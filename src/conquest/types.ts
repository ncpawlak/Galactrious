import type { RunDefinition } from '../flow/node';
import type { UnlockSpec } from '../finale/unlocks';

/**
 * Conquest data formats (DESIGN.md "Conquest"). A region is a data pack: everything about one Conquest run lives in a
 * `RegionDefinition`; the flow engine, challenge tracker, screens and save are generic.
 */

/** What a challenge measures. All are measured by the run and saved the moment they are met (a later death cannot take them back). */
export type ChallengeMetric =
  /** Enemies defeated in one run (units and ground turrets; hidden items and flybys that leave do not count). */
  | { kind: 'kills'; n: number }
  /** Seconds survived in one run (the run clock: it runs while a node is active, including the card screens). */
  | { kind: 'time'; seconds: number }
  /** Hidden items found in one run. */
  | { kind: 'hidden'; n: number }
  /** Reach the end of the run. */
  | { kind: 'clear' }
  /** Boss feat: defeat a boss without losing a hull point. `boss` = a boss id; omitted = any boss of the run. */
  | { kind: 'bossNoDamage'; boss?: string }
  /** Boss feat: destroy every gun housing (turret) of the boss `boss` in the fight in which it is defeated. */
  | { kind: 'bossTurrets'; boss: string }
  /** Boss feat: take a room of the boss `boss` offline within `seconds` of the fight starting. */
  | { kind: 'bossRoom'; boss: string; seconds: number };

export interface ChallengeDef {
  id: string;
  name: string;
  /** One line shown in the list. */
  desc: string;
  metric: ChallengeMetric;
  /** Awarded (written to the save) when the challenge is first completed; shown on the result screen and the Unlocks screen. */
  rewards: UnlockSpec[];
}

/** What finding a hidden item gives the run. */
export type HiddenReward = { heal: number } | { card: true };

/** A hidden item placement: which scroll section carries it and where. The section builder turns it into a `hidden` timeline entry. */
export interface HiddenPlacement {
  id: string;
  /** Id of the scroll level (a `scroll` node, or a wave/boss node's scroll) the item lives in. */
  level: string;
  /** Scroll distance in px at which it enters at the top. */
  at: number;
  x: number;
  variant: 'crate' | 'cache';
  width?: number;
  reward: HiddenReward;
  /** Shown when it is found ("Sealed wall opened"). */
  label: string;
}

export interface RegionDefinition {
  id: string;
  name: string;
  /** One or two lines on the region screen. */
  blurb: string;
  /** The campaign whose completion unlocks the region (`CampaignDefinition.id`), and the hint shown while locked. */
  campaign: string;
  unlockHint: string;
  /** Look: scroll theme ids used and the accent colour of the region's screens. */
  theme: { scroll: string[]; accent: string };
  /** What fights you here, for the region screen: unit ids, flyby presets and boss ids (the run is the node list; these describe it). */
  roster: { units: string[]; flybys: string[]; bosses: string[]; hazards: string[] };
  /** The ordered run: levels of nodes, heal at each level start, a reward after each level but the last, scaling along the way. */
  run: RunDefinition;
  challenges: ChallengeDef[];
  hidden: HiddenPlacement[];
}
