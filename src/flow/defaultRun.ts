import type { LevelDefinition, RunDefinition } from './node';

/** One v1 level: three waves, the boss, then a reward pick. */
function level(bossId: string): LevelDefinition {
  return { nodes: [{ type: 'wave' }, { type: 'wave' }, { type: 'wave' }, { type: 'boss', bossId }], reward: { choices: 3 } };
}

/**
 * The v1 run (DESIGN.md "Run flow"): three levels of `wave, wave, wave, boss`, a reward after levels 1 and 2.
 * Boss order is a pacing guess: simplest first (components), then rooms, then Mantis. Retune when the waves exist.
 */
export const DEFAULT_RUN: RunDefinition = {
  name: 'v1 run',
  levels: [level('bulwark-components'), level('bulwark-rooms'), level('mantis')],
};
