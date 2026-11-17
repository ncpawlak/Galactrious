import type { ScrollEntry, ScrollLevelDef } from './types';

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

/** Retreat: 200 px/s for the first 100 s (20000 px), then 260 px/s. */
const RETREAT_SPEED = 200;
const RETREAT_FAST = 260;
const RETREAT_SWITCH = 100;
/** Time (s) to scroll distance (px) in the retreat. */
export const retreatDistance = (t: number): number => (t <= RETREAT_SWITCH ? t * RETREAT_SPEED : RETREAT_SWITCH * RETREAT_SPEED + (t - RETREAT_SWITCH) * RETREAT_FAST);

const d = retreatDistance;
const F = 'empire-strafer';
const R = 'empire-fighter-rear';
const FLAK = 'empire-flak';

/** Pass helpers: a group of empire fighters on a flyby path. */
const cross = (t: number, count: number, y: number, spacing = 0.4): ScrollEntry => ({ at: d(t), kind: 'flyby', unit: F, preset: 'cross', y, count, spacing, alternate: true });
const strafe = (t: number, count: number, x: number, xStep: number, spacing = 0.3, side: 'left' | 'right' = 'left'): ScrollEntry => ({ at: d(t), kind: 'flyby', unit: F, preset: 'strafe', x, xStep, count, spacing, side });
const rear = (t: number, count: number, x: number, xStep: number, spacing = 0.35): ScrollEntry => ({ at: d(t), kind: 'flyby', unit: R, preset: 'rear', x, xStep, count, spacing });
const flak = (t: number, x: number): ScrollEntry => ({ at: d(t), kind: 'flyby', unit: FLAK, preset: 'drift', x });

/** Distance at which the exit opens (about 110 s in) and the length of the level (about 118 s). */
export const FP2_EXIT_DISTANCE = d(110);

/** Extra passes between the handmade ones, growing with time: one group every 4.5 s from t = 12, cycling cross / strafe / rear, 1 + t/35 fighters each. */
function fillerPasses(): ScrollEntry[] {
  const out: ScrollEntry[] = [];
  let k = 0;
  for (let t = 12; t < 108; t += 4.5, k++) {
    const n = 1 + Math.floor(t / 35);
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
  length: d(118),
  speed: RETREAT_SPEED,
  theme: 'space',
  allies: { count: 4, pattern: 'patrol' },
  timeline: [
    // Early: a few passes, the wingmen fighting alongside.
    cross(3, 2, 250),
    strafe(9, 2, 150, 240),
    rear(15, 1, 270, 0),
    flak(21, 80),
    cross(26, 3, 200, 0.5),
    strafe(32, 3, 110, 150),
    rear(38, 2, 150, 240),
    flak(40, 460),
    // Building up.
    cross(46, 2, 420),
    strafe(46.5, 2, 200, 140),
    { at: d(52), kind: 'allies', on: false },
    rear(54, 3, 120, 150),
    flak(55, 270),
    cross(60, 4, 180, 0.45),
    strafe(66, 4, 90, 120, 0.25, 'right'),
    flak(70, 100),
    flak(70.5, 440),
    { at: d(76), kind: 'flyby', unit: 'empire-gunship', preset: 'drift', x: 270, time: 10 },
    rear(74, 3, 100, 170),
    cross(80, 3, 300),
    strafe(80.5, 3, 160, 110),
    // Into the atmosphere: the sky warms.
    { at: d(85), kind: 'theme', theme: 'atmosphere', fade: 12 },
    { at: d(85), kind: 'setWeather', intensity: 0.2, ease: 12 },
    flak(88, 150),
    flak(88.5, 390),
    rear(89, 3, 130, 140),
    cross(94, 4, 220, 0.35),
    strafe(94.5, 4, 80, 125, 0.25, 'right'),
    { at: d(100), kind: 'speed', speed: RETREAT_FAST, ease: 3 },
    flak(102, 270),
    strafe(102.5, 4, 80, 125),
    cross(103, 3, 350),
    rear(108, 4, 90, 120),
    cross(109, 3, 160),
    ...fillerPasses(),
  ],
};

/** Objective 2 of the retreat: the sky over Orini, nothing hostile, the scripted shoot-down plays on the objective's beats. */
export const FP2_SHOT: ScrollLevelDef = {
  id: 'fp2-shot',
  name: 'Shot down',
  length: 1e9,
  speed: RETREAT_FAST,
  theme: 'atmosphere',
  timeline: [],
};

// --- chapter 3: freefall ------------------------------------------------------------------------------------------------

/** Peaks and debris falling past, faster and tighter all the way down. 134 s at the speeds below, ending at the crash. */
export const FP3_LENGTH = 44000;

export const FP3_FREEFALL: ScrollLevelDef = {
  id: 'fp3-freefall',
  name: 'Freefall',
  length: FP3_LENGTH,
  speed: 240,
  theme: 'atmosphere',
  weaponsLocked: true,
  timeline: [
    // Weather (the atmosphere theme's storm intensity, 0 calm to 1 violent): calm at the start, cloud building through the peaks, a blizzard
    // in the tightest stretch, easing down for the crash.
    { at: 0, kind: 'setWeather', intensity: 0.05, ease: 0.1 },
    { at: 6000, kind: 'setWeather', intensity: 0.25, ease: 8 },
    { at: 13000, kind: 'setWeather', intensity: 0.45, ease: 8 },
    { at: 21000, kind: 'setWeather', intensity: 0.6, ease: 8 },
    { at: 30000, kind: 'setWeather', intensity: 0.9, ease: 6 },
    { at: 40000, kind: 'setWeather', intensity: 0.35, ease: 6 },
    // A. Sparse debris, a wide free lane (0 to 6000 px, 25 s at 240 px/s).
    { at: 300, kind: 'field', to: 6000, density: 3, shapes: [{ shape: 'debris-s', weight: 3 }, { shape: 'debris-m', weight: 2 }], motions: ['straight', 'tumble', 'drift-l', 'drift-r'], lane: { x: 270, width: 220 }, laneDrift: { amp: 40, period: 3000 }, seed: 101 },
    // B. Bigger debris, the first peaks (6000 to 13000, 280 px/s).
    { at: 6000, kind: 'speed', speed: 280, ease: 2 },
    { at: 6300, kind: 'field', to: 13000, density: 5, shapes: [{ shape: 'debris-m', weight: 3 }, { shape: 'debris-l', weight: 2 }, { shape: 'peak-s', weight: 1 }], motions: ['straight', 'tumble', 'drift-l', 'drift-r', 'weave'], lane: { x: 270, width: 160 }, laneDrift: { amp: 60, period: 2800 }, seed: 102 },
    { at: 8500, kind: 'obstacle', shape: 'peak-m', x: 100 },
    { at: 10500, kind: 'obstacle', shape: 'peak-m', x: 440 },
    // C. Peaks join in (13000 to 21000, 320 px/s). The sky cools to arctic at the start of D.
    { at: 13000, kind: 'speed', speed: 320, ease: 2 },
    { at: 13300, kind: 'field', to: 21000, density: 7, shapes: [{ shape: 'debris-m' }, { shape: 'debris-l' }, { shape: 'peak-s', weight: 1.4 }, { shape: 'peak-m', weight: 1 }], motions: ['straight', 'tumble', 'weave', 'fast'], lane: { x: 270, width: 125 }, laneDrift: { amp: 80, period: 2600 }, seed: 103 },
    { at: 15500, kind: 'obstacle', shape: 'peak-l', x: 30, edge: 'left', motion: 'straight' },
    { at: 18000, kind: 'obstacle', shape: 'peak-l', x: 30, edge: 'right', motion: 'straight' },
    // D. Tight fields (21000 to 30000, 360 px/s), snowy peaks.
    { at: 21000, kind: 'speed', speed: 360, ease: 2 },
    { at: 21000, kind: 'theme', theme: 'arctic', fade: 6 },
    { at: 21300, kind: 'field', to: 30000, density: 9, shapes: [{ shape: 'debris-m' }, { shape: 'debris-l', weight: 1.5 }, { shape: 'debris-xl', weight: 0.6 }, { shape: 'peak-s' }, { shape: 'peak-m', weight: 1.4 }, { shape: 'peak-l', weight: 0.8 }], motions: ['straight', 'tumble', 'fast'], lane: { x: 270, width: 105 }, laneDrift: { amp: 90, period: 2400 }, seed: 104 },
    // E. The peak field: tightest, fastest (30000 to 40000, 400 px/s).
    { at: 30000, kind: 'speed', speed: 400, ease: 2 },
    { at: 30300, kind: 'field', to: 40000, density: 11, shapes: [{ shape: 'debris-l' }, { shape: 'debris-xl', weight: 0.8 }, { shape: 'peak-s' }, { shape: 'peak-m', weight: 1.6 }, { shape: 'peak-l', weight: 1.2 }], motions: ['straight', 'tumble', 'fast'], lane: { x: 270, width: 95 }, laneDrift: { amp: 100, period: 2200 }, seed: 105 },
    // F. The last stretch: the world is clear, the ground rushes up. The campaign beats end the level at the crash.
    { at: 40000, kind: 'speed', speed: 440, ease: 2 },
  ],
};

/** Objective 2 of the fall: the last seconds before the crash. Empty arctic sky, the scripted crash plays on the objective's beats. */
export const FP3_CRASH: ScrollLevelDef = { id: 'fp3-crash', name: 'Crash', length: 1e9, speed: 440, theme: 'arctic', weaponsLocked: true, timeline: [] };

export const FALLEN_PEACE_SCROLL_LEVELS: ScrollLevelDef[] = [FP1_SPACE, FP1_SIEGE, FP2_RETREAT, FP2_SHOT, FP3_FREEFALL, FP3_CRASH];
