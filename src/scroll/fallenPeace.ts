import type { ObstacleField, ScrollEntry, ScrollLevelDef } from './types';

/**
 * Scroll levels of the campaign "Fallen Peace" chapters 1 to 3 (DESIGN.md "As built: Fallen Peace chapters 1-3"). Authored in
 * seconds where that is easier (`d()` converts time to scroll distance for a level's speed profile). The campaign
 * content (src/campaign/fallenPeace.ts) refers to them by id.
 */

// --- chapter 1: a closed screen with a slow background and the Delta wingmen -------------------------------------------

/** Chapter 1 never really scrolls: a slow starfield drift (60 px/s) with four wingmen weaving underneath. The length never ends. */
export const FP1_SPACE: ScrollLevelDef = {
  id: 'fp1-space',
  name: 'Above Orini',
  length: 1e9,
  speed: 60,
  theme: 'space',
  allies: { count: 4, pattern: 'weave' },
  timeline: [],
};

/** The same sky for the capital-ship fight: three wingmen on patrol. */
export const FP1_SIEGE: ScrollLevelDef = { ...FP1_SPACE, id: 'fp1-siege', allies: { count: 3, pattern: 'patrol' } };

// --- chapter 2: the retreat --------------------------------------------------------------------------------------------

/**
 * Retreat: SPACE the whole way (the planet below), 200 px/s, about 60 s. The jump gate opens at 50 s; the shoot-down cinematic
 * plays when the player reaches it (the objective's `outro`). Enemy fire runs 20% slower than authored (`fireScale`).
 */
export const RETREAT_SPEED = 200;
/** Time (s) to scroll distance (px) in the retreat. */
export const retreatDistance = (t: number): number => t * RETREAT_SPEED;

const d = retreatDistance;
const F = 'empire-strafer';
const R = 'empire-fighter-rear';
const FLAK = 'empire-flak';

/** Pass helpers: a group of empire fighters on a flyby path. */
const cross = (t: number, count: number, y: number, spacing = 0.4): ScrollEntry => ({ at: d(t), kind: 'flyby', unit: F, preset: 'cross', y, count, spacing, alternate: true });
const strafe = (t: number, count: number, x: number, xStep: number, spacing = 0.3, side: 'left' | 'right' = 'left'): ScrollEntry => ({ at: d(t), kind: 'flyby', unit: F, preset: 'strafe', x, xStep, count, spacing, side });
const rear = (t: number, count: number, x: number, xStep: number, spacing = 0.35): ScrollEntry => ({ at: d(t), kind: 'flyby', unit: R, preset: 'rear', x, xStep, count, spacing });
const flak = (t: number, x: number): ScrollEntry => ({ at: d(t), kind: 'flyby', unit: FLAK, preset: 'drift', x });

/** Distance at which the jump gate opens (50 s in). */
export const FP2_EXIT_DISTANCE = d(50);

/** Extra passes between the handmade ones: one group every 6.2 s from t = 12 to 48, cycling cross / strafe / rear, 1 + t/40 fighters each. */
function fillerPasses(): ScrollEntry[] {
  const out: ScrollEntry[] = [];
  let k = 0;
  for (let t = 12; t < 48; t += 6.2, k++) {
    const n = 1 + Math.floor(t / 40);
    const x = 90 + ((k * 137) % 360);
    if (k % 3 === 0) out.push(cross(t, n, 170 + ((k * 61) % 300), 0.5));
    else if (k % 3 === 1) out.push(strafe(t, n, x, 110, 0.3, k % 2 ? 'left' : 'right'));
    else out.push(rear(t, n, x, 120, 0.4));
  }
  return out;
}

export const FP2_RETREAT: ScrollLevelDef = {
  id: 'fp2-retreat',
  name: 'Retreat',
  length: d(90),
  speed: RETREAT_SPEED,
  theme: 'space',
  fireScale: 0.8,
  allies: { count: 4, pattern: 'patrol' },
  timeline: [
    // Early: a few passes, the wingmen fighting alongside.
    cross(3, 2, 250),
    strafe(8, 2, 150, 240),
    rear(13, 1, 270, 0),
    flak(18, 80),
    cross(23, 3, 200, 0.5),
    strafe(28, 3, 110, 150),
    rear(33, 2, 150, 240),
    flak(35, 460),
    // Building up to the gate.
    cross(39, 2, 420),
    strafe(39.5, 2, 200, 140),
    { at: d(42), kind: 'allies', on: false },
    rear(43, 3, 120, 150),
    flak(44, 270),
    cross(46, 3, 180, 0.45),
    ...fillerPasses(),
  ],
};

// --- chapter 3: freefall ------------------------------------------------------------------------------------------------

/**
 * Chapter 3 is flown BACKWARDS: the ship points at the top of the screen but falls tail first, so the planet surface is ahead at the
 * TOP and the sky is behind at the bottom (`skyFlip`). The world still scrolls down the screen (clouds and peaks stream down toward
 * you). Peaks (and ranges) come in from the top; debris falls faster than you and overtakes you from BELOW (and from the sides),
 * moving up the screen (`rise` motions, a warning marker shows on the edge first).
 */
export const FP3_LENGTH = 36000;

/** Shared lane so a path always exists through both the peaks and the debris. */
const lane = (width: number, amp: number, period: number) => ({ lane: { x: 270, width }, laneDrift: { amp, period } });
const FROM_BELOW: ObstacleField['edge'] = [{ edge: 'bottom', weight: 3 }, { edge: 'sides', weight: 1 }];

export const FP3_FREEFALL: ScrollLevelDef = {
  id: 'fp3-freefall',
  name: 'Freefall',
  length: FP3_LENGTH,
  speed: 240,
  theme: 'atmosphere',
  skyFlip: true,
  weaponsLocked: true,
  timeline: [
    // Weather: calm at the start, cloud building through the first peaks, a hard storm in the ranges, a violent blizzard at the end.
    { at: 0, kind: 'setWeather', intensity: 0.05, ease: 0.1 },
    { at: 5000, kind: 'setWeather', intensity: 0.25, ease: 8 },
    { at: 11000, kind: 'setWeather', intensity: 0.45, ease: 8 },
    { at: 18000, kind: 'setWeather', intensity: 0.65, ease: 8 },
    { at: 26000, kind: 'setWeather', intensity: 0.9, ease: 6 },
    { at: 31000, kind: 'setWeather', intensity: 1, ease: 5 },
    // A. Sparse debris from below, a wide free lane (0 to 5000 px, 21 s at 240 px/s). No peaks yet.
    { at: 300, kind: 'field', to: 5000, density: 2.6, shapes: [{ shape: 'debris-s', weight: 3 }, { shape: 'debris-m', weight: 2 }], motions: ['rise', 'rise-tumble'], edge: 'bottom', ...lane(260, 40, 3000), seed: 201, damage: 1 },
    // B. Bigger debris from below and a few side drifters; the first peaks come from the top (5000 to 11000, 280 px/s).
    { at: 5000, kind: 'speed', speed: 280, ease: 2 },
    { at: 5300, kind: 'field', to: 11000, density: 3.6, shapes: [{ shape: 'debris-m', weight: 3 }, { shape: 'debris-l', weight: 1.5 }], motions: ['rise', 'rise-tumble', 'rise-fast'], edge: FROM_BELOW, ...lane(210, 60, 2800), seed: 202, damage: 1 },
    { at: 5600, kind: 'field', to: 11000, density: 1.5, shapes: [{ shape: 'peak-s', weight: 2 }, { shape: 'peak-m', weight: 1 }], motions: ['straight'], edge: 'top', ...lane(220, 60, 2800), seed: 203, damage: 1 },
    // C. Ranges join in (11000 to 18000, 320 px/s).
    { at: 11000, kind: 'speed', speed: 320, ease: 2 },
    { at: 11300, kind: 'field', to: 18000, density: 4.6, shapes: [{ shape: 'debris-m' }, { shape: 'debris-l' }, { shape: 'debris-s', weight: 0.6 }], motions: ['rise', 'rise-tumble', 'rise-fast'], edge: FROM_BELOW, ...lane(170, 80, 2600), seed: 204, damage: 1 },
    { at: 11600, kind: 'field', to: 18000, density: 2.2, shapes: [{ shape: 'peak-s' }, { shape: 'peak-m', weight: 1.4 }, { shape: 'range-m', weight: 1 }], motions: ['straight'], edge: 'top', ...lane(180, 80, 2600), seed: 205, damage: 1 },
    // D. Tight fields, snowy ranges: the sky turns arctic (18000 to 26000, 360 px/s).
    { at: 18000, kind: 'speed', speed: 360, ease: 2 },
    { at: 18000, kind: 'theme', theme: 'arctic', fade: 6 },
    { at: 18300, kind: 'field', to: 26000, density: 5.6, shapes: [{ shape: 'debris-m' }, { shape: 'debris-l', weight: 1.4 }, { shape: 'debris-xl', weight: 0.5 }], motions: ['rise', 'rise-tumble', 'rise-fast'], edge: FROM_BELOW, ...lane(140, 90, 2400), seed: 206, damage: 1 },
    { at: 18600, kind: 'field', to: 26000, density: 3, shapes: [{ shape: 'peak-m' }, { shape: 'peak-l', weight: 0.8 }, { shape: 'range-m', weight: 1.2 }, { shape: 'range-l', weight: 0.6 }], motions: ['straight'], edge: 'top', ...lane(150, 90, 2400), seed: 207, damage: 1 },
    // E. The range: tightest and fastest, in a violent storm (26000 to 33000, 400 px/s).
    { at: 26000, kind: 'speed', speed: 400, ease: 2 },
    { at: 26300, kind: 'field', to: 33000, density: 6.4, shapes: [{ shape: 'debris-l' }, { shape: 'debris-xl', weight: 0.8 }, { shape: 'debris-m' }], motions: ['rise', 'rise-tumble', 'rise-fast'], edge: FROM_BELOW, ...lane(125, 100, 2200), seed: 208, damage: 1 },
    { at: 26600, kind: 'field', to: 33000, density: 3.6, shapes: [{ shape: 'peak-l' }, { shape: 'range-m', weight: 1.2 }, { shape: 'range-l', weight: 1 }, { shape: 'peak-m', weight: 0.8 }], motions: ['straight'], edge: 'top', ...lane(130, 100, 2200), seed: 209, damage: 1 },
    // F. The last stretch: nothing left in the way, the ground rushes up. The cinematic (the objective's outro) plays the crash.
    { at: 33000, kind: 'speed', speed: 440, ease: 2 },
  ],
};

export const FALLEN_PEACE_SCROLL_LEVELS: ScrollLevelDef[] = [FP1_SPACE, FP1_SIEGE, FP2_RETREAT, FP3_FREEFALL];
