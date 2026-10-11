// Vertical two-player scissor/viewport rect maths (split-screen plan §5.2).
// Pure: given a window size in CSS pixels, return the two viewport rectangles
// (x measured from the left, y from the bottom — WebGL viewport convention)
// that tile the screen side by side: Player 1 left, Player 2 right.
export function splitViewports(width, height) {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const half = Math.floor(w / 2);
  return [
    { x: 0, y: 0, width: half, height: h },
    { x: half, y: 0, width: w - half, height: h },
  ];
}

// The two rectangles cover the full width exactly (mid-split for even widths,
// split-minus-pixel + remainder for odd widths, so no column is ever skipped).
export function splitCoversFullWidth(width) {
  const parts = splitViewports(width, 100);
  return parts[0].width + parts[1].width === Math.max(0, Math.floor(width));
}

// The chosen field of view for split cameras (plan §5.1: halving the aspect
// also halves horizontal FOV, so the vertical FOV is bumped to keep the
// horizontal view close to the single-player chase cam).
export const SPLIT_FOV = 72;