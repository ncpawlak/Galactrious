/**
 * The flow-engine contract (DESIGN.md "Run flow"). A run is data (`RunDefinition`); the `Run` state machine
 * (run.ts) walks it and drives one `FlowNode` at a time. A node knows nothing about other nodes: it gets a
 * `NodeContext` in `start`, is updated and drawn every frame, and reports an outcome when it is finished.
 *
 * To add a node type: add a definition interface to `NodeDefinition`, write a class implementing `FlowNode`
 * in `nodes/`, and add one `case` to `createNode` in `nodes/index.ts`. The engine does not change.
 */

/** Every node type, including the reserved ones (not built, `createNode` throws for them). */
import type { BossSnapshot } from '../campaign/snapshot';
import type { WaveDefinition } from '../waves';
import type { ScrollLevelDef, ScrollRunner } from '../scroll/types';

export type NodeType = 'wave' | 'boss' | 'reward' | 'level' | 'interlude' | 'scroll';

/** `done` = the player cleared it (go on); `lost` = the player died (the run is over). `null` while running. */
export type NodeOutcome = 'done' | 'lost';

// --- definitions (pure data, what a RunDefinition holds) ------------------------------------------------

/** A boss fight against the BossDefinition with this id (src/bosses/index.ts). */
export interface BossNodeDefinition {
  type: 'boss';
  bossId: string;
  /** Run the fight over a scrolling level (id in `SCROLL_LEVELS` or an inline definition): background, obstacles, allies, timeline. */
  scroll?: string | ScrollLevelDef;
}

/** A wave of enemy units (src/waves.ts): the node ends when every unit is dead. */
export interface WaveNodeDefinition {
  type: 'wave';
  wave: WaveDefinition;
  /** Run the wave over a scrolling level (id in `SCROLL_LEVELS` or an inline definition). */
  scroll?: string | ScrollLevelDef;
}

/** A scrolling level on its own (src/scroll): the node ends when the scroll distance reaches the level's length. */
export interface ScrollNodeDefinition {
  type: 'scroll';
  level: string | ScrollLevelDef;
}

/** A pick-one-of-N upgrade card screen (see nodes/reward.ts, src/upgrades/). */
export interface RewardNodeDefinition {
  type: 'reward';
  /** How many cards are offered (default 3). */
  choices?: number;
}

/** Reserved: a hand-built set-piece level. Not built. */
export interface LevelNodeDefinition {
  type: 'level';
  id: string;
}

/** Reserved: story card, shop... Not built. */
export interface InterludeNodeDefinition {
  type: 'interlude';
  id: string;
}

export type NodeDefinition =
  | BossNodeDefinition
  | WaveNodeDefinition
  | ScrollNodeDefinition
  | RewardNodeDefinition
  | LevelNodeDefinition
  | InterludeNodeDefinition;

export interface LevelDefinition {
  /** Played in order. */
  nodes: NodeDefinition[];
  /** The reward offered after the level. Omitted = none. The last level's reward is never shown (the run is won). */
  reward?: Omit<RewardNodeDefinition, 'type'>;
}

export interface RunDefinition {
  name: string;
  levels: LevelDefinition[];
}

// --- run state -----------------------------------------------------------------------------------------

/** One stat change an upgrade makes. Read through `Loadout` (src/upgrades/stats.ts), never applied to the global TUNING/WEAPONS. */
export interface Modifier {
  /** Dotted stat key, e.g. 'gauss.reach', 'ship.maxHealth', 'dodge.cooldown'. */
  stat: string;
  op: 'add' | 'mul';
  value: number;
}

/** An upgrade the player picked from a reward card (in practice a `CardDef`, src/upgrades/model.ts). Held once per stack. */
export interface Upgrade {
  id: string;
  name: string;
  modifiers: Modifier[];
}

/** What a run carries from node to node. Created fresh by `Run.start`; nothing persists across runs. */
export interface RunState {
  /** Seeds `rng` (and any later per-run randomness). Pass `?seed=N` to replay a run's random choices. */
  seed: number;
  /** Seeded random source, 0..1. Use this, not Math.random, for anything that should depend on the seed. */
  rng: () => number;
  levelIndex: number;
  /** Index into the level's node list (the level's nodes, then its reward if it has one). */
  nodeIndex: number;
  /** Base max health. The live hit points belong to the combat sim; the host heals them (`NodeHost.healFull`). */
  maxHealth: number;
  /** The chosen ship (`ShipDefinition.id`, src/ships.ts). Its base stats feed `Loadout`. */
  shipId: string;
  /** The weapons in the slots: one main and up to three aux (`WeaponDef.id`, src/weapons.ts). */
  loadout: { main: string; aux: string[] };
  /** Upgrades picked so far, in order: the place for upgrade modifiers. */
  upgrades: Upgrade[];
  /** Run clock in seconds (only counts while a node is active). */
  time: number;
}

// --- node interface ------------------------------------------------------------------------------------

/** Where the player stands, for a node's own text. */
export interface NodePosition {
  level: number; // 1-based
  levels: number;
  /** 1-based index among nodes of the same type in this level, and how many there are. */
  index: number;
  count: number;
}

export interface NodeContext {
  host: NodeHost;
  run: RunState;
  position: NodePosition;
}

/** Combat result as the game reports it. `won` = the boss fell; `lost` = the ship was destroyed. */
export type CombatResult = 'running' | 'won' | 'lost';

/**
 * What a node may ask of the game (implemented by `Game`). Deliberately small: the units-and-waves work will
 * add what waves need (spawn units, the player's shots, ship damage) here rather than reach into the game.
 */
/** Cumulative counters the game keeps while combat runs (the campaign reads deltas of them per attempt; see src/campaign/session.ts). */
export interface CombatCounters {
  /** Units that started dying. */
  kills: number;
  /** Hits that landed on the ship (after dodge and i-frames). */
  hits: number;
  /** Hull points lost. */
  damage: number;
  /** Rooms (boss or unit) that went offline. */
  roomsDestroyed: number;
  /** Kills by the tag the unit was spawned with. */
  killsByTag: Record<string, number>;
}

/** One unit spawned by a campaign objective or beat. */
export interface SpawnRequest {
  unit: string;
  x: number;
  y: number;
  tag?: string;
  /** Seconds from now until it appears. */
  delay?: number;
}

export interface NodeHost {
  /** The player's ship position (live; only meaningful while in combat). */
  readonly ship: { x: number; y: number };
  /** Start a boss fight and turn combat on (ship, weapons, bullets, HUD). Health carries over from the last node. */
  startBossFight(bossId: string, scroll?: string | ScrollLevelDef): void;
  /**
   * Campaign: (re)start combat from a clean field: units, enemy fire, bullets and the weapon timers reset, the boss fight
   * starts when `bossId` is given (optionally with a restored `BossSnapshot`), otherwise there is no boss. `keepHealth`
   * false heals the ship fully (a checkpoint restart), true keeps its hull. Also unlocks weapons (`setWeaponsLocked`).
   */
  startCombat(opts?: { bossId?: string; keepHealth?: boolean; restore?: BossSnapshot; scroll?: string | ScrollLevelDef }): void;
  /** Queue one unit (campaign spawn). Needs combat to be on. */
  spawnUnit(req: SpawnRequest): void;
  /** Queue a whole wave by id (`WAVE_LIST`), tagging its units. */
  spawnWaveById(id: string, tag?: string): void;
  /** Units (alive, dying or queued) matching a tag and/or unit def id. */
  unitsLeft(match: { tag?: string; unit?: string }): number;
  /** Live cumulative counters (never reset; take deltas). */
  counters(): CombatCounters;
  /** The script blows the ship up now (not a death for the campaign). `combatResult` then reports `lost` after the usual beat. */
  forceDestroyPlayer(): void;
  /** Weapons off (no main fire, no aux triggers) or on. Reset by `startCombat`. */
  setWeaponsLocked(locked: boolean): void;
  /** Swap the ship and, optionally, its weapons (heals the ship). */
  setShip(shipId: string, loadout?: { main: string; aux: string[] }): void;
  /** False while the ship is exploding or gone (after a death or `forceDestroyPlayer`). */
  shipAlive(): boolean;
  /** State of a component or room of the running boss, by id: `destroyed`, `intact` or `missing` (no such id, or no boss). */
  bossTarget(kind: 'component' | 'room', id: string): 'destroyed' | 'intact' | 'missing';
  /** Snapshot of the running boss fight, or null when there is none. */
  captureBoss(): BossSnapshot | null;
  /** Start a wave and turn combat on with no boss (ship, weapons, bullets). The units spawn on the wave's own schedule. Health carries over. */
  startWave(wave: WaveDefinition, scroll?: string | ScrollLevelDef): void;
  /** Start a scrolling level (combat on, no boss unless the timeline spawns one). Health carries over. */
  startScroll(level: string | ScrollLevelDef): void;
  /** The running scroll level (distance, speed, `setSpeed`, `onEvent`), or null. */
  scroll(): ScrollRunner | null;
  /** Units of the running wave still alive, dying or waiting to spawn. 0 = the wave is cleared. */
  waveRemaining(): number;
  /** Result of the combat started by this node. A short death/explosion beat is already included. Waves only ever report `lost` (clearing is `waveRemaining() === 0`). */
  combatResult(): CombatResult;
  /** Turn combat off (the game goes back to the plain starfield). Call from `end`. */
  endCombat(): void;
  /** Restore the ship to full health. */
  healFull(): void;
  /** Next pointer press or key press since the last frame, or null. Each press is returned once. */
  takeTap(): { x: number; y: number } | null;
  takeKey(): string | null;
  /** Where the pointer currently is (hover highlight), or null if it has not been seen. */
  pointer(): { x: number; y: number } | null;
}

export interface FlowNode {
  /** Called once when the node becomes current. */
  start(ctx: NodeContext): void;
  /** Called every frame while current. */
  update(dt: number): void;
  /** null while running, then `done` or `lost`. The engine stops updating the node once this is non-null. */
  outcome(): NodeOutcome | null;
  /**
   * Draw the node's own visuals over the game's starfield. A node that runs combat (boss) draws nothing:
   * the game draws the combat scene itself. Canvas is 540x960 logical pixels.
   */
  draw(g: CanvasRenderingContext2D): void;
  /** Optional cleanup, called once after the node finishes or the run is abandoned. */
  end?(): void;
}
