import type { CardDef } from './model';

/**
 * DEMO locked cards: they prove the unlock gating end to end and ship nothing real. They stay out of the reward pool
 * until `game.debug.unlock('cards', '<unlock id>')` (or the Unlocks screen flow, later campaign medals) sets the flag.
 * To remove them: delete this file and its two lines in cards.ts.
 */
export const DEMO_LOCKED_CARDS: CardDef[] = [
  {
    id: 'demo-chain-overclock',
    name: 'Overclocked Chain',
    group: 'Chain gun',
    weapon: 'chain',
    desc: 'DEMO: chain gun fires 30% faster.',
    maxStacks: 2,
    unlock: 'demo-chain-overclock',
    unlockHint: 'demo: game.debug.unlock("cards", "demo-chain-overclock")',
    modifiers: [{ stat: 'chain.fireRate', op: 'mul', value: 1.3 }],
  },
  {
    id: 'demo-ablative-plating',
    name: 'Ablative Plating',
    group: 'Ship',
    desc: 'DEMO: +2 max hull, repaired right away.',
    maxStacks: 1,
    weight: 0.6,
    rarity: 'rare',
    unlock: 'demo-ablative-plating',
    unlockHint: 'demo: game.debug.unlock("cards", "demo-ablative-plating")',
    modifiers: [{ stat: 'ship.maxHealth', op: 'add', value: 2 }],
  },
  {
    id: 'demo-gauss-supercharge',
    name: 'Supercharged Gauss',
    group: 'Gauss',
    weapon: 'gauss',
    desc: 'DEMO: Gauss shots carry 50% more energy.',
    maxStacks: 1,
    unlock: 'demo-gauss-supercharge',
    unlockHint: 'demo: game.debug.unlock("cards", "demo-gauss-supercharge")',
    modifiers: [{ stat: 'gauss.energy', op: 'mul', value: 1.5 }],
  },
];
