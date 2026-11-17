import { CAPITAL_CONQUEST_ID } from '../bosses/capitalShipConquest';
import type { WaveDefinition } from '../waves';
import { cqWave, miniBossWave, type Archetype } from './waveGen';
import type { EnemyScale } from '../difficulty';
import type { LevelDefinition, NodeDefinition, RunDefinition } from '../flow/node';
import { SPEED5, SURFACE_TUNE, surfaceTimeline, T5, type SurfaceTune } from '../scroll/fallenPeace45';
import type { ScrollEntry, ScrollLevelDef } from '../scroll/types';
import type { HiddenEntry } from '../terrain/types';
import type { ChallengeDef, HiddenPlacement, RegionDefinition } from './types';

/**
 * Region 1: EMPIRE BASE (DESIGN.md "Conquest"). Everything it uses already exists: the chapter 5 surface-run timeline (defence lines, gun and
 * mortar turrets, shield barriers, turret clusters), the base, surface and wilderness scenery of chapters 4 and 5, the empire fighters, gunships and the
 * three aces (as mini-bosses), Bulwark and Mantis (map bosses) and the chapter 7 capital ship (the final boss). What is new is the order, the scaling,
 * the random mini-bosses and the hidden items.
 *
 * The run is a sequence of MAPS (a map is a flow-engine "level": full heal at its start, a card after its boss), about 15 to 25 minutes:
 *   Map 1 "Base perimeter" (base scenery, easy guns), boss BULWARK.
 *   Map 2 "Surface defences" (open ground, mid guns), boss MANTIS.
 *   Map 3 "Frozen wilds" (snow and pines, full guns), boss the CAPITAL SHIP: the run ends when it falls.
 * Each map is 3 waves (each a scroll section with its own scenery, obstacles and ground defences, with the formation waves chained over it) and a card pick
 * after each, a seeded chance of a random mini-boss (in place of a wave, or right after one), the map boss, then (but on the last map) a card.
 */

export const EMPIRE_BASE_ID = 'empire-base';

// --- the scroll sections -----------------------------------------------------------------------------------------

/** Three difficulty variants of the chapter 5 timeline; sections are 60 s windows of them (the same cut points chapter 5 uses). */
const EASY: SurfaceTune = { ...SURFACE_TUNE, lineBase: 12.5 };
const MID: SurfaceTune = { ...SURFACE_TUNE, lineBase: 11 };
const HARD: SurfaceTune = { ...SURFACE_TUNE };

const timelines = new Map<string, ScrollEntry[]>();
function timelineOf(name: string, tune: SurfaceTune): ScrollEntry[] {
  let t = timelines.get(name);
  if (!t) timelines.set(name, (t = surfaceTimeline(tune)));
  return t;
}

/** Hidden items as terrain timeline entries for one section. */
function hiddenEntries(level: string, hidden: readonly HiddenPlacement[]): HiddenEntry[] {
  return hidden.filter((h) => h.level === level).map((h, i): HiddenEntry => ({ at: h.at, kind: 'hidden', id: h.id, variant: h.variant, x: h.x, width: h.width, seed: i + 1 }));
}

/** A section: the entries of `tune`'s timeline from second `t0` to `t1`, re-based to distance 0, plus the region's hidden items for it. */
function section(id: string, name: string, theme: string, tuneName: string, tune: SurfaceTune, t0: number, t1: number, fire: number, hidden: readonly HiddenPlacement[]): ScrollLevelDef {
  const timeline = timelineOf(tuneName, tune)
    .filter((e) => e.kind !== 'flyby' && e.at >= T5(t0) && e.at < T5(t1))
    .map((e) => ({ ...e, at: e.at - T5(t0) }) as ScrollEntry);
  return { id, name, length: T5(t1 - t0), speed: SPEED5, theme, fireScale: fire, timeline: [...timeline, ...hiddenEntries(id, hidden)].sort((a, b) => a.at - b.at) };
}

/** A slow background for a boss fight (the ground drifts by; no entries). */
function backdrop(id: string, theme: string): ScrollLevelDef {
  return { id, name: id, length: 1e7, speed: 30, theme, timeline: [] };
}

// --- hidden items ------------------------------------------------------------------------------------------------

/**
 * Six placements, three kinds of tell (see src/terrain/hidden.ts). Crates sit off the main lane at a screen edge; caches are wall pieces whose
 * plating has a faint seam and two amber rivets over a sealed room: dig through the plating, shoot the console. `at` is scroll px from the start of
 * the section (180 px/s: 1 s = 180 px). Two per map, in the first and the third wave.
 */
export const EMPIRE_BASE_HIDDEN: HiddenPlacement[] = [
  { id: 'eb-crate-1', level: 'cq-1a', at: T5(26), x: 488, variant: 'crate', reward: { heal: 1 }, label: 'Supply crate opened' },
  { id: 'eb-cache-1', level: 'cq-1b', at: T5(20), x: 92, width: 120, variant: 'cache', reward: { card: true }, label: 'Secret room opened' },
  { id: 'eb-crate-2', level: 'cq-2a', at: T5(30), x: 52, variant: 'crate', reward: { heal: 2 }, label: 'Supply crate opened' },
  { id: 'eb-cache-2', level: 'cq-2b', at: T5(24), x: 448, width: 120, variant: 'cache', reward: { card: true }, label: 'Secret room opened' },
  { id: 'eb-crate-3', level: 'cq-3a', at: T5(28), x: 494, variant: 'crate', reward: { heal: 2 }, label: 'Supply crate opened' },
  { id: 'eb-cache-3', level: 'cq-3b', at: T5(22), x: 100, width: 120, variant: 'cache', reward: { card: true }, label: 'Secret room opened' },
];

const H = EMPIRE_BASE_HIDDEN;
export const CQ_SECTIONS: Record<string, ScrollLevelDef> = Object.fromEntries(
  [
    // Map 1, base: the compound, in the dark and then in daylight.
    section('cq-1a', 'Outer fence', 'baseInterior', 'easy', EASY, 0, 60, 0.5, H),
    section('cq-1m', 'Motor pool', 'surfaceBase', 'easy', EASY, 120, 178, 0.5, H),
    section('cq-1b', 'Perimeter guns', 'surfaceBase', 'easy', EASY, 60, 120, 0.5, H),
    // Map 2, surface: the open ground outside the walls.
    section('cq-2a', 'The yard', 'surface', 'mid', MID, 0, 60, 0.5, H),
    section('cq-2m', 'Gun line', 'surface', 'mid', MID, 120, 178, 0.5, H),
    section('cq-2b', 'Hangar row', 'surface', 'mid', MID, 60, 120, 0.5, H),
    // Map 3, wilderness: snow and pines, the last stretch before the flagship.
    section('cq-3a', 'Inner defences', 'surfaceWild', 'hard', HARD, 120, 178, 0.45, H),
    section('cq-3m', 'Frozen outpost', 'tundraNight', 'hard', HARD, 0, 60, 0.45, H),
    section('cq-3b', 'The last line', 'surfaceWild', 'hard', HARD, 60, 120, 0.5, H),
  ].map((l) => [l.id, l]),
);

// --- waves and maps ----------------------------------------------------------------------------------------------

/**
 * The formation waves (src/conquest/waveGen.ts: the Endless wave format and the empire roster, growing with a tier 0 to 5) run over the scroll
 * sections (scenery, obstacles and ground defences underneath). A section CHAINS its waves (`ScrollNodeDefinition.chain`): the next wave comes
 * a couple of seconds after the field is cleared (never earlier than 8 s after the last one), the section ends with a SECTOR CLEAR beat once the last
 * wave is down and it is far enough in, and it never waits on an empty scroll. The flybys of the chapter 5 timeline are gone.
 */
const wv = (id: string, name: string, kind: Archetype, tier: number, light = false): WaveDefinition => cqWave({ id, name, kind, tier, light });

// --- difficulty --------------------------------------------------------------------------------------------------

/**
 * THE tuning table: every difficulty number of the Empire Base run, per map, in one place. Map 1 is the baseline (all 1 / 0: as authored).
 * Cards make the player stronger as the run goes on, so enemy HP and fire rate also grow with the number of cards held (`perCard*`, after the
 * map's base multiplier): the later maps outgrow the player's gains instead of being outgrown by them.
 *   hp, fire          unit hull and core multiplier, and unit fire-rate multiplier (`perCardHp`/`perCardFire` added per card held)
 *   bossHp, bossFire  the same for the map boss (`perCardBossHp` per card; the fire multiplier is flat)
 *   fireCap, hpCap    ceilings on the card-scaled multipliers, so a lucky card pile cannot make a map unwinnable
 *   tiers             waveGen tier (formation size, "+" units, dive timing) of waves a / m / b of the map, one entry per chained wave
 *   miniTier, miniEscort, miniChance   mini-boss tier, escort size, chance of one appearing
 */
export interface MapDifficulty {
  hp: number;
  fire: number;
  perCardHp: number;
  perCardFire: number;
  hpCap: number;
  fireCap: number;
  bossHp: number;
  bossFire: number;
  perCardBossHp: number;
  tiers: { a: number[]; m: number[]; b: number[] };
  miniTier: number;
  miniEscort: number;
  miniChance: number;
}

export const CQ_DIFFICULTY: MapDifficulty[] = [
  // Map 1: unchanged.
  { hp: 1, fire: 1, perCardHp: 0, perCardFire: 0, hpCap: 1, fireCap: 1, bossHp: 1, bossFire: 1, perCardBossHp: 0, tiers: { a: [0, 0], m: [1], b: [0, 1] }, miniTier: 1, miniEscort: 3, miniChance: 0.6 },
  // Map 2: noticeably harder.
  { hp: 1.2, fire: 1.08, perCardHp: 0.03, perCardFire: 0.01, hpCap: 1.6, fireCap: 1.25, bossHp: 1.4, bossFire: 1.1, perCardBossHp: 0.025, tiers: { a: [1, 2], m: [2], b: [2, 3] }, miniTier: 3, miniEscort: 4, miniChance: 0.8 },
  // Map 3: the hardest.
  { hp: 1.4, fire: 1.45, perCardHp: 0.04, perCardFire: 0.04, hpCap: 2, fireCap: 2.4, bossHp: 1.7, bossFire: 1.4, perCardBossHp: 0.04, tiers: { a: [4, 4], m: [5], b: [5, 6] }, miniTier: 4, miniEscort: 6, miniChance: 1 },
];

/** Enemy scaling for map `map` with `cards` upgrades held (`RunDefinition.enemyScale`). */
export function enemyScale(map: number, cards: number): EnemyScale {
  const d = CQ_DIFFICULTY[Math.max(0, Math.min(CQ_DIFFICULTY.length - 1, map))];
  const hp = Math.min(d.hpCap, d.hp + d.perCardHp * cards);
  const fire = Math.min(d.fireCap, d.fire + d.perCardFire * cards);
  return { hp: d.perCardHp === 0 ? d.hp : hp, fire: d.perCardFire === 0 ? d.fire : fire, bossHp: d.bossHp + d.perCardBossHp * cards, bossFire: d.bossFire };
}

interface MapDef {
  id: string;
  name: string;
  /** Scenery behind the mini-bosses and the boss. */
  theme: string;
  /** Wave 1 and 3 of the map: a section with two light waves each; wave 2: a section with one full wave. */
  a: { section: string; waves: WaveDefinition[] };
  m: { section: string; waves: WaveDefinition[] };
  b: { section: string; waves: WaveDefinition[] };
  bossId: string;
  bossName: string;
  /** Mini-boss tier and escort size on this map, and the chance of one appearing. */
  miniTier: number;
  miniEscort: number;
  miniChance: number;
}

const T = CQ_DIFFICULTY;

export const CQ_MAPS: MapDef[] = [
  {
    id: 'base',
    name: 'Base perimeter',
    theme: 'baseInterior',
    a: { section: 'cq-1a', waves: [wv('cq-1a-a', 'Outer fence: line', 'line', T[0].tiers.a[0], true), wv('cq-1a-b', 'Outer fence: grid', 'grid', T[0].tiers.a[1], true)] },
    m: { section: 'cq-1m', waves: [wv('cq-1m-a', 'Gunship escort', 'escort', T[0].tiers.m[0])] },
    b: { section: 'cq-1b', waves: [wv('cq-1b-a', 'Perimeter: vee', 'vee', T[0].tiers.b[0], true), wv('cq-1b-b', 'Perimeter: strafers', 'strafers', T[0].tiers.b[1], true)] },
    bossId: 'bulwark-components',
    bossName: 'BULWARK',
    miniTier: T[0].miniTier,
    miniEscort: T[0].miniEscort,
    miniChance: T[0].miniChance,
  },
  {
    id: 'surface',
    name: 'Surface defences',
    theme: 'surface',
    a: { section: 'cq-2a', waves: [wv('cq-2a-a', 'Yard: grid', 'grid', T[1].tiers.a[0], true), wv('cq-2a-b', 'Yard: pincer', 'pincer', T[1].tiers.a[1], true)] },
    m: { section: 'cq-2m', waves: [wv('cq-2m-a', 'Siege wing', 'siege', T[1].tiers.m[0])] },
    b: { section: 'cq-2b', waves: [wv('cq-2b-a', 'Hangar: strafers', 'strafers', T[1].tiers.b[0], true), wv('cq-2b-b', 'Hangar: grid', 'grid', T[1].tiers.b[1], true)] },
    bossId: 'mantis',
    bossName: 'MANTIS',
    miniTier: T[1].miniTier,
    miniEscort: T[1].miniEscort,
    miniChance: T[1].miniChance,
  },
  {
    id: 'wilds',
    name: 'Frozen wilds',
    theme: 'surfaceWild',
    a: { section: 'cq-3a', waves: [wv('cq-3a-a', 'Inner: pincer', 'pincer', T[2].tiers.a[0], true), wv('cq-3a-b', 'Inner: escort', 'escort', T[2].tiers.a[1], true)] },
    m: { section: 'cq-3m', waves: [wv('cq-3m-a', 'Flak battery', 'flak', T[2].tiers.m[0])] },
    b: { section: 'cq-3b', waves: [wv('cq-3b-a', 'Last line: siege', 'siege', T[2].tiers.b[0], true), wv('cq-3b-b', 'Strafers+', 'strafers', T[2].tiers.b[1], true)] },
    bossId: CAPITAL_CONQUEST_ID,
    bossName: 'CAPITAL SHIP',
    miniTier: T[2].miniTier,
    miniEscort: T[2].miniEscort,
    miniChance: T[2].miniChance,
  },
];

/** The chained waves, for the debug list and the tests. */
export const CQ_WAVES: WaveDefinition[] = CQ_MAPS.flatMap((m) => [...m.a.waves, ...m.m.waves, ...m.b.waves]);

const MINIS = [
  { unit: 'empire-mb-viper', name: 'VIPER' },
  { unit: 'empire-mb-cinder', name: 'CINDER' },
  { unit: 'empire-mb-raven', name: 'RAVEN' },
];

// --- the run -----------------------------------------------------------------------------------------------------

const reward: NodeDefinition = { type: 'reward', choices: 3 };

/** One wave of a map: its section with the chained waves (wave 1 and 3: two light waves, wave 2: one full one). */
function waveNode(m: MapDef, slot: 'a' | 'm' | 'b', n: number): NodeDefinition {
  const w = m[slot];
  const single = w.waves.length === 1;
  return {
    type: 'scroll',
    level: CQ_SECTIONS[w.section],
    chain: { waves: w.waves, first: 3, gap: 2.5, minSpacing: 8, every: 30, minEnd: single ? 0.45 : 0.6 },
    hud: { kind: 'wave', n, of: 3, title: CQ_SECTIONS[w.section].name },
  };
}

/** The mini-boss fight of map `m` against `mini`: over the map's scenery; `n` = the wave it stands in for or follows. */
function miniNode(m: MapDef, mini: (typeof MINIS)[number], n: number): NodeDefinition {
  return {
    type: 'wave',
    wave: miniBossWave(`cq-mb-${m.id}-${mini.name.toLowerCase()}`, `Mini-boss ${mini.name}`, mini.unit, m.miniEscort, m.miniTier),
    scroll: backdrop(`cq-bg-mini-${m.id}`, m.theme),
    hud: { kind: 'mini', n, of: 3, title: mini.name },
  };
}

/** Mini-bosses already drawn in this run (the levels are built in order from map 0: no repeats). */
let usedMinis: string[] = [];

/**
 * One map: 3 waves, a card after each, possibly a random mini-boss (the chance grows per map; it takes the place of a wave or comes right after one,
 * decided by the seeded rng), then the map boss. The level's own reward (a card) follows the boss, except on the last map.
 */
export function buildMap(mapIndex: number, rng: () => number): NodeDefinition[] {
  const m = CQ_MAPS[mapIndex];
  if (mapIndex === 0) usedMinis = [];
  const slots: NodeDefinition[][] = [[waveNode(m, 'a', 1)], [waveNode(m, 'm', 2)], [waveNode(m, 'b', 3)]];
  if (rng() < m.miniChance) {
    const pool = MINIS.filter((x) => !usedMinis.includes(x.unit));
    const mini = pool[Math.floor(rng() * pool.length) % pool.length];
    const at = Math.floor(rng() * 3);
    const replace = rng() < 0.5;
    usedMinis.push(mini.unit);
    if (replace) slots[at] = [miniNode(m, mini, at + 1)];
    else slots[at].push(miniNode(m, mini, at + 1));
  }
  const boss: NodeDefinition = { type: 'boss', bossId: m.bossId, scroll: backdrop(`cq-bg-boss-${m.id}`, m.theme), hud: { kind: 'boss', title: m.bossName } };
  return [...slots.flatMap((nodes) => [...nodes, reward]), boss];
}

const LEVELS: LevelDefinition[] = CQ_MAPS.map((m, i) => ({
  name: m.name,
  nodes: buildMap(i, () => 1), // the static list: no mini-bosses (the run rolls its own, see `build`)
  build: (rng, li) => buildMap(li, rng),
  reward: { choices: 3 },
}));

export const EMPIRE_BASE_RUN: RunDefinition = { name: 'Conquest: Empire Base', levels: LEVELS, enemyScale };

// --- challenges --------------------------------------------------------------------------------------------------

export const EMPIRE_BASE_CHALLENGES: ChallengeDef[] = [
  {
    id: 'eb-kills',
    name: 'Scrap the fleet',
    desc: 'Defeat 220 enemies in one run.',
    metric: { kind: 'kills', n: 220 },
    rewards: [{ kind: 'cards', id: 'demo-chain-overclock' }, { kind: 'weapons', id: 'mine' }],
  },
  {
    id: 'eb-survive',
    name: 'Hold the line',
    desc: 'Survive for 10 minutes in one run.',
    metric: { kind: 'time', seconds: 600 },
    rewards: [{ kind: 'cards', id: 'demo-ablative-plating' }],
  },
  {
    id: 'eb-hidden',
    name: 'Eyes open',
    desc: 'Find 3 hidden items in one run (a lamp that flickers, a seam in a wall).',
    metric: { kind: 'hidden', n: 3 },
    rewards: [{ kind: 'cards', id: 'demo-gauss-supercharge' }, { kind: 'weapons', id: 'drone' }],
  },
  {
    id: 'eb-aces',
    name: 'Ace hunter',
    desc: 'Defeat 2 different mini-bosses (VIPER, CINDER, RAVEN) in one run. They turn up at random.',
    metric: { kind: 'miniBosses', n: 2 },
    rewards: [{ kind: 'cards', id: 'cq-ace-plating' }],
  },
  {
    id: 'eb-guns',
    name: 'Disarm the flagship',
    desc: 'Destroy every gun housing of the capital ship.',
    metric: { kind: 'bossTurrets', boss: CAPITAL_CONQUEST_ID },
    rewards: [{ kind: 'cards', id: 'cq-gunsmith-coil' }, { kind: 'weapons', id: 'shield-pulse' }],
  },
  {
    id: 'eb-clear',
    name: 'Fall of the base',
    desc: 'Clear the whole run.',
    metric: { kind: 'clear' },
    rewards: [{ kind: 'cards', id: 'cq-salvaged-reactor' }],
  },
];

// --- the region --------------------------------------------------------------------------------------------------

export const EMPIRE_BASE: RegionDefinition = {
  id: EMPIRE_BASE_ID,
  name: 'EMPIRE BASE',
  blurb: 'The fortress the squadron escaped from, in three maps: the base, the surface defences, the frozen wilds. A boss ends each map, the flagship ends the run. One life.',
  campaign: 'fallen-peace',
  unlockHint: 'Finish the Fallen Peace campaign.',
  theme: { scroll: ['baseInterior', 'surfaceBase', 'surface', 'surfaceWild', 'tundraNight'], accent: '#ff8a5a' },
  roster: {
    units: ['empire-fighter', 'empire-gunship', 'empire-strafer', 'empire-flak'],
    flybys: ['strafe', 'cross', 'rear', 'drift'],
    bosses: ['Mini-bosses VIPER, CINDER, RAVEN', 'Bulwark', 'Mantis', 'Capital ship'],
    hazards: ['defence lines', 'ground turrets', 'shield barriers'],
  },
  run: EMPIRE_BASE_RUN,
  challenges: EMPIRE_BASE_CHALLENGES,
  hidden: EMPIRE_BASE_HIDDEN,
};
