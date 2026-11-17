import type { Formation, WaveDefinition, WaveGroup } from '../waves';

/**
 * Fallen Peace chapter 1 waves (empire fighters and gunships). Each wave here is a whole stretch of dogfight with timed groups
 * (`start` in seconds), so one `destroy` objective can hold three or four escalating waves: everything is queued at the start
 * and counts as "units left" until it is shot down. Slots stay above y ~ 420; the player is below.
 */
const row = (count: number, y: number, spacing: number, x = 270): Formation => ({ kind: 'row', count, x, y, spacing });
const slots = (...pts: [number, number][]): Formation => ({ kind: 'slots', points: pts.map(([x, y]) => ({ x, y })) });
const group = (unit: string, formation: Formation, rest: Partial<WaveGroup> = {}): WaveGroup => ({ unit, formation, ...rest });

/**
 * The chapter 1 stream: a continuous, escalating flow of fighters. A new group arrives every 3.1 s at first, every 2.3 s at the end,
 * 2 to 4 fighters each, so the next group is in the air while the last one is still alive: the screen never goes empty. Two gunship
 * pairs (t = 22, 40) break up the rhythm. Everything is queued up front by `start` times; the objective's clock (a time gate, not a
 * kill count) decides when the stream stops (STREAM_SECONDS).
 */
export const STREAM_SECONDS = 52;

function streamGroups(): WaveGroup[] {
  const out: WaveGroup[] = [];
  const entrances = ['swoop', 'loop', 'drop'] as const;
  let t = 0;
  for (let k = 0; t < STREAM_SECONDS; k++) {
    const n = 2 + Math.floor(t / 28);
    const x = 150 + ((k * 83) % 240);
    const y = 150 + ((k * 67) % 220);
    const f: Formation = k % 3 === 0 ? row(n, y, 62, x) : k % 3 === 1 ? { kind: 'vee', count: n + 1, x, y: y + 40, spacingX: 44, spacingY: 34 } : slots(...Array.from({ length: n }, (_, i): [number, number] => [x - 70 + i * 70, y + (i % 2) * 40]));
    out.push(group('empire-fighter', f, { entrance: { kind: entrances[k % 3] }, start: t, stagger: 0.28, dive: { first: 4 + (k % 3), every: 7 } }));
    t += 3.1 - 0.8 * (t / STREAM_SECONDS);
  }
  // Gunship pairs with an escort row.
  out.push(group('empire-gunship', slots([150, 130], [390, 130]), { entrance: { kind: 'drop', time: 2.6 }, start: 22, stagger: 0.8 }));
  out.push(group('empire-gunship', slots([210, 120], [330, 120]), { entrance: { kind: 'drop', time: 2.6 }, start: 40, stagger: 0.8 }));
  return out;
}

export const EMPIRE_WAVES: WaveDefinition[] = [
  /** Chapter 1, objective 1: the endless-feeling fighter stream (see `streamGroups`). */
  { id: 'fp1-stream', name: 'Dogfight stream', lower: 40, groups: streamGroups() },
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
