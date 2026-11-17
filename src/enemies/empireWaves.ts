import type { Formation, WaveDefinition, WaveGroup } from '../waves';

/**
 * Fallen Peace chapter 1 waves (empire fighters and gunships). Each wave here is a whole stretch of dogfight with timed groups
 * (`start` in seconds), so one `destroy` objective can hold three or four escalating waves: everything is queued at the start
 * and counts as "units left" until it is shot down. Slots stay above y ~ 420; the player is below.
 */
const row = (count: number, y: number, spacing: number, x = 270): Formation => ({ kind: 'row', count, x, y, spacing });
const slots = (...pts: [number, number][]): Formation => ({ kind: 'slots', points: pts.map(([x, y]) => ({ x, y })) });
const group = (unit: string, formation: Formation, rest: Partial<WaveGroup> = {}): WaveGroup => ({ unit, formation, ...rest });

export const EMPIRE_WAVES: WaveDefinition[] = [
  /** Chapter 1, objective 1: four waves of empire fighters, gunships in the last. 28 fighters and 2 gunships. */
  {
    id: 'fp1-dogfight',
    name: 'Dogfight',
    lower: 40,
    groups: [
      // Wave 1: a first line of fighters.
      group('empire-fighter', row(6, 190, 70), { entrance: { kind: 'swoop' }, stagger: 0.3, dive: { first: 7, every: 9 } }),
      // Wave 2: a V and a second row.
      group('empire-fighter', { kind: 'vee', count: 8, x: 270, y: 300, spacingX: 44, spacingY: 34 }, { entrance: { kind: 'loop' }, start: 16, stagger: 0.25, dive: { first: 6, every: 8 } }),
      // Wave 3: two tight rows dropping in.
      group('empire-fighter', { kind: 'rows', rows: 2, perRow: 5, x: 270, y: 210, spacingX: 62, spacingY: 50 }, { entrance: { kind: 'drop' }, start: 34, stagger: 0.22, dive: { first: 5, every: 7 } }),
      // Wave 4: gunships with an escort.
      group('empire-gunship', slots([150, 130], [390, 130]), { entrance: { kind: 'drop', time: 2.6 }, start: 54, stagger: 0.8 }),
      group('empire-fighter', row(4, 330, 80), { entrance: { kind: 'swoop' }, start: 58, stagger: 0.3, dive: { first: 6, every: 8 } }),
    ],
  },
  /** Chapter 1, objective 2 (harassment while you carve): a few fighters at a time, y low enough to cut across the carve zone. */
  {
    id: 'fp1-harass-a',
    name: 'Harassment A',
    lower: 0,
    groups: [group('empire-fighter', row(4, 470, 90), { entrance: { kind: 'swoop' }, stagger: 0.35, dive: { first: 5, every: 8 } })],
  },
  {
    id: 'fp1-harass-b',
    name: 'Harassment B',
    lower: 0,
    groups: [
      group('empire-fighter', { kind: 'vee', count: 4, x: 270, y: 540, spacingX: 70, spacingY: 40 }, { entrance: { kind: 'loop' }, stagger: 0.3, dive: { first: 5, every: 8 } }),
    ],
  },
  {
    id: 'fp1-harass-c',
    name: 'Harassment C (gunship)',
    lower: 0,
    groups: [group('empire-gunship', slots([270, 560]), { entrance: { kind: 'drop', time: 2.4 } }), group('empire-fighter', row(2, 480, 220), { entrance: { kind: 'swoop' }, start: 1.5, stagger: 0.3, dive: { first: 5, every: 8 } })],
  },
];
