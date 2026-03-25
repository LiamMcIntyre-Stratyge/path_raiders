import { COLS, ROWS } from '../maps/MapData'
import type { OverlayType, TerrainType } from '../types/index'

export type Cell = [number, number]  // [row, col]

const WALKABLE_TERRAIN = new Set<TerrainType>(['path', 'bridge', 'cross'])

export function isWalkable(
  r: number, c: number,
  base: TerrainType[][],
  over: (OverlayType)[][],
): boolean {
  const ov = over[r][c]
  if (ov === 'base_zone') return true
  if (ov === 'wall' || ov === 'break_mach' || ov === 'break_plant' || ov === 'break_wiz') return false
  return WALKABLE_TERRAIN.has(base[r][c])
}

export function canBreakWall(ov: OverlayType, faction: string): boolean {
  if (ov === 'wall') return true
  if (ov === 'break_mach')  return faction === 'machines'
  if (ov === 'break_plant') return faction === 'plants'
  if (ov === 'break_wiz')   return faction === 'wizards'
  return false
}

export function findPath(
  startR: number, startC: number,
  goals: Cell[],
  base: TerrainType[][],
  over: (OverlayType)[][],
  faction: string,
): Cell[] {
  // Phase 1: open walkable path only
  const path1 = bfs(startR, startC, goals, (r, c) => isWalkable(r, c, base, over))
  if (path1) return path1
  // Phase 2: allow breakable walls for this faction
  const path2 = bfs(startR, startC, goals,
    (r, c) => isWalkable(r, c, base, over) || canBreakWall(over[r][c], faction))
  return path2 ?? []
}

function bfs(
  startR: number, startC: number,
  goals: Cell[],
  canEnter: (r: number, c: number) => boolean,
): Cell[] | null {
  const key = (r: number, c: number) => r * COLS + c
  const goalSet = new Set(goals.map(([r, c]) => key(r, c)))
  const visited = new Set<number>([key(startR, startC)])
  const parent  = new Map<number, number>()
  const queue: Cell[] = [[startR, startC]]

  while (queue.length) {
    const [r, c] = queue.shift()!
    const k = key(r, c)
    if (goalSet.has(k)) {
      const path: Cell[] = []
      let cur = k
      while (parent.has(cur)) {
        path.unshift([Math.floor(cur / COLS), cur % COLS])
        cur = parent.get(cur)!
      }
      return path
    }
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = r + dr, nc = c + dc
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue
      const nk = key(nr, nc)
      if (visited.has(nk) || !canEnter(nr, nc)) continue
      visited.add(nk)
      parent.set(nk, k)
      queue.push([nr, nc])
    }
  }
  return null
}
