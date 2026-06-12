import type { SimUnit, SimWorld, SimEvent } from './types'
import { COMBAT_RANGE, BASE_REACH_DMG } from './types'
import { CELL } from '../maps/MapData'
import { canBreakWall } from '../lib/pathfinder'
import { assignPath } from './world'
import type { OverlayType } from '../types'

const WALL_OVERLAYS = new Set(['wall', 'break_mach', 'break_plant', 'break_wiz'])

/**
 * Pure unit-position math, lifted from Unit.moveStep (Unit.ts:66-81).
 * Moves the unit one step toward waypoints[wpIdx]; returns true when it arrives.
 */
export function moveUnit(u: SimUnit, dt: number): boolean {
  if (u.wpIdx >= u.waypoints.length) return false
  const target = u.waypoints[u.wpIdx]
  const dx = target.x - u.x
  const dy = target.y - u.y
  const dist = Math.hypot(dx, dy)
  const stepDist = (u.speedPx * dt) / 1000
  if (dist <= stepDist) {
    u.x = target.x
    u.y = target.y
    return true
  }
  u.x += (dx / dist) * stepDist
  u.y += (dy / dist) * stepDist
  return false
}

/** Pure goal check, lifted from Unit.isAtGoal (Unit.ts:83-85). */
export function isAtGoal(u: SimUnit): boolean {
  return u.wpIdx >= u.waypoints.length
}

/**
 * Apply damage to a unit. Mirrors Unit.takeDamage (Unit.ts:87-94) minus the
 * Phaser flash/kill tweens — the sim sets `dead` and pushes a `unit_died` event;
 * the scene plays the death animation in response (D-03). Returns true on death.
 */
export function takeDamage(u: SimUnit, amount: number, events: SimEvent[]): boolean {
  if (u.dead) return false
  u.hp = Math.max(0, u.hp - amount)
  if (u.hp <= 0) {
    u.dead = true
    events.push({ type: 'unit_died', unitId: u.id, x: u.x, y: u.y, faction: u.faction })
    return true
  }
  return false
}

/**
 * Damage a wall cell. Mirrors GameScene.damageWall :734-742 + breakWall :744-756
 * (sim-relevant parts only): decrements wallHP, and on break clears the overlay,
 * pushes a `wall_break` event, and recomputes paths for ALL live units.
 *
 * Path recompute happens immediately (preserving current GameScene behavior,
 * RESEARCH.md Risk 7 — wall-breaks are rare so immediate recompute is safe).
 */
function damageWall(world: SimWorld, r: number, c: number, amount: number, events: SimEvent[]): void {
  const key = `${r},${c}`
  const hp = world.wallHP.get(key)
  if (hp === undefined) return
  const newHp = Math.max(0, hp - amount)
  world.wallHP.set(key, newHp)
  if (newHp <= 0) {
    world.wallHP.delete(key)
    world.mutableOver[r][c] = null
    events.push({ type: 'wall_break', row: r, col: c })
    for (const unit of [...world.hostUnits, ...world.guestUnits]) {
      if (!unit.dead) assignPath(world, unit)
    }
  }
}

/**
 * Decrement a base's HP and emit base_hit (+ game_over if it falls).
 * Mirrors GameScene.damageBase :511-528 (sim parts: HP + win check; broadcast
 * is the scene's job, driven off the base_hit event per D-04).
 */
function damageBase(world: SimWorld, side: 'host' | 'guest', amount: number, events: SimEvent[]): void {
  if (world.over) return
  if (side === 'host') {
    world.hostBaseHp = Math.max(0, world.hostBaseHp - amount)
    events.push({ type: 'base_hit', side: 'host', newHp: world.hostBaseHp })
    if (world.hostBaseHp <= 0) {
      world.over = true
      events.push({ type: 'game_over', winner: 'guest' })
    }
  } else {
    world.guestBaseHp = Math.max(0, world.guestBaseHp - amount)
    events.push({ type: 'base_hit', side: 'guest', newHp: world.guestBaseHp })
    if (world.guestBaseHp <= 0) {
      world.over = true
      events.push({ type: 'game_over', winner: 'host' })
    }
  }
}

/**
 * Run the per-unit tick for one army against its enemies. Faithful extraction of
 * the inner closure in GameScene.updateUnits :419-485. Priority order is
 * load-bearing (RESEARCH.md Risk 2): wall attack → combat scan → path movement.
 *
 * Pruning is NOT done here — it happens in step.ts AFTER both army passes
 * (RESEARCH.md Risk 1 / Anti-Pattern Index): a unit killed early in the frame is
 * still present for the second pass, matching current behavior.
 */
function processArmy(world: SimWorld, movers: SimUnit[], enemies: SimUnit[], events: SimEvent[], dt: number): void {
  for (const unit of movers) {
    if (unit.dead) continue

    // ── Priority 1: wall attack ────────────────────────────────────────────
    if (unit.wallTarget) {
      const [wr, wc] = unit.wallTarget
      if (!world.wallHP.has(`${wr},${wc}`)) {
        unit.wallTarget = null
        if (!unit.dead) assignPath(world, unit)
      } else {
        unit.attackCd -= dt
        if (unit.attackCd <= 0) {
          unit.attackCd = unit.attackRate
          damageWall(world, wr, wc, unit.dmg, events)
        }
      }
      continue
    }

    // ── Priority 2: unit combat (nearest-target + D-07 id-tiebreak) ─────────
    const blocker = enemies
      .filter((e) => !e.dead && Math.hypot(e.x - unit.x, e.y - unit.y) < COMBAT_RANGE)
      .sort((a, b) => {
        const da = Math.hypot(a.x - unit.x, a.y - unit.y)
        const db = Math.hypot(b.x - unit.x, b.y - unit.y)
        return da - db || (a.id < b.id ? -1 : 1)
      })[0]

    if (blocker) {
      unit.attackCd -= dt
      if (unit.attackCd <= 0) {
        unit.attackCd = unit.attackRate
        takeDamage(blocker, unit.dmg, events)
      }
      continue
    }

    // ── Priority 3: path movement ──────────────────────────────────────────
    if (isAtGoal(unit)) {
      if (unit.waypoints.length === 0) {
        // No path found yet — retry next frame
        if (!unit.dead) assignPath(world, unit)
        continue
      }
      // Legitimately reached enemy base
      const side = unit.dir === -1 ? 'guest' : 'host'
      damageBase(world, side, BASE_REACH_DMG, events)
      takeDamage(unit, 9999, events)
      continue
    }

    // Check if next waypoint is a wall that needs breaking
    const wp = unit.waypoints[unit.wpIdx]
    const wpR = Math.floor(wp.y / CELL)
    const wpC = Math.floor(wp.x / CELL)
    const ov = world.mutableOver[wpR]?.[wpC]
    if (ov && WALL_OVERLAYS.has(ov)) {
      if (canBreakWall(ov as OverlayType, unit.faction)) {
        unit.wallTarget = [wpR, wpC]
      }
      // Wrong faction — unit waits (pathfinder should have routed around)
      continue
    }

    const arrived = moveUnit(unit, dt)
    if (arrived) unit.wpIdx++
  }
}

/**
 * Process all units for one tick. Order preserved (RESEARCH.md Risk 1):
 * host units attack guest, THEN guest units attack host. Prune happens in step().
 */
export function processUnits(world: SimWorld, events: SimEvent[], dt: number): void {
  processArmy(world, world.hostUnits, world.guestUnits, events, dt)
  processArmy(world, world.guestUnits, world.hostUnits, events, dt)
}

/**
 * Process all towers for one tick. Faithful extraction of GameScene.updateTowers
 * :491-509 with the D-07 id-tiebreak added to the nearest-target sort.
 */
export function processTowers(world: SimWorld, events: SimEvent[], dt: number): void {
  for (const tower of world.towers) {
    tower.cd = Math.max(0, tower.cd - dt)
    if (tower.cd > 0) continue

    // Host-side tower attacks guest units; guest-side tower attacks host units
    const targets = tower.isHostSide ? world.guestUnits : world.hostUnits
    const inRange = targets
      .filter((u) => !u.dead && Math.hypot(u.x - tower.cx, u.y - tower.cy) <= tower.range)
      .sort((a, b) => {
        const da = Math.hypot(a.x - tower.cx, a.y - tower.cy)
        const db = Math.hypot(b.x - tower.cx, b.y - tower.cy)
        return da - db || (a.id < b.id ? -1 : 1)
      })

    if (inRange.length === 0) continue
    takeDamage(inRange[0], tower.dmg, events)
    tower.cd = tower.maxCd
  }
}
