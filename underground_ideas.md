# Underground Area — Ideas Not Yet Built

Everything below lives in the underground (`src/levels/underground/index.js`,
`src/modules/holyMountain.js`, `src/glasscity.js`, wired through main.js). The
notes list things we talked about but haven't implemented, plus new ideas for
this area. Sources are cited where the idea came from (`Ideas.md`, `TODO.md`,
or a code comment).

## Previously Talked About But Not Built

1. **Foam that looks like foam.** `Ideas.md` — "give the neon glowing foam a
   texture so it looks more like foam." Bumped foam is still a plain pastel
   sphere (no bubble texture). Could use a canvas bubble texture on the sphere,
   or replace it with a cluster of small bright cells.

2. **Rotating platter.** `Ideas.md` — "rotating platter." A big spinning
   turntable on the cavern floor (or on the second roof) that carries the car
   in a circle and flings it off when the grip ends. Nothing like this exists
   yet.

8. **Sweeper arms, balance beams and upper ledges around the elevator.**
   `TODO.md` #21–#24 + code comment at `index.js:1044` — ledges, balance beams
   and spinning sweeper arms used to ring the elevator at its old top (y=9).
   They were removed so the elevator can rise to the ceiling, and the
   `sweepers` array is now always empty. Re-add sweepers at the new elevator
   heights (or on the second roof) so `onSweeperHit` gets used again.  

9. **Elevators delivering to upper ledges.** `Ideas.md` design doc — "continuous
   vertical platform lifts ... allow drivers to ride their cars to elevated
   tiers and drive along upper ledges." The elevator reach now tops out at the
   ceiling itself, but there are no mid-height ledges/tiers to drive onto and
   off from along the way.  -- yeah make the elevator actually work - put a hole in the ceiling so it can deliver you up there and you can start driving on the colorful tiles


13. **Trampoline/launch pads on the cavern floor.** Glowing bounce patches that
    throw the car high enough to land on the ceiling tiles, giving a floor→roof
    path that doesn't use the staircase or grand ramp.

14. **Giant rotating disco ball above the course.** A big mirrored sphere
    hanging from the ceiling (near the pole) that spins and casts moving neon
    dots across the cavern. Bonus: knocking it with a jump makes it swing.

15. **Shooting stars in the foreboding sky.** The constellations/stars exist;
    add occasional meteors streaking across the dark sky, visible from the
    second roof and through holes.


22. **More conduit-pipe patterns.** The four sliding pipes are all "horizontal
    sweeps." Add a vertical/guillotine pipe, or a double-beam X crossing a lane,
    to vary the timing puzzles.



24. **Interactive shrine.** The holy man and goats are static props; give them a
    reaction (man raising an arm, goats turning) when the car arrives or honks,
    and make the light beam pulse in response to the car idling in the chamber.

25. **Crystal clusters + a central crystal spire in the Glass City.** The city
    reads as "crystal city" to us — add glowing crystal clusters along the
    streets (like the mine gems) and one big central citadel crystal that the
    towers ring.  -- also the baloons should pop when you run into them

26. **Moving mannequin tableaux.** The shop mannequins are frozen; let some
    "change pose" slowly (a rotating body/arm on a clock), like living exhibits.


28. **Kickable foam pieces.** Foam balls only bounce on the floor; have the car
    nudge them when it drives through a pile, so they scatter realistically
    instead of sitting untouched.

29. **Underground minimap / feature markers.** The cavern is large and dark;
    markers for the pole, staircase, elevator, waterfall and mountain on the
    minimap (or a cavern-only map) would help find the features.


31. **More statue types.** Beyond the Art Deco obelisks and Vorticist trees:
    cubist figures, broken columns, a giant hand — and statues that also topple
    when the CAR tags them (not just when their tile crumbles).

32. **Twin counterweight elevators.** Two platforms that move opposite each
    other (one up while the other drops) over the foam pit, so there's always a
    ride available and a cool balance-challenge when they meet mid-height.

33. **Giant conveyor lane.** A slow-moving conveyor band across part of the
    floor that drags the car sideways while it drives — great for low-speed
    tomfoolery and parking skill tests.
