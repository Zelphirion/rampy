# Checklist

This list captures all requested changes. Mark `[x]` when completed so you can resume if interrupted.

## Inside the House

### Cat proportions and behaviour
- [x] **Tweak cat dimensions for a proper feline shape.** Adjust `CAT_LEN`, `CAT_HEIGHT`, `CAT_WIDTH` and leg segment lengths (`UPPER_LEN`, `LOWER_LEN`, `HIP_Y`) in `src/cat.js`. Target: longer body, much longer legs, taller overall, narrower barrel; haunches should be wider than waist.
- [x] **Rebalance model to match new proportions.** Update barrel/chest/haunch scales, head position, ears, eyes, whiskers, legs, tail segments so the built mesh matches new numbers.
- [x] **Verify via tests.** Run `node --test src/catProportions.test.mjs` and adjust until all pass. 
- [x] **Make cat swipe exactly 3 times then get bored.** Modify `src/cat.js` (and `catTemper.js` if needed): cat should swat 3 times maximum during a chase, then stop swiping and eventually go off to sleep/do its own thing. Track `state.swipes` and transition behavior at 3.
- [x] **Update wiring if needed.** Ensure chase logic respects the 3-swipe limit and still uses the confined swipe. Check `src/catSwipe.test.mjs` behavior if affected.
- [x] **Verify cat tests.** Run `node --test src/cat*.test.mjs` and fix until green.

### Fireplace and Ash mode
- [x] **Add fireplace in sitting room.** Add mesh/model in `src/levels/house/index.js` (fireplace, fire, hot coals) inside the sitting room coordinates. Use emissive materials for fire.
- [x] **Define Ash mode.** When car drives into/near the fireplace area (trigger), set car to "ash" state. When driving out, car becomes completely black (all materials) with ash flakes particles flying off for a while until reverting to regular color.
- [x] **Exclude spider/skater from fire.** For spider and skateboarder, if they try to enter fireplace area they should bounce halfway across the room instead.
- [x] **Wire into house logic.** Add detection/transition in `src/main.js` or house update path. Ensure particles/timer for ash revert.

### Bathroom redesign
- [x] **Reconfigure bathroom.** In `src/levels/house/index.js` (and layout if needed), move bathtub against one wall, add tile all around the bathtub creating a flat surface to drive around the outside, and make the interior of the bathtub driveable like a bowl (from underground).
- [x] **Add small surfboard ramp.** Place a small surfboard leaning against the bathtub to drive up into it.

### Guitar ramp to dresser
- [ ] **Create dresser setup in a bedroom.** In one bedroom, add a dresser. Lean a guitar against it so you can drive up like a ramp to reach the top.
- [ ] **Make dresser top knockable.** Place mini figurines, books, lamp, jewelry, clock, keys, and other items on top — all knockable, fall to floor on impact. Use existing knockable physics/props patterns.

### Mouse hole / kitchen countertop
- [ ] **Add dark mouse hole in kitchen floorboards.** Add trigger hole in floor.
- [ ] **Teleport/car travels to countertop.** When driving into hole, camera stays outside and moves to a mouse hole on the countertop so car can drive on the countertop with the sink.
- [ ] **Sink basins as bowls.** Kitchen sink has two basins like bowls (ramp world style).
- [ ] **Counter items knockable.** Add bread, dishes, fruit, paper towels, soap on counter — knockable, knock to floor. Some glass items break when hitting floor.

### Children's room
- [ ] **Make it messy with toys.** Populate child's bedroom with toys.
- [ ] **Block castle.** Stack thin blocks (not cubes) sideways/tall into a castle with a small cupola. Driving into blocks knocks it down.
- [ ] **Giant balls.** Add at least a soccer ball and basketball (giant to car but regular relative to house). They roll when knocked.
- [ ] **Working train set.** Add 3/4 size train set (off). Driving over a red switch turns it on and it drives in circles on its track. Reuse city train model and cars.

### Remove interior walls (mostly)
- [ ] **Open floor plan.** In `src/levels/house/index.js`, remove all interior walls except the wall around the garage and the wall around the bedrooms.
- [ ] **Bigger bedrooms, big open doors.** Enlarge bedrooms, replace doors with large open doorways.

### Piano mat in child's room
- [ ] **Add piano key mat.** Add a mat on floor in child's room with piano keys. When you drive over a key, it plays the corresponding piano note.

## Underground

### Color tiles make music
- [ ] **Tile music on color change.** When a tile turns blue, it makes a pleasant bong sound; each color makes a lower note. Only colors you directly drive over make sound (not concentric rings spreading out).

## City

### Giant robot camera behavior
- [ ] **Change robot camera zoom rules.** In city/robot code, the giant robot camera must never zoom out unless about to eat you. When about to eat, zoom out starts ~3 seconds before eating; if you drive away in those 3 seconds it won't eat you. Update logic in relevant file (`src/robot.js` or `src/main.js` robot section).

### Beach world entrance (clam shell)
- [ ] **Add giant open clam shell in park.** In city park by little pond, add a giant open clam shell with iridescent pearls. If you drive into it, it closes around you.
- [ ] **Create Beach level.** Add new level `src/levels/beach/index.js` (and any required modules). When clam closes, transition to Beach world. Camera faces closed clam in Beach world which opens so you drive out.
- [ ] **Beach world scene.** Sunset beach looking back to ocean, high cliffs (can't drive up), small/large rocks, sandy beach, sparkling ocean, tide comes in/out making sand wet. 
- [ ] **Crabs behavior.** Crabs initially still. When you find the first crab, all crabs come out and chase like goats; if they get too close they run away.
- [ ] **Underwater.** Can drive into ocean to go underwater. Underwater: slower movement, tinted dark blue, forest of seaweed/kelp, many fish/seahorses/sea turtles, occasional mermaid, bubbles. Stay on ocean floor (no floating). Waves visible.
- [ ] **Wiring.** Hook portal/transition in `src/main.js`/city logic so monster truck fits in shell and transition works.

## Ramp World / Smashable Electrical Grid
- [ ] **Enable smashing for monster truck and steamroller only.** Around electrical grid/power utility area, only monster truck and steamroller can smash down fences and knock equipment.
- [ ] **Electrical effects chain.** Knocking equipment causes huge electrical sparks to fly everywhere, then a fire starts, then town goes dark. 
- [ ] **Global darkness.** When dark, all lights everywhere go dark (streetlights, building lights/window glows) and all lighted windows go dark. Trigger state/visual update across city. Even the sky seems to get dark, lighting is less everywhere except the glowing gems, glowing rings, and glowing irredecent pearls and seashell.  leaving the city for another word resets everything, including the lighting

## Testing & Verification
- [x] **Run full suite.** After changes, run `node --test --test-reporter=tap "src/**/*.test.mjs"` and ensure all tests still pass.
- [x] **Quick smoke tests for affected areas.** Verify cat proportions pass, no encoding issues, cache stamps consistent if you modified imports.

## Notes
- Preserve unrelated uncommitted work; don't revert.
- Keep import `?v=` URLs identical across sites when sharing modules.
- Minimap coords are minimap (use conversion formulas if placing from map).
