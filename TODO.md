# TODO — Massive Subterranean Obstacle Course

Implementation plan for the underground sandbox level described in `Ideas.md`.
All work happens inside the existing underworld (`src/levels/underground/index.js`,
wired through `addUnderground(undergroundScene)` in `src/main.js`). No goals,
scores, or timers — pure kinetic playground.

## Foundation

1. [x] Pick a build zone: choose coordinates on the 292×276 cavern slab that avoid the Glass City footprint (z ≈ 132–173), the two pillars (-72,98) and (-40,66), and the tunnel foot near (-55,83). Write the chosen zone bounds as constants at the top of `index.js`.
2. [x] Add a shared neon material helper (e.g., `makeGlowMat(color)`) returning emissive `MeshStandardMaterial` variants so all glowing props share one palette and intensity.
3. [x] Add a cavern ceiling mesh above the course zone (dark rock plane at a fixed height, e.g., y ≈ 30 local) plus a few vertical support columns from floor to ceiling, with colliders for the columns.
4. [x] Add dim colored PointLights along the course zone so glowing props read well without washing out the Glass City light.

## Glowing Overhead & Track Hazards

5. [x] Build one suspended neon prompt-block prototype: glowing box mesh hanging from the ceiling by a thin rod, positioned at jump-apex height over a test ramp.
6. [x] Add bump detection for prompt-blocks: when the car is airborne and its position enters a block's trigger radius, fire a callback (no collider — pass-through bump).
7. [x] On bump: flash the block's emissive intensity briefly and mark it on cooldown so it can't retrigger every frame.
8. [x] Spawn a giant foam collectible on bump: big soft-colored sphere/cube that pops out with an upward+random velocity, falls, bounces once or twice, then shrinks and disappears after a few seconds.
9. [x] Cap active foam collectibles (e.g., max ~12) and reuse/recycle oldest to keep the scene cheap.
10. [x] Lay out a row of 5–8 prompt-blocks across the open zone at varied heights so different jumps hit different blocks.
11. [x] Build one oversized glowing conduit pipe prototype: long emissive cylinder spanning a track lane, mounted just above bumper height on end posts.
12. [x] Animate the conduit pipe sliding back and forth across the lane in `update(delta)` using a sine of elapsed time (store phase/speed per pipe).
13. [x] Add pipe-vs-car knockback: when the moving pipe overlaps the car's position, apply a sideways impulse matching the pipe's travel direction so cars get shoved.
14. [x] Place 3–4 conduit pipes across separate lanes with different speeds/phases/directions and register their end-post colliders in the returned `colliders` array.

## Industrial Car Elevators & Sweeper Arms

> REMOVED (2026-09-18): the entire elevator situation was deleted — twin decks,
> hydraulic tubes, roof shaft hole, y=9 ledges, roof beam and sweepers are gone
> (see `underground_ideas.md` #8/#9/#32). The foam pit (item 15) remains.

15. [x] Dig a deep foam pit: recessed padded zone (visual only — dark soft-looking floor patch with raised rim walls that have colliders).
16. [x] Build one elevator platform prototype: flat industrial platform (metal box + hazard-stripe edge) that moves vertically in a smooth up/down loop over the pit.
17. [x] Make the elevator drivable: while the car is on the platform, carry the car with it (track platform delta-Y per frame and offset car.position.y when the car's x/z is within the platform footprint).
18. [x] Give the elevator a dynamic collider so `buildingTopAt` can report its current top height (extend the collider entry or update its `h` each frame in `update`).
19. [x] Build upper ledges/tiers: static walkway platforms at elevator-top height around the pit, with colliders, so drivers can drive off the elevator onto ledges.
20. [x] Tune elevator speed/range so the ride is smooth and the car doesn't clip through at the top or bottom turnaround.
21. [x] Build a high balance beam: narrow long walkway at ledge height connecting two tiers, with a thin collider strip.
22. [x] Build a spinning sweeper arm: glowing horizontal arm rotating around a central post at bumper height above the beam, animated in `update`.
23. [x] Add sweeper hit response: when the rotating arm sweeps through the car's position on the beam, apply a strong outward impulse to knock the car off into the foam pit below.
24. [x] Place 2 beams with sweepers at different heights/speeds and add glow lights to the arms.

## Solid Staircase & Finish Ramp

25. [x] Design the staircase footprint against the cavern wall: N tiers (e.g., 8–10), each tier one step high, leading up to a peak platform.
26. [x] Build the staircase statically first: all steps present as boxes with colliders, verify the car can climb it tier by tier.
27. [x] ~~Add per-step retract animation~~ — REPLACED (2026-09-06): the moving/retracting steps were too complex. The staircase is now a STATIC stepped staircase (9 solid steps, no moving parts) in the CENTRE of the course (cx=42), rising from the open floor south of the elevator hub up onto the south ledge — the real second level / big flat roof the elevator delivers you to (LEDGE_Y = 9). Each step has a neon front-edge strip; soft climb colliders let the car drive up step by step and roll straight onto the roof. The old remote cx=100 roof slab was removed.
28. [x] ~~Sync step colliders with animation~~ — superseded: the static steps' climb colliders are always active (no retract sync needed).
29. [x] ~~Extract the stair timing math into a pure module~~ — `src/modules/stairCycle.js` still exists + passes tests but is no longer imported by the level (kept for the test suite).
30. [x] ~~Build the massive launch ramp at the pyramid peak~~ — REMOVED (2026-09-06): the "little ramp on top of the stairs going the other way" was removed per user request. The padded pole remains as a standalone landmark on the open floor.
31. [x] Build the padded vertical pole: tall cushioned column at the landing point with a trigger volume around it.
32. [x] Pole impact event: when the car hits the pole region above a speed threshold, trigger the reward sequence (see next items); below threshold, just bounce the car off softly.
33. [x] Explosive light show on impact: burst of flashing colored PointLights + expanding ring/shockwave mesh that fades over ~1 second.
34. [x] Impact sound effect: short synthesized boom/chime via WebAudio (no asset files), triggered on pole impact and optionally on foam-collectible bumps.
35. [x] Add a respawn convenience: if the car ends up somewhere unrecoverable (pit corner, behind stairs), make sure the debug `.teleport()` hook still works and consider a gentle auto-nudge back to open floor.

## Polish & Verification

36. [x] Performance pass: merge static geometry where easy, confirm light count stays reasonable, and cap shadow-casting to key props only.
37. [x] Full playthrough test in-browser (`?debug`): drive the mine shaft in, hit every feature — blocks, pipes, elevator, beam sweepers, central stairs (climb to y=9 onto the south ledge), pole — and fix anything that traps or flings the car badly.
38. [x] Remember stale-module gotcha: changed submodules aren't cache-busted, so hard-reload modules before judging behavior.
39. [x] Run `node --test src/carFlatMode.test.mjs src/modules/portalRules.test.mjs` (plus any new tests) and commit the level in small, working increments per section above.
