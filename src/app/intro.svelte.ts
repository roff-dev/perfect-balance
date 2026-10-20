// The start screen's opening, once per page load: the scale turns a full circle in the middle of
// the screen and settles into its place, then the words come in. Shared so the cookie notice can
// wait for it.

export const intro = $state({
  /** The words are hidden while the scale has the screen to itself. */
  veiled: false,
  /** It hasn't finished, so nothing else (the cookie notice) should arrive yet. */
  playing: false,
});

let claimed = false;

/** True the first time only, so coming back to the start screen from a game doesn't play it again. */
export function claimIntro(): boolean {
  const first = !claimed;
  claimed = true;
  return first;
}
