import Phaser from 'phaser'

/**
 * Tower rendering extracted from GameScene.drawTowers (D-09).
 *
 * Mirrors the UnitData/UnitView split: TowerData holds static stats, TowerView
 * owns the Phaser draw. Towers are static (no animation, no per-frame sync), so
 * this is a single depth-3 Graphics pass drawn once at scene create() time.
 *
 * The faction color table (FC) and its lookup helper (fac) live here as the
 * single source of truth — they were formerly duplicated inline in GameScene.
 */
export const FC: Record<string, { fill: number; lite: number; bd: number }> = {
  machines: { fill: 0x1a5090, lite: 0x3a80c0, bd: 0x70b0ff },
  plants: { fill: 0x1a6018, lite: 0x3a9030, bd: 0x70d050 },
  wizards: { fill: 0x501080, lite: 0x8030c0, bd: 0xb060ff },
}

export const fac = (f: string) => FC[f] ?? FC.machines

interface TowerRenderable {
  cx: number
  cy: number
  isHostSide: boolean
}

/**
 * Draws all towers onto a fresh depth-3 Graphics object owned by `scene`.
 *
 * Pixel output is identical to the former GameScene.drawTowers:
 * shadow → body → highlight → border → 3 battlements per tower (tw=th=28).
 * Host-side towers use `hostFaction`, guest-side towers use `guestFaction`
 * (resolved by the caller via resolveSide).
 */
export function drawTowers(
  scene: Phaser.Scene,
  towers: readonly TowerRenderable[],
  hostFaction: string,
  guestFaction: string,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics()
  g.setDepth(3)

  for (const tower of towers) {
    const faction = tower.isHostSide ? hostFaction : guestFaction
    const c = fac(faction)
    const tw = 28
    const th = 28
    const x = tower.cx - tw / 2
    const y = tower.cy - th / 2
    g.fillStyle(0x000000, 0.4); g.fillRect(x + 3, y + 3, tw, th)
    g.fillStyle(c.fill, 1);     g.fillRect(x, y, tw, th)
    g.fillStyle(c.lite, 0.4);   g.fillRect(x, y, tw, th * 0.45)
    g.lineStyle(2, c.bd, 1);    g.strokeRect(x, y, tw, th)
    // Battlements
    g.fillStyle(c.bd, 1)
    for (let i = 0; i < 3; i++) g.fillRect(x + 2 + i * 9, y - 6, 6, 8)
  }

  return g
}
