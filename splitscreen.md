# Local Split-Screen Multiplayer — Technical Plan

Status: **design only, nothing implemented yet.**

This document describes how to add two-player local split-screen to Rampy:
two humans, one machine, one shared world, each with their own controls,
their own car, and their own half of the screen.

---

## 1. Player experience (the target)

1. From the menu / showroom, the player picks **2 Players**.
2. A pairing screen asks each player to claim a controller:
   - **Player 1**: *"Press W, A, S or D, or a button on your controller."*
   - **Player 2**: *"Press the arrow keys, or a button on a second controller."*
   - Valid combinations: **WASD + Arrows** (both on the keyboard), **WASD + pad**,
     **Arrows + pad**, or **two pads**. Duplicate claims are rejected and
     re-prompted.
3. Each player then selects a **car** (both selections shown side by side so
   nobody loses track of who picked what).
4. The game starts in **vertical split-screen**: **Player 1 on the left**,
   **Player 2 on the right**, with a thin divider down the middle.
5. While playing, each player sees a **green floating marker** above the *other*
   player's car: a green arrow plus green "P1"/"P2" lettering that always faces
   the viewer. A player never sees their own marker floating over their own car.
6. Each side has its own chase camera and its own minimap. Both cars share one
   world; a portal or level change triggered by either player moves both.

---

## 2. Where the code is today (constraints to plan around)

Rampy is effectively one giant ES module, `src/main.js` (~11.8k lines), plus small
helper modules under `src/modules/`, `src/levels/`, and `src/*.js`. Two facts
dominate the design:

**There is exactly one of everything that should be per-player.**

| Concept | Current location | Notes |
|---|---|---|
| Player car | `const car = createCar(0xa61e1e)` — `src/main.js:1391` | reparented between scenes on world change |
| Velocity / steering | `const velocity`, `const steering` — `src/main.js:1429-1430` | single global mutable holders |
| Keyboard state | `const keys = {}` — `src/main.js:1428` | one map, global keydown/keyup at `src/main.js:5423` |
| Gamepad state | `const pad = {…}` — `src/main.js:5523`, polled in `pollGamepad()` — `src/main.js:5613` | **only the first connected pad** is used |
| Camera | `const camera = new THREE.PerspectiveCamera(60, …, 0.1, gfx.far)` — `src/main.js:513` | one chase camera, ~800-line `updateCamera()` — `src/main.js:7975` |
| Chase-cam state | `cameraOrbit`, `cameraYawOffset`, `camOffset`, `cameraTarget` | global |
| World | `worldState` string (`'city'|'ramp'|'underground'|'house'|'beach'`) | one active scene at a time |
| Ride identity | `playerCarKind` (`src/main.js:5845`), `playerRobot`, `playerTrain`, … | singleton booleans |
| Renderer | `renderer` — `src/main.js:832` | single full-window WebGLRenderer |
| Render call | `renderer.render(scene, camera)` — `src/main.js:11028` | one view per frame |
| Minimap | `drawMinimap()` — `src/main.js:4938`, canvas in `index.html:1121` | hardwired to `car` |
| Resize | `window.addEventListener('resize', …)` — `src/main.js:11871` | updates one camera + renderer |

There is **no `Player` class, no player index, no player array** anywhere. There
is one useful precedent for a second, independently-updated vehicle: the blue
"steamroller" chaser `bumperCar = createCar(0x1e7ea6)` (`src/main.js:1421`),
swapped with `applyChaseCar(kind)` (`src/main.js:5971`) and driven by
`updateRampWorldBumper()` (`src/main.js:7738`).

Everything below therefore has two parts: (a) introduce a per-player structure,
(b) duplicate rendering / HUD for two viewports.

---

## 3. Core abstraction: the `Player` record

Introduce a single object that owns everything that is currently a singleton.
This is the backbone of the whole feature.

```js
// One per human. P1 = index 0, P2 = index 1.
const player = {
  index,            // 0 | 1
  name,             // 'P1' | 'P2'
  device,           // 'kb-wasd' | 'kb-arrows' | 'pad:0' | 'pad:1' | …
  input,            // { forward, reverse, steer, boost } filled each frame
  car,              // THREE.Group from createCar / buildPlayerCar
  kind,             // id from CAR_KINDS
  velocity,         // { value }  (was the global `velocity`)
  steering,         // { value }  (was the global `steering`)
  camera,           // its own THREE.PerspectiveCamera
  cam: {            // its own chase-cam state
    orbit:  { radius, phi, minPhi, maxPhi },
    yaw, target, offset,
  },
  marker,           // { group, sprite } the floating P1/P2 tag
  spawn,            // THREE.Vector3 spawn/orientation
};
```

The refactor is staged so single-player keeps working at every step
(see §9). The key discipline: **no per-player value may keep a top-level
`const`/`let` of its own.**

---

## 4. Input

### 4.1 Device schemes

Define named schemes instead of scattering key checks:

```js
const INPUT_SCHEMES = {
  'kb-wasd':   { throttle:['KeyW'], reverse:['KeyS'], left:['KeyA'], right:['KeyD'], boost:['ShiftLeft','ShiftRight'] },
  'kb-arrows': { throttle:['ArrowUp'], reverse:['ArrowDown'], left:['ArrowLeft'], right:['ArrowRight'], boost:['ShiftRight'] },
};
```

Gamepad schemes use the existing mapping in `pollGamepad` (`src/main.js:5613`):
left stick X steer, RT throttle, LT reverse, A boost, etc.

The current frame-time reads at `src/main.js:8858` and `src/main.js:8900`:

```js
if (keys['ArrowUp'] || keys['KeyW']) forward = 1;
if (keys['ArrowLeft'] || keys['KeyA']) { … }
```

become a per-player resolve:

```js
function readInput(p) {
  // keyboard half OR pad index; returns {forward, reverse, steer, boost}
}
```

### 4.2 Multiple gamepads

`pollGamepad` currently does `for (const p of list) { if (p && p.connected) { gp = p; break; } }`
(`src/main.js:5613+`) — first pad wins. Change to build a **list of connected
pads** (`navigator.getGamepads()`), and let each `Player` reference a specific
pad index. State must become `pads[index] = {steer, throttle, reverse, boost, …}`
rather than one flat `pad` object.

### 4.3 Touch

The on-screen joystick (`joy`, ~`src/main.js:5457`) is inherently single-player.
**Hide it in split-screen mode.**

### 4.4 Global keys

Pause (`Space`), horn (`H`), bookmark (`B`), and top-down toggle (`C`) are global
today. In split mode:
- **Pause** stays global (Space / pad Start) — both players share it.
- **Top-down (`C`)** is disabled: the plan camera is a single-view concept
  (`toggleTopDownCamera` — `src/main.js:743`, and the top-down far-plane override
  in `updateCamera`).
- Horn can remain global, or be routed to whichever player's device pressed it
  (nice-to-have).

### 4.5 Controller-claim screen

The pairing overlay is a new DOM screen (same style as the existing
`select-mode` modal, `src/main.js:6555` `enterSelectMode`). It listens for the
*next* qualifying input and assigns it:

- `keydown` with a code in a keyboard scheme's key set → claims that scheme.
- Any pad button press (edge-detected, not held) → claims that pad index.

Rules:
- Input #1 → Player 1, input #2 → Player 2.
- Reject an input that maps to an already-claimed keyboard scheme or pad index
  ("Player 1 is already using that — Player 2, pick the other one").
- A pad may not be claimed twice; two separate pads are required for pad+pad.
- Support **cancel/back** (Esc / pad B) to leave the pairing screen.

This satisfies "both players press a button to select their controller" while
staying unambiguous when both use the same physical keyboard.

### 4.6 Car-select screen

Reuse the showroom machinery: `CAR_KINDS` (`src/main.js:5793`),
`buildSelectScene` (`src/main.js:6413`), and the `selectScene`/`selectCamera`
renderer path (`src/main.js:8831`).

- Show **two panels** (P1 left, P2 right). Each shows the chosen car and cycles
  through the same catalogue.
- **v1: turn-based** — P1 picks and confirms, then P2. Turn-based avoids needing
  distinct confirm keys for two keyboard players (confirm = `Enter` / pad A while
  a single player is "active"). The panel for the non-active player is dimmed.
- A later iteration can make it simultaneous with per-scheme confirm keys.
- **Restrict v1 to standard cars.** The exotic rides (robot, train, tarantula,
  crab, taffy, flat, steamroller) ride on singleton globals and per-frame special
  cases; supporting two of them at once is out of scope for the first cut.
- Build each car with a parameterized `buildPlayerCar(p, kind)` derived from
  `swapPlayerCar` (`src/main.js:5993`), and give each a distinct spawn offset so
  they do not interpenetrate at the start.

---

## 5. Rendering the split

### 5.1 Two cameras

Give each player its own `THREE.PerspectiveCamera`. Clone the settings from the
main camera (`fov 60`, near `0.1`, far `gfx.far` — `src/main.js:513`).

- **Aspect:** each viewport is half as wide, so `cam.aspect = (window.innerWidth/2) / window.innerHeight`. Update on resize and on entry.
- **Field of view:** halving the aspect also halves horizontal FOV, which feels
  cramped in a chase cam. Recommend bumping split-mode vertical FOV to ~72–75°
  so the horizontal view stays close to single-player.

The existing single `camera` (`src/main.js:513`) remains the single-player
camera; split mode swaps in `players[0].camera` / `players[1].camera`.

### 5.2 Two viewports via scissor

There is no post-processing stack (no `EffectComposer`), which makes this clean.
Replace the single `renderer.render(scene, camera)` at `src/main.js:11028` with:

```js
const w = window.innerWidth, h = window.innerHeight, half = Math.floor(w / 2);
renderer.setScissorTest(true);
renderer.setViewport(0, 0, half, h);        renderer.setScissor(0, 0, half, h);
renderer.render(scene, players[0].camera);  // left  (autoClear clears only the scissor)
renderer.setViewport(half, 0, w - half, h); renderer.setScissor(half, 0, w - half, h);
renderer.render(scene, players[1].camera);  // right
renderer.setScissorTest(false);
```

`setViewport`/`setScissor` take CSS pixels; three.js applies the device pixel
ratio internally.

### 5.3 Shadow maps

Two `render()` calls would recompute shadow maps twice per frame. Cheap fix:

```js
renderer.shadowMap.autoUpdate = false;
// once per frame, before the first viewport:
renderer.shadowMap.needsUpdate = true;
```

The lights are shared by both viewports, so a single shadow pass is correct.

### 5.4 Underwater tint and other full-screen effects

`renderUnderwaterTint()` (`src/main.js:854`) draws a full-screen quad with
`autoClear=false` after the main render — it would tint *both* halves from one
of the cameras' viewpoint. In split mode, render it once per viewport (set the
scissor before each call) or suppress it. Low priority; note it so it is not
forgotten.

### 5.5 The divider

A 2px DOM element pinned to the vertical centre (CSS `position: fixed; left:
50%; top: 0; bottom: 0; width: 2px;`), shown only in split mode. Not part of the
WebGL canvas.

### 5.6 Resize

`src/main.js:11871` currently resizes one camera. Extend it to resize the
renderer plus **both** split cameras (half-width aspect each). Both cameras'
`updateProjectionMatrix()` must run.

---

## 6. The other-player marker (green arrow + P1/P2)

Requirement: a green arrow and green "P1"/"P2" lettering floats above the other
player's car and always faces the viewer.

### 6.1 Geometry

Build the marker as **one `THREE.Sprite`** whose texture is a canvas containing
the arrow *and* the lettering (bold green `#39ff5a`, dark outline for contrast).
A sprite is a screen-facing quad by definition, so it **always faces whichever
camera renders it with zero per-frame work** — perfect for the "always faces
you" requirement.

```js
const canvas = document.createElement('canvas');       // e.g. 128x128
// draw arrow + "P1"/"P2" text in green
const tex = new THREE.CanvasTexture(canvas);
const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
sprite.scale.set(1.6, 1.6, 1);
sprite.position.set(0, 2.6, 0);                        // float above the car
car.add(sprite);
```

- `depthTest: true` means the marker is hidden when the car is behind a wall —
  that matches "when you see the other car." (A later option could float it above
  everything with `depthTest:false` + a high `renderOrder`.)
- `sizeAttenuation` stays default `true` so it scales with distance naturally.

### 6.2 Only show the *other* player's marker, per viewport

Both viewports render the same scene with two cameras, so we must hide each
player's own marker from their own view. Use **three.js layers**:

- P2's marker (labelled "P2") → `layer 1`, enabled on **P1's** camera only.
- P1's marker (labelled "P1") → `layer 2`, enabled on **P2's** camera only.

```js
p1Marker.sprite.layers.set(2);   // P1's own tag — seen by P2's camera
p2Marker.sprite.layers.set(1);   // P2's own tag — seen by P1's camera
camA.layers.enable(2);           // P1's camera sees layer 2 (the "P1" tag on the other car)
camB.layers.enable(1);           // P2's camera sees layer 1 (the "P2" tag)
```

(Layer 0 stays enabled on both cameras for the rest of the world. Confirm
`camera.layers.autoUpdate` behaviour — `enable()` is additive on top of layer 0.)

Markers are created only when split mode starts, and hidden/removed otherwise so
single-player is untouched.

---

## 7. Physics, camera follow, and world integration

### 7.1 The per-frame step

The single-car driving/physics block currently lives inline in `animate()`
(`src/main.js:8801+`), roughly `src/main.js:8855-9560`. Extract it into:

```js
function stepPlayer(p, dt) { /* uses p.car, p.velocity, p.steering, readInput(p) */ }
```

and call it for each player. This is the largest single piece of work. Approach:

- **Phase 1 (no behaviour change):** wrap the existing body in `stepPlayer(car,
  velocity, steering, input)` and call it once for the single player.
- **Phase 2:** give each `Player` its own `velocity`/`steering` and call twice.

Per-frame special cases that assume one car must be made per-player or explicitly
gated: `robot.playerCaptured`, `spiralCine`, `gullHasTheCar()`, hole-fall,
train/portal traps, `respawnPlayer()` (`src/main.js:3904`), and the exotic ride
modes. v1 keeps these applying to both cars where harmless, and disabled where
they hijack a single camera.

### 7.2 Camera follow

`updateCamera(delta)` (`src/main.js:7975`) is ~800 lines and full of cinematics,
top-down overrides and single-car assumptions. Do **not** refactor all of it.

- In split mode, bypass `updateCamera` and use a small, new
  `followCamera(playerCamState, player, dt)` that reproduces only the core chase
  math (heading → theta → desired offset → lerp → `lookAt`, the code around
  `src/main.js:~8420-8800`).
- Give each player its own `cam` state so their orbit/zoom are independent.
- **Mouse orbit / scroll-zoom:** either applies to both viewports or is disabled
  in split. v1 recommendation: **disable mouse orbit** (each player has a fixed
  chase camera) to avoid one mouse steering two cameras.
- All camera hijacks (spiral cine, house garage fade, gull, cutscenes) are
  skipped in split mode; world *events* still fire, only the camera override is
  suppressed.

### 7.3 World state and transitions

Both players share one `worldState` and one active scene. When either player
triggers a portal / world change (`enterRampWorld` `src/main.js:3969`,
`enterCityWorld` `src/main.js:4102`, etc.), the transition must reparent **both**
cars and preserve each player's relative spawn. Level update functions that take
a single `car.position` today
(e.g. `undergroundWorld.update(delta, car.position, …)`, `beachWorld.update(…)`)
must be called per player or taught to accept both.

This is a known v1 limitation to document for players: **level changes are
shared.** A future option is to lock portals in split mode.

### 7.4 Car-vs-car collision

Optional for v1, but cheap: after both `stepPlayer`s, if the cars' planar
distance is below a radius, push them apart along the connecting axis (reuse the
wall-slide/collision resolve style around `isPositionBlocked`, `src/main.js:987`).
Start without it and add if playtesting shows cars overlapping.

---

## 8. HUD

### 8.1 Minimap

`drawMinimap()` (`src/main.js:4938`) hardcodes `car`. Parameterize it as
`drawMinimap(focusPlayer, players)`, and draw **both** cars as labelled dots
(P1 one colour, P2 another) on every minimap, with the focus player's own car
distinguished.

- **v1:** one minimap per side — left canvas bottom-left (P1), a second canvas
  bottom-right (P2). Add a `#minimap-p2` to `index.html` mirroring `#minimap`
  (`index.html:1121`).
- The minimap canvas is 160×160 and already rotated 180°; the `AGENTS.md`
  coordinate mapping (`mapX = 90 - worldX`, `mapZ = 123 - worldZ`) is unchanged.

### 8.2 Other HUD

- Hide the on-screen touch joystick in split mode.
- The gear/FPS badge and settings panel are global — fine as-is.
- Pause menu content is shared; both players pause together.

---

## 9. Suggested milestones

Each milestone leaves the game playable.

1. **Graphics walk fix** (separate change, already independent of this doc):
   make the auto-quality walk bidirectional and stop it touching draw distance.
2. **Player record + input refactor (no visible change).** Introduce the `Player`
   object, keep exactly one player, route `keys`/`pad`/`velocity`/`steering`
   through it, and extract `stepPlayer()`. All 366 existing tests must stay green.
3. **Dual camera + scissor split (no HUD).** Two cars, two follow cameras, two
   viewports, divider. Both cars drivable by hardcoded schemes. This is the
   riskiest step (shadow maps, aspect/FOV, resize).
4. **Controller claim screen.** Pairing flow with duplicate rejection.
5. **Car-select screen** (turn-based, standard cars only).
6. **Markers** (green arrow + P1/P2 via layers) and **HUD** (two minimaps,
   hide joystick).
7. **Polish:** shared world transitions, optional car-vs-car collision, exotic
   rides if feasible, mouse-orbit decision.

---

## 10. Testing

- The project runs headless via `node --test` (see `package.json`, and existing
  suites such as `src/gamepadControls.test.mjs`). Add tests for:
  - the input-scheme resolver (`readInput`) across keyboard halves and pad states,
  - the controller-claim rules (duplicate rejection, ordering, cancel),
  - marker layer assignment (P1 tag on layer seen only by P2's camera, and vice
    versa),
  - scissor/viewport math for a few window sizes (including odd widths).
- Manual checklist: two-keyboard play, keyboard+pad, pad+pad; resize mid-game;
  enter/exit split to single-player and back; pause; level transition moves both;
  markers face camera in both viewports and hide correctly per player.

---

## 11. Risks & open questions

- **The physics extraction is the hard part.** The driving block is entangled
  with cinematics and exotic rides; keeping single-player byte-identical during
  the refactor is essential.
- **Exotic rides under two players** are deferred; document that split v1 is
  standard cars.
- **Shared world/portals** may separate the players across levels; decide whether
  to lock portals or teleport the other player.
- **Mouse orbit, top-down camera, and touch joystick** are single-user concepts
  and are disabled in split mode.
- **Performance** roughly halves (two viewports), so the automatic quality walk
  will matter more; ensure the walk still behaves with split rendering (it
  operates on shared `gfx`, which is fine).
- **FOV/aspect** tuning is subjective — playtest the split FOV before settling.
