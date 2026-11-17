import type { CardDef } from './model';

/**
 * Cards awarded by Conquest challenges (src/conquest/empireBase.ts). The first three Conquest rewards are the older gated cards in
 * demoCards.ts (reworded for Conquest); these two cover the two challenges that had no card left. They use existing stat keys only.
 */
export const CONQUEST_CARDS: CardDef[] = [
  {
    id: 'cq-salvaged-reactor',
    name: 'Salvaged Reactor',
    group: 'Ship',
    desc: 'Dodge recharges 25% faster (taken from a base reactor).',
    maxStacks: 1,
    weight: 0.7,
    rarity: 'rare',
    unlock: 'cq-salvaged-reactor',
    unlockHint: 'Conquest, Empire Base: clear the run.',
    modifiers: [{ stat: 'dodge.cooldown', op: 'mul', value: 0.75 }],
  },
  {
    id: 'cq-gunsmith-coil',
    name: "Gunsmith's Coil",
    group: 'Gauss',
    weapon: 'gauss',
    desc: 'Gauss recharges 20% faster (a coil from a capital ship gun).',
    maxStacks: 1,
    weight: 0.7,
    unlock: 'cq-gunsmith-coil',
    unlockHint: 'Conquest, Empire Base: destroy every gun of the capital ship.',
    modifiers: [{ stat: 'gauss.cooldown', op: 'mul', value: 0.8 }],
  },
  {
    id: 'cq-ace-plating',
    name: "Ace's Plating",
    group: 'Ship',
    desc: '+1 max hull (plating cut from a mini-boss).',
    maxStacks: 1,
    weight: 0.7,
    rarity: 'rare',
    unlock: 'cq-ace-plating',
    unlockHint: 'Conquest, Empire Base: defeat all three mini-bosses in one run.',
    modifiers: [{ stat: 'ship.maxHealth', op: 'add', value: 1 }],
  },
];
