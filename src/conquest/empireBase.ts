import { CAPITAL_CONQUEST_ID } from '../bosses/capitalShipConquest';
import type { WaveDefinition } from '../waves';
import { cqWave, miniBossWave, type Archetype } from './waveGen';
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
    section('cq-1a', 'Outer fence', 'surfaceBase', 'easy', EASY, 0, 60, 0.5, H),
    section('cq-1b', 'Perimeter guns', 'surface', 'easy', EASY, 60, 120, 0.5, H),
    section('cq-2a', 'The yard', 'baseInterior', 'mid', MID, 0, 60, 0.5, H),
    section('cq-2b', 'Hangar row', 'surfaceBase', 'mid', MID, 60, 120, 0.5, H),
    section('cq-3a', 'Inner defences', 'baseInterior', 'hard', HARD, 120, 178, 0.45, H),
    section('cq-3b', 'The last line', 'surfaceBase', 'hard', HARD, 60, 120, 0.5, H),
  ].map((l) => [l.id, l]),
);

// --- waves -------------------------------------------------------------------------------------------------------

/**
 * The run is formation waves (src/conquest/waveGen.ts: the Endless wave format and the empire roster, growing with a tier 0 to 5) with the
 * scroll sections as scenery and ground defences underneath: each section carries two timed formation waves of its own and ends only when
 * they are dead (`waitForUnits`), and the flybys of the chapter 5 timeline are gone (no lone ship passing by). Between nodes: a card.
 */
const wv = (id: string, name: string, kind: Archetype, tier: number, light = false): WaveDefinition => cqWave({ id, name, kind, tier, light });
const mini = (id: string, name: string, boss: string, escort: number, tier: number): WaveDefinition => miniBossWave(id, name, boss, escort, tier);

export const CQ_WAVES: WaveDefinition[] = [
  wv('cq-w1', 'Picket line', 'line', 0),
  wv('cq-w2', 'Gunship escort', 'escort', 1),
  wv('cq-w3', 'Strafing run', 'strafers', 1),
  mini('cq-mb-viper', 'Mini-boss VIPER', 'empire-mb-viper', 3, 1),
  wv('cq-w4', 'Pincer', 'pincer', 2),
  wv('cq-w5', 'Siege wing', 'siege', 2),
  mini('cq-mb-cinder', 'Mini-boss CINDER', 'empire-mb-cinder', 4, 2),
  wv('cq-w6', 'Vee assault', 'vee', 3),
  wv('cq-w7', 'Flak battery', 'flak', 3),
  wv('cq-w8', 'Strafers+', 'strafers', 3),
  mini('cq-mb-raven', 'Mini-boss RAVEN', 'empire-mb-raven', 5, 4),
];

const waveBy = (id: string): WaveDefinition => CQ_WAVES.find((w) => w.id === id)!;

/** Overlay waves for a section (the timed formations): `at` seconds into the section. */
const overlay = (sectionId: string, items: [number, WaveDefinition][]): void => {
  const lvl = CQ_SECTIONS[sectionId];
  lvl.timeline = [...lvl.timeline, ...items.map(([sec, wave]): ScrollEntry => ({ at: T5(sec), kind: 'wave', wave }))].sort((x, y) => x.at - y.at);
};
overlay('cq-1a', [[5, wv('cq-1a-a', 'Outer fence: vee', 'vee', 0, true)], [32, wv('cq-1a-b', 'Outer fence: grid', 'grid', 0, true)]]);
overlay('cq-1b', [[5, wv('cq-1b-a', 'Perimeter: line', 'line', 0, true)], [32, wv('cq-1b-b', 'Perimeter: vee', 'vee', 1, true)]]);
overlay('cq-2a', [[5, wv('cq-2a-a', 'Yard: grid', 'grid', 1, true)], [32, wv('cq-2a-b', 'Yard: line', 'line', 1, true)]]);
overlay('cq-2b', [[5, wv('cq-2b-a', 'Hangar: vee', 'vee', 2, true)], [32, wv('cq-2b-b', 'Hangar: grid', 'grid', 2, true)]]);
overlay('cq-3a', [[5, wv('cq-3a-a', 'Inner: line', 'line', 2, true)], [32, wv('cq-3a-b', 'Inner: vee', 'vee', 2, true)]]);
overlay('cq-3b', [[5, wv('cq-3b-a', 'Last line: grid', 'grid', 3, true)], [32, wv('cq-3b-b', 'Last line: line', 'line', 3, true)]]);

// --- the run -----------------------------------------------------------------------------------------------------

const wave = (id: string): NodeDefinition => ({ type: 'wave', wave: waveBy(id) });
const scroll = (id: string): NodeDefinition => ({ type: 'scroll', level: CQ_SECTIONS[id], waitForUnits: true });
const reward: NodeDefinition = { type: 'reward', choices: 3 };

/** Nodes with a card pick after each one (the Endless rhythm). */
function withRewards(nodes: NodeDefinition[]): NodeDefinition[] {
  return nodes.flatMap((n) => [n, reward]).slice(0, -1);
}

const LEVELS: LevelDefinition[] = [
  { nodes: withRewards([wave('cq-w1'), scroll('cq-1a'), wave('cq-w2'), scroll('cq-1b'), wave('cq-w3'), wave('cq-mb-viper')]), reward: { choices: 3 } },
  { nodes: withRewards([scroll('cq-2a'), wave('cq-w4'), scroll('cq-2b'), wave('cq-w5'), wave('cq-mb-cinder'), { type: 'boss', bossId: 'bulwark-components', scroll: backdrop('cq-bg-garrison', 'baseInterior') }]), reward: { choices: 3 } },
  { nodes: withRewards([wave('cq-w6'), scroll('cq-3a'), wave('cq-w7'), scroll('cq-3b'), wave('cq-w8'), wave('cq-mb-raven')]), reward: { choices: 3 } },
  { nodes: [{ type: 'boss', bossId: CAPITAL_CONQUEST_ID, scroll: backdrop('cq-bg-capital', 'surfaceBase') }] },
];

export const EMPIRE_BASE_RUN: RunDefinition = { name: 'Conquest: Empire Base', levels: LEVELS };

// --- challenges --------------------------------------------------------------------------------------------------

export const EMPIRE_BASE_CHALLENGES: ChallengeDef[] = [
  {
    id: 'eb-kills',
    name: 'Scrap the fleet',
    desc: 'Defeat 220 enemies in one run.',
    metric: { kind: 'kills', n: 220 },
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
    id: 'eb-aces',
    name: 'Ace hunter',
    desc: 'Defeat all three mini-bosses (VIPER, CINDER, RAVEN) in one run.',
    metric: { kind: 'miniBosses', n: 3 },
    rewards: [{ kind: 'cards', id: 'cq-ace-plating' }],
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
    bosses: ['Mini-bosses VIPER, CINDER, RAVEN', 'Bulwark', 'Capital ship'],
    hazards: ['defence lines', 'ground turrets', 'shield barriers'],
  },
  run: EMPIRE_BASE_RUN,
  challenges: EMPIRE_BASE_CHALLENGES,
  hidden: EMPIRE_BASE_HIDDEN,
};
