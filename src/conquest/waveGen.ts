import type { Formation, WaveDefinition, WaveGroup } from '../waves';

/**
 * Formation wave generator for Conquest (Empire Base). Same wave format and the same empire units as Endless/Fallen Peace
 * (src/waves.ts); a wave is picked by archetype and `tier` (0 = first wave of the run, 5 = last before the capital ship).
 * Tier sets the size (counts), the unit variants ("+" = guns a quarter faster from tier 2) and how soon the dives start.
 * `light` waves are about two thirds the size: they are the ones overlaid on a scroll section, where ground guns also fire.
 */

const row = (count: number, y: number, spacing: number, x = 270): Formation => ({ kind: 'row', count, x, y, spacing });
const slots = (...pts: [number, number][]): Formation => ({ kind: 'slots', points: pts.map(([x, y]) => ({ x, y })) });
const vee = (count: number, y: number, sx = 44): Formation => ({ kind: 'vee', count, x: 270, y, spacingX: sx, spacingY: 34 });
const grid = (rows: number, perRow: number, y: number, sx = 56, sy = 48): Formation => ({ kind: 'rows', rows, perRow, x: 270, y, spacingX: sx, spacingY: sy });
const group = (unit: string, formation: Formation, rest: Partial<WaveGroup> = {}): WaveGroup => ({ unit, formation, ...rest });

export type Archetype = 'line' | 'vee' | 'grid' | 'pincer' | 'escort' | 'flak' | 'strafers' | 'siege';

const F = 'empire-fighter';
const S = 'empire-strafer';
const G = 'empire-gunship';
const FL = 'empire-flak';

export interface WaveOpts {
  id: string;
  name: string;
  kind: Archetype;
  tier: number;
  light?: boolean;
}

export function cqWave(o: WaveOpts): WaveDefinition {
  const t = o.tier;
  const plus = t >= 2 ? '+' : '';
  const f = F + plus;
  const s = S + plus;
  const g = G + plus;
  const fl = FL + plus;
  const k = o.light ? 0.7 : 1;
  const n = (base: number): number => Math.max(2, Math.round((base + t) * k));
  const d1 = Math.max(4, 7 - Math.floor(t / 2)); // first dive
  // Overlaid (light) waves hold their slots longer and dive less: the ground guns are shooting too.
  const dive = o.light ? { first: d1 + 5, every: 13 } : { first: d1, every: 8 };
  const g1: WaveGroup[] = [];
  switch (o.kind) {
    case 'line':
      g1.push(group(f, row(n(5), 200, 62), { entrance: { kind: 'swoop' }, stagger: 0.3, dive }), group(f, vee(n(4), 300), { entrance: { kind: 'loop' }, start: 8, stagger: 0.25, dive }));
      break;
    case 'vee':
      g1.push(group(f, vee(n(6), 300), { entrance: { kind: 'loop' }, stagger: 0.25, dive }), group(f, row(n(4), 200, 70), { entrance: { kind: 'drop' }, start: 7, stagger: 0.25, dive }));
      break;
    case 'grid':
      g1.push(group(f, grid(2, Math.min(6, n(3) + 1), 200), { entrance: { kind: 'drop' }, stagger: 0.2, dive }), group(s, row(n(3), 350, 80), { entrance: { kind: 'swoop' }, start: 8, stagger: 0.3, dive }));
      break;
    case 'pincer':
      g1.push(
        group(f, row(n(5), 210, 62), { entrance: { kind: 'swoop', side: 'left' }, stagger: 0.25, dive }),
        group(f, row(n(5), 290, 62), { entrance: { kind: 'swoop', side: 'right' }, start: 3, stagger: 0.25, dive }),
        group(g, slots([270, 118]), { entrance: { kind: 'drop', time: 2.6 }, start: 8 }),
      );
      break;
    case 'escort': {
      const ships = t >= 3 ? [[110, 128], [270, 108], [430, 128]] : [[160, 130], [380, 130]];
      g1.push(group(g, slots(...(o.light ? ships.slice(0, 2) : ships) as [number, number][]), { entrance: { kind: 'drop', time: 2.6 }, stagger: 0.7 }), group(f, grid(2, Math.min(5, n(2) + 1), 260, 62, 50), { entrance: { kind: 'swoop' }, start: 4, stagger: 0.25, dive }), group(f, vee(n(4), 390), { entrance: { kind: 'loop' }, start: 12, stagger: 0.25, dive }));
      break;
    }
    case 'flak': {
      const batteries = t >= 4 && !o.light ? [[110, 140], [430, 140], [270, 110]] : [[130, 135], [410, 135]];
      g1.push(group(fl, slots(...batteries as [number, number][]), { entrance: { kind: 'drop', time: 2.4 }, stagger: 0.6 }), group(f, row(n(5), 280, 66), { entrance: { kind: 'swoop' }, start: 3, stagger: 0.28, dive }), group(f, vee(n(4), 380), { entrance: { kind: 'loop' }, start: 11, stagger: 0.25, dive }));
      break;
    }
    case 'strafers':
      g1.push(group(s, row(n(4), 230, 70), { entrance: { kind: 'loop' }, stagger: 0.3, dive: { first: d1 - 1, every: 7 } }), group(s, grid(2, Math.min(5, n(3)), 310, 62), { entrance: { kind: 'swoop' }, start: 6, stagger: 0.25, dive }));
      break;
    case 'siege':
      g1.push(
        group(g, slots([120, 128], [420, 128]), { entrance: { kind: 'drop', time: 2.6 }, stagger: 0.7 }),
        group(fl, slots([270, 112]), { entrance: { kind: 'drop', time: 2.4 }, start: 2 }),
        group(f, grid(2, Math.min(6, n(3)), 250, 60), { entrance: { kind: 'loop' }, start: 4, stagger: 0.2, dive }),
        group(g, slots([270, 150]), { entrance: { kind: 'drop', time: 2.6 }, start: 13 }),
      );
      break;
  }
  return { id: o.id, name: o.name, lower: 30, groups: g1 };
}

/** A mini-boss wave: the boss, then an escort of fighters that joins after a few seconds. */
export function miniBossWave(id: string, name: string, boss: string, escort: number, tier: number): WaveDefinition {
  const plus = tier >= 2 ? '+' : '';
  return {
    id,
    name,
    lower: 20,
    groups: [
      group(boss, slots([270, 230]), { start: 0 }),
      group(S + plus, row(escort, 360, 90), { entrance: { kind: 'swoop' }, start: 9, stagger: 0.4, dive: { first: 7, every: 9 } }),
    ],
  };
}
