/**
 * Campaign data format (DESIGN.md "As built: campaign framework"). Everything here is plain data: a campaign is a list
 * of levels, a level is a preset ship + a sequence of objectives + medal rules. The runtime is `session.ts`.
 */
import type { Medal, UnlockKind } from '../save';
import type { ScrollLevelDef } from '../scroll/types';

export type { Medal };

/** A rectangle (x, y = top-left) or circle (x, y = centre) in 540x960 screen px. */
export type Zone = { x: number; y: number; w: number; h: number } | { x: number; y: number; r: number };

/** Something to put into the level: one unit (or a row of them) or a whole wave from `WAVE_LIST`. `tag` lets objectives and bonus rules address them. */
export type SpawnSpec =
  | { unit: string; x: number; y: number; tag?: string; delay?: number; count?: number; spacing?: number }
  | { wave: string; tag?: string };

/** One scripted step. `at` = seconds since the objective (attempt) started; `atDistance` = scroll distance in px (needs a `ScrollHooks` implementation, see hooks.ts). */
export type Beat = ({ at: number } | { atDistance: number }) & BeatAction;

export type BeatAction =
  /** Show a line of text (briefing or dialogue) as a subtitle; does not pause play. */
  | { do: 'text'; text: string; speaker?: string; seconds?: number }
  /** The ship is blown up by the script. NOT counted as a death and does not restart the objective. */
  | { do: 'forceDestroyPlayer' }
  | { do: 'lockWeapons'; locked?: boolean }
  /** Swap the ship (and its weapons) mid-level, e.g. the escape pod or the commandeered fighter. */
  | { do: 'setShip'; ship: string; loadout?: { main: string; aux: string[] } }
  | { do: 'spawn'; spawn: SpawnSpec }
  /** Scroll hook (src/campaign/hooks.ts); a no-op until the scrolling session installs one. */
  | { do: 'setScrollSpeed'; speed: number; ease?: number }
  /** Jump to the objective with this id (the current one counts as completed). */
  | { do: 'startObjective'; objective: string }
  | { do: 'completeObjective' };

interface ObjectiveBase {
  id: string;
  /** Short name for the HUD (default: derived from the type). */
  title?: string;
  /** Units to place when the objective starts (re-placed on every checkpoint restart). */
  spawns?: SpawnSpec[];
  /** Scripted beats (restart with the objective). */
  beats?: Beat[];
  /** Weapons locked from the start of the objective (chapter 3). */
  weaponsLocked?: boolean;
  /**
   * Run the objective over a scrolling level (id in `SCROLL_LEVELS` or an inline definition): background, obstacles, allies,
   * flybys and the distance timeline. Restarts with the objective. A closed screen with allies is a slow scroll that never ends.
   */
  scroll?: string | ScrollLevelDef;
}

/** What a `destroy` objective waits for: every unit with this tag or def id, or one component / room of the running boss by id. */
export type DestroyTarget = { tag: string } | { unit: string } | { component: string } | { room: string };

export interface DestroyObjective extends ObjectiveBase {
  type: 'destroy';
  /** All of them must be gone (units still queued to spawn count). */
  targets: DestroyTarget[];
}

export interface ReachObjective extends ObjectiveBase {
  type: 'reach';
  zone: Zone;
  /** Stay in the zone this many seconds (a hold objective, e.g. the hangar circle). Default 0 = touch it. */
  hold?: number;
}

export interface SurviveObjective extends ObjectiveBase {
  type: 'survive';
  seconds: number;
}

export interface EscapeObjective extends ObjectiveBase {
  type: 'escape';
  exit: Zone;
  /** Scrolling levels: the exit is only open (drawn, reachable) once the scroll distance reaches this many px. Omitted = open from the start. */
  exitAtDistance?: number;
  /** Reach the exit within this many seconds or the attempt fails (restarts the objective, counts as a death). */
  timer?: number;
  /** A wall of fire that sweeps up (y shrinks) from `fromY` to `toY` over `seconds`; the ship below it fails the attempt. */
  closing?: { fromY: number; toY: number; seconds: number };
}

export interface BossFightObjective extends ObjectiveBase {
  type: 'bossFight';
  bossId: string;
  /** Done when the boss falls (default) or when this component / room is destroyed (the capital ship's engine room). */
  until?: { component: string } | { room: string };
  /** Capture the boss into this campaign snapshot slot when the objective completes (latest completion replaces). */
  snapshotSlot?: string;
  /** Restore this slot's snapshot onto the boss when the fight starts (the finale). Ignored when the slot is empty. */
  restoreSlot?: string;
}

/** Fly the scrolling level to its end (`scroll` on the objective is required): done when the distance reaches the level's length. Chapter 3. */
export interface ScrollObjective extends ObjectiveBase {
  type: 'scroll';
}

export type ObjectiveDefinition = ScrollObjective | DestroyObjective | ReachObjective | SurviveObjective | EscapeObjective | BossFightObjective;
export type ObjectiveType = ObjectiveDefinition['type'];

/** Per-attempt counters the bonus criteria read (see session.ts). */
export interface LevelCounters {
  kills: number;
  hits: number;
  damage: number;
  roomsDestroyed: number;
  collected: number;
  detections: number;
  killsByTag: Record<string, number>;
}

/** Bonus gold objective as data. `text` is the line shown in level select and the briefing. */
export type BonusCriteria = { text: string } & (
  | { kind: 'killCount'; count: number }
  | { kind: 'hitless' }
  | { kind: 'noDamage' }
  | { kind: 'collectAll'; count: number }
  | { kind: 'destroyAll'; tag: string; count: number }
  | { kind: 'roomsDestroyed'; count: number }
  | { kind: 'noDetection' }
);

export interface MedalRules {
  /** Seconds. Bronze is awarded for completing; its time only drives the pace colour. */
  bronze: number;
  silver: number;
  gold: number;
  /** Gold = zero deaths AND (time <= gold OR this bonus). */
  bonus: BonusCriteria;
}

export interface CampaignLevel {
  id: string;
  name: string;
  /** Shown on the briefing screen. */
  briefing: string[];
  /** The preset ship and weapons (no builder, no cards). */
  ship: { id: string; loadout?: { main: string; aux: string[] } };
  objectives: ObjectiveDefinition[];
  medals: MedalRules;
  /** Level-wide beats (`at` = level seconds, fired once, not repeated after a death). */
  beats?: Beat[];
}

export interface UnlockAward {
  kind: UnlockKind;
  id: string;
  /** Printed on the result screen. */
  label: string;
}

export interface CampaignDefinition {
  id: string;
  name: string;
  /** Story intro overlay shown when the campaign opens (paragraphs). */
  intro: string[];
  levels: CampaignLevel[];
  /** Awarded when the last level is completed (slice 1: a test flag). */
  completionUnlock?: UnlockAward;
}


export interface LevelResult {
  campaignId: string;
  levelId: string;
  timeMs: number;
  deaths: number;
  medal: Medal;
  bonusDone: boolean;
  /** How gold was reached, when it was. */
  goldRoute?: 'time' | 'bonus';
  newBestTime: boolean;
  newBestMedal: boolean;
  /** Labels of unlocks newly awarded by this result. */
  unlocked: string[];
  counters: LevelCounters;
}
