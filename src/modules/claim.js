// Controller-claim rules for the split-screen pairing screen (plan §4.5).
// Pure by design: no DOM, no Gamepad API. The caller feeds either an
// `event.code` (keyboard) or a pad index, and gets back the next claim state
// or the reason it was rejected. main.js owns the actual listeners and the
// overlay; everything that needs a rule lives here so it can be tested.
//
// A "claim" is one physical input: a keyboard half or one controller. The
// first claim is Player 1's input, the second is Player 2's (plan: "Input #1
// -> Player 1, input #2 -> Player 2"). Duplicates are rejected and re-prompted.
import { INPUT_SCHEMES } from './player.js?v=1791800000000';

export const MAX_PLAYERS = 2;
// The two keyboard halves a claim can land on.
export const KB_HALVES = ['kb-wasd', 'kb-arrows'];

// Which keys count as "a player pressed a key to claim this half". Boost keys
// (ShiftLeft/ShiftRight) are deliberately excluded: ShiftRight sits in BOTH
// schemes and a Shift press could claim either half — ambiguous. Throttle,
// reverse and steer keys are unambiguous per half.
export function claimableCodes(scheme) {
  const s = INPUT_SCHEMES[scheme] || {};
  return [...(s.throttle || []), ...(s.reverse || []), ...(s.left || []), ...(s.right || [])];
}

// Translate a keyboard event code into the keyboard half it claims, or null
// when the key claims nothing (a Shift, a letter outside the two halves, a
// modifier, an unknown code).
export function claimForCode(code) {
  if (!code) return null;
  for (const scheme of KB_HALVES) {
    if (claimableCodes(scheme).includes(code)) return { device: scheme, code };
  }
  return null;
}

// A fresh pairing session.
export function makeClaimState() {
  return { claims: [], players: [] };
}

// Try to attach one input (a keyboard `code` or a `padIndex`) to the pairing.
// Returns { ok, state, player?, claim?, reason? }:
//   ok:true      -> the input was claimed for `player` (0 or 1)
//   ok:false     -> `reason` is why it was not taken
// `reason` is one of:
//   'ignored'    -> not a claimable input (key outside the halves, etc.)
//   'duplicate'  -> that keyboard half / pad is already in use by the other player
//   'full'       -> both players already have inputs
export function tryClaim(state, input) {
  if (state.claims.length >= MAX_PLAYERS) return { ok: false, state, reason: 'full' };
  let claim;
  if (input && input.padIndex !== undefined && input.padIndex !== null) {
    claim = { device: 'pad:' + input.padIndex, padIndex: input.padIndex };
  } else {
    claim = claimForCode(input && input.code);
    if (!claim) return { ok: false, state, reason: 'ignored' };
  }
  for (const c of state.claims) {
    if (c.device === claim.device) {
      return { ok: false, state, reason: 'duplicate', device: claim.device };
    }
  }
  const next = { claims: [...state.claims, claim] };
  next.players = claimStatePlayers(next);
  return { ok: true, state: next, player: next.claims.length - 1, claim };
}

// Cancel the pairing (Esc / pad B). Returns a fresh, empty state.
export function cancelClaims() {
  return makeClaimState();
}

// Map the claimed inputs onto concrete player devices:
//   a 'kb-wasd' claim  -> that player drives with WASD           (no pad)
//   a 'kb-arrows' claim-> that player drives with the arrow keys (no pad)
//   a 'pad:i' claim    -> that player drives a controller wired to pad i,
//                         keeping their own keyboard half for the merge in
//                         readInput (a claimed controller REPLACES the shared
//                         first-pad, so two pads drive independently).
//
// A keyboard- or touch-only claim must fold in NO pad: in split mode each
// player reads pads[p.padIndex], so a keyboard player left on pad 0 would also
// read the very controller the other player claimed and both cars would move
// together. NO_PAD is out of range, so pads[NO_PAD] is undefined and readInput
// falls back to an empty pad.
export const NO_PAD = -1;
export function claimStatePlayers(state) {
  return state.claims.map((c, index) => {
    if (c.device === 'kb-wasd') return { device: 'kb-wasd', padIndex: NO_PAD };
    if (c.device === 'kb-arrows') return { device: 'kb-arrows', padIndex: NO_PAD };
    // touch — two players on one screen, each with an on-screen joystick.
    if (c.device === 'touch') return { device: 'touch', padIndex: NO_PAD };
    // pad:i — padIndex is the claimed controller.
    return {
      device: index === 0 ? 'kb-wasd' : 'kb-arrows',
      padIndex: c.padIndex,
    };
  });
}