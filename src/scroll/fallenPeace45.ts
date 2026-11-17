import { countTurrets } from '../terrain/structures';
import { GROUND_TAG, type WallGap } from '../terrain/types';
import type { CoverDef, LightDef } from '../stealth/types';
import type { ScrollEntry, ScrollLevelDef } from './types';

/**
 * Scroll levels of "Fallen Peace" chapters 4 and 5 (DESIGN.md "As built: Fallen Peace chapters 4-5").
 *
 * CHAPTER 4, the base at night (stealth, `baseNight`): two stealth levels back to back, so a death costs a minute, not the chapter.
 *  - `fp4-outer`, the outer fence (55 s): the lights are taught one at a time (a slow pendulum, two pendulums, a rotating beacon, a
 *    patrolling lamp, pulsing beams) with a roof or shadow every 2 to 3 seconds of scroll. Ends by scroll distance.
 *  - `fp4-yard`, the hangar yard (65 s + the 10 s hold): the harder lights (counter-rotating beacons, a roaming spot, three staggered
 *    pulse beams, a wide sweep) and the hangar circle at the end; the `patrolWave` objective's countdown runs here.
 * CHAPTER 5, the surface run (`surface` theme, 180 px/s, 178 s): ONE authored timeline in seconds (`surfaceTimeline`) cut into three
 * sections (`fp5-a`, `fp5-b`, `fp5-c`, one objective each, so a death restarts about a minute). Defence lines every 6 to 8 s with
 * gaps that narrow, gun and mortar turrets built into the walls, turret clusters and free-standing wall segments between the lines,
 * and an empire air squadron flying past every 8 s or so, all escalating.
 * Times in the helpers are seconds; `T4` / `T5` turn them into scroll px.
 */

// --- chapter 4 ---------------------------------------------------------------------------------------------------

const SPEED4 = 90;
const T4 = (t: number): number => Math.round(t * SPEED4);

const cone = (t: number, x: number, size: number, spread: number, pattern: LightDef['pattern'], color?: string): LightDef => ({ at: T4(t), x, y: -30, shape: 'cone', size, spread, pattern, color });

/** A deterministic 0..1 hash for cover placement. */
function rnd(n: number): number {
  const x = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Cover every `every` s of scroll from `t0` to `t1`: roofs and soft shadows alternating, wandering over the lanes (x from 20 to 340, never
 * a pair on the same side), so the next hiding place is always a short hop from the last. `seed` varies the walk between levels.
 */
function coverRun(t0: number, t1: number, every: number, seed: number): CoverDef[] {
  const out: CoverDef[] = [];
  let k = 0;
  for (let t = t0; t < t1; t += every, k++) {
    const w = 170 + Math.round(rnd(seed + k) * 50);
    const h = 120 + Math.round(rnd(seed * 3 + k) * 30);
    const slot = (k + Math.floor(rnd(seed * 7 + k) * 2)) % 3; // left, middle, right
    const x = slot === 0 ? 20 + Math.round(rnd(k + seed) * 40) : slot === 1 ? 175 + Math.round(rnd(k + seed) * 40) : 330 + Math.round(rnd(k + seed) * 30);
    const shadow = k % 3 === 2;
    out.push({ at: T4(t), x, y: -h - 10, w, h, kind: shadow ? 'shadow' : 'roof', label: shadow ? '' : undefined });
  }
  return out;
}

// -- the outer fence -------------------------------------------------------------------------------------------------

const OUTER_LIGHTS: LightDef[] = [
  // 1. A single slow pendulum from the left: learn what a beam looks like.
  cone(4, 150, 480, 22, { type: 'sweep', center: 90, amp: 26, period: 7 }),
  // 2. Two pendulums, opposite phase: a rhythm to cross between.
  cone(12, 130, 460, 22, { type: 'sweep', center: 90, amp: 28, period: 6.5, phase: 0.8 }),
  cone(12, 420, 460, 22, { type: 'sweep', center: 90, amp: 28, period: 6.5, phase: 0.3 }),
  // 3. A slow rotating beacon in the middle of the lane.
  cone(24, 270, 320, 30, { type: 'rotate', speed: 38, start: 20 }),
  // 4. A lamp on a rail, pacing across the lane.
  cone(35, 270, 380, 20, { type: 'patrol', path: [{ x: -160, y: 0 }, { x: 160, y: 0 }], speed: 80, aim: 90 }, '#ffe08a'),
  // 5. Two pulsing beams: warn (dashed outline) then on.
  cone(45, 140, 400, 16, { type: 'pulse', aim: 90, on: 1.4, off: 2.4 }, '#ff9a7a'),
  cone(45, 400, 400, 16, { type: 'pulse', aim: 90, on: 1.4, off: 2.4, offset: 1.9 }, '#ff9a7a'),
];

export const FP4_OUTER: ScrollLevelDef = {
  id: 'fp4-outer',
  name: 'The outer fence',
  length: T4(55),
  speed: SPEED4,
  theme: 'tundraNight',
  stealth: {
    lights: OUTER_LIGHTS,
    // The first roof sits over the pod's start, so the first seconds are dark.
    covers: [{ at: 0, x: 170, y: 690, w: 200, h: 190, kind: 'roof', label: 'COVER' }, ...coverRun(1.5, 53, 2.6, 3)],
    detection: { chasers: 2, maxChasers: 3, cooldown: 10 },
  },
  timeline: [{ at: T4(48), kind: 'speed', speed: 70, ease: 4 }],
};

// -- the hangar yard -------------------------------------------------------------------------------------------------

/** The yard scrolls at full speed for 60 s, then eases to 60 px/s for the last 300 px (the hangar slides into view): about 65 s. */
const YARD_RUN = T4(60);
const YARD_LENGTH = YARD_RUN + 300;

const YARD_LIGHTS: LightDef[] = [
  // 1. One wide slow sweep over the apron.
  cone(7, 270, 500, 22, { type: 'sweep', center: 90, amp: 40, period: 8 }),
  // 2. Counter-rotating beacons, slow.
  cone(11, 100, 330, 28, { type: 'rotate', speed: -40, start: 60 }),
  cone(11, 440, 330, 28, { type: 'rotate', speed: 40, start: 120 }),
  // 3. A big spot wandering on a loop.
  { at: T4(23), x: 270, y: 120, shape: 'spot', size: 90, pattern: { type: 'roam', rx: 160, ry: 60, period: 9 }, color: '#bfe3ff' },
  // 4. Three pulsing beams, staggered: a wave of light to time.
  cone(33, 110, 380, 16, { type: 'pulse', aim: 90, on: 1.3, off: 2.7 }, '#ff9a7a'),
  cone(33, 270, 380, 16, { type: 'pulse', aim: 90, on: 1.3, off: 2.7, offset: 1.0 }, '#ff9a7a'),
  cone(33, 430, 380, 16, { type: 'pulse', aim: 90, on: 1.3, off: 2.7, offset: 2.0 }, '#ff9a7a'),
  // 5. A wide, slower sweep.
  cone(45, 270, 440, 18, { type: 'sweep', center: 90, amp: 30, period: 8 }),
  // 6. The hangar approach: pulses from both sides, aimed in.
  cone(55, 40, 430, 20, { type: 'pulse', aim: 78, on: 1.3, off: 2.6 }, '#ff9a7a'),
  cone(55, 500, 430, 20, { type: 'pulse', aim: 102, on: 1.3, off: 2.6, offset: 1.6 }, '#ff9a7a'),
];

export const YARD_ZONE = { x: 270, y: 380, r: 74 };

export const FP4_YARD: ScrollLevelDef = {
  id: 'fp4-yard',
  name: 'The hangar yard',
  length: YARD_LENGTH,
  speed: SPEED4,
  theme: 'baseInterior',
  stealth: {
    lights: YARD_LIGHTS,
    covers: [
      { at: 0, x: 170, y: 690, w: 200, h: 190, kind: 'roof', label: 'COVER' },
      ...coverRun(1.5, 57, 2.5, 11),
      // The hangar itself: a big roof over the circle at the end of the world.
      { at: YARD_LENGTH - 360, x: 120, y: -80, w: 300, h: 190, kind: 'roof', label: 'HANGAR' },
    ],
    detection: { chasers: 2, maxChasers: 3, cooldown: 10 },
  },
  timeline: [{ at: YARD_RUN, kind: 'speed', speed: 60, ease: 3 }],
};

// --- chapter 5 ---------------------------------------------------------------------------------------------------

export const SPEED5 = 180;
export const T5 = (t: number): number => Math.round(t * SPEED5);
/** Seconds of the whole surface run, and of each section (three objectives: the checkpoints). */
export const SURFACE_SECONDS = 178;
export const SURFACE_SECTIONS = [60, 120, 178] as const;

/** A tiny deterministic generator so the layout is fixed and tunable. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Seconds between shots of one turret (the engine default is 3.2 gun / 4.2 mortar): slower, so a gap can be threaded under fire. */
const TURRET_EVERY = 7.3;

/** Authoring knobs of the surface run (defaults are the shipped values; `buildSurface` takes overrides so a bot can sweep them). */
export interface SurfaceTune {
  every: number;
  flyEvery: number;
  flyCount: number;
  fire: [number, number, number];
  lineK: number;
  mortars: number;
  strafe: boolean;
  /** Progress at which the wall and turret difficulty stops growing. */
  cap: number;
  /** Gap width at progress 0 (px) and how much it narrows by progress 0.6; seconds between lines at the start. */
  gap0: number;
  gapNarrow: number;
  lineBase: number;
  /** Indestructible energy barriers between the defence lines. */
  barriers: boolean;
}
export const SURFACE_TUNE: SurfaceTune = { every: TURRET_EVERY, flyEvery: 13, flyCount: 0.6, fire: [0.6, 0.6, 0.5], lineK: 3.5, mortars: 1, strafe: true, cap: 0.6, gap0: 150, gapNarrow: 55, lineBase: 10.5, barriers: true };
const REAR = 'empire-fighter-rear';
const STRAFER = 'empire-strafer';

/** A turret x that is clear of every gap (margin px) and of the screen edges. */
function clearX(r: () => number, gaps: WallGap[], margin: number): number {
  for (let tries = 0; tries < 40; tries++) {
    const x = 40 + r() * 460;
    if (gaps.every((g) => Math.abs(x - g.x) > g.width / 2 + margin)) return Math.round(x);
  }
  return 270;
}

/**
 * The whole run as one timeline in absolute scroll px (180 px/s). `p` = progress 0..1 steers the escalation: gaps narrow from 120 to 64 px
 * and go from two per line to one, turrets per wall piece 1 to 2, mortars from p 0.3, fans from p 0.5, passes from two to four ships,
 * flak batteries from p 0.35. Structure entries stop 6 s before a section ends (the next section starts with a clear sky, only passes).
 */
export function surfaceTimeline(tune: SurfaceTune = SURFACE_TUNE): ScrollEntry[] {
  const TURRET_EVERY = tune.every;
  const r = lcg(5);
  const out: ScrollEntry[] = [];
  const inTail = (t: number): boolean => SURFACE_SECTIONS.some((s) => t > s - 6 && t < s + 3);
  // Defence lines.
  let t = 14;
  let lineNo = 0;
  /** Seconds at which a defence line crosses the ship's row (about 4.6 s after it enters at the top): no pass is timed to arrive then. */
  const hot: number[] = [];
  while (t < SURFACE_SECONDS - 14) {
    // Difficulty features plateau at p 0.6 (a bot could not hold the narrowest gaps and 3 turrets per line late in the run): the late run gets denser, not narrower.
    const p = Math.min(t / SURFACE_SECONDS, tune.cap);
    if (!inTail(t)) {
      const nGaps = p < 0.3 ? 2 : p < 0.7 ? 1 + (lineNo % 2) : lineNo % 3 === 2 ? 2 : 1;
      const width = Math.round(tune.gap0 - (p / 0.6) * tune.gapNarrow);
      const gaps: WallGap[] = [];
      let prev = lineNo === 0 ? 270 : 270;
      for (let k = 0; k < nGaps; k++) {
        const x = nGaps === 1 ? 110 + Math.round(r() * 320) : k === 0 ? 70 + Math.round(r() * 100) : 370 + Math.round(r() * 100);
        gaps.push({ x: x === prev ? x + 40 : x, width: k === 0 ? width : Math.round(width * (p < 0.5 ? 1 : 0.85)) });
        prev = x;
      }
      const perPiece = p < 0.45 ? 1 : 2;
      const turrets = Array.from({ length: perPiece * 3 }, () => clearX(r, gaps, 170)).sort((a, b) => a - b);
      const mortars = p >= 0.3 ? [clearX(r, gaps, 170), clearX(r, gaps, 170)] : undefined;
      hot.push(t + 4.6);
      out.push({ at: T5(t), kind: 'wallLine', gaps, turrets: turrets.slice(0, 1), mortars: mortars && p >= 0.4 ? mortars.slice(0, tune.mortars) : undefined, fireEvery: TURRET_EVERY, seed: 10 + lineNo, depth: p > 0.9 ? 52 : undefined });
      // What fills the space between two lines: a cluster, a lone turret, or a free-standing wall.
      const between = t + 3.4;
      if (!inTail(between) && lineNo % 3 === 1) {
        const kind = ((lineNo - 1) / 3) % 4;
        if (kind === 0) out.push({ at: T5(between), kind: 'turretCluster', x: 270, count: 2 + Math.min(1, Math.floor(p * 3)), layout: lineNo % 8 === 0 ? 'arc' : 'stagger', spacing: 100, fireEvery: TURRET_EVERY, mortarEvery: p >= 0.5 ? 3 : 0 });
        else if (kind === 1) out.push({ at: T5(between), kind: 'turret', x: 90 + Math.round(r() * 360), type: p >= 0.3 && r() < 0.5 ? 'mortar' : 'gun', fireEvery: TURRET_EVERY });
        else if (kind === 2) out.push({ at: T5(between), kind: 'wall', x: 120 + Math.round(r() * 300), width: 140 + Math.round(r() * 60), turrets: p < 0.4 ? 1 : 2, fireEvery: TURRET_EVERY });
        else out.push({ at: T5(between), kind: 'turretCluster', x: 150 + Math.round(r() * 240), count: 2 + Math.floor(p * 3), layout: 'row', spacing: 110, fireEvery: TURRET_EVERY });
      }
      // An indestructible energy barrier halfway between two lines (never in the first line's slot): it leaves 170 to 190 px open on one side, in
      // the middle, or on both sides of a central island, so the ship must fly around it. Not in a section's tail, and not near the last line.
      const bt = t + 6.2;
      if (tune.barriers && lineNo >= 1 && !inTail(bt) && bt < SURFACE_SECONDS - 20) {
        const v = lineNo % 4;
        const at = T5(bt);
        if (v === 0) out.push({ at, kind: 'barrier', x: 170, width: 380, seed: lineNo });
        else if (v === 1) out.push({ at, kind: 'barrier', x: 370, width: 380, seed: lineNo });
        else if (v === 2) {
          out.push({ at, kind: 'barrier', x: 80, width: 200, seed: lineNo });
          out.push({ at, kind: 'barrier', x: 460, width: 200, seed: lineNo + 50 });
        } else out.push({ at, kind: 'barrier', x: 270, width: 200, seed: lineNo });
      }
      lineNo++;
    }
    t += tune.lineBase - tune.lineK * p; // 10.5 s apart at the start, 8.4 s once the difficulty plateaus
  }
  // The last line before the exit: one narrow gap, guns and mortars, a thick wall. It is a hard block you can carve or squeeze.
  out.push({ at: T5(SURFACE_SECONDS - 12), kind: 'wallLine', gaps: [{ x: 300, width: 76 }], turrets: [90, 210, 400, 470], mortars: [150, 440], fireEvery: TURRET_EVERY, depth: 52, seed: 99 });
  // Air squadrons: every 8 s or so, a mix of passes, more ships as the run goes on. Always something on screen.
  let k = 0;
  for (let t0 = 2; t0 < SURFACE_SECONDS - 3; t0 += tune.flyEvery, k++) {
    // A pass reaches the ship about 2 s after it spawns; slide it clear of the moments a wall line is crossing the ship's row.
    let tf = t0;
    while (hot.some((h) => Math.abs(tf + 2 - h) < 1.8) && tf < t0 + 6) tf += 0.5;
    // Nothing arrives in the first 8 s of a section (the seam fade has just ended).
    for (const sec of SURFACE_SECTIONS) if (tf >= sec - 0.01 - (sec === 178 ? 58 : 60) && tf < sec - (sec === 178 ? 58 : 60) + 8) tf = sec - (sec === 178 ? 58 : 60) + 8;
    const p = tf / SURFACE_SECONDS;
    const n = tf < 60 ? 1 : 2; // one ship per pass in the first minute, two after (flyCount is kept for tuning sweeps)
    void tune.flyCount;
    const x = 90 + Math.round(r() * 360);
    const spec = !tune.strafe && k % 4 === 2 ? 1 : k % 4;
    if (spec === 0) out.push({ at: T5(tf), kind: 'flyby', unit: REAR, preset: 'rear', x, count: n, spacing: 0.5, xStep: r() < 0.5 ? 70 : -70 });
    else if (spec === 1) out.push({ at: T5(tf), kind: 'flyby', unit: STRAFER, preset: 'cross', side: r() < 0.5 ? 'left' : 'right', y: 260 + Math.round(r() * 200), count: n, spacing: 0.9, alternate: true });
    else if (spec === 2) out.push({ at: T5(tf), kind: 'flyby', unit: STRAFER, preset: 'strafe', x, count: Math.max(1, n - 1), spacing: 0.9, side: r() < 0.5 ? 'left' : 'right' });
    else if (p >= 0.35) out.push({ at: T5(tf), kind: 'flyby', unit: 'empire-flak', preset: 'drift', x: 90 + Math.round(r() * 360) });
    else out.push({ at: T5(tf), kind: 'flyby', unit: REAR, preset: 'rear', x, count: n, spacing: 0.45, xStep: 90 });
  }
  return out.sort((a, b) => a.at - b.at);
}

const FULL_TIMELINE = surfaceTimeline();

export type SurfaceSections = [ScrollLevelDef, ScrollLevelDef, ScrollLevelDef];

/** How many turrets the whole run spawns (the `destroyAll` bonus counts every one of them). */
export const FP5_TURRETS = countTurrets(FULL_TIMELINE)[GROUND_TAG] ?? 0;

/** The section `i` of the run: entries inside its time window, re-based to its own distance 0. The tally is on in every section. */
function section(i: 0 | 1 | 2, full: ScrollEntry[] = FULL_TIMELINE, tune: SurfaceTune = SURFACE_TUNE): ScrollLevelDef {
  const t0 = i === 0 ? 0 : SURFACE_SECTIONS[i - 1];
  const t1 = SURFACE_SECTIONS[i];
  const timeline = full.filter((e) => e.at >= T5(t0) && e.at < T5(t1)).map((e) => ({ ...e, at: e.at - T5(t0) }) as ScrollEntry);
  return {
    id: `fp5-${'abc'[i]}`,
    name: `Surface run ${'ABC'[i]}`,
    length: T5(t1 - t0),
    speed: SPEED5,
    theme: ['surfaceBase', 'surface', 'surfaceWild'][i],
    fireScale: tune.fire[i],
    // No `turretTally` entry: the campaign HUD already shows the bonus count for the whole run (a per-section tally would disagree with it).
    timeline,
  };
}

/** Debug: the three sections rebuilt with other knobs (scripted tuning runs only). */
export function buildSurface(tune: Partial<SurfaceTune>): SurfaceSections {
  const t = { ...SURFACE_TUNE, ...tune };
  const full = surfaceTimeline(t);
  return [section(0, full, t), section(1, full, t), section(2, full, t)];
}

export const FP5_A = section(0);
export const FP5_B = section(1);
export const FP5_C = section(2);

export const FALLEN_PEACE_45_SCROLL_LEVELS: ScrollLevelDef[] = [FP4_OUTER, FP4_YARD, FP5_A, FP5_B, FP5_C];
