import { CAPITAL_CONQUEST_ID } from '../bosses/capitalShipConquest';
import type { Formation, WaveDefinition, WaveGroup } from '../waves';
import type { LevelDefinition, NodeDefinition, RunDefinition } from '../flow/node';
import { SPEED5, SURFACE_TUNE, surfaceTimeline, T5, type SurfaceTune } from '../scroll/fallenPeace45';
import type { ScrollEntry, ScrollLevelDef } from '../scroll/types';
import type { HiddenEntry } from '../terrain/types';
import type { ChallengeDef, HiddenPlacement, RegionDefinition } from './types';

/**
 * Region 1: EMPIRE BASE (DESIGN.md "Conquest"). Everything it uses already exists: the chapter 5 surface-run timeline (defence lines, gun and
 * mortar turrets, shield barriers, turret clusters, empire flybys), the base and surface scenery, the empire fighters, gunships and the three
 * aces (as mini-bosses), Bulwark (the garrison, the milestone boss) and the chapter 7 capital ship (the final boss). What is new is the order,
 * the scaling and the hidden items.
 *
 * The run (about 18 minutes at a human pace, see DESIGN.md "Conquest: as built"):
 *   Level 1 "Outer defences": surface run, fighters, surface run, gunships, ace VIPER.
 *   Level 2 "The garrison": surface run, fighters+, surface run, ace CINDER with an escort, BULWARK (milestone boss).
 *   Level 3 "Inner base": surface run, gunships+, surface run, aces RAVEN and VIPER together.
 *   Level 4 "The capital ship": the final boss.
 * A card pick follows every wave, section and boss. Health is restored at the start of each level only (the engine's rule). Scaling: the enemy
 * fire scale of the scroll sections is the one chapter 5 validated for the same window of the timeline (0.5 to 0.6), level 2 on uses the "+" units (a quarter faster guns), formations grow.
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
    .filter((e) => e.at >= T5(t0) && e.at < T5(t1))
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
 * the section (180 px/s: 1 s = 180 px).
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
    section('cq-1a', 'Outer fence', 'surfaceBase', 'easy', EASY, 0, 60, 0.55, H),
    section('cq-1b', 'Perimeter guns', 'surface', 'easy', EASY, 60, 120, 0.55, H),
    section('cq-2a', 'The yard', 'baseInterior', 'mid', MID, 0, 60, 0.6, H),
    section('cq-2b', 'Hangar row', 'surfaceBase', 'mid', MID, 60, 120, 0.6, H),
    section('cq-3a', 'Inner defences', 'baseInterior', 'hard', HARD, 120, 178, 0.5, H),
    section('cq-3b', 'The last line', 'surfaceBase', 'hard', HARD, 60, 120, 0.6, H),
  ].map((l) => [l.id, l]),
);

// --- waves -------------------------------------------------------------------------------------------------------

const row = (count: number, y: number, spacing: number, x = 270): Formation => ({ kind: 'row', count, x, y, spacing });
const slots = (...pts: [number, number][]): Formation => ({ kind: 'slots', points: pts.map(([x, y]) => ({ x, y })) });
const vee = (count: number, y: number): Formation => ({ kind: 'vee', count, x: 270, y, spacingX: 44, spacingY: 34 });
const group = (unit: string, formation: Formation, rest: Partial<WaveGroup> = {}): WaveGroup => ({ unit, formation, ...rest });

/** `+` = the "harder" variant of a unit (guns a quarter faster, src/enemies/index.ts). */
const F = 'empire-fighter';
const G = 'empire-gunship';
const VIPER = 'empire-ace-viper';
const CINDER = 'empire-ace-cinder';
const RAVEN = 'empire-ace-raven';

export const CQ_WAVES: WaveDefinition[] = [
  { id: 'cq-picket', name: 'Picket line', groups: [group(F, row(7, 200, 66), { entrance: { kind: 'swoop' }, stagger: 0.3, dive: { first: 7, every: 9 } }), group(F, vee(7, 300), { entrance: { kind: 'loop' }, start: 9, stagger: 0.25, dive: { first: 6, every: 8 } })] },
  {
    id: 'cq-escort',
    name: 'Gunship escort',
    groups: [group(G, slots([160, 130], [380, 130]), { entrance: { kind: 'drop', time: 2.6 }, stagger: 0.8 }), group(F, row(6, 310, 70), { entrance: { kind: 'swoop' }, start: 3, stagger: 0.3, dive: { first: 7, every: 9 } }), group(F, vee(6, 380), { entrance: { kind: 'loop' }, start: 10, stagger: 0.25, dive: { first: 6, every: 8 } })],
  },
  { id: 'cq-ace-viper', name: 'Ace VIPER', groups: [group(VIPER, slots([270, 220]), { start: 0 }), group(F, row(4, 330, 90), { entrance: { kind: 'swoop' }, start: 7, stagger: 0.35, dive: { first: 6, every: 9 } })] },
  {
    id: 'cq-lancers',
    name: 'Lancer wing',
    groups: [group(`${F}+`, { kind: 'rows', rows: 2, perRow: 6, x: 270, y: 210, spacingX: 52, spacingY: 50 }, { entrance: { kind: 'drop' }, stagger: 0.22, dive: { first: 6, every: 8 } }), group(`${G}+`, slots([130, 130], [410, 130]), { entrance: { kind: 'drop', time: 2.6 }, start: 4, stagger: 0.8 }), group(`${F}+`, vee(6, 370), { entrance: { kind: 'loop' }, start: 12, stagger: 0.25, dive: { first: 6, every: 8 } })],
  },
  { id: 'cq-ace-cinder', name: 'Ace CINDER', groups: [group(CINDER, slots([270, 220])), group(`${F}+`, row(5, 330, 80), { entrance: { kind: 'swoop' }, start: 7, stagger: 0.3, dive: { first: 6, every: 8 } })] },
  {
    id: 'cq-bastion-wing',
    name: 'Bastion wing',
    groups: [group(`${G}+`, slots([110, 128], [270, 108], [430, 128]), { entrance: { kind: 'drop', time: 2.6 }, stagger: 0.7 }), group(`${F}+`, { kind: 'rows', rows: 2, perRow: 5, x: 270, y: 260, spacingX: 62, spacingY: 50 }, { entrance: { kind: 'swoop' }, start: 5, stagger: 0.22, dive: { first: 6, every: 8 } }), group(`${F}+`, vee(7, 390), { entrance: { kind: 'loop' }, start: 14, stagger: 0.25, dive: { first: 6, every: 8 } })],
  },
  {
    id: 'cq-swarm',
    name: 'Fighter swarm',
    groups: [group(F, { kind: 'rows', rows: 2, perRow: 6, x: 270, y: 200, spacingX: 56, spacingY: 48 }, { entrance: { kind: 'drop' }, stagger: 0.2, dive: { first: 6, every: 8 } }), group(F, vee(7, 360), { entrance: { kind: 'swoop' }, start: 8, stagger: 0.22, dive: { first: 6, every: 8 } })],
  },
  {
    id: 'cq-pincer',
    name: 'Pincer',
    groups: [group(`${F}+`, row(7, 210, 62), { entrance: { kind: 'swoop', side: 'left' }, stagger: 0.25, dive: { first: 6, every: 8 } }), group(`${F}+`, row(7, 290, 62), { entrance: { kind: 'swoop', side: 'right' }, start: 3, stagger: 0.25, dive: { first: 7, every: 8 } }), group(`${G}+`, slots([270, 118]), { entrance: { kind: 'drop', time: 2.6 }, start: 8 })],
  },
  {
    id: 'cq-siege',
    name: 'Siege wing',
    groups: [group(`${G}+`, slots([120, 128], [420, 128]), { entrance: { kind: 'drop', time: 2.6 }, stagger: 0.7 }), group(`${F}+`, { kind: 'rows', rows: 3, perRow: 5, x: 270, y: 230, spacingX: 62, spacingY: 46 }, { entrance: { kind: 'loop' }, start: 4, stagger: 0.2, dive: { first: 6, every: 8 } }), group(`${G}+`, slots([270, 108]), { entrance: { kind: 'drop', time: 2.6 }, start: 14 })],
  },
  { id: 'cq-ace-raven', name: 'Aces RAVEN and VIPER', groups: [group(RAVEN, slots([170, 220])), group(VIPER, slots([370, 250]), { start: 6 }), group(`${F}+`, row(4, 340, 90), { entrance: { kind: 'swoop' }, start: 10, stagger: 0.35, dive: { first: 6, every: 8 } })] },
];

const waveBy = (id: string): WaveDefinition => CQ_WAVES.find((w) => w.id === id)!;

// --- the run -----------------------------------------------------------------------------------------------------

const wave = (id: string): NodeDefinition => ({ type: 'wave', wave: waveBy(id) });
const scroll = (id: string): NodeDefinition => ({ type: 'scroll', level: CQ_SECTIONS[id] });
const reward: NodeDefinition = { type: 'reward', choices: 3 };

/** Nodes with a card pick after each one (the Endless rhythm). */
function withRewards(nodes: NodeDefinition[]): NodeDefinition[] {
  return nodes.flatMap((n) => [n, reward]).slice(0, -1);
}

const LEVELS: LevelDefinition[] = [
  { nodes: withRewards([scroll('cq-1a'), wave('cq-picket'), scroll('cq-1b'), wave('cq-escort'), wave('cq-swarm'), wave('cq-ace-viper')]), reward: { choices: 3 } },
  { nodes: withRewards([scroll('cq-2a'), wave('cq-lancers'), wave('cq-pincer'), scroll('cq-2b'), wave('cq-ace-cinder'), { type: 'boss', bossId: 'bulwark-components', scroll: backdrop('cq-bg-garrison', 'baseInterior') }]), reward: { choices: 3 } },
  { nodes: withRewards([scroll('cq-3a'), wave('cq-bastion-wing'), wave('cq-siege'), scroll('cq-3b'), wave('cq-ace-raven')]), reward: { choices: 3 } },
  { nodes: [{ type: 'boss', bossId: CAPITAL_CONQUEST_ID, scroll: backdrop('cq-bg-capital', 'surfaceBase') }] },
];

export const EMPIRE_BASE_RUN: RunDefinition = { name: 'Conquest: Empire Base', levels: LEVELS };

// --- challenges --------------------------------------------------------------------------------------------------

export const EMPIRE_BASE_CHALLENGES: ChallengeDef[] = [
  {
    id: 'eb-kills',
    name: 'Scrap the fleet',
    desc: 'Defeat 150 enemies in one run.',
    metric: { kind: 'kills', n: 150 },
    rewards: [{ kind: 'cards', id: 'demo-chain-overclock' }],
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
    rewards: [{ kind: 'cards', id: 'demo-gauss-supercharge' }],
  },
  {
    id: 'eb-guns',
    name: 'Disarm the flagship',
    desc: 'Destroy every gun housing of the capital ship.',
    metric: { kind: 'bossTurrets', boss: CAPITAL_CONQUEST_ID },
    rewards: [{ kind: 'cards', id: 'cq-gunsmith-coil' }],
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
  blurb: 'The fortress the squadron escaped from: fences, guns and shield barriers, then the garrison and the flagship. One life.',
  campaign: 'fallen-peace',
  unlockHint: 'Finish the Fallen Peace campaign.',
  theme: { scroll: ['surfaceBase', 'surface', 'baseInterior'], accent: '#ff8a5a' },
  roster: {
    units: ['empire-fighter', 'empire-gunship', 'empire-strafer', 'empire-flak'],
    flybys: ['strafe', 'cross', 'rear', 'drift'],
    bosses: ['Aces VIPER, CINDER, RAVEN', 'Bulwark', 'Capital ship'],
    hazards: ['defence lines', 'ground turrets', 'shield barriers'],
  },
  run: EMPIRE_BASE_RUN,
  challenges: EMPIRE_BASE_CHALLENGES,
  hidden: EMPIRE_BASE_HIDDEN,
};
