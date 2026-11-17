import { W } from './config';
import type { Point } from './hazards';
import type { UnitDefinition, UnitPlacement, UnitSystem } from './units';

/**
 * Waves as data (DESIGN.md "Waves"). A wave is a list of groups; a group is N copies of one unit type laid out by a
 * formation, flying in on an entrance path one after another and then holding their slot (optionally diving out of it
 * now and then). Nothing here leaves the screen: the wave ends when every unit is dead.
 *
 *   { unit: 'drone', formation: { kind: 'row', count: 6, x: 270, y: 150, spacing: 60 },
 *     entrance: { kind: 'swoop' }, start: 0, stagger: 0.3, dive: { first: 6, every: 7 } }
 */

export type Formation =
  /** `count` units in a horizontal line centred on x. */
  | { kind: 'row'; count: number; x: number; y: number; spacing: number }
  /** `rows` x `perRow` grid centred on x; rows go down from y. */
  | { kind: 'rows'; rows: number; perRow: number; x: number; y: number; spacingX: number; spacingY: number }
  /** `count` units in a vertical line down from y. */
  | { kind: 'column'; count: number; x: number; y: number; spacing: number }
  /** A V open to the top: the apex (lowest unit) at (x, y), arms rising `spacingY` per unit pair. */
  | { kind: 'vee'; count: number; x: number; y: number; spacingX: number; spacingY: number }
  /** A smile-shaped arc: `count` units on a circle of `radius` around (x, y), spread over `sweepDeg` degrees centred on straight down. */
  | { kind: 'arc'; count: number; x: number; y: number; radius: number; sweepDeg: number }
  /** Explicit slot centres. */
  | { kind: 'slots'; points: Point[] };

export type EntranceKind = 'drop' | 'swoop' | 'loop';

export interface Entrance {
  kind: EntranceKind;
  /** Which side they come in from. 'alternate' (default) = successive units use opposite sides. */
  side?: 'left' | 'right' | 'alternate';
  /** Seconds the flight takes (defaults: drop 1.6, swoop 3, loop 3.4). */
  time?: number;
}

export interface WaveGroup {
  /** `UnitDefinition.id`. */
  unit: string;
  formation: Formation;
  /** Omitted = the units simply appear in their slots. */
  entrance?: Entrance;
  /** Seconds after the wave starts that the first unit of this group spawns (default 0). */
  start?: number;
  /** Seconds between successive units of the group (default 0.25). */
  stagger?: number;
  /** Units dive out of the slot and back: first after `first` s in the slot, then every `every` s (a dive itself takes `time`, default 3.2). `depth` scales how far it goes (default 1). */
  dive?: { first: number; every: number; time?: number; depth?: number };
}

export interface WaveDefinition {
  id: string;
  name?: string;
  groups: WaveGroup[];
  /** Pixels every formation slot is shifted down (closer to the player; DESIGN.md "Combat range"). Default 0. */
  lower?: number;
}

// --- formations ------------------------------------------------------------------------------------------

export function formationSlots(f: Formation): Point[] {
  const out: Point[] = [];
  switch (f.kind) {
    case 'row':
      for (let i = 0; i < f.count; i++) out.push({ x: f.x + (i - (f.count - 1) / 2) * f.spacing, y: f.y });
      break;
    case 'rows':
      for (let r = 0; r < f.rows; r++) for (let i = 0; i < f.perRow; i++) out.push({ x: f.x + (i - (f.perRow - 1) / 2) * f.spacingX, y: f.y + r * f.spacingY });
      break;
    case 'column':
      for (let i = 0; i < f.count; i++) out.push({ x: f.x, y: f.y + i * f.spacing });
      break;
    case 'vee':
      // Order: left arm top to apex, then right arm (so a stagger fills the left side first).
      for (let i = 0; i < f.count; i++) {
        const k = Math.floor(i / 2);
        const side = i % 2 === 0 ? -1 : 1;
        out.push({ x: f.x + side * (k + (f.count % 2 === 0 ? 0.5 : 0)) * f.spacingX, y: f.y - (Math.ceil(f.count / 2) - 1 - k) * f.spacingY });
      }
      out.sort((a, b) => a.x - b.x || a.y - b.y);
      break;
    case 'arc':
      for (let i = 0; i < f.count; i++) {
        const a = Math.PI / 2 + ((f.count === 1 ? 0 : i / (f.count - 1) - 0.5) * f.sweepDeg * Math.PI) / 180;
        out.push({ x: f.x - Math.cos(a) * f.radius, y: f.y + Math.sin(a) * f.radius });
      }
      break;
    case 'slots':
      out.push(...f.points);
      break;
  }
  return out;
}

// --- curves ----------------------------------------------------------------------------------------------

/** Constant-speed point along a Catmull-Rom curve through `pts` (u = 0..1), with a gentle slow-down into the end. */
export function curve(pts: Point[], easeEnd = true): (u: number) => Point {
  const n = pts.length;
  const P = (i: number): Point => pts[Math.max(0, Math.min(n - 1, i))];
  const samples: Point[] = [];
  const PER = 24;
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    for (let k = 0; k < PER; k++) {
      const t = k / PER;
      const t2 = t * t;
      const t3 = t2 * t;
      samples.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  samples.push(pts[n - 1]);
  const cum = [0];
  for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  return (u0) => {
    const c = Math.min(1, Math.max(0, u0));
    const u = easeEnd ? 0.5 * c + 0.5 * Math.sin((c * Math.PI) / 2) : c;
    const d = u * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const k = (d - cum[lo]) / seg;
    return { x: samples[lo].x + (samples[hi].x - samples[lo].x) * k, y: samples[lo].y + (samples[hi].y - samples[lo].y) * k };
  };
}

const mirrorX = (p: Point): Point => ({ x: W - p.x, y: p.y });

/** Entrance waypoints for a unit arriving from the right (+1); the left side is the mirror image. The slot is appended last. */
function entranceWaypoints(kind: EntranceKind, slot: Point, side: 1 | -1): Point[] {
  let pts: Point[];
  switch (kind) {
    case 'drop':
      pts = [{ x: slot.x + 70, y: -50 }, { x: slot.x - 40, y: slot.y * 0.45 }];
      break;
    case 'swoop':
      pts = [
        { x: W / 2 + 190, y: -50 },
        { x: W / 2 + 215, y: 210 },
        { x: W / 2 + 130, y: 400 },
        { x: W / 2 - 20, y: 440 },
        { x: W / 2 - 150, y: 340 },
        { x: W / 2 - 130, y: 220 },
      ];
      break;
    case 'loop': {
      const c = { x: W / 2 + 40, y: 340 };
      const r = 78;
      pts = [{ x: W + 50, y: c.y + r }, { x: c.x + 160, y: c.y + r }];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
      }
      pts.push({ x: c.x - 120, y: c.y - 30 });
      break;
    }
  }
  if (side < 0) pts = pts.map(mirrorX);
  pts.push(slot);
  return pts;
}

/** A dive out of the slot and back: a teardrop swinging toward screen centre. Offsets from the slot centre. */
export function divePath(slot: Point, depth: number): (u: number) => Point {
  const s = slot.x < W / 2 ? 1 : -1;
  const reach = Math.min(depth * 400, 720 - slot.y);
  const k = reach / 400;
  const pts: Point[] = [
    { x: 0, y: 0 },
    { x: s * 40 * k, y: 80 * k },
    { x: s * 120 * k, y: 220 * k },
    { x: s * 90 * k, y: 360 * k },
    { x: -s * 30 * k, y: 400 * k },
    { x: -s * 110 * k, y: 300 * k },
    { x: -s * 60 * k, y: 170 * k },
    { x: 0, y: 60 * k },
    { x: 0, y: 0 },
  ];
  return curve(pts, false);
}

// --- spawning --------------------------------------------------------------------------------------------

const ENTRANCE_TIME: Record<EntranceKind, number> = { drop: 1.6, swoop: 3, loop: 3.4 };

/** Placement of the `i`th unit of a group. */
export function placementFor(g: WaveGroup, slot: Point, i: number): UnitPlacement {
  const placement: UnitPlacement = { slot };
  const e = g.entrance;
  if (e) {
    const side: 1 | -1 = e.side === 'left' ? -1 : e.side === 'right' ? 1 : i % 2 === 0 ? 1 : -1;
    placement.entrance = curve(entranceWaypoints(e.kind, slot, side));
    placement.entranceTime = e.time ?? ENTRANCE_TIME[e.kind];
  }
  if (g.dive) {
    const d = g.dive;
    // Units dive in turn: successive units are offset so the whole group never drops at once.
    placement.dive = { first: d.first + i * 0.9, every: d.every, time: d.time ?? 3.2, path: divePath(slot, d.depth ?? 1) };
  }
  return placement;
}

/** Queue every unit of `wave` on the unit system, timed from its current clock. Returns the number of units. */
export function spawnWave(units: UnitSystem, wave: WaveDefinition, lookup: (id: string) => UnitDefinition): number {
  const base = units.time;
  let total = 0;
  for (const g of wave.groups) {
    const def = lookup(g.unit);
    const slots = formationSlots(g.formation).map((p) => ({ x: p.x, y: p.y + (wave.lower ?? 0) }));
    slots.forEach((slot, i) => {
      units.queue({ at: base + (g.start ?? 0) + i * (g.stagger ?? 0.25), def, placement: placementFor(g, slot, i) });
      total++;
    });
  }
  return total;
}

/** How many units a wave has (for the HUD and tests). */
export function waveSize(wave: WaveDefinition): number {
  return wave.groups.reduce((n, g) => n + formationSlots(g.formation).length, 0);
}
