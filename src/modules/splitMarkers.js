// Marker layer assignment for split-screen (plan §6.2).
// Pure: no THREE here — main.js builds the sprites and sets the layer numbers
// these functions return, and the tests pin the rules.
//
// Each player floats a green "P1"/"P2" tag over their OWN car. A player must
// never see their own tag, but must see the other player's — so each tag is
// put on a THREE layer that only the OTHER player's camera enables:
//   P1's tag (says "P1", floats over P1's car) -> layer 2, seen by P2's camera
//   P2's tag (says "P2", floats over P2's car) -> layer 1, seen by P1's camera
export function markerLayerFor(playerIndex) {
  return playerIndex === 0 ? 2 : 1;
}

// The layer the OTHER player's camera must enable to see the tag floating over
// the car whose index is `playerIndex`. (Same numbers, semantic mirror.)
export function cameraSeesMarkerOf(playerIndex) {
  return playerIndex === 0 ? 2 : 1;
}

// Convenience for the per-viewport visibility rule:
//   viewportOfPlayer(i) sees the tag over the OTHER car.
// Returns the list of player indexes whose tags the given camera must render.
export function markerIndexesVisibleTo(viewerIndex) {
  if (viewerIndex === 0) return [1];   // P1's camera sees P2's tag
  return [0];                          // P2's camera sees P1's tag
}