/**
 * Scroll hooks: the campaign framework asks, the scrolling-levels session answers. Until it installs an implementation
 * (`setScrollHooks`), the default does nothing and reports zero distance, so `setScrollSpeed` beats are harmless and
 * `atDistance` beats never fire.
 */
export interface ScrollHooks {
  /** Set the world scroll speed in px/s, easing over `ease` seconds (default 0 = at once). */
  setSpeed(speed: number, ease?: number): void;
  /** Distance scrolled so far in the current objective attempt, px. */
  distance(): number;
}

export const NOOP_SCROLL: ScrollHooks = {
  setSpeed: () => {},
  distance: () => 0,
};

let current: ScrollHooks = NOOP_SCROLL;

export function setScrollHooks(h: ScrollHooks | null): void {
  current = h ?? NOOP_SCROLL;
}

export function scrollHooks(): ScrollHooks {
  return current;
}
