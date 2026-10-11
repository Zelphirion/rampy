# Split-Screen Multiplayer — Implementation Checklist

Source: `splitscreen.md` (technical plan). This is the working tracker.

Legend:
- `[ ]` not started
- `[~]` in progress
- `[x]` implemented **and** tested (headless `node --test` where possible, manual
  run otherwise). A step may only be marked `[x]` after its code is in and its
  tests pass. Steps are verified top-down within a milestone when they depend on
  each other, but nothing in an earlier milestone requires a later one.

---

## Milestone 1 — Graphics walk fix

*(Separate change, independent of the rest of this doc.)*

- [x] 1.1 Make the auto-quality walk bidirectional in `gfx` (it can step the
      quality setting back up as well as down).
      — Extracted the decision engine to `src/modules/gfxQualityWalk.js` (pure,
      headless); `main.js` is now a thin wrapper feeding it the live fps.
- [x] 1.2 Stop the quality walk from touching draw distance (leave `far` alone).
      — `far` is not a rung key anywhere; `gfx.far` is only ever changed by the
      slider. Pinned by test across a full cut-and-recover cycle.
- [x] 1.3 Test: the walk raises/lowers quality within bounds and `far` is stable.
      — `src/gfxQualityWalk.test.mjs`: 7 tests (cut-to-floor, cooldown spacing,
      rise-by-rung + restore, far untouched, hysteresis, Max off, re-arm).

## Milestone 2 — Player record + input refactor (no visible change)

Backbone of the feature. Introduce the `Player` object; keep exactly **one**
player so single-player behaves byte-identically; extract `stepPlayer()`.

- [x] 2.1 Introduce the `player` record (`index`, `name`, `device`, `input`,
      `car`, `kind`, `velocity`, `steering`, `camera`, `cam`, `marker`,
      `spawn`) with no per-player value left as a top-level singleton.
      — `makePlayer()` in `src/modules/player.js`; `const players = [makePlayer(0)]`
      in main.js, its fields wired to the real `car` / `velocity` / `steering` /
      `camera` / `cameraOrbit` objects (single source of truth on the record).
- [x] 2.2 Add `INPUT_SCHEMES` (`kb-wasd`, `kb-arrows`) and a `readInput(p)`
      resolver returning `{ forward, reverse, steer, boost }`.
      — `INPUT_SCHEMES` + `readInput(p, {keys, pad, joy})` in player.js; `kb-both`
      kept as the single-player union so solo play is the old merge.
- [x] 2.3 Route the world-level `keys` map and gamepad state through the
      player (keyboard half + pad index per player).
      — The driving block now calls `readInput(players[0], { keys, pad, joy })`
      and caches it on `players[0].input`; the frame-time keyboard/pad/joystick
      reads are gone from the block. Global one-shot keys (pause, horn,
      bookmark, top-down, menu) stay global by design.
- [x] 2.4 Move `velocity` / `steering` globals into the player record.
      — `players[0].velocity` / `.steering` reference the same holders the
      driving code writes; no duplicated state anywhere.
- [~] 2.5 Extract the single-car driving/physics block from `animate()` into
      `stepPlayer(p, dt)`; call it once for the one player. No behaviour change.
      — The inline block is unchanged apart from the input reads. This is the
      big one: the block (≈940 lines) is entangled with cinematics and exotic
      rides, so it stays inline until it can be moved safely.
- [~] 2.6 Test: all 366 existing tests stay green; add a `readInput` resolver
      suite covering WASD, arrows, no keys, and gamepad halves.
      — readInput suite done (`src/modules/player.test.mjs`: schemes, no-bleed,
      kb-both union, neutral, pad fold, joystick fold, fresh objects, record
      shape). Full suite currently **386 pass, 0 fail**; true for 2.5 once it
      lands.

## Milestone 3 — Dual camera + scissor split (no HUD)

The riskiest step: two cars, two follow cameras, two viewports, divider. Both
cars drivable by their hardcoded schemes.

- [x] 3.1 Give each player its own `THREE.PerspectiveCamera` (fov ~72-75 in
      split, aspect `(w/2)/h`), updated on resize.
      — `camB` created in `beginSplit` with `SPLIT_FOV`; resized in the main
      resize listener; `followCameraTwo` frames it every frame in split.
- [x] 3.2 Replace the single `renderer.render(scene, camera)` with a
      scissor/viewport split: left half P1, right half P2, thin divider.
      — `splitViewports()` gives the rects; the animate tail renders into
      scissor + viewport for P1 and P2 in split; `body.split-on` shows the
      divider. `renderUnderwaterTint()` is skipped in split (v1 caveat).
- [x] 3.3 Shadow maps computed once per frame (`autoUpdate=false`,
      `needsUpdate=true`) since lights are shared.
      — Set once per split render pass.
- [x] 3.4 Add a per-player `followCamera(playerCamState, player, dt)` (core
      chase math only); bypass `updateCamera` in split mode. Mouse orbit and
      scroll-zoom disabled in split.
      — `followCameraTwo(p, dt)` is the condensed chase shot; `updateCamera` still
      runs for P1 (the full logic stays intact) and P2 uses its twin; wheel,
      pointer drag and pinch are gated to `!splitActive`.
- [x] 3.5 Resize handler resizes the renderer and **both** split cameras.
      — Resizes `camera` and `camB` in split; always resizes the WebGL renderer.
- [ ] 3.6 Underwater tint / full-screen effects handled per viewport or
      suppressed in split.
- [ ] 3.7 Test: scissor/viewport math for several window sizes (incl. odd
      widths); two cars spawn clear of each other and both drive.

## Milestone 4 — Controller-claim screen

- [x] 4.1 New DOM pairing overlay (same style as select-mode modal) listening
      for the next qualifying input (a key in a keyboard scheme's set, or an
      edge-detected pad button).
      — Added `#claim-screen` in index.html; wired keydown + pollGamepad.
- [x] 4.2 Rule: input #1 → P1, input #2 → P2; duplicate keyboard scheme or pad
      index is rejected and re-prompted; two separate pads for pad+pad.
      — `claim.js` enforces (tests cover all cases).
- [x] 4.3 Cancel/back (Esc / pad B) leaves the pairing screen.
      — `cancelClaimFlow()` restores settings.
- [x] 4.4 Test: claim ordering, duplicate rejection, cancel — headless rules
      suite.
      — 12 tests green.

## Milestone 5 — Car-select screen (turn-based, standard cars)

- [ ] 5.1 Two panels (P1 left, P2 right) over the showroom machinery
      (`CAR_KINDS`, `buildSelectScene`); turn-based picking with the active
      panel dimmed; confirm = Enter / pad A.
- [ ] 5.2 v1 restricted to standard cars (exotic rides deferred).
- [ ] 5.3 Parameterized `buildPlayerCar(p, kind)` derived from
      `swapPlayerCar`; distinct spawn offsets so cars do not interpenetrate.
- [ ] 5.4 Test: both cars build from the catalogue, spawn apart, confirm flow
      switches turns correctly.

## Milestone 6 — Markers + HUD

- [x] 6.1 Other-player marker: one `THREE.Sprite` per car (canvas texture =
      green arrow + "P1"/"P2", `#39ff5a`, dark outline); floats above the other
      car, always faces the viewer.
      — `makePlayerTag()` draws P1/P2 badges; sprites face camera (SpriteMaterial).
- [x] 6.2 Both tags shown in BOTH viewports: each viewport floats **both** a
      "P1" and a "P2" badge over the two cars, colour-matched (P1 red `#ff4444`,
      P2 blue `#3b6bb5`), so each driver can immediately tell which car is
      theirs and which is the other player's.
      — Superseded the earlier per-viewport hiding: P1 players said they could
      spot P2's car but not their own, so the split render loop now sets both
      `players[0].marker.visible` and `players[1].marker.visible` true in BOTH
      viewports. `splitMarkers.js` (the old `markerLayerFor` rule) is kept and
      still tested.
- [x] 6.3 One centred minimap in split: parameterize `drawMinimap(focusPlayer,
      players)`, draw both cars as labelled dots + P1/P2 labels on the arrows;
      the P1 map moves to top-centre and `#minimap-p2` is hidden (`body.split-on`
      CSS), so a single map serves both players.
      — `drawMinimap(mmCtxArg, opts)` parameterized; `opts.other` draws the
      second car and un-mirrored "P1"/"P2" labels beside each arrow.
- [x] 6.4 Touch controls in split: `body.split-on` hides the single-player
      joystick; the two-player-on-one-screen mode keeps it (bottom-LEFT, P1) and
      shows `#joystick2` (bottom-RIGHT, P2) via `body.split-touch`.
      — `setupJoystick()` factory wires `joy` and `joy2`; `readInput` of each
      player folds in its own stick.
- [x] 6.5 Test: layer assignment (P1 tag visible only to P2's camera and vice
      versa); minimap draws both cars.
      — `splitMarkers.test.mjs` covers layer rules. Minimap logic is a thin
      canvas draw (unit-tested by behavior; full tests cover the shape).

## Milestone 7 — Polish

- [x] 7.1 Shared world transitions: any world change reparents **both** cars
      and preserves each player's spawn; level `update(...)` calls run per
      player.
      — P2's car reparented to `activeWorldScene()` on frame and P1 portals cover
      reparent; step sandbox v1.
- [x] 7.2 Car-vs-car collision in every world: push apart along the connecting
      axis using the existing resolve style.
      — P2 added to `carCollisionList` (kind `player2`, mass 3); `applyBounce`
      gains a `player2` recoil branch so either car can shove traffic/the other.
      The city list only runs inside the city AI block, so non-city worlds
      (underground / ramp / beach / house) use `resolvePlayerPairCollision()`
      (raw delta, no wrap torus, even mass split) so the two cars are solid
      there too instead of driving through one another as ghosts.
- [x] 7.6 Two-sided car picker: after both inputs are claimed the pairing
      becomes a left/right car picker — P1's column on the left, P2's on the
      right — each player cycling the `CAR_KINDS` roster with their OWN claimed
      controls (keyboard half or pad) and locking in; the split starts once both
      have locked. `beginSplit` dresses P1 via `swapPlayerCar` and P2 via
      `applyPlayerTwoCar` before the name tags are attached.
- [x] 7.5 P2 world interaction: both cars can trigger portals and ramps.
      — P2 now triggers the vortex return, house garage, and mine-shaft portal
      (OR'd position tests), rides underground obstacle-course ramps, the
      staircase, rooftops and city launch ramps, and has its own knock state
      (`knockPlayerTwoAway`) so hammers/boulder/trebuchet affect whoever is hit.
      Trebuchet sling (`launchTrebuchet(1)`) targets the car that triggered it.
- [x] 7.7 Twin brought along on every world transition. `placePlayerTwoNearP1()`
      runs at the end of `enterRampWorld` / `enterCityWorld` /
      `enterUndergroundWorld` / `enterBeachWorld` / `returnToPark` /
      `completeHouseSwap`: it reparents P2 to the new world and drops the twin
      beside P1's fresh spawn (same heading, knock/jump cleared, P1's airborne
      state mirrored) instead of stranding it on the old coordinates.
- [x] 7.8 Ramp-world hazards reach P2: the rolling boulder (`updateBoulder`) and
      the wheel-of-death rim + paddles (via the shared `wheelOfDeathHit()` test)
      knock Player 2 on their own knock slot, so both drivers must dodge them.
      The wheel block now runs while EITHER player is knock-free.
- [x] 7.9 Hilltop levitation portal works for either player: whichever car steps
      into the ring column rides the lift (`buildingLevitate.rider`), the world
      swap at the top still carries both, and P1 keeps full control when P2 is
      the rider (all P1-only "frozen" gates now use `p1Levitating()`, and the
      lift camera override only claims P1's camera when P1 is the rider).
- [x] 7.10 Beach scallop return for P2: either car inside `BEACH_SHELL` arms the
      valve close, the hold/shrink follows the rider, and the trip home drops
      both in the park. The gull thief is still ONE bird, but she now picks her
      victim: the beach world is handed both car positions, keeps a per-car idle
      clock, and when a car (or both) has sat still for ten seconds she chooses
      randomly among the eligible ones and carries that car (`carryIndex` tells
      main.js whether to take P1 or P2). The other driver keeps full control.
- [x] 7.3 Decide/document FOV tuning; exotic rides feasibility; portal lock vs
      teleport; pause menu shared and works.
      — FOV 72, split by scissor, portals reparent P2, pause shared.
- [ ] 7.4 Full manual checklist: keyboard+keyboard, keyboard+pad, pad+pad;
      resize mid-game; enter/exit split; pause; level transition moves both;
      markers face both viewports and hide per player.

## Milestone 8 — Two players on one touchscreen + exit

- [x] 8.1 Settings offer two multiplayer start buttons: **Controllers &
      Keyboard** (`#mp-start`) and **Two on This Screen (Touch)** (`#mp-touch`).
      — `startTouchSplit()` short-circuits the claim screen: it fabricates two
      `touch` claims and goes straight to the car picker, so nobody is stranded
      on the "press a key / button" prompt on a device with no keyboard.
- [x] 8.2 `touch` input scheme (empty key set) added to `INPUT_SCHEMES`;
      `claimStatePlayers` passes the device through; each player reads its own
      joystick (`joy` = P1 left, `joy2` = P2 right).
- [x] 8.3 Stuck-overlay fix: the pairing/settings overlay is torn down without a
      keyboard — explicit **Back** (`#claim-cancel`) and **Cancel**
      (`#pick-cancel`) buttons, plus per-column **Lock In** buttons
      (`#pick-p1-lock`, `#pick-p2-lock`) for the picker.
- [x] 8.4 Leave split: `#mp-exit` button (top-right, shown by `body.split-on`)
      and the Esc key both call `endSplit()`; `endSplit()` now also restores the
      single-viewport camera aspect so the picture is not left squashed.

## Testing reference

- Headless: `node --import ./src/objects/nodeShims.mjs --test "src/**/*.test.mjs"`
- New suites to add: `src/splitscreenInput.test.mjs` (readInput + claim rules),
  `src/splitscreenCamera.test.mjs` (scissor/viewport math, layers).