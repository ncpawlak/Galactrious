/**
 * Boss movement. A movement is a pure function from time to an offset (px) from the boss's anchor
 * position (the spawn point in its definition). It holds no state, so it is easy to compose and
 * test. A phase uses exactly one movement, which may itself be a `combine` (add) or `sequence`
 * (chain) of others. Rotation is deliberately not here yet (see DESIGN.md).
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

// --- Movement library (issue #14) ------------------------------------------------------------
// Every factory below returns a stateless `Movement`. All offsets are 0 at t = 0 except `zip`,
// which starts at its left end (use `sequence` blending or the phase blend to enter it smoothly).

const smooth = (u: number): number => { const c = Math.min(1, Math.max(0, u)); return c * c * (3 - 2 * c); };
/** Stronger ease-in-out than smoothstep (quintic): slow start/stop, very fast middle. */
const smoother = (u: number): number => { const c = Math.min(1, Math.max(0, u)); return c * c * c * (c * (c * 6 - 15) + 10); };

export interface ZipParams {
  /** Half-width of the travel in px (boss centre goes from -amplitude to +amplitude). */
  amplitude: number;
  /** Seconds to cross from one end to the other. THE speed knob: peak speed is about 1.9 * 2 * amplitude / travel. */
  travel: number;
  /** Seconds the boss rests at each end (this is the dodge/dig window). */
  pause: number;
  /** Last `windup` seconds of each pause: the boss pulls back `windupDistance` px against the coming dash (telegraph). */
  windup?: number;
  windupDistance?: number;
}

/** Fast side-to-side dash with easing, a rest at each end and a small wind-up telegraph. */
export function zip(p: ZipParams): Movement {
  const windup = Math.min(p.windup ?? 0.25, p.pause);
  const pull = p.windupDistance ?? 10;
  const cycle = 2 * (p.travel + p.pause);
  return {
    name: 'zip',
    at: (t) => {
      let c = ((t % cycle) + cycle) % cycle;
      const dir = c < cycle / 2 ? 1 : -1; // +1: heading right, -1: heading left
      if (dir < 0) c -= cycle / 2;
      // Within a half cycle: rest [0,pause), then travel [pause, pause+travel).
      if (c < p.pause) {
        const end = -dir * p.amplitude; // the end we are resting at
        const w = p.pause - c < windup ? smooth(1 - (p.pause - c) / windup) : 0;
        return { x: end - dir * pull * w, y: 0 };
      }
      const u = smoother((c - p.pause) / p.travel);
      return { x: -dir * p.amplitude + dir * 2 * p.amplitude * u, y: 0 };
    },
  };
}

/** Vertical sine bob: `amplitude` px up and down, one cycle per `period` s. */
export function bob(amplitude: number, period: number): Movement {
  return { name: 'bob', at: (t) => ({ x: 0, y: Math.sin((t / period) * Math.PI * 2) * amplitude }) };
}

/** Lemniscate: x swings `amplitudeX`, y `amplitudeY` at double frequency, one full 8 per `period` s. */
export function figureEight(amplitudeX: number, amplitudeY: number, period: number): Movement {
  return {
    name: 'figure-eight',
    at: (t) => {
      const a = (t / period) * Math.PI * 2;
      return { x: Math.sin(a) * amplitudeX, y: Math.sin(2 * a) * amplitudeY };
    },
  };
}

export interface SequenceStep {
  movement: Movement;
  /** Seconds this step runs before the next one starts. */
  duration: number;
}

/**
 * Chain movements: each step runs for its `duration` on its own local clock (starting at 0), then
 * the next begins; the list loops. To stay continuous the first `blend` seconds of every step ease
 * from where the previous step ended.
 */
export function sequence(steps: SequenceStep[], blend = 0.5): Movement {
  const total = steps.reduce((s, x) => s + x.duration, 0);
  return {
    name: steps.map((s) => s.movement.name).join('>'),
    at: (t) => {
      let local = ((t % total) + total) % total;
      let i = 0;
      while (local >= steps[i].duration) { local -= steps[i].duration; i++; }
      const cur = steps[i].movement.at(local);
      if (local >= blend) return cur;
      const prev = steps[(i + steps.length - 1) % steps.length];
      const from = prev.movement.at(prev.duration);
      const k = smooth(local / blend);
      return { x: from.x + (cur.x - from.x) * k, y: from.y + (cur.y - from.y) * k };
    },
  };
}

/**
 * "Close in": hold the boss `dy` px lower than its anchor while `m` plays on top (the phase blend eases the drop).
 * Used by later phases so the fight comes down into the close-weapon range (DESIGN.md "Combat range").
 */
export function lowered(dy: number, m: Movement): Movement {
  return { name: `${m.name}+low${dy}`, at: (t) => { const o = m.at(t); return { x: o.x, y: o.y + dy }; } };
}

/** Rename a movement (e.g. to label a tuned preset in the debug overlay). */
export function named(name: string, m: Movement): Movement {
  return { name, at: m.at };
}

/**
 * Tunable presets. Horizontal travel is limited by the screen: the demo boss is 360 wide on a 540
 * screen, so `amplitude` 90 is edge to edge.
 */
export const ZIP_NORMAL: ZipParams = { amplitude: 90, travel: 0.8, pause: 0.9, windup: 0.3, windupDistance: 10 };
/** Fast preset: ~0.28 s across, short rests. Peak speed is roughly 1200 px/s, 20 px per frame at 60 fps. */
export const ZIP_FAST: ZipParams = { amplitude: 90, travel: 0.28, pause: 0.45, windup: 0.2, windupDistance: 12 };

/** Movements selectable live with the debug key [M] (in addition to "phase default"). */
export const MOVEMENT_PRESETS: Movement[] = [
  sway(55, 8),
  named('zip', zip(ZIP_NORMAL)),
  named('zip-fast', zip(ZIP_FAST)),
  bob(40, 3),
  figureEight(70, 35, 6),
  named('sequence', sequence([
    { movement: sway(55, 4), duration: 4 },
    { movement: named('zip-fast', zip(ZIP_FAST)), duration: 3.5 },
    { movement: figureEight(70, 35, 4), duration: 4 },
  ])),
];
