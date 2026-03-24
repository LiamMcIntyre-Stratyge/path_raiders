import type { TerrainType, OverlayType, MapDef } from '../types'

export const COLS = 22
export const ROWS = 16
export const CELL = 36

// World dimensions
export const WORLD_W = COLS * CELL   // 792
export const WORLD_H = ROWS * CELL   // 576

// Base slot definitions
export const BASE_SLOTS: { cols: [number, number]; centerCol: number }[] = [
  { cols: [6, 7],   centerCol: 6.5  },
  { cols: [10, 11], centerCol: 10.5 },
  { cols: [14, 15], centerCol: 14.5 },
]
export const HOST_ROWS  = [14, 15]  // bottom
export const GUEST_ROWS = [0,  1]   // top

// World pixel helpers
export function slotWorldX(slot: number) { return BASE_SLOTS[slot].centerCol * CELL }
export function hostSpawnY()  { return (HOST_ROWS[0]  + 0.5) * CELL }   // row 14.5
export function guestSpawnY() { return (GUEST_ROWS[1] + 0.5) * CELL }   // row 0.5

// ─── Terrain + overlay palette ─────────────────────────────────────────────
export const TERRAIN_COLOR: Record<TerrainType, { bg: number; border: number }> = {
  open:   { bg: 0x2d4a1e, border: 0x3a5a26 },
  path:   { bg: 0xb89a6a, border: 0xc9aa7a },
  forest: { bg: 0x1a3a10, border: 0x264d18 },
  rock:   { bg: 0x5a5250, border: 0x6e6660 },
  water:  { bg: 0x0a2a4a, border: 0x0d3a60 },
  lava:   { bg: 0x5a1200, border: 0x8a2400 },
  sand:   { bg: 0x5a4a28, border: 0x6a5a34 },
  ruins:  { bg: 0x2a2218, border: 0x3a3020 },
  cross:  { bg: 0xc8a040, border: 0xd4b050 },
  bridge: { bg: 0x9e7e50, border: 0xb08d60 },
}

export const OVERLAY_COLOR: Record<Exclude<OverlayType,null>, { bg: number; border: number; icon: string }> = {
  tunnel:      { bg: 0x181808, border: 0x2c2c14, icon: '○' },
  dead_end:    { bg: 0x280808, border: 0x3c1010, icon: '✕' },
  wall:        { bg: 0x383838, border: 0x505050, icon: '▪' },
  break_mach:  { bg: 0x182838, border: 0x205070, icon: '⚙' },
  break_plant: { bg: 0x102808, border: 0x184010, icon: '❧' },
  break_wiz:   { bg: 0x200838, border: 0x301858, icon: '✦' },
  base_zone:   { bg: 0x1a3010, border: 0x2a5020, icon: '⬡' },
}

// ─── Map builder helpers ───────────────────────────────────────────────────
function makeGrid<T>(fill: T): T[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill))
}
function paint<T>(grid: T[][], cells: [number,number][], val: T) {
  cells.forEach(([r,c]) => { if (r>=0&&r<ROWS&&c>=0&&c<COLS) grid[r][c]=val })
}
function paintRect<T>(grid: T[][], r1:number,c1:number,r2:number,c2:number, val:T) {
  for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++)
    if (r>=0&&r<ROWS&&c>=0&&c<COLS) grid[r][c]=val
}
function hline<T>(grid: T[][], r:number,c1:number,c2:number, val:T) {
  for (let c=c1;c<=c2;c++) if (c>=0&&c<COLS) grid[r][c]=val
}
function vline<T>(grid: T[][], c:number,r1:number,r2:number, val:T) {
  for (let r=r1;r<=r2;r++) if (r>=0&&r<ROWS) grid[r][c]=val
}
function addBasesOverlay(over: (OverlayType)[][]) {
  const guestCells: [number,number][] = [
    [0,6],[0,7],[1,6],[1,7], [0,10],[0,11],[1,10],[1,11], [0,14],[0,15],[1,14],[1,15]
  ]
  const hostCells: [number,number][] = [
    [14,6],[14,7],[15,6],[15,7], [14,10],[14,11],[15,10],[15,11], [14,14],[14,15],[15,14],[15,15]
  ]
  // Top (guest) base slots
  guestCells.forEach(([r,c]) => { if(r>=0&&r<ROWS&&c>=0&&c<COLS) over[r][c]='base_zone' })
  // Bottom (host) base slots
  hostCells.forEach(([r,c]) => { if(r>=0&&r<ROWS&&c>=0&&c<COLS) over[r][c]='base_zone' })
}

// ─── MAP 1: THE GAUNTLET ──────────────────────────────────────────────────
function buildMap1(): Pick<MapDef,'base'|'over'> {
  const base = makeGrid<TerrainType>('rock')
  const over = makeGrid<OverlayType>(null)
  vline(base,10,0,15,'path'); vline(base,11,0,15,'path')
  hline(base,4,10,15,'path');  over[4][15]='dead_end'
  hline(base,7,6,10,'path');   over[7][6]='dead_end'
  hline(base,11,11,16,'path'); if(11<ROWS&&16<COLS) over[11][16]='dead_end'
  hline(base,12,5,10,'path');  over[12][5]='dead_end'
  for (let r=6;r<=9;r++) { over[r][10]='tunnel'; over[r][11]='tunnel' }
  over[3][10]='break_mach'; over[3][11]='break_mach'
  over[7][10]='break_mach'; over[7][11]='break_mach'
  if(13<ROWS) { over[13][10]='break_mach'; over[13][11]='break_mach' }
  if(8<ROWS) { base[8][10]='cross'; base[8][11]='cross' }
  addBasesOverlay(over)
  return { base, over }
}

// ─── MAP 2: ISLAND HOPPING ────────────────────────────────────────────────
function buildMap2(): Pick<MapDef,'base'|'over'> {
  const base = makeGrid<TerrainType>('water')
  const over = makeGrid<OverlayType>(null)
  paintRect(base,2,1,5,7,'path'); paintRect(base,2,14,5,20,'path')
  paintRect(base,6,4,9,8,'path'); paintRect(base,6,13,9,17,'path')
  paintRect(base,10,1,13,7,'path'); paintRect(base,10,14,13,20,'path')
  paintRect(base,6,9,9,12,'path')
  paint(base,[[2,1],[2,2],[3,1],[4,1],[4,2],[2,19],[2,20],[3,20],[4,19]],'forest')
  paint(base,[[11,1],[11,2],[12,1],[11,19],[12,20],[11,20]],'forest')
  hline(base,3,7,14,'bridge'); hline(base,12,7,14,'bridge')
  vline(base,4,5,6,'bridge'); vline(base,4,9,10,'bridge')
  vline(base,4,17,6,'bridge'); vline(base,4,12,9,'bridge')
  vline(base,9,4,10,'bridge'); vline(base,9,17,10,'bridge')
  hline(base,7,8,13,'bridge'); hline(base,8,8,13,'bridge')
  over[3][10]='break_plant'; over[3][11]='break_plant'
  if(12<ROWS) { over[12][10]='break_plant'; over[12][11]='break_plant' }
  over[7][0]='dead_end'; if(7<ROWS) base[7][0]='path'
  if(8<ROWS&&21<COLS) { over[8][21]='dead_end'; base[8][21]='path' }
  base[7][10]='cross'
  addBasesOverlay(over)
  return { base, over }
}

// ─── MAP 3: THE LABYRINTH ─────────────────────────────────────────────────
function buildMap3(): Pick<MapDef,'base'|'over'> {
  const base = makeGrid<TerrainType>('ruins')
  const over = makeGrid<OverlayType>(null)
  for (let c=1;c<21;c++) {
    base[2][c]='path'; base[5][c]='path'
    base[8][c]='path'; if(11<ROWS) base[11][c]='path'
    if(13<ROWS) base[13][c]='path'
  }
  for (const c of [1,4,7,10,13,16,19,20]) {
    for (let r=2;r<=13;r++) if(r<ROWS) base[r][c]='path'
  }
  const wallCells: [number,number][] = [
    [3,2],[3,3],[4,5],[4,6],[3,8],[3,9],[4,11],[4,12],[3,14],[3,15],[4,17],[4,18],
    [6,2],[6,3],[6,6],[6,7],[7,9],[7,10],[6,12],[6,13],[6,16],[6,17],[7,19],[7,20],
    [9,3],[9,4],[9,7],[9,8],[10,11],[10,12],[9,15],[9,16],[9,18],[9,19],
    [12,2],[12,3],[12,6],[12,7],[12,9],[12,10],[12,14],[12,15],[12,17],[12,18],
  ]
  wallCells.forEach(([r,c]) => { if(r<ROWS&&c<COLS) over[r][c]='wall' })
  if(5<ROWS) { over[5][7]='break_wiz' }
  if(8<ROWS) { over[8][13]='break_wiz' }
  if(11<ROWS) { over[11][4]='break_wiz' }
  over[2][16]='break_wiz'
  if(13<ROWS) { over[13][9]='break_wiz' }
  if(5<ROWS) { over[5][18]='break_wiz' }
  for (let c=9;c<=12;c++) if(7<ROWS) over[7][c]='tunnel'
  for (let r=5;r<=7;r++) if(r<ROWS) over[r][10]='tunnel'
  if(7<ROWS) base[7][10]='cross'
  addBasesOverlay(over)
  return { base, over }
}

// ─── MAP 4: VOLCANO CORE ─────────────────────────────────────────────────
function buildMap4(): Pick<MapDef,'base'|'over'> {
  const base = makeGrid<TerrainType>('lava')
  const over = makeGrid<OverlayType>(null)
  hline(base,2,2,19,'path'); if(13<ROWS) hline(base,13,2,19,'path')
  vline(base,2,2,13,'path'); vline(base,19,2,13,'path')
  if(5<ROWS) { hline(base,5,5,16,'path'); vline(base,5,5,10,'path') }
  if(10<ROWS) { hline(base,10,5,16,'path'); vline(base,16,5,10,'path') }
  vline(base,8,2,5,'path'); vline(base,8,10,13,'path')
  vline(base,13,2,5,'path'); vline(base,13,10,13,'path')
  if(7<ROWS) { hline(base,7,2,5,'path'); hline(base,7,16,19,'path') }
  if(8<ROWS) { hline(base,8,2,5,'path'); hline(base,8,16,19,'path') }
  if(7<ROWS&&8<ROWS) {
    hline(base,7,5,8,'bridge'); hline(base,8,5,8,'bridge')
    hline(base,7,13,16,'bridge'); hline(base,8,13,16,'bridge')
  }
  paint(base,[[6,7],[6,8],[7,7],[9,13],[9,14],[10,14]],'rock')
  over[2][10]='break_mach'; over[2][11]='break_mach'
  if(13<ROWS) { over[13][10]='break_mach'; over[13][11]='break_mach' }
  if(7<ROWS&&8<ROWS) {
    over[7][2]='break_mach'; over[8][2]='break_mach'
    over[7][19]='break_mach'; over[8][19]='break_mach'
  }
  over[2][1]='dead_end'; base[2][1]='path'
  if(21<COLS) { over[2][21]='dead_end'; }
  if(13<ROWS) { over[13][1]='dead_end'; base[13][1]='path' }
  for (let c=9;c<=12;c++) if(7<ROWS&&8<ROWS) { over[7][c]='tunnel'; over[8][c]='tunnel' }
  if(7<ROWS&&8<ROWS) { base[7][10]='cross'; base[8][11]='cross' }
  addBasesOverlay(over)
  return { base, over }
}

// ─── MAP 5: THE SPIRAL ────────────────────────────────────────────────────
function buildMap5(): Pick<MapDef,'base'|'over'> {
  const base = makeGrid<TerrainType>('forest')
  const over = makeGrid<OverlayType>(null)
  hline(base,2,1,20,'path')
  if(13<ROWS) { vline(base,20,2,13,'path'); hline(base,13,2,20,'path') }
  vline(base,2,2,11,'path')
  if(4<ROWS) { hline(base,4,4,17,'path'); vline(base,17,4,11,'path') }
  if(11<ROWS) { hline(base,11,4,17,'path'); vline(base,4,4,9,'path') }
  if(6<ROWS) { hline(base,6,6,14,'path'); vline(base,14,6,9,'path') }
  if(9<ROWS) { hline(base,9,6,14,'path'); vline(base,6,6,7,'path') }
  if(7<ROWS) hline(base,7,8,12,'path')
  if(4<ROWS) { over[4][10]='break_plant'; over[4][11]='break_plant' }
  if(11<ROWS) { over[11][8]='break_plant'; over[11][9]='break_plant' }
  if(9<ROWS) over[9][14]='break_plant'
  if(6<ROWS) over[6][8]='break_plant'
  for (let c=8;c<=12;c++) if(5<ROWS) over[5][c]='tunnel'
  for (let r=5;r<=8;r++) if(r<ROWS) over[r][8]='tunnel'
  if(7<ROWS) { base[7][10]='cross'; base[7][11]='cross' }
  addBasesOverlay(over)
  return { base, over }
}

// ─── MAP 6: TWIN RIVERS ───────────────────────────────────────────────────
function buildMap6(): Pick<MapDef,'base'|'over'> {
  const base = makeGrid<TerrainType>('open')
  const over = makeGrid<OverlayType>(null)
  paintRect(base,0,0,15,2,'forest'); paintRect(base,0,19,15,21,'forest')
  vline(base,7,2,13,'water'); vline(base,8,2,13,'water')
  if(13<ROWS&&14<COLS) { vline(base,13,2,13,'water'); vline(base,14,2,13,'water') }
  vline(base,3,2,13,'path'); vline(base,4,2,13,'path'); vline(base,5,2,13,'path')
  if(4<ROWS&&11<ROWS) { hline(base,4,9,12,'path'); hline(base,11,9,12,'path') }
  vline(base,9,4,11,'path'); vline(base,10,4,11,'path'); vline(base,11,4,11,'path')
  vline(base,16,2,13,'path'); vline(base,17,2,13,'path'); vline(base,18,2,13,'path')
  if(4<ROWS&&11<ROWS) {
    hline(base,4,5,9,'bridge'); hline(base,11,5,9,'bridge')
    hline(base,4,12,16,'bridge'); hline(base,11,12,16,'bridge')
    over[4][6]='break_plant'; over[11][6]='break_plant'
    over[4][14]='break_plant'; over[11][14]='break_plant'
  }
  if(7<ROWS&&8<ROWS) {
    hline(base,7,3,5,'path'); hline(base,7,16,18,'path')
    hline(base,8,3,5,'path'); hline(base,8,16,18,'path')
    over[7][2]='dead_end'; over[8][2]='dead_end'
    if(19<COLS) { over[7][19]='dead_end'; over[8][19]='dead_end' }
    base[7][10]='cross'
  }
  addBasesOverlay(over)
  return { base, over }
}

// ─── MAP 7: THE RUINS ─────────────────────────────────────────────────────
function buildMap7(): Pick<MapDef,'base'|'over'> {
  const base = makeGrid<TerrainType>('ruins')
  const over = makeGrid<OverlayType>(null)
  if(3<ROWS) { hline(base,3,0,21,'path'); hline(base,4,0,21,'path') }
  if(11<ROWS) { hline(base,11,0,21,'path'); hline(base,12,0,21,'path') }
  vline(base,5,0,15,'path'); vline(base,6,0,15,'path')
  vline(base,10,0,15,'path'); vline(base,11,0,15,'path')
  vline(base,15,0,15,'path'); vline(base,16,0,15,'path')
  paintRect(over,1,1,2,4,'wall'); paintRect(over,1,8,2,9,'wall')
  paintRect(over,1,12,2,13,'wall'); paintRect(over,1,17,2,20,'wall')
  paintRect(over,5,1,10,4,'wall'); paintRect(over,5,7,10,9,'wall')
  paintRect(over,5,12,10,14,'wall'); paintRect(over,5,17,10,20,'wall')
  if(13<ROWS) {
    paintRect(over,13,1,14,4,'wall'); paintRect(over,13,8,14,9,'wall')
    paintRect(over,13,12,14,13,'wall'); paintRect(over,13,17,14,20,'wall')
  }
  over[2][5]='break_wiz'; over[2][6]='break_wiz'
  over[2][14]='break_wiz'; over[2][15]='break_wiz'
  if(13<ROWS) {
    over[13][5]='break_wiz'; over[13][6]='break_wiz'
    over[13][14]='break_wiz'; over[13][15]='break_wiz'
  }
  if(7<ROWS&&8<ROWS) {
    for (let c=7;c<=9;c++) { over[7][c]='tunnel'; over[8][c]='tunnel' }
    for (let c=12;c<=14;c++) { over[7][c]='tunnel'; over[8][c]='tunnel' }
    hline(base,7,0,4,'path'); over[7][0]='dead_end'
    hline(base,8,0,4,'path'); over[8][0]='dead_end'
    if(21<COLS) { hline(base,7,17,21,'path'); over[7][21]='dead_end' }
    if(21<COLS) { hline(base,8,17,21,'path'); over[8][21]='dead_end' }
    base[7][10]='cross'; base[8][11]='cross'
  }
  addBasesOverlay(over)
  return { base, over }
}

// ─── MAP 8: UNDERGROUND NETWORK ──────────────────────────────────────────
function buildMap8(): Pick<MapDef,'base'|'over'> {
  const base = makeGrid<TerrainType>('rock')
  const over = makeGrid<OverlayType>(null)
  hline(base,2,1,20,'path')
  if(7<ROWS) hline(base,7,1,20,'path')
  if(13<ROWS) hline(base,13,1,20,'path')
  vline(base,5,2,13,'path'); vline(base,10,2,13,'path')
  vline(base,15,2,13,'path')
  for (let c=1;c<=20;c++) {
    over[2][c]='tunnel'
    if(7<ROWS) over[7][c]='tunnel'
    if(13<ROWS) over[13][c]='tunnel'
  }
  for (let r=2;r<=13;r++) if(r<ROWS) {
    over[r][5]='tunnel'; over[r][10]='tunnel'
    over[r][15]='tunnel'
  }
  if(4<ROWS&&5<ROWS) {
    paintRect(base,4,6,5,9,'path'); paintRect(base,4,11,5,14,'path')
    for (let r=4;r<=5;r++) for(let c=6;c<=14;c++) over[r][c]=null
  }
  if(9<ROWS&&10<ROWS) {
    paintRect(base,9,6,10,9,'path'); paintRect(base,9,11,10,14,'path')
    for (let r=9;r<=10;r++) for(let c=6;c<=14;c++) over[r][c]=null
  }
  over[2][10]='break_mach'; over[2][11]='break_mach'
  if(7<ROWS) { over[7][4]='break_mach'; over[7][16]='break_mach' }
  if(13<ROWS) { over[13][10]='break_mach'; over[13][11]='break_mach' }
  if(5<ROWS&&21<COLS) { hline(base,5,20,21,'path'); over[5][21]='dead_end' }
  if(10<ROWS&&21<COLS) { hline(base,10,20,21,'path'); over[10][21]='dead_end' }
  if(5<ROWS) { hline(base,5,0,1,'path'); over[5][0]='dead_end' }
  if(10<ROWS) { hline(base,10,0,1,'path'); over[10][0]='dead_end' }
  if(7<ROWS) { base[7][10]='cross'; base[7][11]='cross' }
  addBasesOverlay(over)
  return { base, over }
}

// ─── MAP 9: THE ARENA ─────────────────────────────────────────────────────
function buildMap9(): Pick<MapDef,'base'|'over'> {
  const base = makeGrid<TerrainType>('sand')
  const over = makeGrid<OverlayType>(null)
  hline(base,2,1,20,'path')
  if(13<ROWS) hline(base,13,1,20,'path')
  vline(base,1,2,13,'path'); vline(base,20,2,13,'path')
  paintRect(over,1,1,1,20,'wall')
  if(14<ROWS) paintRect(over,14,1,14,20,'wall')
  paintRect(over,2,1,13,1,'wall'); paintRect(over,2,20,13,20,'wall')
  paintRect(over,4,4,11,4,'wall'); paintRect(over,4,17,11,17,'wall')
  paintRect(over,4,4,4,17,'wall')
  if(11<ROWS) paintRect(over,11,4,11,17,'wall')
  hline(base,2,2,19,'path')
  if(13<ROWS) hline(base,13,2,19,'path')
  vline(base,2,2,13,'path'); vline(base,19,2,13,'path')
  paintRect(base,5,5,10,16,'path')
  over[1][9]=null; over[1][10]=null; over[1][11]=null
  if(14<ROWS) { over[14][9]=null; over[14][10]=null; over[14][11]=null }
  if(7<ROWS&&8<ROWS) {
    over[7][1]=null; over[8][1]=null; over[7][20]=null; over[8][20]=null
    over[4][9]=null; over[4][10]=null; over[4][11]=null
  }
  if(11<ROWS) { over[11][9]=null; over[11][10]=null; over[11][11]=null }
  if(7<ROWS&&8<ROWS) { over[7][4]=null; over[8][4]=null; over[7][17]=null; over[8][17]=null }
  over[3][10]='break_mach'
  if(12<ROWS) over[12][10]='break_mach'
  if(7<ROWS&&8<ROWS) {
    over[7][3]='break_wiz'; over[8][3]='break_wiz'
    over[7][18]='break_wiz'; over[8][18]='break_wiz'
  }
  paintRect(base,7,9,8,12,'rock')
  if(7<ROWS&&8<ROWS) { base[7][10]='cross'; base[8][11]='cross' }
  if(5<ROWS&&21<COLS) { hline(base,5,21,21,'path'); over[5][21]='dead_end' }
  if(10<ROWS&&21<COLS) { hline(base,10,21,21,'path'); over[10][21]='dead_end' }
  if(5<ROWS) { hline(base,5,0,0,'path'); over[5][0]='dead_end' }
  if(10<ROWS) { hline(base,10,0,0,'path'); over[10][0]='dead_end' }
  addBasesOverlay(over)
  return { base, over }
}

// ─── MAP 10: MIRRORED FAULT ───────────────────────────────────────────────
function buildMap10(): Pick<MapDef,'base'|'over'> {
  const base = makeGrid<TerrainType>('open')
  const over = makeGrid<OverlayType>(null)
  paintRect(base,0,0,15,9,'forest')
  paintRect(base,0,12,15,21,'ruins')
  vline(base,10,2,13,'lava'); vline(base,11,2,13,'lava')
  hline(base,3,0,9,'path')
  vline(base,2,3,10,'path'); vline(base,3,3,12,'path')
  if(7<ROWS) hline(base,7,1,9,'path')
  if(12<ROWS) hline(base,12,0,9,'path')
  if(7<ROWS&&8<ROWS) { vline(base,7,7,12,'path'); vline(base,8,7,12,'path') }
  if(10<ROWS) hline(base,10,2,9,'path')
  if(3<ROWS&&4<ROWS) { hline(base,3,12,21,'path'); hline(base,4,12,21,'path') }
  if(7<ROWS&&8<ROWS) { hline(base,7,12,21,'path'); hline(base,8,12,21,'path') }
  if(12<ROWS&&13<ROWS) { hline(base,12,12,21,'path'); hline(base,13,12,21,'path') }
  if(13<ROWS&&14<COLS) { vline(base,13,4,13,'path'); vline(base,14,4,13,'path') }
  if(18<COLS) { vline(base,18,4,13,'path'); vline(base,19,4,13,'path') }
  if(5<ROWS) { hline(base,5,9,12,'bridge'); }
  if(10<ROWS) hline(base,10,9,12,'bridge')
  if(5<ROWS) { over[5][5]='break_plant'; over[5][6]='break_plant' }
  if(10<ROWS) { over[10][3]='break_plant'; over[10][4]='break_plant' }
  if(5<ROWS) { over[5][15]='break_wiz'; over[5][16]='break_wiz' }
  if(10<ROWS) over[10][18]='break_wiz'
  for (let r=5;r<=9;r++) if(r<ROWS) over[r][9]='tunnel'
  for (let c=13;c<=16;c++) if(5<ROWS) over[5][c]='tunnel'
  if(3<ROWS&&21<COLS) { over[3][21]='dead_end'; base[3][21]='path' }
  if(12<ROWS&&21<COLS) { over[12][21]='dead_end'; base[12][21]='path' }
  if(7<ROWS) { over[7][0]='dead_end'; base[7][0]='path' }
  if(5<ROWS) { base[5][10]='cross' }
  if(10<ROWS) base[10][10]='cross'
  addBasesOverlay(over)
  return { base, over }
}

// ─── REGISTRY ─────────────────────────────────────────────────────────────
export const MAPS: MapDef[] = [
  { id:1,  name:'The Gauntlet',        faction:'machines', factionColor:'#4a9adf', paths:1, desc:'One brutal corridor. Three mechanical gates.', ...buildMap1() },
  { id:2,  name:'Island Hopping',      faction:'neutral',  factionColor:'#c8940a', paths:4, desc:'Islands across open water. Vine walls seal bridges.', ...buildMap2() },
  { id:3,  name:'The Labyrinth',       faction:'wizards',  factionColor:'#a04adf', paths:3, desc:'Magic walls hide faster routes through the maze.', ...buildMap3() },
  { id:4,  name:'Volcano Core',        faction:'machines', factionColor:'#4a9adf', paths:4, desc:'Two ring roads orbit a lava core.', ...buildMap4() },
  { id:5,  name:'The Spiral',          faction:'plants',   factionColor:'#4adf7a', paths:2, desc:'One long coiling path. Vine walls force detours.', ...buildMap5() },
  { id:6,  name:'Twin Rivers',         faction:'neutral',  factionColor:'#c8940a', paths:3, desc:'Two rivers split the map. Four bridge chokepoints.', ...buildMap6() },
  { id:7,  name:'The Ruins',           faction:'wizards',  factionColor:'#a04adf', paths:4, desc:'Ancient city grid. Magic walls seal shortcuts.', ...buildMap7() },
  { id:8,  name:'Underground Network', faction:'machines', factionColor:'#4a9adf', paths:3, desc:'All tunnels. Machine walls seal passages.', ...buildMap8() },
  { id:9,  name:'The Arena',           faction:'neutral',  factionColor:'#c8940a', paths:2, desc:'Outer ring feeds into a gated inner arena.', ...buildMap9() },
  { id:10, name:'Mirrored Fault',      faction:'plants',   factionColor:'#4adf7a', paths:3, desc:'Left=forest organic. Right=ruins grid. One lava fault.', ...buildMap10() },
]
