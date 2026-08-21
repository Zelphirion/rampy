# Plan: Underground Obstacle-Course Level ("The Underworks")

A massive subterranean sandbox playground beneath the whole map: a chaotic, oversized mechanical
obstacle course built for cars — glowing hazards, conveyors, pistons, elevators, sweeper arms,
retracting pyramid stairs, and a launch-ramp finale into a padded pole with an explosive light
show. No goals, scores, or timers — pure kinetic toy-box driving.

---

## 1. Current state (verified)

- `src/underground.js` (~120 lines) builds: a flat rock floor slab (292 × 276, top at y ≈ −0.02),
  a decorative spiral tube, 60 glow markers, and 2 pillars at (−72, 98) / (−40, 66).
  Exports `UNDERGROUND_Y = -30`, `tunnelPoint(s)`, and `addUnderground(parent)` → `{ colliders, update() }`
  where `update()` is a **never-called no-op stub**.
- `main.js` owns everything: `worldState = 'city' | 'ramp' | 'underground'`, three scenes
  (`scene`, `rampScene`, `undergroundScene`), hand-written physics branches, render-target ternaries
  (paused early-return + end of frame).
- Underground physics branch (main.js ~L1934): **flat-floor clamp** — grounded snaps `car.position.y = 0`,
  airborne lands at `y <= 0`. No height variation exists yet.
- Moving-hazard pattern to copy: `updateRampWorldDanger(delta)` (main.js ~L1398) — recompute hazard
  world position analytically each frame, circle-overlap test at bumper height, then
  `knockPlayerAway(nx, nz, power, spin, hop)` with a per-hazard cooldown.
- Colliders are plain AABBs `{ x, z, halfW, halfD, h }`; `isPositionBlocked` / `buildingTopAt`
  already select `ugColliders` when underground. Knock dispatch for underground already exists
  (`knockAt(car.position, playerKnockRadius, 0, 0)`). Torus wrap is correctly skipped underground.
- Transitions: `enterUndergroundWorld()` drops the car at (−58, 30, 104);
  `leaveUndergroundWorld()` triggers when grounded within 8 u of `tunnelPoint(1)` ≈ (−55, 83).
- Reusable templates: `rampworld.js` (wedge launch ramps with glowing lip + `boost`, wheel-of-death
  spinning paddles, pendulum mallets, exported metrics so physics matches visuals),
  `factory.js` (conveyor modulo-travel animation, pulsing emissive vats, unwired
  `{ colliders, update(delta, player) }` contract), `props.js` (hydrant-spray ad-hoc particle burst).
- **No audio system exists** (greenfield). No kinematic platforms, no conveyor surface velocity,
  no spawn-on-hit collectibles — all three must be built.

## 2. Architecture decisions

1. **Self-contained level module.** All geometry, animation math, and physics data live in
   `underground.js`; it exports a rich API:
   ```js
   addUnderground(parent) => {
     colliders,                       // static AABBs (pillars, wall frames, pyramid sides)
     update(delta),                   // animate visuals (called only when worldState==='underground')
     groundHeightAt(x, z),            // static driveable heights (floor, ledges, tiers, ramp)
     dynamicSurfaceAt(x, z, t),       // time-varying heights (lift tops, stair-step extensions)
     conveyorAt(x, z),                // { dirX, dirZ, speed } | null  (surface push)
     foamPitAt(x, z),                 // pit record | null (bouncy landing region)
     dangers,                         // metric records: pipes, piston walls, sliders, sweeper arms
     promptBlocks,                    // bumpable overhead blocks (position, radius, cooldown)
     pole,                            // finale pole metrics (x, z, radius, height)
     reset(),                         // restore cooldowns/blocks on world entry
   }
   ```
   Single source of truth: every animated surface exposes the same math used by its visuals, so
   physics always matches what the player sees (the rampworld approach).
2. **Surgical main.js hooks only** (no generic level-manager refactor in this task):
   - Rewrite the underground physics branch: height-function ground (static + dynamic), conveyor
     displacement, foam-pit bounce, launch-ramp support (reuse the existing `wasOnRamp` launch idiom).
   - Call `undergroundWorld.update(delta)` inside `animate()` gated on `worldState === 'underground'`.
   - Add `updateUndergroundDanger(delta)` modeled on `updateRampWorldDanger` (pipes, piston walls,
     sliders, sweeper arms, prompt-block bumps, pole impact → knock impulses + event triggers).
   - Extend the debug helper: `window.__game.ug(x, z)` teleports straight into the underground
     (existing `teleport` can't switch worlds).
3. **New tiny audio module `src/sfx.js`** — synthesized WebAudio (oscillator + noise + envelopes),
   no asset files. Lazy `AudioContext` created on first user gesture (autoplay policy). Sounds:
   soft foam thud, pipe whoosh-knock, block-pop chime, pole-impact boom + light-show arpeggio.
4. **Foam collectibles are purely physical toys** — no HUD, no counters (matches "no goals").
5. **Performance guardrails:** shared geometries/materials; emissive materials instead of many
   point lights (≤ 6 dynamic PointLights total: pole flash, 2–3 zone accents); hazard/AI updates
   skip when the player is > 80 u away; pooled particles with hard caps.

## 3. Course layout

Cavern floor spans x ∈ [−146, +146], z ∈ [−96.5, +179.5]. Spawn drop at (−58, 104);
return-tunnel foot at ≈ (−55, 83) — both kept clear (radius ~10). Existing pillars stay.

```
 z
 170 ┌──────────────────────────┬─────────────────────────┐
     │        (spawn drop)      │  ZONE D — THE PYRAMID   │
 120 │   ┌──────────────────┐   │  retracting stair tiers │
     │   │ ZONE A — NEON    │   │  peak launch ramp →     │
     │   │ GAUNTLET         │   │  PADDED POLE finale     │
  80 │   └──────────────────┘   │                         │
     │  tunnel foot (return)    │                         │
  40 ├───────┐                  │                         │
     │ZONE B │   central plaza  │      ┌──────────────────┤
   0 │CONVEYOR│  (flow corridors│      │ ZONE C — LIFT    │
     │CANYON │   + glow dressing)│     │ WORKS & SKY BEAMS│
 −40 │pistons│                  │      │ foam pits, lifts,│
     │& walls│                  │      │ high balance beams│
 −80 └───────┴──────────────────┴──────┴──────────────────┘
      −146      −58               0       +70          +146
```

Flow: land at spawn → Zone A (warm-up, east) → central plaza → Zone B (west) or
Zone C (southeast, verticality) → Zone D (northeast, skill climax) → cruise back to the
tunnel foot to leave.

## 4. Feature specs

### Zone A — Neon Gauntlet (track hazards) · x ∈ [−20, 70], z ∈ [120, 165]
Three parallel east–west lanes (each ~11 wide) separated by low glowing curb strips.
- **Suspended neon prompt-blocks**: emissive cubes (~2.2 u, alternating cyan/magenta) hanging at
  y ≈ 3.2 over each lane every ~14 u. When a leaping/airborne car overlaps a block's sphere
  (r ≈ 2.6): block flashes bright, pops 6–8 **giant foam collectibles** (oversized soft-colored
  cubes/cylinders/tori, 1.2–2.0 u) that burst outward, tumble, bounce softly and settle as
  drivable clutter; per-block cooldown ~4 s; chime SFX. Collectibles fade out after ~20 s
  (pooled, capped ~48 alive).
- **Motorized conduit pipes**: oversized glowing cylinders (r ≈ 1.1, length ~26) mounted across
  the lanes, sliding rapidly back and forth ACROSS the lanes (amplitude ±9 u, period ~2.2 s,
  neighboring pipes anti-phased). Center at bumper height (y ≈ 1.4) — jump to dodge or eat a
  knock: flung along the pipe's slide direction (power ~110) + hop 4, cooldown 1.2 s.

### Zone B — Conveyor Canyon & Piston Walls · x ∈ [−135, −55], z ∈ [−70, 10]
Two recessed driveways (10 wide, cut ~0.4 into the floor) running north–south, plus a crossroad.
- **High-speed conveyors**: belts push AGAINST the direction of travel (~9 u/s rearward drift
  applied while grounded on the belt). Visual: dark belt with scrolling emissive chevrons
  (modulo-travel stripe animation, factory pattern). Full-length lane so the push is felt.
- **Soft wobbling sliders**: rounded foam slabs (3 × 1.5 × 2) sliding side-to-side across each
  driveway (±6 u, period ~3 s) with squash-and-stretch wobble; gentle bump (power ~60, small hop).
- **Pneumatic piston walls**: two massive walls (14 wide × 5 tall) of stacked oversized glowing
  foam blocks (emissive lime/orange grid) flanking the crossroad, stroking back and forth ACROSS
  the road on visible piston rods (stroke ±5 u, period ~1.6 s, anti-phased). Contact = heavy
  swat: power ~140 + hop 5.5 + spin, cooldown 1.4 s. Wall frames are static colliders; the
  moving wall itself is hazard-metric only (never traps the car — stroke keeps a driveable gap).

### Zone C — Lift Works & Sky Beams · x ∈ [25, 115], z ∈ [−75, 15]
Vertical playground: two deep foam pits (16 × 16, floor at y ≈ −8) each with an industrial
**car elevator**, feeding elevated tier ledges (y = 7 and y = 13) connected by **balance beams**.
- **Elevators**: 9 × 9 platforms, continuous vertical cycle (smooth sine ease, ~6 s period,
  banks at floor→7 and 7→13). Platform tops are dynamic ground: the car rides up/down
  automatically (ground snap handles carry; vertical-only motion, no lateral shear).
  Steel frame + hazard-stripe skirt + glowing edge trim; faint mechanical hum (looped osc, quiet).
- **Foam pits**: falling in is safe and fun — foam floor at y ≈ −8 is super-bouncy
  (restitution ~0.45, extra drag, soft thud + puff particles). Small exit ramps at pit corners
  let the car drive out; elevators are the fun way up.
- **Upper tier ledges**: flat driveable decks at y = 7 / 13 with glowing railings (visual only,
  open edges so you can launch off).
- **Balance beams + sweeper arms**: narrow beams (width ~4.5) linking tier towers at y ≈ 13;
  each beam hosts a spinning glowing sweeper arm (hub post + arm length ~6.5, ~1.1 rad/s,
  sweeping horizontally at bumper height). Time your run or get knocked off into the foam pit
  below (power ~120 tangential + hop 3). Arm metrics exported for the danger updater
  (wheel-of-death pattern).

### Zone D — The Pyramid (finale) · x ∈ [45, 125], z ∈ [105, 170]
Landmark centerpiece visible from the spawn drop.
- **Retracting pyramid stairs**: a giant tiered block staircase (~44 × 44 base, 6 tiers,
  each ~2.8 tall → peak deck y ≈ 17). Individual steps (each tier has 4–6 block steps on its
  faces) rhythmically **extend/retract into the cavern walls** of the pyramid mass:
  extension per step = smoothstep pulse (period ~4 s, phase-staggered ~0.9 rad per tier) with
  stroke ~4 u; a step is driveable once > 60 % extended. Ground query reads live extensions;
  visuals read the same math. Misjudge the rhythm and you slide back down.
- **Peak launch ramp**: wedge ramp (len ~16, height ~5, boost ~1.35, glowing lip — rampworld
  pattern) aimed at the finale pole ~18 u away.
- **Padded vertical pole**: a huge cushioned column (r ≈ 1.6, height ~26) with foam collar rings.
  A solid hit (impact speed > 8) triggers: big reflective bounce (velocity × 0.65 away + spin 6
  + hop 7), **explosive light show** (pole rings flash-sequence, PointLight spike decaying ~1.2 s,
  expanding torus shockwave, ~40 spark particles — hydrant-spray pattern), and the **boom +
  arpeggio SFX**. Cooldown 1 s. This is the payoff toy — hitting it should feel amazing.

### Cavern dressing (all zones)
Glow-strip floor lanes guiding zone-to-zone flow; scattered crystal clusters (mine-shaft motif,
emissive, knockable-wobble); faint stalactite silhouettes near walls (cheap cones, no ceiling
mesh — keep the violet-void look); fog/light tuning per zone accent color.

## 5. Engine upgrades required (main.js)

| Hook | Change |
|---|---|
| Underground physics branch (~L1934) | Replace flat clamp with: `surface = max(groundHeightAt, dynamicSurfaceAt(t))`; grounded snap to surface; airborne lands on surface; launch-ramp support at pyramid peak (reuse `wasOnRamp` idiom); foam-pit bounce override; conveyor displacement while grounded |
| `animate()` loop | Call `undergroundWorld.update(delta)` + `updateUndergroundDanger(delta)` gated on `worldState === 'underground'` |
| New `updateUndergroundDanger(delta)` | Pipes, piston walls, sliders, sweeper arms (knock impulses w/ cooldowns); prompt-block bump detection (airborne overlap → release collectibles + flash + SFX); pole impact detection (light show + SFX + bounce) |
| World entry | Call `undergroundWorld.reset()` in `enterUndergroundWorld()` |
| Debug helper | `window.__game.ug(x, z)` — jump straight into the underground at (x, z) for testing |

## 6. New capabilities to build

1. **Spawn-on-hit foam collectibles** (new, Zone A): pooled tumbling bodies with simple ballistic
   + ground bounce + settle; reuse hydrant-droplet lifecycle ideas; cap + fade.
2. **Conveyor surface push** (new engine behavior): rect test + directional displacement.
3. **Dynamic rideable platforms** (new engine behavior): lift tops as time-varying ground height.
4. **Foam-pit bounce volume** (new engine behavior): region override for landing response.
5. **Synth SFX module `src/sfx.js`** (greenfield): init-on-gesture, `thud/whoosh/pop/boom/arpeggio/hum`,
   master gain, mute-friendly (no-op until first gesture).
6. **Light-show kit** (in `underground.js`): flash sequencer for pole rings + shockwave torus +
   spark burst pool.

## 7. Implementation phases (each independently verifiable)

1. **Groundwork** — expand `underground.js` API skeleton (height fns returning floor 0 everywhere,
   empty registries), rewrite main.js underground branch to height-function form, wire `update()`,
   add `__game.ug()` debug teleport. ✅ Verify: game unchanged, car drives on flat cavern floor.
2. **Zone A** — lanes, prompt-blocks + foam-collectible system, conduit pipes + danger knocks.
   ✅ Verify: leap-bump pops foam toys; pipes swat the car along their slide.
3. **Zone B** — recessed conveyors (+ push physics + scroll visuals), sliders, piston walls.
   ✅ Verify: belts visibly fight the car; piston walls swat across the crossroad.
4. **Zone C** — foam pits (+ bounce), elevators (+ ride physics), tier ledges, beams + sweeper arms.
   ✅ Verify: ride a lift up, traverse a beam, survive/fail sweepers, bounce safely in foam.
5. **Zone D** — pyramid tiers + retracting steps (+ live ground query), peak ramp, padded pole +
   light show + `src/sfx.js` integration. ✅ Verify: climb on rhythm, launch, smash the pole,
   get the show.
6. **Polish** — dressing pass, fog/light tuning, LOD gating + particle caps, full transition
   round-trip test (city ⇄ underground), performance check.

## 8. Files changed

- `src/underground.js` — major expansion (~900–1100 lines): layout, all zone builders, animation
  math, physics API, light-show kit. (Split into `undergroundProps.js` later only if unwieldy.)
- `src/main.js` — surgical hooks (~+200 lines): physics branch rewrite, update/danger calls,
  reset-on-entry, debug `ug()`.
- `src/sfx.js` — new (~120 lines): synthesized WebAudio SFX.

## 9. Open questions (for refinement)

1. Sound effects: build the synth SFX module? *(recommended: yes — the pole finale begs for it)*
2. Foam collectibles: fade after ~20 s vs. persist until world reset? *(recommended: fade, pooled)*
3. Ceiling: keep open violet void (recommended) or add a real cavern ceiling with stalactites?
4. Should the blue bumper car follow you underground as a chase toy? *(currently stays in city)*
5. Tuning: all motion periods/amplitudes/knock powers centralized in a `UG_TUNING` config object
   at the top of `underground.js` for easy iteration?
