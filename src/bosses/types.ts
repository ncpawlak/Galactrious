import type { BossSpec } from '../boss';
import type { AttackStep } from '../attackSchedulers';
import type { Movement } from '../movement';

/**
 * When a phase begins. Evaluated while the PREVIOUS phase is running, so phases advance in list
 * order; the first phase needs no trigger. Three kinds:
 *  - damage: boss damage percent has reached `percent` (0..100). `metric` picks what is measured:
 *      'pixels' (default): share of ALL layer pixels carved away or broken off (hull+frame+rooms).
 *      'core': share of core HP lost (note: the core is armoured until the layers are dug).
 *  - fightTime: `seconds` since the fight started.
 *  - phaseTime: `seconds` spent in the previous phase.
 */
export type PhaseTrigger =
  | { kind: 'damage'; percent: number; metric?: 'pixels' | 'core' }
  | { kind: 'fightTime'; seconds: number }
  | { kind: 'phaseTime'; seconds: number };

export interface PhaseDefinition {
  name: string;
  /** Required for every phase except the first. */
  trigger?: PhaseTrigger;
  movement: Movement;
  /** Attack set, run in order and looped by a ScriptedScheduler. */
  attacks: AttackStep[];
  /** Seconds before the first attack after the phase starts (default 1). */
  attackDelay?: number;
}

/**
 * A boss (or mini-boss: same shape) as data. To add one: create `src/bosses/<name>.ts` exporting a
 * BossDefinition built from a layout, a spawn point and a list of phases, and list it in
 * `src/bosses/index.ts`. See DESIGN.md "Boss definition framework".
 */
export interface BossDefinition {
  id: string;
  name: string;
  /** Builds the layered masks and core (called on every restart, since carving mutates them). */
  layout: () => BossSpec;
  /** Anchor: screen x of the boss centre and y of its top edge. Movements offset from here. */
  spawn: { x: number; y: number };
  /** Flip the layout horizontally once at load (layers, rooms, core, anchors). Not live. */
  mirror?: boolean;
  /** At least one phase. */
  phases: PhaseDefinition[];
}
