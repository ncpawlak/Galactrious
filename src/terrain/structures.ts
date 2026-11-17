import { W } from '../config';
import type { AttackStep } from '../attackSchedulers';
import type { BossSpec } from '../boss';
import type { ComponentSpec } from '../components';
import type { UnitDefinition } from '../units';
import { groundFan, groundMortar, groundShot } from './patterns';
import { paintPad, paintWall } from './paint';
import { GROUND_TAG, type TerrainEntry, type TurretClusterEntry, type TurretEntry, type TurretKind, type TurretOptions, type WallEntry, type WallLineEntry, type WallOptions } from './types';

/**
 * Turns terrain entries into PLANNED STRUCTURES (pure data: where each wall piece or pad goes and which turrets it carries) and
 * builds the `UnitDefinition` of one structure. A structure is a normal unit on a `BossFight` (so every player weapon carves it,
 * its turrets are components with hit points and craters, its attacks are an ordinary scripted attack list with a `source` on
 * every step), flagged `ground` so the unit system treats it as terrain: it never dies from damage, never counts as a wave remnant,
 * and fires only while on screen.
 */

/** A wall longer than this is built from several pieces (each its own canvas) that look like one wall. */
export const MAX_PIECE = 260;
export const DEFAULT_DEPTH = 44;
const MIN_PIECE = 26;

export interface PlannedTurret {
  /** Offset in px from the structure's centre. */
  dx: number;
  type: TurretKind;
}

export interface PlannedStructure {
  kind: 'wall' | 'pad';
  /** Screen x of the centre. */
  cx: number;
  width: number;
  height: number;
  capL: boolean;
  capR: boolean;
  turrets: PlannedTurret[];
  /** Extra scroll px above the entry point. */
  dy: number;
  variant: number;
  opts: TurretOptions & WallOptions;
}

const PAD_SIZE: Record<TurretKind, number> = { gun: 64, mortar: 76 };

/** Cut the span [left, right] into pieces of at most MAX_PIECE; turrets (absolute x) go to the piece under them. */
function pieces(
  left: number,
  right: number,
  capL: boolean,
  capR: boolean,
  turrets: { x: number; type: TurretKind }[],
  depth: number,
  opts: PlannedStructure['opts'],
  variant: number,
): PlannedStructure[] {
  const out: PlannedStructure[] = [];
  const total = right - left;
  if (total < MIN_PIECE) return out;
  const n = Math.max(1, Math.ceil(total / MAX_PIECE));
  const len = total / n;
  for (let i = 0; i < n; i++) {
    const a = left + i * len;
    const b = a + len;
    out.push({
      kind: 'wall',
      cx: (a + b) / 2,
      width: Math.round(len),
      height: depth,
      capL: i === 0 && capL,
      capR: i === n - 1 && capR,
      turrets: turrets.filter((t) => t.x >= a + 12 && t.x <= b - 12 && (i === n - 1 ? true : t.x < b)).map((t) => ({ dx: t.x - (a + b) / 2, type: t.type })),
      dy: 0,
      variant: (variant + i) % 4,
      opts,
    });
  }
  return out;
}

const depthOf = (o: WallOptions): number => Math.max(36, Math.round(o.depth ?? DEFAULT_DEPTH));

function evenly(left: number, right: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => left + ((right - left) * (i + 1)) / (n + 1));
}

export function planWall(e: WallEntry): PlannedStructure[] {
  const left = e.x - e.width / 2;
  const right = e.x + e.width / 2;
  const caps = e.caps ?? true;
  const xs = typeof e.turrets === 'number' ? evenly(left, right, e.turrets) : (e.turrets ?? []).map((dx) => e.x + dx);
  return pieces(left, right, caps, caps, xs.map((x) => ({ x, type: 'gun' as const })), depthOf(e), e, (e.seed ?? Math.floor(e.at)) % 4);
}

/** Gaps are clamped to the screen, sorted and merged; the wall runs from past the left edge to past the right edge. */
export function planWallLine(e: WallLineEntry): PlannedStructure[] {
  const gaps = e.gaps
    .map((g) => ({ a: Math.max(0, g.x - g.width / 2), b: Math.min(W, g.x + g.width / 2) }))
    .filter((g) => g.b > g.a)
    .sort((p, q) => p.a - q.a);
  const spans: { l: number; r: number; capL: boolean; capR: boolean }[] = [];
  let at = -6;
  let capL = false;
  for (const g of gaps) {
    if (g.a > at) spans.push({ l: at, r: g.a, capL, capR: true });
    at = Math.max(at, g.b);
    capL = true;
  }
  if (at < W + 6) spans.push({ l: at, r: W + 6, capL, capR: false });
  const out: PlannedStructure[] = [];
  const depth = depthOf(e);
  spans.forEach((s, k) => {
    let xs: { x: number; type: TurretKind }[] = [];
    if (typeof e.turrets === 'number') xs = evenly(Math.max(s.l, 0), Math.min(s.r, W), e.turrets).map((x) => ({ x, type: 'gun' as const }));
    else xs = (e.turrets ?? []).filter((x) => x > s.l && x < s.r).map((x) => ({ x, type: 'gun' as const }));
    for (const m of e.mortars ?? []) if (m > s.l && m < s.r) xs.push({ x: m, type: 'mortar' });
    out.push(...pieces(s.l, s.r, s.capL, s.capR, xs, depth, e, (e.seed ?? Math.floor(e.at)) + k));
  });
  return out;
}

function pad(x: number, type: TurretKind, dy: number, opts: TurretOptions, variant: number): PlannedStructure {
  const size = PAD_SIZE[type];
  return { kind: 'pad', cx: x, width: size, height: size, capL: false, capR: false, turrets: [{ dx: 0, type }], dy, variant: variant % 4, opts };
}

export function planTurret(e: TurretEntry): PlannedStructure[] {
  return [pad(e.x, e.type ?? 'gun', e.dy ?? 0, e, Math.floor(e.at / 100))];
}

export function planCluster(e: TurretClusterEntry): PlannedStructure[] {
  const sp = e.spacing ?? 96;
  const layout = e.layout ?? 'stagger';
  const out: PlannedStructure[] = [];
  for (let i = 0; i < e.count; i++) {
    const k = i - (e.count - 1) / 2;
    let x = e.x + k * sp;
    let dy = 0;
    if (layout === 'stagger') dy = (i % 2) * sp * 0.9;
    if (layout === 'arc') dy = Math.abs(k) * Math.abs(k) * (sp * 0.28);
    x = Math.min(W - 40, Math.max(40, x));
    const type: TurretKind = e.mortarEvery && (i + 1) % e.mortarEvery === 0 ? 'mortar' : (e.type ?? 'gun');
    out.push(pad(x, type, dy, e, i + Math.floor(e.at / 100)));
  }
  return out;
}

export function planEntry(e: TerrainEntry): PlannedStructure[] {
  switch (e.kind) {
    case 'wall':
      return planWall(e);
    case 'wallLine':
      return planWallLine(e);
    case 'turret':
      return planTurret(e);
    case 'turretCluster':
      return planCluster(e);
    default:
      return [];
  }
}

/** Turrets a list of timeline entries will spawn (for the `destroyAll` count and the HUD's total), by tag. */
export function countTurrets(entries: readonly { kind: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    if (e.kind !== 'wall' && e.kind !== 'wallLine' && e.kind !== 'turret' && e.kind !== 'turretCluster') continue;
    const te = e as WallEntry | WallLineEntry | TurretEntry | TurretClusterEntry;
    const n = planEntry(te).reduce((a, p) => a + p.turrets.length, 0);
    const tag = te.tag ?? GROUND_TAG;
    out[tag] = (out[tag] ?? 0) + n;
  }
  return out;
}

// --- building one structure ------------------------------------------------------------------------------------

/** Mutable scroll offset of one structure (px moved down since it spawned), read by its movement. */
export interface Follow {
  y: number;
}

/** Carve densities (energy per pixel; the base gun spends 90 per shot, the fighter hull is 3): a lane takes about two seconds of base-gun fire. */
export const DENSITY = { plating: 0.6, rubble: 0.5 };

const DEFAULT_HP: Record<TurretKind, number> = { gun: 150, mortar: 220 };
const DEFAULT_EVERY: Record<TurretKind, number> = { gun: 3.2, mortar: 4.2 };

function turretSpec(id: string, anchor: string, type: TurretKind, hp: number): ComponentSpec {
  const r = type === 'mortar' ? 13 : 10;
  return {
    id,
    type: 'turret',
    anchor,
    radius: r,
    hp,
    mount: 'surface',
    group: 'ground-turret',
    turret: { aim: 'tracking', angle: 90, trackRate: type === 'mortar' ? 70 : 95, telegraph: type === 'mortar' ? 0.8 : 0.65 },
    // A blast and a crater when it goes; it never hurts the wall's (unkillable) core.
    blast: { radius: 20 + r, energy: 330, damage: 4, coreDamage: 0 },
    crater: { radius: r * 1.35, energy: 300 },
  };
}

export function buildStructure(p: PlannedStructure, follow: Follow): UnitDefinition {
  const tough = p.opts.toughness ?? 1;
  const w = p.width;
  const h = p.height;
  const painted = p.kind === 'wall' ? paintWall(w, h, p.capL, p.capR, p.turrets.map((t) => w / 2 + t.dx), p.variant) : paintPad(w, p.turrets[0]?.type === 'mortar', p.variant);
  const anchors: Record<string, { x: number; y: number }> = {};
  const components: ComponentSpec[] = [];
  const attacks: AttackStep[] = [];
  const n = p.turrets.length;
  p.turrets.forEach((t, i) => {
    const id = `t${i}`;
    anchors[id] = { x: w / 2 + t.dx, y: h / 2 };
    components.push(turretSpec(id, id, t.type, p.opts.hp ?? DEFAULT_HP[t.type]));
    const pattern = t.type === 'mortar' ? groundMortar : p.opts.fan ? groundFan : groundShot;
    attacks.push({ pattern, interval: Math.max(0.9, (p.opts.fireEvery ?? DEFAULT_EVERY[t.type]) / n), source: id });
  });
  return {
    id: p.kind === 'wall' ? 'terrain-wall' : p.turrets[0]?.type === 'mortar' ? 'terrain-mortar' : 'terrain-turret',
    name: p.kind === 'wall' ? 'Imperial wall' : 'Ground turret',
    size: 'small',
    ground: true,
    faction: 'empire',
    layout: (): BossSpec => ({
      width: w,
      height: h,
      layers: [
        { name: 'Plating', density: DENSITY.plating * tough, canvas: painted.plating },
        { name: 'Rubble', density: DENSITY.rubble * tough, canvas: painted.rubble },
      ],
      // The core is a 1 px marker that nothing here can kill (hp is huge): structures never die, they only get carved.
      core: { x: Math.floor(w / 2), y: p.kind === 'wall' ? h - 3 : Math.floor(h * 0.86), radius: 1, hp: 1e9 },
      anchors,
    }),
    components,
    deathFraction: 2,
    hold: { name: 'ground', at: () => ({ x: 0, y: follow.y }) },
    attacks,
    attackDelay: p.opts.firstShot ?? 1.2,
  };
}
