/**
 * Boss movement. A movement is a pure function from time to an offset (px) from the boss's anchor
 * position (the spawn point in its definition). It holds no state, so it is easy to compose and
 * test. A phase uses exactly one movement; new movements (zip, bob, figure-eight, ...) are just
 * more factories returning a `Movement`.
 */
export interface Offset2 {
  x: number;
  y: number;
}

export interface Movement {
  name: string;
  /** Offset from the anchor at `t` seconds since the fight started (continuous across phases). */
  at(t: number): Offset2;
}

/** Stand still. */
export const still: Movement = { name: 'still', at: () => ({ x: 0, y: 0 }) };

/** Horizontal sine sway: `amplitude` px either side of the anchor, one full cycle per `period` s. */
export function sway(amplitude: number, period: number): Movement {
  return { name: 'sway', at: (t) => ({ x: Math.sin((t / period) * Math.PI * 2) * amplitude, y: 0 }) };
}

/** Add the offsets of several movements (e.g. a slow sway plus a faster bob). */
export function combine(...parts: Movement[]): Movement {
  return {
    name: parts.map((p) => p.name).join('+'),
    at: (t) => parts.reduce((o, p) => { const q = p.at(t); return { x: o.x + q.x, y: o.y + q.y }; }, { x: 0, y: 0 }),
  };
}
