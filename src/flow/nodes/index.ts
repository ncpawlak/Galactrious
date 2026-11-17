import type { FlowNode, NodeDefinition } from '../node';
import { BossNode } from './boss';
import { RewardNode } from './reward';
import { ScrollNode } from './scroll';
import { WaveNode } from './wave';

/** The one place node types are wired up. Reserved types (`level`, `interlude`) are not built. */
export function createNode(def: NodeDefinition): FlowNode {
  switch (def.type) {
    case 'boss':
      return new BossNode(def);
    case 'wave':
      return new WaveNode(def);
    case 'scroll':
      return new ScrollNode(def);
    case 'reward':
      return new RewardNode(def);
    case 'level':
    case 'interlude':
      throw new Error(`node type "${def.type}" is reserved and not built yet`);
  }
}
