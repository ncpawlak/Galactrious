import { waveById } from '../enemies/waveContent';
import type { LevelDefinition, NodeDefinition, RunDefinition } from './node';

/**
 * One v1 level: three waves, then the boss. The owner wants an upgrade pick between every wave, so a `reward` node
 * follows each wave, and `reward` (appended by `Run` after the boss, except on the last level) follows the boss.
 * Health: the run heals fully when a new level starts and at no other time, so reward nodes do not heal.
 */
function level(waveIds: [string, string, string], bossId: string): LevelDefinition {
  const nodes: NodeDefinition[] = [];
  for (const id of waveIds) nodes.push({ type: 'wave', wave: waveById(id) }, { type: 'reward', choices: 3 });
  nodes.push({ type: 'boss', bossId });
  return { nodes, reward: { choices: 3 } };
}

/**
 * The v1 run (DESIGN.md "Run flow"): three levels of wave, reward, wave, reward, wave, reward, boss, then a reward
 * (not after the last boss). Boss order: bulwark-components, bulwark-rooms, mantis. Waves: src/enemies/waveContent.ts.
 */
export const DEFAULT_RUN: RunDefinition = {
  name: 'v1 run',
  levels: [
    level(['l1w1', 'l1w2', 'l1w3'], 'bulwark-components'),
    level(['l2w1', 'l2w2', 'l2w3'], 'bulwark-rooms'),
    level(['l3w1', 'l3w2', 'l3w3'], 'mantis'),
  ],
};
