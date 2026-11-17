import { DEMO_LOCKED_CARDS } from './demoCards';
import type { CardDef } from './model';

/**
 * The card pool: DATA ONLY. Every number here is a first guess meant to be tuned in this one file.
 * A card is a list of `modifiers` on stat keys (see `STATS` in stats.ts); stacking just applies the card N times,
 * up to `maxStacks`. `weight` is the draw weight (default 1; rarer cards use less).
 *
 * A card with `unlock: 'flag'` is only drawn once that flag is unlocked in the save (src/save.ts); without it, always available.
 *
 * To add a card: add an entry below. If it needs a stat that does not exist yet, add the key to `STATS` and
 * read it where the thing is built (`Loadout.get('your.key', base)`). Nothing else changes.
 */
export const CARDS: CardDef[] = [
  // --- chain gun (the base gun) ---
  { id: 'chain-rate', name: 'Rapid Fire', group: 'Chain gun', weapon: 'chain', desc: 'Chain gun fires 20% faster.', maxStacks: 4, modifiers: [{ stat: 'chain.fireRate', op: 'mul', value: 1.2 }] },
  { id: 'chain-damage', name: 'Heavy Rounds', group: 'Chain gun', weapon: 'chain', desc: 'Chain gun bullets hit 25% harder.', maxStacks: 4, modifiers: [{ stat: 'chain.damage', op: 'mul', value: 1.25 }] },
  { id: 'chain-barrel', name: 'Extra Barrel', group: 'Chain gun', weapon: 'chain', desc: 'One more bullet per chain gun shot, in a spread.', maxStacks: 2, weight: 0.8, modifiers: [{ stat: 'chain.barrels', op: 'add', value: 1 }] },
  {
    id: 'chain-burn',
    name: 'Burn',
    group: 'Chain gun',
    weapon: 'chain',
    desc: 'On hit, +1 burn: chain gun shots set the target ablaze, burning a small area for a short time.',
    maxStacks: 3,
    weight: 0.7,
    rarity: 'rare',
    modifiers: [{ stat: 'chain.tag.burn', op: 'add', value: 1 }],
  },
  // --- gauss ---
  { id: 'gauss-reach', name: 'Deep Bore', group: 'Gauss', weapon: 'gauss', desc: 'Gauss shots carry 30% more energy, drilling much deeper.', maxStacks: 3, modifiers: [{ stat: 'gauss.energy', op: 'mul', value: 1.3 }] },
  { id: 'gauss-width', name: 'Wide Shaft', group: 'Gauss', weapon: 'gauss', desc: 'Gauss shots drill a wider shaft.', maxStacks: 3, modifiers: [{ stat: 'gauss.width', op: 'add', value: 1 }] },
  { id: 'gauss-cooldown', name: 'Gauss Capacitor', group: 'Gauss', weapon: 'gauss', desc: 'Gauss recharges 15% faster.', maxStacks: 4, modifiers: [{ stat: 'gauss.cooldown', op: 'mul', value: 0.85 }] },
  // --- rocket ---
  { id: 'rocket-radius', name: 'Wide Warhead', group: 'Rocket', weapon: 'rocket', desc: 'Rocket blasts are 18 px wider.', maxStacks: 3, modifiers: [{ stat: 'rocket.radius', op: 'add', value: 18 }] },
  { id: 'rocket-energy', name: 'Shaped Charge', group: 'Rocket', weapon: 'rocket', desc: 'Rocket blasts carry 30% more carving energy.', maxStacks: 3, modifiers: [{ stat: 'rocket.energy', op: 'mul', value: 1.3 }] },
  { id: 'rocket-cooldown', name: 'Rocket Autoloader', group: 'Rocket', weapon: 'rocket', desc: 'Rocket reloads 15% faster.', maxStacks: 4, modifiers: [{ stat: 'rocket.cooldown', op: 'mul', value: 0.85 }] },
  // --- arc ---
  { id: 'arc-count', name: 'Arc Swarm', group: 'Arc', weapon: 'arc', desc: 'Arc launches one more homing missile.', maxStacks: 3, weight: 0.8, modifiers: [{ stat: 'arc.count', op: 'add', value: 1 }] },
  { id: 'arc-cooldown', name: 'Arc Relay', group: 'Arc', weapon: 'arc', desc: 'Arc recharges 15% faster.', maxStacks: 4, modifiers: [{ stat: 'arc.cooldown', op: 'mul', value: 0.85 }] },
  // --- scatter (main) ---
  { id: 'scatter-pellets', name: 'Extra Pellets', group: 'Scatter', weapon: 'scatter', desc: 'Scatter fires 2 more pellets per shot.', maxStacks: 3, modifiers: [{ stat: 'scatter.barrels', op: 'add', value: 2 }] },
  { id: 'scatter-rate', name: 'Pump Action', group: 'Scatter', weapon: 'scatter', desc: 'Scatter fires 20% faster.', maxStacks: 4, modifiers: [{ stat: 'scatter.fireRate', op: 'mul', value: 1.2 }] },
  { id: 'scatter-damage', name: 'Heavy Shot', group: 'Scatter', weapon: 'scatter', desc: 'Scatter pellets hit 25% harder.', maxStacks: 4, modifiers: [{ stat: 'scatter.damage', op: 'mul', value: 1.25 }] },
  // --- needler (main) ---
  { id: 'needle-rate', name: 'Rapid Needles', group: 'Needler', weapon: 'needle', desc: 'Needler fires 20% faster.', maxStacks: 4, modifiers: [{ stat: 'needle.fireRate', op: 'mul', value: 1.2 }] },
  { id: 'needle-damage', name: 'Hardened Tips', group: 'Needler', weapon: 'needle', desc: 'Needler rounds hit 25% harder.', maxStacks: 4, modifiers: [{ stat: 'needle.damage', op: 'mul', value: 1.25 }] },
  // --- lance ---
  { id: 'lance-energy', name: 'Focused Beam', group: 'Lance', weapon: 'lance', desc: 'Lance beam carries 30% more energy per tick.', maxStacks: 3, modifiers: [{ stat: 'lance.energy', op: 'mul', value: 1.3 }] },
  { id: 'lance-cooldown', name: 'Lance Capacitor', group: 'Lance', weapon: 'lance', desc: 'Lance recharges 15% faster.', maxStacks: 4, modifiers: [{ stat: 'lance.cooldown', op: 'mul', value: 0.85 }] },
  // --- blades ---
  { id: 'blades-count', name: 'More Blades', group: 'Blades', weapon: 'blades', desc: 'One more orbiting blade.', maxStacks: 3, weight: 0.8, modifiers: [{ stat: 'blades.count', op: 'add', value: 1 }] },
  { id: 'blades-cooldown', name: 'Blade Dock', group: 'Blades', weapon: 'blades', desc: 'Blades recharge 15% faster.', maxStacks: 4, modifiers: [{ stat: 'blades.cooldown', op: 'mul', value: 0.85 }] },
  // --- swarm ---
  { id: 'swarm-count', name: 'Bigger Swarm', group: 'Swarm', weapon: 'swarm', desc: 'Swarm launches 2 more missiles.', maxStacks: 3, modifiers: [{ stat: 'swarm.count', op: 'add', value: 2 }] },
  { id: 'swarm-cooldown', name: 'Swarm Hive', group: 'Swarm', weapon: 'swarm', desc: 'Swarm recharges 15% faster.', maxStacks: 4, modifiers: [{ stat: 'swarm.cooldown', op: 'mul', value: 0.85 }] },
  // --- laser (main, campaign unlock) ---
  { id: 'laser-damage', name: 'Overcharge', group: 'Laser', weapon: 'laser', desc: 'Laser bolts hit 25% harder.', maxStacks: 4, modifiers: [{ stat: 'laser.damage', op: 'mul', value: 1.25 }] },
  { id: 'laser-rate', name: 'Laser Capacitor', group: 'Laser', weapon: 'laser', desc: 'Laser fires 18% faster.', maxStacks: 4, modifiers: [{ stat: 'laser.fireRate', op: 'mul', value: 1.18 }] },
  { id: 'laser-pierce', name: 'Piercing Beam', group: 'Laser', weapon: 'laser', desc: 'Laser keeps 8% more energy through each layer, tunnelling deeper.', maxStacks: 3, modifiers: [{ stat: 'laser.pierce', op: 'add', value: 0.08 }] },
  { id: 'laser-width', name: 'Wide Lens', group: 'Laser', weapon: 'laser', desc: 'Laser bores a wider tunnel.', maxStacks: 3, modifiers: [{ stat: 'laser.width', op: 'add', value: 1 }] },
  // --- energy wave (aux, campaign unlock) ---
  { id: 'wave-arc', name: 'Wider Crescent', group: 'Energy Wave', weapon: 'wave', desc: 'Energy Wave sweeps an arc 20 degrees wider.', maxStacks: 3, modifiers: [{ stat: 'wave.arc', op: 'add', value: 20 }] },
  { id: 'wave-reach', name: 'Long Crescent', group: 'Energy Wave', weapon: 'wave', desc: 'Energy Wave reaches 25 px farther.', maxStacks: 3, modifiers: [{ stat: 'wave.reach', op: 'add', value: 25 }] },
  { id: 'wave-cooldown', name: 'Wave Capacitor', group: 'Energy Wave', weapon: 'wave', desc: 'Energy Wave recharges 15% faster.', maxStacks: 4, modifiers: [{ stat: 'wave.cooldown', op: 'mul', value: 0.85 }] },
  { id: 'wave-edge', name: 'Sustained Field', group: 'Energy Wave', weapon: 'wave', desc: 'Energy Wave loses less power with distance (edge power +10 points).', maxStacks: 3, modifiers: [{ stat: 'wave.edge', op: 'add', value: 0.1 }] },
  // --- ship ---
  { id: 'hull-plating', name: 'Hull Plating', group: 'Ship', desc: '+1 max hull, repaired right away.', maxStacks: 3, modifiers: [{ stat: 'ship.maxHealth', op: 'add', value: 1 }] },
  { id: 'dodge-cooldown', name: 'Quick Thrusters', group: 'Ship', desc: 'Dodge recharges 20% faster.', maxStacks: 3, modifiers: [{ stat: 'dodge.cooldown', op: 'mul', value: 0.8 }] },
  { id: 'ship-speed', name: 'Engines', group: 'Ship', desc: 'Ship moves 12% faster.', maxStacks: 3, weight: 0.8, modifiers: [{ stat: 'ship.speed', op: 'mul', value: 1.12 }] },
  { id: 'ship-hitbox', name: 'Compact Hull', group: 'Ship', desc: 'Smaller hitbox: bullets must be closer to hurt you.', maxStacks: 2, weight: 0.6, rarity: 'rare', modifiers: [{ stat: 'ship.hitbox', op: 'mul', value: 0.8 }] },
  ...DEMO_LOCKED_CARDS, // DEMO locked cards (gating proof); remove with demoCards.ts
];

export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));
