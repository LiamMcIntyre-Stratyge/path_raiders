# Path Raiders — Character Sprite Pipeline

## What You Already Have

| Folder | Contents | Status |
|---|---|---|
| `public/assets/characters/` | Full source art, 6 PNGs (91KB–1.3MB) | ✅ Ready |
| `public/assets/spritesheets/` | 6 PNG strips + 6 JSON files, 96×96px frames | ⚠️ Partial (idle + walk only) |
| `public/assets/tokens/` | Round token icons, 6 PNGs | ✅ Used in game now |

**Current sprite sheets have:** `idle` (4 frames) + `walk` (6 frames) = 10 frames each
**Missing:** `attack` (4 frames) + `death` (5 frames) per character

---

## Characters

| ID | Name | Faction |
|---|---|---|
| `scout_drone` | Scout Drone | Machines |
| `assault_bot` | Assault Bot | Machines |
| `vine_crawler` | Vine Crawler | Plants |
| `thorn_beast` | Thorn Beast | Plants |
| `apprentice_mage` | Apprentice Mage | Wizards |
| `elementalist` | Elementalist | Wizards |

---

## Step 1 — Verify Source Art Angle

Open these files and confirm they are **bird's eye / top-down view**
(character viewed from slightly above, like looking down at a table — same angle as Clash Royale):

```
public/assets/characters/scout_drone.png
public/assets/characters/vine_crawler.png
public/assets/characters/apprentice_mage.png
```

**If the angle is wrong** (side-view or portrait), regenerate in Scenario.gg before continuing.
**If the angle is correct**, proceed to Step 2.

---

## Step 2 — Generate Attack + Death Frames in Scenario.gg

**Site:** https://scenario.gg

For each of the 6 characters you need **9 new frames**: 4 attack + 5 death.

### Train a model (one time only)
1. Upload all 6 files from `public/assets/characters/` as training data
2. Style tag: `"top-down game sprite, bird's eye view, transparent background"`
3. Save the **Model ID** — you'll need it for the API script in Step 3

### Prompts to use

**Attack frames** — run 4 times per character with slight variation:
```
[character description], top-down bird's eye view, attacking pose,
arm/weapon extended forward, game sprite, transparent background,
96x96px, same style as reference
```

**Death frames** — run 5 times per character, progressive collapse:
```
[character description], top-down bird's eye view, falling/dying pose,
frame [1–5] of death animation, game sprite, transparent background,
96x96px, same style as reference
```

### Output naming convention
Save downloaded frames as:
```
public/assets/frames/scout_drone_attack_0.png
public/assets/frames/scout_drone_attack_1.png
public/assets/frames/scout_drone_attack_2.png
public/assets/frames/scout_drone_attack_3.png
public/assets/frames/scout_drone_death_0.png
public/assets/frames/scout_drone_death_1.png
public/assets/frames/scout_drone_death_2.png
public/assets/frames/scout_drone_death_3.png
public/assets/frames/scout_drone_death_4.png
```
Repeat for all 6 characters.

---

## Step 3 — Scenario.gg API Script (automates Step 2)

Once you have your Model ID, this script generates and saves all frames automatically.

**Install dependency first:**
```bash
npm install node-fetch
```

**Create `scripts/generate-frames.ts`** and fill in your API key and model ID:
```ts
const SCENARIO_API_KEY = 'your_api_key_here'
const MODEL_ID         = 'your_model_id_here'

const CHARACTERS = [
  { id: 'scout_drone',     desc: 'small robot scout drone' },
  { id: 'assault_bot',     desc: 'heavy armored robot warrior' },
  { id: 'vine_crawler',    desc: 'vine plant creature' },
  { id: 'thorn_beast',     desc: 'large thorned plant monster' },
  { id: 'apprentice_mage', desc: 'young wizard in robes' },
  { id: 'elementalist',    desc: 'powerful elemental mage' },
]
```

Run with:
```bash
npx ts-node scripts/generate-frames.ts
```

> Claude will write this script in full once you have your Model ID from Scenario.gg.

---

## Step 4 — Build Complete Sprite Sheets

**Install dependency:**
```bash
npm install sharp @types/sharp
```

**Run the build script:**
```bash
npx ts-node scripts/build-spritesheets.ts
```

This script:
1. Takes the existing sprite sheet (idle + walk, 10 frames × 96px = 960×96px)
2. Appends attack frames (4 × 96px) and death frames (5 × 96px)
3. Outputs a complete 1824×96px PNG strip
4. Updates the JSON atlas with new frame definitions

**Final sprite sheet layout per character:**
```
[idle_0][idle_1][idle_2][idle_3][walk_0][walk_1][walk_2][walk_3][walk_4][walk_5][attack_0][attack_1][attack_2][attack_3][death_0][death_1][death_2][death_3][death_4]
```
= 19 frames × 96px = **1824×96px PNG**

> Claude will write this script in full once attack/death frames exist.

---

## Step 5 — 3D Character Preview in LoadoutScene

Uses **Three.js** to render a live 3D preview on each unit card.

**Install:**
```bash
npm install three @types/three
```

**How it works:**
- Each unit card gets a 140×140px Three.js canvas
- The character source image (`/characters/[id].png`) is loaded as a texture on a flat plane
- A point light from top-right creates depth and shadow
- The plane gently rotates on the Y-axis (slow spin)
- Clicking the card pauses the spin and shows full stats

This gives a genuine 3D feel without needing actual 3D models.

> Claude will implement this in `LoadoutScene.ts` once the source art angle is confirmed.

---

## Step 6 — Wire Animations into Phaser

### BootScene — load atlases
```ts
const UNIT_IDS = ['scout_drone', 'assault_bot', 'vine_crawler', 'thorn_beast', 'apprentice_mage', 'elementalist']

for (const id of UNIT_IDS) {
  this.load.atlas(id, `assets/spritesheets/${id}.png`, `assets/spritesheets/${id}.json`)
}
```

### GameScene — register animations (once on create)
```ts
for (const id of UNIT_IDS) {
  this.anims.create({ key: `${id}_idle`,   frames: this.anims.generateFrameNames(id, { prefix: 'idle_',   start: 0, end: 3 }), frameRate: 6,  repeat: -1 })
  this.anims.create({ key: `${id}_walk`,   frames: this.anims.generateFrameNames(id, { prefix: 'walk_',   start: 0, end: 5 }), frameRate: 10, repeat: -1 })
  this.anims.create({ key: `${id}_attack`, frames: this.anims.generateFrameNames(id, { prefix: 'attack_', start: 0, end: 3 }), frameRate: 12, repeat: 0  })
  this.anims.create({ key: `${id}_death`,  frames: this.anims.generateFrameNames(id, { prefix: 'death_',  start: 0, end: 4 }), frameRate: 10, repeat: 0  })
}
```

### Unit.ts — play correct animation per state
```ts
// Replace the current image token with a sprite:
const sprite = scene.add.sprite(0, 0, def.id)
sprite.play(`${def.id}_idle`)

// Then in state transitions:
sprite.play(`${def.id}_walk`)    // while moving
sprite.play(`${def.id}_attack`)  // while fighting
sprite.play(`${def.id}_death`)   // on kill — destroy after animation completes
```

---

## Summary Checklist

- [ ] **Step 1** — Open `/characters/` PNGs and confirm bird's eye angle
- [ ] **Step 2** — Generate attack + death frames manually in Scenario.gg
- [ ] **Step 3** — (Optional) Set up Scenario.gg API script for automation
- [ ] **Step 4** — Run `build-spritesheets.ts` to produce complete 19-frame strips
- [ ] **Step 5** — Three.js 3D preview added to LoadoutScene
- [ ] **Step 6** — Phaser animations wired up in BootScene + GameScene + Unit.ts

---

## File Structure When Complete

```
public/assets/
├── characters/          ← source art (used for 3D preview)
│   ├── scout_drone.png
│   └── ...
├── spritesheets/        ← complete 19-frame atlas (used in gameplay)
│   ├── scout_drone.png  (1824×96px)
│   ├── scout_drone.json
│   └── ...
├── frames/              ← raw generated frames (input to build script)
│   ├── scout_drone_attack_0.png
│   ├── scout_drone_death_0.png
│   └── ...
└── tokens/              ← round icons (used in HUD/cards)
    ├── scout_drone_token.png
    └── ...
```
