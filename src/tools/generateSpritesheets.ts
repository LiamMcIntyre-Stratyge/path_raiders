import { createCanvas, loadImage } from '@napi-rs/canvas'
import path from 'path'
import fs from 'fs'

const FRAME_SIZE = 96
const IDLE_FRAMES = 4
const WALK_FRAMES = 6
const TOTAL_FRAMES = IDLE_FRAMES + WALK_FRAMES
const SHEET_WIDTH = FRAME_SIZE * TOTAL_FRAMES
const SHEET_HEIGHT = FRAME_SIZE

// Idle: vertical bounce offsets (px)
const IDLE_Y_OFFSETS = [0, -3, -5, -2]

// Walk: rotation (deg) and x-offset (px) per frame
const WALK_CONFIGS = [
  { rot: -2, dx: -2 },
  { rot:  0, dx:  0 },
  { rot:  2, dx:  2 },
  { rot:  0, dx:  0 },
  { rot: -2, dx: -2 },
  { rot:  0, dx:  0 },
]

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

async function generateSpritesheet(unitId: string): Promise<void> {
  const charPath = path.join('public', 'assets', 'characters', `${unitId}.png`)
  const outPng   = path.join('public', 'assets', 'spritesheets', `${unitId}.png`)
  const outJson  = path.join('public', 'assets', 'spritesheets', `${unitId}.json`)

  const img = await loadImage(charPath)

  // Scale character to fit in frame with padding
  const maxDim = FRAME_SIZE - 16
  const scale = Math.min(maxDim / img.width, maxDim / img.height)
  const drawW = img.width * scale
  const drawH = img.height * scale

  const sheet = createCanvas(SHEET_WIDTH, SHEET_HEIGHT)
  const ctx = sheet.getContext('2d')

  const frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> = {}

  // --- Idle frames ---
  for (let i = 0; i < IDLE_FRAMES; i++) {
    const frameX = i * FRAME_SIZE
    const yOffset = IDLE_Y_OFFSETS[i]

    ctx.save()
    ctx.translate(frameX + FRAME_SIZE / 2, FRAME_SIZE / 2 + yOffset)
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()

    frames[`idle_${i}`] = {
      frame: { x: frameX, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
    }
  }

  // --- Walk frames ---
  for (let i = 0; i < WALK_FRAMES; i++) {
    const frameX = (IDLE_FRAMES + i) * FRAME_SIZE
    const { rot, dx } = WALK_CONFIGS[i]

    ctx.save()
    ctx.translate(frameX + FRAME_SIZE / 2 + dx, FRAME_SIZE / 2)
    ctx.rotate(degToRad(rot))
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()

    frames[`walk_${i}`] = {
      frame: { x: frameX, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
    }
  }

  // Save PNG
  const buffer = sheet.toBuffer('image/png')
  fs.writeFileSync(outPng, buffer)

  // Save atlas JSON (Phaser format)
  const atlas = {
    textures: [
      {
        image: `${unitId}.png`,
        format: 'RGBA8888',
        size: { w: SHEET_WIDTH, h: SHEET_HEIGHT },
        scale: 1,
        frames: Object.entries(frames).map(([name, data]) => ({
          filename: name,
          rotated: false,
          trimmed: false,
          sourceSize: { w: FRAME_SIZE, h: FRAME_SIZE },
          spriteSourceSize: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
          frame: data.frame,
        })),
      },
    ],
    meta: { app: 'path-raiders-generator', version: '1.0' },
  }

  fs.writeFileSync(outJson, JSON.stringify(atlas, null, 2))
  console.log(`✓ ${unitId}.png + ${unitId}.json`)
}

async function main() {
  fs.mkdirSync(path.join('public', 'assets', 'spritesheets'), { recursive: true })

  const unitIds = [
    'scout_drone',
    'assault_bot',
    'vine_crawler',
    'thorn_beast',
    'apprentice_mage',
    'elementalist',
  ]

  for (const id of unitIds) {
    await generateSpritesheet(id)
  }

  console.log('\nAll spritesheets generated.')
}

main().catch(console.error)
