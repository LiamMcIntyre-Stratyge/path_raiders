import type { SimWorld, SimEvent, SimInput } from './types'
import { processUnits, processTowers } from './combat'
import { spawnUnit, assignPath } from './world'
import { UNITS, resolveUnitStats } from '../units/UnitData'
import { slotWorldX, guestSpawnY } from '../maps/MapData'

/**
 * Practice-AI spawner. Mirrors GameScene.updateAI :390-416 with the two RNG
 * calls injected (D-06): rng() #1 chooses the unit type from the opponent pool,
 * rng() #2 chooses the spawn slot (0-2). Reads the opponent faction off
 * world.guestFaction (preset at createWorld via resolveSide) so the sim stays
 * free of any session-singleton import (RESEARCH.md Pitfall 5).
 *
 * In practice mode the player is host; the AI is the guest army, spawning from
 * the guest end and moving down (dir +1) — identical to the original.
 */
function spawnAI(world: SimWorld, rng: () => number): void {
  const oppFac = world.guestFaction
  const oppPool = UNITS.filter((u) => u.faction === oppFac)
  if (oppPool.length === 0) return
  const def = oppPool[Math.floor(rng() * oppPool.length)] // rng call 1
  const slotIdx = Math.floor(rng() * 3) // rng call 2

  // P12: resolve AI unit stats via resolveUnitStats (PROG-03 spawnAI landmine fix)
  // In practice mode guestUnitLevels is {}, so AI always resolves to level 1 — intended.
  const aiLevel = world.guestUnitLevels[def.id] ?? 1
  const aiStats = resolveUnitStats(def.id, aiLevel)

  const unit: SimWorld['guestUnits'][number] = {
    id: String(world.nextId++),
    defId: def.id,
    faction: def.faction,
    x: slotWorldX(slotIdx),
    y: guestSpawnY(),
    hp: aiStats.hp,
    maxHp: aiStats.hp,
    dir: 1,
    laneSlot: slotIdx,
    attackCd: 0,
    attackRate: 900,
    speedPx: def.speedPx,
    dmg: aiStats.dmg,
    waypoints: [],
    wpIdx: 0,
    wallTarget: null,
    dead: false,
  }
  world.guestUnits.push(unit)
  assignPath(world, unit)
}

/**
 * The single tick entry point (D-08). Routes inputs → gold → timer → AI → units
 * → towers → prune, exactly mirroring GameScene.update :351-363 + the five
 * updateX methods. Variable `dt` is preserved (no fixed timestep this phase);
 * `rng` is injected (default Math.random) and used ONLY by the practice-AI
 * spawner. Returns the discrete events the scene consumes.
 */
export function step(
  world: SimWorld,
  inputs: SimInput[],
  dt: number,
  rng: () => number = Math.random,
): SimEvent[] {
  const events: SimEvent[] = []

  // 1. Apply inputs (deploys from local + remote; opponent wall breaks)
  for (const input of inputs) {
    if (input.type === 'deploy') {
      spawnUnit(world, input, events)
    } else if (input.type === 'wall_break') {
      // Opponent's wall break: the scene already received it; the sim applies
      // the state change (clear overlay, recompute paths) and emits the event.
      const key = `${input.row},${input.col}`
      if (world.wallHP.has(key)) {
        world.wallHP.delete(key)
        world.mutableOver[input.row][input.col] = null
        events.push({ type: 'wall_break', row: input.row, col: input.col })
        for (const u of [...world.hostUnits, ...world.guestUnits]) {
          if (!u.dead) assignPath(world, u)
        }
      }
    }
  }

  // 2. Gold (updateGold :365-374 — DOM/session-cache writes stripped; world is source)
  world.goldAccum += dt
  while (world.goldAccum >= 2000) {
    world.goldAccum -= 2000
    world.gold = Math.min(world.gold + 10, 9999)
  }

  // 3. Timer (updateTimer :376-388 — DOM writes stripped)
  world.timeLeft = Math.max(0, world.timeLeft - dt / 1000)
  if (world.timeLeft <= 0 && !world.over) {
    const winner =
      world.hostBaseHp > world.guestBaseHp
        ? 'host'
        : world.guestBaseHp > world.hostBaseHp
          ? 'guest'
          : 'tie'
    world.over = true
    events.push({ type: 'game_over', winner })
  }

  // 4. AI spawn (updateAI :390-416 — rng injected, faction read off world)
  if (world.isPractice && !world.over) {
    world.aiTimer += dt
    if (world.aiTimer >= world.aiInterval) {
      world.aiTimer = 0
      spawnAI(world, rng)
    }
  }

  // 5. Units (updateUnits :418-489 — extracted to combat.ts)
  if (!world.over) {
    processUnits(world, events, dt)
  }

  // 6. Towers (updateTowers :491-509 — extracted to combat.ts)
  if (!world.over) {
    processTowers(world, events, dt)
  }

  // 7. Prune dead AFTER both combat passes (RESEARCH.md Risk 1; .active → !u.dead)
  world.hostUnits = world.hostUnits.filter((u) => !u.dead)
  world.guestUnits = world.guestUnits.filter((u) => !u.dead)

  world.tickCount++
  return events
}
