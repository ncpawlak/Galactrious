import type { CardDef } from './model';

/**
 * The first gated cards (written to prove the unlock gating, hence the file name). They are now real Conquest rewards (Empire Base challenges, see
 * src/conquest/empireBase.ts): out of the reward pool until the flag is set by the challenge (or `game.debug.unlock('cards', '<unlock id>')`).
 */
export const DEMO_LOCKED_CARDS: CardDef[] = [
  {
    id: 'demo-chain-overclock',
    name: 'Overclocked Chain',
    group: 'Chain gun',
    weapon: 'chain',
    desc: 'Chain gun fires 30% faster.',
    maxStacks: 2,
    unlock: 'demo-chain-overclock',
    unlockHint: 'Conquest, Empire Base: defeat 150 enemies in one run.',
    modifiers: [{ stat: 'chain.fireRate', op: 'mul', value: 1.3 }],
  },
  {
    id: 'demo-ablative-plating',
    name: 'Ablative Plating',
    group: 'Ship',
    desc: '+2 max hull, repaired right away.',
    maxStacks: 1,
    weight: 0.6,
    rarity: 'rare',
    unlock: 'demo-ablative-plating',
    unlockHint: 'Conquest, Empire Base: survive 10 minutes in one run.',
    modifiers: [{ stat: 'ship.maxHealth', op: 'add', value: 2 }],
  },
  {
    id: 'demo-gauss-supercharge',
    name: 'Supercharged Gauss',
    group: 'Gauss',
    weapon: 'gauss',
    desc: 'Gauss shots carry 50% more energy.',
    maxStacks: 1,
    unlock: 'demo-gauss-supercharge',
    unlockHint: 'Conquest, Empire Base: find 3 hidden items in one run.',
    modifiers: [{ stat: 'gauss.energy', op: 'mul', value: 1.5 }],
  },
];
