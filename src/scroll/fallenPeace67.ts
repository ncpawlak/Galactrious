import type { ScrollEntry, ScrollLevelDef } from './types';

/**
 * Scroll levels of "Fallen Peace" chapters 6 and 7 (DESIGN.md "As built: Fallen Peace chapters 6-7"). The campaign content
 * (src/campaign/fallenPeace67.ts) refers to them by id.
 *
 *  - `fp6-climb` (chapter 6): the climb out of Orini's atmosphere, the REVERSE of chapter 3: normal orientation, the world scrolls
 *    down the screen at a steady 250 px/s for 120 s, the storm calms as the ship rises (weather 1 down to 0.05), the sky turns to
 *    space and the planet falls away below. Empire interceptors chase all the way: flyby passes (cross, strafe, and rear passes
 *    that come up from below = the chasers) overlapping with fighters that drop in and dive, and the ace RAVEN near the end.
 *  - `fp7-finale` (chapter 7): a closed screen above Orini (a slow starfield drift) with the squad patrolling; the capital ship
 *    fight is the objective's boss, everything else is timed beats in the campaign file.
 */

export const FP6_SPEED = 250;
/** Time (s) to scroll distance (px) in the climb. */
export const climbDistance = (t: number): number => t * FP6_SPEED;
export const FP6_SECONDS = 120;

const d = climbDistance;
const F = 'empire-strafer';
const R = 'empire-fighter-rear';

const cross = (t: number, count: number, y: number, spacing = 0.45): ScrollEntry => ({ at: d(t), kind: 'flyby', unit: F, preset: 'cross', y, count, spacing, alternate: true });
const strafe = (t: number, count: number, x: number, xStep: number, spacing = 0.3, side: 'left' | 'right' = 'left'): ScrollEntry => ({ at: d(t), kind: 'flyby', unit: F, preset: 'strafe', x, xStep, count, spacing, side });
/** A chaser: comes up from below and passes the ship shooting, then climbs away off the top. */
const chase = (t: number, count: number, x: number, xStep: number, spacing = 0.4): ScrollEntry => ({ at: d(t), kind: 'flyby', unit: R, preset: 'rear', x, xStep, count, spacing });
const drop = (t: number, x: number, y = 200): ScrollEntry => ({ at: d(t), kind: 'unit', unit: 'empire-fighter', x, y });

/**
 * Overlapping passes, one every 3.8 s from t = 6 to 112 (cycling strafe, chase, cross), 1 + t/60 fighters each, plus a group of
 * fighters that drop in and hold position (diving now and then) every 9 s from t = 4: the next group arrives before the last is dead.
 */
function passes(): ScrollEntry[] {
  const out: ScrollEntry[] = [];
  let k = 0;
  for (let t = 6; t < 112; t += 3.8, k++) {
    const n = 1 + Math.floor(t / 60);
    const x = 90 + ((k * 137) % 360);
    if (k % 3 === 0) out.push(strafe(t, n, x, 110, 0.3, k % 2 ? 'left' : 'right'));
    else if (k % 3 === 1) out.push(chase(t, n, x, 120, 0.4));
    else out.push(cross(t, n, 170 + ((k * 61) % 300), 0.5));
  }
  for (let t = 4, j = 0; t < 108; t += 9, j++) {
    const n = 3;
    for (let i = 0; i < n; i++) out.push(drop(t + i * 0.5, 130 + ((j * 97 + i * 140) % 280), 150 + ((i * 53) % 90)));
  }
  return out;
}

export const FP6_CLIMB: ScrollLevelDef = {
  id: 'fp6-climb',
  name: 'Climb',
  length: d(FP6_SECONDS),
  speed: FP6_SPEED,
  theme: 'atmosphere',
  weather: 1,
  fireScale: 0.5,
  timeline: [
    // The storm calms as the ship rises; above the cloud the sky turns to space and the planet falls away below.
    { at: 0, kind: 'setWeather', intensity: 1, ease: 0.1 },
    { at: d(18), kind: 'setWeather', intensity: 0.75, ease: 10 },
    { at: d(38), kind: 'setWeather', intensity: 0.45, ease: 10 },
    { at: d(54), kind: 'setWeather', intensity: 0.2, ease: 8 },
    { at: d(62), kind: 'theme', theme: 'space', fade: 10 },
    { at: d(66), kind: 'setWeather', intensity: 0.05, ease: 6 },
    // Handmade openings: interceptors on the ship at once.
    cross(1.5, 2, 230),
    chase(3, 2, 270, 140),
    // The ace joins near the end.
    { at: d(88), kind: 'unit', unit: 'empire-ace-raven', x: 380, y: 220 },
    ...passes(),
  ],
};

/** Chapter 7's sky: a slow starfield drift, the squad patrolling underneath. Never ends (the boss fight ends the objective). */
export const FP7_FINALE: ScrollLevelDef = {
  id: 'fp7-finale',
  name: 'Command ship',
  length: 1e9,
  speed: 60,
  theme: 'space',
  allies: { count: 3, pattern: 'patrol' },
  timeline: [],
};

export const FALLEN_PEACE_67_SCROLL_LEVELS: ScrollLevelDef[] = [FP6_CLIMB, FP7_FINALE];
