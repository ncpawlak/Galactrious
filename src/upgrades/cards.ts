import type { CardDef } from './model';

/**
 * The card pool: DATA ONLY. Every number here is a first guess meant to be tuned in this one file.
 * A card is a list of `modifiers` on stat keys (see `STATS` in stats.ts); stacking just applies the card N times,
 * up to `maxStacks`. `weight` is the draw weight (default 1; rarer cards use less).
 *
 * To add a card: add an entry below. If it needs a stat that does not exist yet, add the key to `STATS` and
 * read it where the thing is built (`Loadout.get('your.key', base)`). Nothing else changes.
 */
export const CARDS: CardDef[] = [
  // --- chain gun (the base gun) ---
  { id: 'chain-rate', name: 'Rapid Fire', group: 'Chain gun', desc: 'Chain gun fires 20% faster.', maxStacks: 4, modifiers: [{ stat: 'chain.fireRate', op: 'mul', value: 1.2 }] },
  { id: 'chain-damage', name: 'Heavy Rounds', group: 'Chain gun', desc: 'Chain gun bullets hit 25% harder.', maxStacks: 4, modifiers: [{ stat: 'chain.damage', op: 'mul', value: 1.25 }] },
  { id: 'chain-barrel', name: 'Extra Barrel', group: 'Chain gun', desc: 'One more bullet per chain gun shot, in a spread.', maxStacks: 2, weight: 0.8, modifiers: [{ stat: 'chain.barrels', op: 'add', value: 1 }] },
  {
    id: 'chain-burn',
    name: 'Burn',
    group: 'Chain gun',
    desc: 'On hit, +1 burn: chain gun shots set the target ablaze, burning a small area for a short time.',
    maxStacks: 3,
    weight: 0.7,
    rarity: 'rare',
    modifiers: [{ stat: 'chain.tag.burn', op: 'add', value: 1 }],
  },
  // --- gauss ---
  { id: 'gauss-reach', name: 'Deep Bore', group: 'Gauss', desc: 'Gauss shots carry 30% more energy, drilling much deeper.', maxStacks: 3, modifiers: [{ stat: 'gauss.energy', op: 'mul', value: 1.3 }] },
  { id: 'gauss-width', name: 'Wide Shaft', group: 'Gauss', desc: 'Gauss shots drill a wider shaft.', maxStacks: 3, modifiers: [{ stat: 'gauss.width', op: 'add', value: 1 }] },
  { id: 'gauss-cooldown', name: 'Gauss Capacitor', group: 'Gauss', desc: 'Gauss recharges 15% faster.', maxStacks: 4, modifiers: [{ stat: 'gauss.cooldown', op: 'mul', value: 0.85 }] },
  // --- rocket ---
  { id: 'rocket-radius', name: 'Wide Warhead', group: 'Rocket', desc: 'Rocket blasts are 18 px wider.', maxStacks: 3, modifiers: [{ stat: 'rocket.radius', op: 'add', value: 18 }] },
  { id: 'rocket-energy', name: 'Shaped Charge', group: 'Rocket', desc: 'Rocket blasts carry 30% more carving energy.', maxStacks: 3, modifiers: [{ stat: 'rocket.energy', op: 'mul', value: 1.3 }] },
  { id: 'rocket-cooldown', name: 'Rocket Autoloader', group: 'Rocket', desc: 'Rocket reloads 15% faster.', maxStacks: 4, modifiers: [{ stat: 'rocket.cooldown', op: 'mul', value: 0.85 }] },
  // --- arc ---
  { id: 'arc-count', name: 'Arc Swarm', group: 'Arc', desc: 'Arc launches one more homing missile.', maxStacks: 3, weight: 0.8, modifiers: [{ stat: 'arc.count', op: 'add', value: 1 }] },
  { id: 'arc-cooldown', name: 'Arc Relay', group: 'Arc', desc: 'Arc recharges 15% faster.', maxStacks: 4, modifiers: [{ stat: 'arc.cooldown', op: 'mul', value: 0.85 }] },
  // --- ship ---
  { id: 'hull-plating', name: 'Hull Plating', group: 'Ship', desc: '+1 max hull, repaired right away.', maxStacks: 3, modifiers: [{ stat: 'ship.maxHealth', op: 'add', value: 1 }] },
  { id: 'dodge-cooldown', name: 'Quick Thrusters', group: 'Ship', desc: 'Dodge recharges 20% faster.', maxStacks: 3, modifiers: [{ stat: 'dodge.cooldown', op: 'mul', value: 0.8 }] },
  { id: 'ship-speed', name: 'Engines', group: 'Ship', desc: 'Ship moves 12% faster.', maxStacks: 3, weight: 0.8, modifiers: [{ stat: 'ship.speed', op: 'mul', value: 1.12 }] },
  { id: 'ship-hitbox', name: 'Compact Hull', group: 'Ship', desc: 'Smaller hitbox: bullets must be closer to hurt you.', maxStacks: 2, weight: 0.6, rarity: 'rare', modifiers: [{ stat: 'ship.hitbox', op: 'mul', value: 0.8 }] },
];

export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));
