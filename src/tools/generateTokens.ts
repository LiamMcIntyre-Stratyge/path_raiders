import sharp from 'sharp'
import path from 'path'
import fs from 'fs'

const UNIT_FACTION: Record<string, string> = {
  scout_drone: 'machines',
  assault_bot: 'machines',
  vine_crawler: 'plants',
  thorn_beast: 'plants',
  apprentice_mage: 'wizards',
  elementalist: 'wizards',
}

const FACTION_COLORS: Record<string, { circle: string; silhouette: string }> = {
  machines: { circle: '#1D4ED8', silhouette: '#93C5FD' },
  plants:   { circle: '#15803D', silhouette: '#86EFAC' },
  wizards:  { circle: '#7E22CE', silhouette: '#D8B4FE' },
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

async function generateToken(unitId: string): Promise<void> {
  const faction = UNIT_FACTION[unitId]
  if (!faction) throw new Error(`Unknown unit: ${unitId}`)

  const colors = FACTION_COLORS[faction]
  const [cr, cg, cb] = hexToRgb(colors.circle)
  const [sr, sg, sb] = hexToRgb(colors.silhouette)

  const size = 64
  const charPath = path.join('public', 'assets', 'characters', `${unitId}.png`)
  const outPath  = path.join('public', 'assets', 'tokens', `${unitId}_token.png`)

  // 1. Resize character to fit inside the token circle, preserving transparency
  const charResized = await sharp(charPath)
    .resize(52, 52, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  // 2. Convert all non-transparent pixels to silhouette colour
  const { data, info } = await sharp(charResized)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const silhouette = Buffer.from(data)
  for (let i = 0; i < silhouette.length; i += 4) {
    const alpha = silhouette[i + 3]
    if (alpha > 10) {
      silhouette[i]     = sr
      silhouette[i + 1] = sg
      silhouette[i + 2] = sb
      silhouette[i + 3] = alpha
    }
  }

  const silhouetteBuffer = await sharp(silhouette, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()

  // 3. Create circle background in faction colour
  const circleSvg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"
        fill="rgb(${cr},${cg},${cb})" />
    </svg>`

  const circleBuffer = await sharp(Buffer.from(circleSvg))
    .resize(size, size)
    .png()
    .toBuffer()

  // 4. Composite silhouette centred on circle
  const offset = Math.floor((size - 52) / 2)
  await sharp(circleBuffer)
    .composite([{ input: silhouetteBuffer, left: offset, top: offset }])
    .png()
    .toFile(outPath)

  console.log(`✓ ${unitId}_token.png`)
}

async function main() {
  fs.mkdirSync(path.join('public', 'assets', 'tokens'), { recursive: true })
  const unitIds = Object.keys(UNIT_FACTION)
  for (const id of unitIds) {
    await generateToken(id)
  }
  console.log('\nAll tokens generated.')
}

main().catch(console.error)
