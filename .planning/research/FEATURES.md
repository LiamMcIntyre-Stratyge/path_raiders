# Feature Research — v2.0 Meta-Game Foundations

**Domain:** Competitive mobile/web strategy game — meta-systems (accounts, economy, progression, matchmaking)
**Researched:** 2026-06-12
**Confidence:** HIGH (well-established genre conventions from Clash Royale / Clash of Clans, verified against current sources)

> **Scope discipline:** This milestone is the *foundational slice* of a hybrid PvP + async-raid
> game. The genre (Supercell-class titles) has 7+ years of feature accretion: seasons, clans,
> battle passes, gacha chests, leagues, mastery tracks. **Almost all of that is anti-feature
> for a foundation.** The goal here is the minimum set of persistent systems that make a single
> battle "matter over time" — and nothing more. Categories below are aggressive about deferral.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these makes the foundation feel broken or pointless. These are the minimum
that justify the word "persistent."

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Persistent account identity** | Already have Supabase auth; players assume their login = a durable identity that survives sessions/devices | LOW | `profiles` row already exists. Extend, don't rebuild. Foundation for everything else. |
| **Player profile (name, faction, lifetime W/L)** | Every competitive game shows "who am I, how am I doing." `wins`/`losses` already tracked in `gameState` | LOW | Mostly persisting existing fields server-side. Add display name + chosen identity. |
| **Soft currency earned from battles** | Players expect post-match reward ("I played, I got *something*"). The empty-handed match is the #1 "feels broken" signal | LOW–MED | Already have `gold` as an *in-match* resource — meta-currency must be a **separate persistent currency** (see anti-feature note). Win/loss-scaled payout. |
| **Spend currency to unlock content** | The loop's payoff. Unlock the 3 non-starter units (Assault Bot, Thorn Beast, Elementalist) the player already sees but can't use | LOW | `unlockedUnits` already exists in `gameState` (starters seeded). Make it server-authoritative + purchasable. |
| **Persistent progression that carries between matches** | "I got stronger" must survive the match. Without it, currency/unlocks are pointless | MED | The core promise of v2.0. Server-authoritative state is the prerequisite. |
| **Match result persistence (record outcome)** | Already done client-side in `recordResult`; players assume their record is real, not local | LOW–MED | Move authority server-side so it can't be trivially forged. |
| **Real matchmaking (find an opponent without a room code)** | Current flow requires sharing a 4-char code — fine for testing, not for "real" PvP. Players expect a "Battle" button that finds someone | MED–HIGH | Queue + pairing. Can start as simple FIFO queue; rating-based is a differentiator (below). |
| **Server-authoritative battle outcome** | Required for currency/progression to be trustworthy. If clients self-report wins, the economy is meaningless | HIGH | Listed in PROJECT.md as explicit goal. The hardest table-stake. Without it, *everything downstream is exploitable*. |
| **Post-match summary screen** | Players expect to see win/loss, currency earned, and progress gained in one screen before returning | LOW | UI integration (designs owned by user). Pure presentation of the above systems. |

### Differentiators (Competitive Advantage)

Not required for the foundation to feel complete, but high-leverage if cheap. Add when the
table stakes are solid — **most are deferrable past this milestone.**

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Skill-based matchmaking (hidden MMR/Elo)** | Matches "feel fair," which is the single biggest retention lever in competitive games. Genre standard is a hidden MMR + a visible ladder | MED–HIGH | Verified current convention: dual system (hidden rating drives pairing, visible trophies drive motivation). For a foundation, a **single hidden Elo** with bounded ±range expansion on queue time is enough; visible ladder can wait. |
| **Per-unit upgrade levels (not just unlock)** | Depth beyond binary unlock — units get a level, scaling HP/dmg. The Clash Royale core loop | MED | Powerful but a balance/tuning sink. For a foundation, *unlock-only* is safer; level curves invite power-creep and matchmaking-fairness problems. Flag as v2.x. |
| **Faction/tower progression** | Lets players invest in a faction identity beyond individual units | MED | Listed as a v2.0 target. Recommend the *simplest* axis first (unit unlocks), add tower/faction levels only once the economy is tuned. |
| **Friend invite / direct challenge** | The existing room-code flow *is* this primitive. Polishing it into "invite a friend" is cheap and social | LOW–MED | Keep room codes as the friendly-challenge path even after matchmaking exists. Already built — reframe, don't rebuild. |
| **Visible rank/trophy display** | Motivation surface for the hidden MMR | LOW–MED | Genre-standard to show a *number that goes up*. Cheap once MMR exists. Borderline table-stakes if competitive positioning matters; deferrable for a foundation. |
| **Match history list** | "My last 10 battles" — players value reviewing their record | LOW | Just persisting + listing match rows. Nice retention hook, not foundational. |

### Anti-Features (Commonly Requested, Often Problematic)

These define the *deliberate non-goals* of this milestone. Documented to prevent scope creep.

| Feature | Why Requested | Why Problematic (for a foundation) | Alternative |
|---------|---------------|-----------------|-------------|
| **Hard (premium) currency / IAP** | "It's how these games make money" | Monetization design is a whole project; introduces store, payment, fraud, balance-vs-fairness tension. Zero value pre-PMF | Single **soft currency** only this milestone. Design hard currency after the loop is proven. |
| **Gacha / loot chests / randomized unlocks** | Genre signature; "exciting" reward delivery | Adds RNG balancing, drop tables, duplicate handling, regulatory/loot-box concerns. Massive complexity for a foundation | **Deterministic** unlocks: pick what you buy. Predictable, debuggable, fair. |
| **Seasons / battle pass / time-limited tracks** | Retention engine of live games | Requires live-ops cadence, reset logic, season schema, FOMO design — a team-sized commitment. Explicitly out-of-scope in PROJECT.md | Persistent (non-resetting) progression. Layer seasons on later. |
| **Clans / guilds / social graph** | Strong retention, donations loop | Whole subsystem: membership, chat, donations, permissions. Explicitly deferred in PROJECT.md | Friend-challenge via room code only. |
| **Leaderboards / global ranked ladder** | Competitive prestige | Needs anti-cheat maturity, tiers, decay, reset cadence. Explicitly out-of-scope | Hidden MMR for *pairing only*; optional simple visible number. No global board. |
| **Per-card upgrade material economy (Cards + Gold + Wild Cards)** | Mirrors Clash Royale exactly | CR's multi-resource upgrade economy took years to tune; duplicate-card-as-upgrade-currency is deep | Single currency → direct unlock. If levels are added later, use one currency, simple curve. |
| **Reusing in-match `gold` as the meta-currency** | "We already have gold" | **Trap.** In-match gold is an ephemeral combat resource (passive +10/2s, spent on deploys). Conflating it with persistent wealth breaks both — either battles mint infinite meta-currency or the economy starves | Introduce a **distinct named persistent currency** (e.g. "Cores"/"Credits"). Keep battle `gold` ephemeral and per-match. |
| **Engagement-optimized matchmaking (EOMM / rigged matches)** | "Maximizes retention" | Manipulative; erodes trust if discovered; ethically fraught; over-engineered for a foundation | Honest skill-based pairing. Fairness *is* the retention strategy at this stage. |
| **Cosmetic shop / skins** | Monetization, expression | Asset-pipeline heavy, no systemic value to the foundation | Defer entirely. |

---

## Feature Dependencies

```
[Server-authoritative battle outcome]   ← the keystone; nearly everything trusts this
        │
        ├──enables──> [Trustworthy match-result persistence]
        │                     │
        │                     └──enables──> [Currency earned from battles]
        │                                        │
        │                                        └──enables──> [Spend to unlock units]
        │                                                            │
        │                                                            └──enables──> [Unit upgrade levels (v2.x)]
        │
        └──enables──> [Hidden MMR / rating updates]
                              │
                              └──feeds──> [Skill-based matchmaking]   ──surfaced by──> [Visible rank display]

[Persistent account / profile]  ← foundation under ALL of the above (identity to attach state to)

[Real matchmaking queue] ──coexists with──> [Friend-challenge via room code]  (existing flow, keep both)
```

### Dependency Notes

- **Economy requires accounts:** currency/unlocks must attach to a durable identity. Profiles first.
- **Economy & progression require server-authoritative outcomes:** if a client can self-report a win,
  it can mint currency and forge progression. This is *the* gating dependency — the whole economy is
  only as trustworthy as the battle-result authority. Build authority before/with the economy, not after.
- **Matchmaking rating requires authoritative results too:** MMR updated from forgeable results is meaningless.
- **Unlock-gating depends on currency:** the 3 non-starter units are the natural first sink. The unlock
  data path (`unlockedUnits`) already exists client-side — server-authoritative-ize it.
- **Visible rank depends on hidden MMR:** don't build a visible ladder without the underlying rating.
- **Matchmaking and friend-challenge are independent:** the existing room-code flow already serves
  "play with a friend"; the new queue serves "find a stranger." Ship them as parallel entry points.

---

## MVP Definition

### Launch With (this milestone — foundational minimum)

The smallest set where a battle persistently "matters." Be ruthless.

- [ ] **Server-authoritative battle outcome** — keystone; without it the economy is forgeable. (HIGH)
- [ ] **Persistent account + profile** (identity, display name, lifetime W/L) — extend existing `profiles`. (LOW)
- [ ] **Single persistent soft currency, earned per battle** — distinct from in-match `gold`. (LOW–MED)
- [ ] **Deterministic unit unlocks** — spend currency to unlock the 3 non-starter units. (LOW)
- [ ] **Server-authoritative persistence of currency + unlocks + record.** (MED)
- [ ] **Basic matchmaking queue** ("Battle" button → finds an opponent) — FIFO acceptable to start. (MED–HIGH)
- [ ] **Post-match summary** integrating reward/progress (UI designs owned by user). (LOW)
- [ ] **Keep room-code friend challenge** as the social/test path. (already built)

### Add After Validation (v2.x — once the loop is proven & tuned)

- [ ] **Hidden MMR + skill-based pairing** (bounded ±range, expands with queue time) — upgrade the FIFO queue.
- [ ] **Visible rank/trophy number** — motivation surface once MMR exists.
- [ ] **Per-unit upgrade levels** — only after the unlock economy's pacing is validated (power-creep risk).
- [ ] **Faction/tower progression axis** — second investment axis after units.
- [ ] **Match history list** — retention polish.

### Future Consideration (later milestones — explicitly deferred per PROJECT.md)

- [ ] Async base-building & raids (the long-term core, separate milestone)
- [ ] Seasons / battle pass
- [ ] Clans / guilds / donations
- [ ] Global leaderboards / ranked ladder
- [ ] Hard currency / IAP / cosmetics / gacha chests

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Server-authoritative outcome | HIGH | HIGH | P1 |
| Account + profile | HIGH | LOW | P1 |
| Soft currency from battles | HIGH | LOW–MED | P1 |
| Deterministic unit unlocks | HIGH | LOW | P1 |
| Persist currency/unlocks/record | HIGH | MED | P1 |
| Matchmaking queue (FIFO ok) | HIGH | MED–HIGH | P1 |
| Post-match summary | MED | LOW | P1 |
| Hidden MMR / skill pairing | HIGH | MED–HIGH | P2 |
| Visible rank display | MED | LOW–MED | P2 |
| Per-unit upgrade levels | MED | MED | P2/P3 |
| Faction/tower progression | MED | MED | P3 |
| Match history list | LOW–MED | LOW | P3 |
| Hard currency / gacha / seasons / clans | — | HIGH | OUT |

**Priority key:** P1 = foundational minimum this milestone · P2 = add after validation · P3 = nice-to-have · OUT = anti-feature/deferred

## Competitor Feature Analysis

| Feature | Clash Royale | Clash of Clans | Our Foundation Approach |
|---------|--------------|----------------|-------------------------|
| Currency | Gold (soft) + Gems (hard) + per-card upgrade mats | Gold/Elixir (soft) + Gems (hard) | **One soft currency only.** Defer hard currency entirely. |
| Unlocks | Cards via chests (gacha) + shop | Buildings/troops via progression | **Deterministic purchase** — no RNG chests. |
| Progression | Per-card levels + Collection Levels + Mastery | Town Hall + building/troop levels | **Unlock-only first;** unit levels are v2.x. |
| Matchmaking | Hidden MMR + visible Trophy Road (dual system) | Trophy-based (raids) | **Hidden MMR for pairing;** visible rank deferred to v2.x. |
| Social | Clans, donations, friend battles | Clans, wars | **Friend-challenge via room code only** (already built). |
| Retention engine | Seasons + Pass Royale + events | Seasons + clan wars | **None this milestone** — persistent (non-resetting) progression only. |

---

## Sources

- Clash Royale current progression/upgrade & Trophy Road mechanics (Supercell official + community guides, May–June 2026):
  [Supercell — June Update 2026](https://supercell.com/en/games/clashroyale/blog/release-notes/june-update-2026/),
  [Supercell — New Collection Levels & Mastery](https://supercell.com/en/games/clashroyale/blog/news/new-collection-levels-and-mastery-changes/),
  [Clash Royale AI Coach — Collection Levels Guide (May 2026)](https://clashcoachai.com/guides/collection-levels-guide-may-2026),
  [Clash Royale AI Coach — Trophy Progression Hub](https://clashcoachai.com/guides/trophy-progression-hub)
- Matchmaking / MMR conventions (hidden MMR vs visible ladder, bounded ±range expansion):
  [OutrightCRM — MMR Systems in Mobile Competitive Games](https://www.outrightcrm.com/blog/mmr-systems-in-mobile-competitive-games/),
  [PubNub — Skill-Based Matchmaking Explained](https://www.pubnub.com/blog/skill-based-matchmaking-explained/),
  [Wikipedia — Skill-based matchmaking](https://en.wikipedia.org/wiki/Skill-based_matchmaking),
  [Boosteria — Mobile Legends Rank System (MMR/queue types)](https://boosteria.org/guides/mobile-legends-rank-system-stars-mmr-queue-types)
- Engagement-optimized matchmaking (cited as anti-feature):
  [EOMM: An Engagement Optimized Matchmaking Framework (arXiv)](https://arxiv.org/pdf/1702.06820)
- Internal codebase context: `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`,
  `src/lib/gameState.ts` (existing `unlockedUnits`/`wins`/`losses`/`gold`), `src/units/UnitData.ts` (starter vs unlock units)

---
*Feature research for: competitive strategy game meta-systems (foundational slice)*
*Researched: 2026-06-12 · Confidence: HIGH (genre conventions verified against current sources)*
