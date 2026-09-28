# AGENTS.md

## Minimap coordinates — how they map to world coordinates

The game world uses **world coordinates** (Three.js x / z on the ground plane).
The on-screen minimap displays **minimap coordinates**, which are a rotated /
flipped view of the same plane. They are NOT identical — a minimap coordinate
must be converted before it can be used as a world position. This is the single
most common source of misunderstanding, so read this before placing anything
from the minimap.

### Conversion formulas

Defined in `src/main.js` `drawMinimap()` (comment lines ~2782-2794):

```
mapX = worldXHi - worldX     // = 90 - worldX
mapZ = worldZHi - worldZ     // = 123 - worldZ
```

and their inverse (what you use when placing a feature at a given minimap spot):

```
worldX = worldXHi - mapX     // = 90 - mapX
worldZ = worldZHi - mapZ     // = 123 - mapZ
```

Constants live in `src/modules/world.js`:

- `worldXLo = -90`, `worldXHi = 90`   → mapX range 0..180
- `worldZLo = -90`, `worldZHi = 123`  → mapZ range 0..213

### Why the inversion

`drawMinimap()` rotates the world view 180° (canvas `scale(-1,-1)` about the
160×160 centre) so that **+Z (north) is at the TOP** of the minimap and
**+X (east) is on the LEFT** — a true view-from-above. The minimap axis
numbers therefore count the "upper-left corner origin" values: top-edge x
labels read `worldXHi - g`, left-edge z labels read `worldZHi - g`.

Net effect: a world position with a large X/Z shows up with a SMALL mapX/mapZ
(and vice versa).

### Worked examples (underground course gates)

Note in `src/levels/underground/index.js` there is a comment block recording:

```
//   START  map (107, 57) -> world (-17, 66)
//   FINISH map (87, 153) -> world (3, -30)
```

- A user saying "put the start banner at minimap x=107 z=57" wants world
  (90-107, 123-57) = (−17, 66).
- Never copy minimap numbers into `GRAND.x`, `makeStartGate(...)`, collider
  positions, etc. — those all take WORLD coordinates.

### Aesthetics / placement sanity check

- World XZ must stay inside the slab: x ∈ [-146, 146], z ∈ [-96.5, 179.5]
  (`SLAB` in `src/levels/underground/index.js`).
- The Holy Mountain sits at world (−100, 8) with `baseR = 34`
  (`MOUNT` in `src/modules/holyMountain.js`) — keep gates clear of it.
- Minimap feature markers come from a level's exported `mapFeatures` list
  (see the underground level's `mapFeatures`), rendered in `drawMinimap()`.
  Their `x`/`z` are WORLD coordinates.

### Quick reference table

| location (source of truth)   | world x | world z | minimap x (90−x) | minimap z (123−z) |
|------------------------------|---------|---------|------------------|-------------------|
| Holy Mountain centre         | −100    | 8       | 190 (off-map)    | 115               |
| START banner (per user)      | −17     | 66      | 107              | 57                |
| FINISH ribbon (per user)     | 3       | −30     | 87               | 153               |
| Candy waterfall (grand ramp) | 24      | 65      | 66               | 58                |

All prompts will always be in minimap coordinates, since that is what is reported on the map.  Assume any coordinates you get in a prompt are minimap coordinates.