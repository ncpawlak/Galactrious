import { CONQUEST_CARDS } from './conquestCards';
import { DEMO_LOCKED_CARDS } from './demoCards';
import type { CardDef } from './model';

/**
 * The card pool: DATA ONLY. Every number here is a first guess meant to be tuned in this one file.
 * A card is a list of `modifiers` on stat keys (see `STATS` in stats.ts); stacking just applies the card N times,
 * up to `maxStacks`. `weight` is the draw weight (default 1; rarer cards use less).
 *
 * Layers (DESIGN.md "Content pass", section 3): main-slot cards (`main.*` stats, any main gun), aux cards (`aux.*`, all aux weapons, or `aux1.*`..`aux3.*`
 * for one slot), weapon-specific cards (`<weapon>.*`, only where the weapon has a mechanic of its own), ship cards, burn synergies and trade-offs.
 * A slot card is offered only while its slot is filled; a weapon card only while that weapon is equipped (`canOffer` in stats.ts).
 *
 * A card with `unlock: 'flag'` is only drawn once that flag is unlocked in the save (src/save.ts); without it, always available.
 *
 * To add a card: add an entry below. If it needs a stat that does not exist yet, add the key to `STATS` and
 * read it where the thing is built (`Loadout.get('your.key', base)`). Nothing else changes.
 */

const AUX_SLOTS: (1 | 2 | 3)[] = [1, 2, 3];

/** Per-slot aux cards ("Aux 2 Overclock"): the same effects as the all-aux cards, aimed at one slot. Rarer each, so the three slots together offer about as much as the generic card. */
function slotCards(): CardDef[] {
  return AUX_SLOTS.flatMap((n): CardDef[] => [
    { id: `aux${n}-cooldown`, name: `Aux ${n} Overclock`, group: `Aux ${n}`, slot: n, desc: `Only the weapon in aux slot ${n} recharges 22% faster.`, maxStacks: 3, weight: 0.5, modifiers: [{ stat: `aux${n}.cooldown`, op: 'mul', value: 0.78 }] },
    { id: `aux${n}-damage`, name: `Aux ${n} Overcharge`, group: `Aux ${n}`, slot: n, desc: `Only the weapon in aux slot ${n} hits 35% harder.`, maxStacks: 3, weight: 0.5, modifiers: [{ stat: `aux${n}.damage`, op: 'mul', value: 1.35 }] },
    { id: `aux${n}-count`, name: `Aux ${n} Extra Volley`, group: `Aux ${n}`, slot: n, needs: 'count', desc: `The weapon in aux slot ${n} gets one more shot, blade, mine or drone.`, maxStacks: 2, weight: 0.3, modifiers: [{ stat: `aux${n}.count`, op: 'add', value: 1 }] },
    { id: `aux${n}-radius`, name: `Aux ${n} Wide Blast`, group: `Aux ${n}`, slot: n, needs: 'radius', desc: `The weapon in aux slot ${n} gets a 25% bigger blast, orbit or bubble.`, maxStacks: 2, weight: 0.3, modifiers: [{ stat: `aux${n}.radius`, op: 'mul', value: 1.25 }] },
  ]);
}

export const CARDS: CardDef[] = [
  // --- main slot: acts on whatever main gun is equipped ---
  { id: 'main-rate', name: 'Rapid Fire', group: 'Main gun', slot: 'main', desc: 'Your main gun fires 20% faster.', maxStacks: 4, modifiers: [{ stat: 'main.fireRate', op: 'mul', value: 1.2 }] },
  { id: 'main-damage', name: 'Heavy Rounds', group: 'Main gun', slot: 'main', desc: 'Every main gun shot hits 25% harder.', maxStacks: 4, modifiers: [{ stat: 'main.damage', op: 'mul', value: 1.25 }] },
  { id: 'main-barrel', name: 'Extra Barrel', group: 'Main gun', slot: 'main', desc: 'One more shot per volley from your main gun.', maxStacks: 2, weight: 0.8, modifiers: [{ stat: 'main.barrels', op: 'add', value: 1 }] },
  { id: 'main-pierce', name: 'Piercing Rounds', group: 'Main gun', slot: 'main', desc: 'Main shots keep 10% more energy after a hit and carry on into the next layer.', maxStacks: 3, weight: 0.8, modifiers: [{ stat: 'main.pierce', op: 'add', value: 0.1 }] },
  {
    id: 'main-burn',
    name: 'Incendiary Rounds',
    group: 'Burn',
    slot: 'main',
    desc: 'Main gun hits set the target ablaze: +1 burn, a small fire that keeps carving for a moment.',
    maxStacks: 3,
    weight: 0.7,
    rarity: 'rare',
    modifiers: [{ stat: 'main.tag.burn', op: 'add', value: 1 }],
  },
  // --- all aux slots ---
  { id: 'aux-cooldown', name: 'Aux Capacitors', group: 'All aux', slot: 'aux', desc: 'All your aux weapons recharge 10% faster.', maxStacks: 4, modifiers: [{ stat: 'aux.cooldown', op: 'mul', value: 0.9 }] },
  { id: 'aux-damage', name: 'Aux Overcharge', group: 'All aux', slot: 'aux', desc: 'All your aux weapons hit 20% harder.', maxStacks: 3, modifiers: [{ stat: 'aux.damage', op: 'mul', value: 1.2 }] },
  { id: 'aux-count', name: 'Extra Volley', group: 'All aux', slot: 'aux', needs: 'count', desc: 'Aux weapons that fire several things (Arc, Swarm, Blades, Mines, Drone) get one more.', maxStacks: 2, weight: 0.8, modifiers: [{ stat: 'aux.count', op: 'add', value: 1 }] },
  { id: 'aux-radius', name: 'Wide Blasts', group: 'All aux', slot: 'aux', needs: 'radius', desc: 'Blasts, orbits and bubbles of your aux weapons are 15% bigger.', maxStacks: 3, modifiers: [{ stat: 'aux.radius', op: 'mul', value: 1.15 }] },
  {
    id: 'aux-burn',
    name: 'Incendiary Blasts',
    group: 'Burn',
    slot: 'aux',
    desc: 'Aux weapon hits set the target ablaze: +1 burn. A blast that lights the whole crater.',
    maxStacks: 2,
    weight: 0.6,
    rarity: 'rare',
    modifiers: [{ stat: 'aux.tag.burn', op: 'add', value: 1 }],
  },
  ...slotCards(),
  // --- weapon specific: only where a weapon has a mechanic of its own ---
  { id: 'gauss-reach', name: 'Deep Bore', group: 'Gauss', weapon: 'gauss', desc: 'Gauss shots carry 30% more energy, drilling much deeper.', maxStacks: 3, modifiers: [{ stat: 'gauss.energy', op: 'mul', value: 1.3 }] },
  { id: 'gauss-width', name: 'Wide Shaft', group: 'Gauss', weapon: 'gauss', desc: 'Gauss shots drill a wider shaft.', maxStacks: 3, modifiers: [{ stat: 'gauss.width', op: 'add', value: 1 }] },
  { id: 'lance-long', name: 'Long Beam', group: 'Lance', weapon: 'lance', desc: 'The Lance beam stays on 0.4 s longer each time it fires.', maxStacks: 3, modifiers: [{ stat: 'lance.duration', op: 'add', value: 0.4 }] },
  { id: 'flak-fuse', name: 'Short Fuse', group: 'Energy Bomb', weapon: 'flak', desc: 'Energy Bombs burst 25% sooner after they land.', maxStacks: 3, modifiers: [{ stat: 'flak.fuse', op: 'mul', value: 0.75 }] },
  { id: 'scatter-pellets', name: 'Extra Pellets', group: 'Scatter', weapon: 'scatter', desc: 'Scatter fires 2 more pellets per shot.', maxStacks: 3, modifiers: [{ stat: 'scatter.barrels', op: 'add', value: 2 }] },
  { id: 'laser-width', name: 'Wide Lens', group: 'Laser', weapon: 'laser', desc: 'Laser bores a wider tunnel.', maxStacks: 3, modifiers: [{ stat: 'laser.width', op: 'add', value: 1 }] },
  { id: 'wave-arc', name: 'Wider Crescent', group: 'Energy Wave', weapon: 'wave', desc: 'Energy Wave sweeps an arc 20 degrees wider.', maxStacks: 3, modifiers: [{ stat: 'wave.arc', op: 'add', value: 20 }] },
  { id: 'wave-reach', name: 'Long Crescent', group: 'Energy Wave', weapon: 'wave', desc: 'Energy Wave reaches 25 px farther.', maxStacks: 3, modifiers: [{ stat: 'wave.reach', op: 'add', value: 25 }] },
  { id: 'wave-edge', name: 'Sustained Field', group: 'Energy Wave', weapon: 'wave', desc: 'Energy Wave loses less power with distance (edge power +10 points).', maxStacks: 3, modifiers: [{ stat: 'wave.edge', op: 'add', value: 0.1 }] },
  // --- the new aux weapons ---
  { id: 'mine-count', name: 'Deep Magazine', group: 'Mine Layer', weapon: 'mine', desc: 'The Mine Layer drops 1 more mine each time, and more can be out at once.', maxStacks: 2, weight: 0.8, modifiers: [{ stat: 'mine.count', op: 'add', value: 1 }] },
  { id: 'mine-arm', name: 'Quick Fuses', group: 'Mine Layer', weapon: 'mine', desc: 'Mines arm 30% sooner (0.6 s at the start).', maxStacks: 2, modifiers: [{ stat: 'mine.arm', op: 'mul', value: 0.7 }] },
  { id: 'mine-trigger', name: 'Proximity Sensor', group: 'Mine Layer', weapon: 'mine', desc: 'Mines go off from 14 px farther away.', maxStacks: 3, modifiers: [{ stat: 'mine.trigger', op: 'add', value: 14 }] },
  { id: 'drone-count', name: 'Second Drone', group: 'Drone', weapon: 'drone', desc: 'The Drone weapon launches 1 more drone, on the other side of your ship.', maxStacks: 2, weight: 0.8, modifiers: [{ stat: 'drone.count', op: 'add', value: 1 }] },
  { id: 'drone-rate', name: 'Rapid Drones', group: 'Drone', weapon: 'drone', desc: 'Drones fire 25% faster.', maxStacks: 3, modifiers: [{ stat: 'drone.fireRate', op: 'mul', value: 1.25 }] },
  { id: 'drone-duration', name: 'Long-Life Cells', group: 'Drone', weapon: 'drone', desc: 'Drones stay out 3 s longer.', maxStacks: 3, modifiers: [{ stat: 'drone.duration', op: 'add', value: 3 }] },
  { id: 'shield-duration', name: 'Lasting Pulse', group: 'Shield Pulse', weapon: 'shield', desc: 'The Shield Pulse bubble lasts 0.6 s longer.', maxStacks: 3, modifiers: [{ stat: 'shield.duration', op: 'add', value: 0.6 }] },
  { id: 'shield-radius', name: 'Wide Bubble', group: 'Shield Pulse', weapon: 'shield', desc: 'The Shield Pulse bubble is 12 px wider.', maxStacks: 3, modifiers: [{ stat: 'shield.radius', op: 'add', value: 12 }] },
  // --- ship ---
  { id: 'hull-plating', name: 'Hull Plating', group: 'Ship', desc: '+1 max hull, repaired right away.', maxStacks: 3, modifiers: [{ stat: 'ship.maxHealth', op: 'add', value: 1 }] },
  { id: 'dodge-cooldown', name: 'Quick Thrusters', group: 'Ship', desc: 'Dodge recharges 20% faster.', maxStacks: 3, modifiers: [{ stat: 'dodge.cooldown', op: 'mul', value: 0.8 }] },
  { id: 'ship-speed', name: 'Engines', group: 'Ship', desc: 'Ship moves 12% faster.', maxStacks: 3, weight: 0.8, modifiers: [{ stat: 'ship.speed', op: 'mul', value: 1.12 }] },
  { id: 'ship-hitbox', name: 'Compact Hull', group: 'Ship', desc: 'Smaller hitbox: bullets must be closer to hurt you.', maxStacks: 2, weight: 0.6, rarity: 'rare', modifiers: [{ stat: 'ship.hitbox', op: 'mul', value: 0.8 }] },
  // --- synergy (needs a burn stack from the cards above) ---
  {
    id: 'burn-napalm',
    name: 'Napalm Mix',
    group: 'Burn',
    slot: 'main',
    requiresAny: ['main.tag.burn', 'aux.tag.burn'],
    desc: 'Needs a burn card. +1 burn on your main gun AND on every aux weapon.',
    maxStacks: 1,
    weight: 0.3,
    rarity: 'epic',
    modifiers: [
      { stat: 'main.tag.burn', op: 'add', value: 1 },
      { stat: 'aux.tag.burn', op: 'add', value: 1 },
    ],
  },
  // --- trade-offs: a real gain with a real cost ---
  { id: 'trade-glass', name: 'Glass Cannon', group: 'Trade-off', slot: 'main', minHull: 3, desc: 'Main gun hits 50% harder, but you lose 1 max hull.', maxStacks: 1, weight: 0.4, rarity: 'rare', modifiers: [{ stat: 'main.damage', op: 'mul', value: 1.5 }, { stat: 'ship.maxHealth', op: 'add', value: -1 }] },
  { id: 'trade-hotrod', name: 'Hot Rod', group: 'Trade-off', slot: 'main', desc: 'Main gun fires 35% faster, but your dodge recharges 35% slower.', maxStacks: 2, weight: 0.4, rarity: 'rare', modifiers: [{ stat: 'main.fireRate', op: 'mul', value: 1.35 }, { stat: 'dodge.cooldown', op: 'mul', value: 1.35 }] },
  { id: 'trade-ordnance', name: 'Heavy Ordnance', group: 'Trade-off', slot: 'aux', desc: 'All aux weapons hit 50% harder, but your ship is 10% slower.', maxStacks: 1, weight: 0.4, rarity: 'rare', modifiers: [{ stat: 'aux.damage', op: 'mul', value: 1.5 }, { stat: 'ship.speed', op: 'mul', value: 0.9 }] },
  { id: 'trade-trigger', name: 'Hair Trigger', group: 'Trade-off', slot: 'aux', desc: 'All aux weapons recharge 30% faster, but your hitbox grows 15%.', maxStacks: 1, weight: 0.4, rarity: 'rare', modifiers: [{ stat: 'aux.cooldown', op: 'mul', value: 0.7 }, { stat: 'ship.hitbox', op: 'mul', value: 1.15 }] },
  {
    id: 'trade-overdrive',
    name: 'Overdrive Core',
    group: 'Trade-off',
    slot: 'main',
    minHull: 4,
    desc: 'Main gun fires 40% faster and hits 20% harder, but you lose 2 max hull.',
    maxStacks: 1,
    weight: 0.2,
    rarity: 'epic',
    modifiers: [{ stat: 'main.fireRate', op: 'mul', value: 1.4 }, { stat: 'main.damage', op: 'mul', value: 1.2 }, { stat: 'ship.maxHealth', op: 'add', value: -2 }],
  },
  {
    id: 'trade-surge',
    name: 'Arsenal Surge',
    group: 'Trade-off',
    slot: 'aux',
    desc: 'All aux weapons recharge 25% faster and hit 25% harder, but dodge recharges 50% slower.',
    maxStacks: 1,
    weight: 0.2,
    rarity: 'epic',
    modifiers: [{ stat: 'aux.cooldown', op: 'mul', value: 0.75 }, { stat: 'aux.damage', op: 'mul', value: 1.25 }, { stat: 'dodge.cooldown', op: 'mul', value: 1.5 }],
  },
  ...DEMO_LOCKED_CARDS, // gated cards; the first three Conquest (Empire Base) rewards, see demoCards.ts
  ...CONQUEST_CARDS,
];

/**
 * Cards that were folded into the slot cards (or renamed). A granted id that no longer exists resolves through this map (`cardById`);
 * an id in neither place is simply unknown and the caller skips it (never a crash).
 */
export const LEGACY_CARD_IDS: Record<string, string> = {
  'chain-rate': 'main-rate',
  'scatter-rate': 'main-rate',
  'needle-rate': 'main-rate',
  'laser-rate': 'main-rate',
  'chain-damage': 'main-damage',
  'scatter-damage': 'main-damage',
  'needle-damage': 'main-damage',
  'laser-damage': 'main-damage',
  'chain-barrel': 'main-barrel',
  'laser-pierce': 'main-pierce',
  'chain-burn': 'main-burn',
  'gauss-cooldown': 'aux-cooldown',
  'rocket-cooldown': 'aux-cooldown',
  'arc-cooldown': 'aux-cooldown',
  'lance-cooldown': 'aux-cooldown',
  'blades-cooldown': 'aux-cooldown',
  'swarm-cooldown': 'aux-cooldown',
  'wave-cooldown': 'aux-cooldown',
  'rocket-radius': 'aux-radius',
  'rocket-energy': 'aux-damage',
  'lance-energy': 'aux-damage',
  'arc-count': 'aux-count',
  'blades-count': 'aux-count',
  'swarm-count': 'aux-count',
};

export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));

/** A card by id, following `LEGACY_CARD_IDS` for cards that were folded away. Undefined for an id nothing knows. */
export function cardById(id: string): CardDef | undefined {
  return CARD_BY_ID.get(id) ?? CARD_BY_ID.get(LEGACY_CARD_IDS[id] ?? '');
}
