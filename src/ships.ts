import { TUNING } from './config';
import { DELTA, EMPIRE } from './factions';
import { isUnlocked } from './save';

/**
 * Ships as data. A ship is a look (drawn on the canvas), base stats, the weapons it starts with and an optional unlock flag.
 * Ships never contain behaviour: the game reads `baseStats` through `Loadout` (src/upgrades/stats.ts), the look through `drawShipLook`,
 * and the loadout builder starts from `startingWeapons` (any unlocked weapons can then be swapped in).
 * To add a ship: add an entry to `SHIPS` below (see DESIGN.md "Ships and weapon slots: as built").
 */

/** A polygon part of a ship silhouette, in ship-local px (the ship's nose is at -y, its centre at 0,0). */
export interface ShipPart {
  color: string;
  points: [number, number][];
}

/** What a ship looks like: a main hull polygon, extra polygons on top, a cockpit slit and an exhaust flame. All plain data. */
export interface ShipLook {
  hull: ShipPart;
  /** Drawn after the hull, in order (wings, fins, stripes). */
  details?: ShipPart[];
  cockpit: { color: string; x: number; y: number; w: number; h: number };
  /** Exhaust rect: `len` is the flicker base length, `flicker` the random extra. */
  flame: { color: string; x: number; y: number; w: number; len: number; flicker: number };
}

export interface ShipStats {
  maxHealth: number;
  /** Keyboard move speed, px/s (the pointer follow rate scales with it). */
  speed: number;
  dodgeCooldown: number;
  /** Collision circle radius, px. */
  hitbox: number;
  /** Highest y (px from the top) the ship may fly to; lower = closer to the enemies. Omitted = `TUNING.shipMinY`. */
  minY?: number;
  /** Keyboard acceleration, px/s^2 (the ship eases to its speed and coasts to a stop). Omitted = instant, like every other ship. The pointer follow rate is also softened. */
  accel?: number;
  /** Scale on the dodge dash distance (default 1). */
  dodgeScale?: number;
}

export interface WeaponLoadout {
  main: string;
  aux: string[];
}

export interface ShipDefinition {
  id: string;
  name: string;
  /** One line for the select screen. */
  desc: string;
  look: ShipLook;
  baseStats: ShipStats;
  startingWeapons: WeaponLoadout;
  /** Unlock flag (`save.unlocks.ships`). Omitted = always unlocked. */
  unlock?: string;
  /** Shown on the select screen while locked: how to get it. */
  unlockHint?: string;
  /** No guns at all: firing and the weapon rings are off (the escape pod). */
  noWeapons?: boolean;
  /**
   * Empire technology (the commandeered empire fighter): its weapons fire on the empire's own frequency, so the capital ship's
   * armour can be hit (src/finale/armour.ts, `armourResonance`). Omitted = false.
   */
  empireTech?: boolean;
}

export const DEFAULT_SHIP_ID = 'vanguard';

export const SHIPS: ShipDefinition[] = [
  {
    // The original ship: same numbers and the same polygon as before ships existed.
    id: DEFAULT_SHIP_ID,
    name: 'Vanguard',
    desc: 'Balanced all-rounder. Chain gun with Gauss, Rocket and Arc.',
    look: {
      hull: { color: '#6ee7ff', points: [[0, -22], [15, 16], [0, 9], [-15, 16]] },
      cockpit: { color: '#ffffff', x: -2, y: -6, w: 4, h: 9 },
      flame: { color: '#ff8a3c', x: -3, y: 12, w: 6, len: 4, flicker: 5 },
    },
    baseStats: { maxHealth: TUNING.player.maxHealth, speed: TUNING.ship.speed, dodgeCooldown: TUNING.dodge.cooldown, hitbox: TUNING.player.hitbox },
    startingWeapons: { main: 'chain', aux: ['gauss', 'rocket', 'arc'] },
  },
  {
    id: 'warden',
    name: 'Warden',
    desc: 'Heavy hull, slow to turn. Scatter shotgun with Blades, Rocket and Lance.',
    look: {
      hull: { color: '#ff9f43', points: [[0, -20], [10, -8], [24, 6], [24, 18], [10, 14], [0, 18], [-10, 14], [-24, 18], [-24, 6], [-10, -8]] },
      details: [
        { color: '#7a4a1c', points: [[-24, 6], [-16, 6], [-16, 18], [-24, 18]] },
        { color: '#7a4a1c', points: [[24, 6], [16, 6], [16, 18], [24, 18]] },
        { color: '#ffe3b8', points: [[0, -14], [4, -4], [-4, -4]] },
      ],
      cockpit: { color: '#2a1608', x: -3, y: -2, w: 6, h: 10 },
      flame: { color: '#ffd23a', x: -6, y: 14, w: 12, len: 4, flicker: 6 },
    },
    baseStats: { maxHealth: 7, speed: 390, dodgeCooldown: 3, hitbox: 6, minY: 290 },
    startingWeapons: { main: 'scatter', aux: ['blades', 'rocket', 'lance'] },
    unlock: 'warden',
    unlockHint: 'Defeat the first boss in a run.',
  },
  {
    id: 'wisp',
    name: 'Wisp',
    desc: 'Frail and fast, tiny hitbox. Needler with Swarm, Gauss and Arc.',
    look: {
      hull: { color: '#c77dff', points: [[0, -24], [7, 4], [4, 18], [0, 12], [-4, 18], [-7, 4]] },
      details: [
        { color: '#7dff9a', points: [[7, 2], [20, 14], [6, 12]] },
        { color: '#7dff9a', points: [[-7, 2], [-20, 14], [-6, 12]] },
      ],
      cockpit: { color: '#f4e6ff', x: -1, y: -10, w: 2, h: 10 },
      flame: { color: '#7dff9a', x: -2, y: 12, w: 4, len: 5, flicker: 6 },
    },
    baseStats: { maxHealth: 3, speed: 560, dodgeCooldown: 2, hitbox: 4 },
    startingWeapons: { main: 'needle', aux: ['swarm', 'gauss', 'arc'] },
    unlock: 'wisp',
    unlockHint: 'Clear a whole run.',
  },
  {
    // The commandeered empire fighter (Fallen Peace chapters 5 to 7), a hero version of the empire fighter unit: angular, forward-swept
    // wings, slate plating with a bronze nose, the red chevron insignia. A little tougher and faster than the Vanguard, reaches higher.
    id: 'empire-fighter',
    name: 'Empire Fighter',
    desc: 'Captured empire tech: tougher and faster. Its weapons hurt empire armour. Chain gun with Gauss, Rocket and Arc.',
    look: {
      hull: { color: EMPIRE.armour, points: [[0, -22], [4, -10], [8, -8], [24, -16], [22, -2], [15, 15], [7, 13], [4, 19], [0, 21], [-4, 19], [-7, 13], [-15, 15], [-22, -2], [-24, -16], [-8, -8], [-4, -10]] },
      details: [
        { color: EMPIRE.armourLight, points: [[8, -6], [21, -13], [19, -3], [9, 4]] },
        { color: EMPIRE.armourLight, points: [[-8, -6], [-21, -13], [-19, -3], [-9, 4]] },
        { color: EMPIRE.hull, points: [[0, -22], [3, -11], [-3, -11]] },
        { color: EMPIRE.accent, points: [[-21, 3], [21, 3], [20, 7], [-20, 7]] },
        { color: EMPIRE.armourDark, points: [[-4, -10], [4, -10], [4, 13], [0, 19], [-4, 13]] },
        { color: EMPIRE.accent, points: [[0, -4], [4, 1], [4, 3], [0, -1], [-4, 3], [-4, 1]] },
        { color: EMPIRE.accentDark, points: [[0, 1], [4, 6], [4, 7], [0, 3], [-4, 7], [-4, 6]] },
      ],
      cockpit: { color: EMPIRE.canopy, x: -2, y: -14, w: 4, h: 7 },
      flame: { color: EMPIRE.glow, x: -3, y: 19, w: 6, len: 4, flicker: 6 },
    },
    baseStats: { maxHealth: 6, speed: 500, dodgeCooldown: 2.2, hitbox: TUNING.player.hitbox, minY: 260 },
    startingWeapons: { main: 'chain', aux: ['gauss', 'rocket', 'arc'] },
    unlock: 'empire-fighter',
    unlockHint: 'Finish the Fallen Peace campaign.',
    empireTech: true,
  },
];

/**
 * Campaign-only ships: never shown in the Endless ship select (they are not in `SHIPS`), but `shipById` and `Game.setShip` know them.
 * `delta-rookie` is the Fallen Peace ship: the Vanguard's numbers and silhouette in the Delta squad palette (mint, white, teal; no red,
 * so it never reads as an empire ship), preset weapons chain + Gauss, Rocket, Arc.
 */
export const DELTA_ROOKIE_ID = 'delta-rookie';
export const CAMPAIGN_SHIPS: ShipDefinition[] = [
  {
    id: DELTA_ROOKIE_ID,
    name: 'Delta Rookie',
    desc: 'Delta squad standard issue. Chain gun with Gauss, Rocket and Arc.',
    look: {
      hull: { color: DELTA.hull, points: [[0, -22], [15, 16], [0, 9], [-15, 16]] },
      details: [
        { color: DELTA.mid, points: [[0, -16], [8, 12], [0, 8], [-8, 12]] },
        { color: DELTA.trim, points: [[-15, 16], [-9, 13], [-9, 16]] },
        { color: DELTA.trim, points: [[15, 16], [9, 13], [9, 16]] },
        { color: DELTA.dark, points: [[-12, 15], [-7, 11], [-7, 15]] },
        { color: DELTA.dark, points: [[12, 15], [7, 11], [7, 15]] },
      ],
      cockpit: { color: '#ffffff', x: -2, y: -6, w: 4, h: 9 },
      flame: { color: DELTA.flame, x: -3, y: 12, w: 6, len: 4, flicker: 5 },
    },
    baseStats: { maxHealth: TUNING.player.maxHealth, speed: TUNING.ship.speed, dodgeCooldown: TUNING.dodge.cooldown, hitbox: TUNING.player.hitbox },
    startingWeapons: { main: 'chain', aux: ['gauss', 'rocket', 'arc'] },
  },
];

/**
 * The escape pod (chapter 4, stealth): campaign only. Half the hitbox, 2 hull, slow to speed up and turn round, shorter dodge, no
 * weapons (`noWeapons`: the rings are hidden, firing is off). A small egg-shaped capsule in the Delta palette with a tiny engine glow.
 */
export const ESCAPE_POD_ID = 'escape-pod';
CAMPAIGN_SHIPS.push({
  id: ESCAPE_POD_ID,
  name: 'Escape pod',
  desc: 'A tiny lifeboat. No weapons, two hull, a very small hitbox.',
  look: {
    hull: { color: DELTA.trim, points: [[0, -11], [5, -6], [6, 3], [4, 9], [-4, 9], [-6, 3], [-5, -6]] },
    details: [
      { color: DELTA.mid, points: [[0, -11], [5, -6], [6, 3], [3, 3], [2, -7]] },
      { color: DELTA.dark, points: [[-4, 9], [4, 9], [3, 6], [-3, 6]] },
      { color: DELTA.hull, points: [[-6, 3], [-8, 8], [-4, 7]] },
      { color: DELTA.hull, points: [[6, 3], [8, 8], [4, 7]] },
    ],
    cockpit: { color: '#9ff6ff', x: -2, y: -6, w: 4, h: 5 },
    flame: { color: DELTA.flame, x: -1, y: 9, w: 2, len: 2, flicker: 3 },
  },
  baseStats: { maxHealth: 2, speed: 300, dodgeCooldown: 3, hitbox: 3, accel: 1100, dodgeScale: 0.55 },
  startingWeapons: { main: 'chain', aux: [] },
  noWeapons: true,
});

export const SHIP_BY_ID = new Map([...SHIPS, ...CAMPAIGN_SHIPS].map((s) => [s.id, s]));

/** The ship's highest allowed y. */
export function shipMinY(id: string): number {
  return shipById(id).baseStats.minY ?? TUNING.shipMinY;
}

export function shipById(id: string): ShipDefinition {
  return SHIP_BY_ID.get(id) ?? SHIP_BY_ID.get(DEFAULT_SHIP_ID)!;
}

/** True when the ship is always available or its flag is set in the save. */
export function shipUnlocked(s: ShipDefinition): boolean {
  return !s.unlock || isUnlocked('ships', s.unlock);
}

/** Stat-key overrides a ship applies as the base of `Loadout` (upgrades then stack on top). */
export function shipBase(id: string): Record<string, number> {
  const b = shipById(id).baseStats;
  return { 'ship.maxHealth': b.maxHealth, 'ship.speed': b.speed, 'dodge.cooldown': b.dodgeCooldown, 'ship.hitbox': b.hitbox };
}

/** Draws a ship centred at (x, y) at `scale` (1 = in-game size). The flame flickers with Math.random, as the in-game ship always did. */
export function drawShipLook(g: CanvasRenderingContext2D, look: ShipLook, x: number, y: number, scale = 1): void {
  g.save();
  g.translate(Math.round(x), Math.round(y));
  if (scale !== 1) g.scale(scale, scale);
  const poly = (p: ShipPart): void => {
    g.fillStyle = p.color;
    g.beginPath();
    p.points.forEach(([px, py], i) => (i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
    g.closePath();
    g.fill();
  };
  poly(look.hull);
  for (const d of look.details ?? []) poly(d);
  const c = look.cockpit;
  g.fillStyle = c.color;
  g.fillRect(c.x, c.y, c.w, c.h);
  const f = look.flame;
  g.fillStyle = f.color;
  g.fillRect(f.x, f.y, f.w, f.len + Math.random() * f.flicker);
  g.restore();
}
