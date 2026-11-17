import { TUNING } from './config';
import { DELTA, EMPIRE } from './factions';
import { isUnlocked, saveStore } from './save';

/**
 * Ships as data. A ship is a look (drawn on the canvas), base stats, the weapons it starts with and an optional unlock flag.
 * Ships never contain behaviour: the game reads `baseStats` through `Loadout` (src/upgrades/stats.ts), the look through `drawShipLook`,
 * and the loadout builder starts from `startingWeapons` (any unlocked weapons can then be swapped in).
 * To add a ship: add an entry to `SHIPS` below (see DESIGN.md "Ships and weapon slots: as built").
 */

/** A polygon part of a ship silhouette, in ship-local px (the ship's nose is at -y, its centre at 0,0). */
export interface ShipPart {
  /** Names the part so a skin palette can recolour it (`ShipSkin.palette`). */
  id?: string;
  color: string;
  points: [number, number][];
}

/** What a ship looks like: a main hull polygon, extra polygons on top, a cockpit slit and an exhaust flame. All plain data. */
export interface ShipLook {
  hull: ShipPart;
  /** Drawn after the hull, in order (wings, fins, stripes). */
  details?: ShipPart[];
  /** `r` rounds the corners (a bubble canopy); `highlight` is a smaller lighter rect on top of it. */
  cockpit: { color: string; x: number; y: number; w: number; h: number; r?: number; highlight?: { color: string; x: number; y: number; w: number; h: number } };
  /** Exhaust rect: `len` is the flicker base length, `flicker` the random extra. `xs` adds more flames at those x offsets (twin or triple engines). */
  flame: { color: string; x: number; y: number; w: number; len: number; flicker: number; xs?: number[] };
  /** How big the shape is drawn (default 1). The redesigned hulls are drawn in a large coordinate space and scaled down to the old in-game footprint; hitboxes are unchanged. */
  scale?: number;
}

/**
 * A skin: a colour variant of a body. `palette` maps a part `id` (or `cockpit`, `highlight`, `flame`) to a colour; `details` are extra parts
 * (stripes, emblems) drawn after the body's own details. The first skin of a ship is its default (always unlocked, empty palette).
 */
export interface ShipSkin {
  id: string;
  name: string;
  palette: Record<string, string>;
  details?: ShipPart[];
  /** Flag in `save.unlocks.skins`. Omitted = always unlocked. */
  unlock?: string;
  /** Shown on the locked skin in the ship builder. */
  requirement?: string;
  /** Awarded when a run of this Conquest region is won (src/conquest/tracker.ts). */
  clearRegion?: string;
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
  /** Campaign: the main gun fires this many parallel streams from muzzles `muzzleGap` px apart (default 1). The shot's damage is split between them by the ship's `statMul`. */
  twinMuzzles?: number;
  muzzleGap?: number;
  /** Damage multiplier of each stream when twinned (default 1 / twinMuzzles, so the total is unchanged; above that the twin guns hit harder in total). */
  muzzleDamage?: number;
  /** Campaign tuning: multipliers on weapon stats (`chain.fireRate`, `chain.damage`, ...), applied under upgrades. Endless ships leave it out. */
  statMul?: Record<string, number>;
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
  /** Colour variants (see `ShipSkin`); the first is the default. Omitted = one skin. */
  skins?: ShipSkin[];
  baseStats: ShipStats;
  startingWeapons: WeaponLoadout;
  /** Unlock flag (`save.unlocks.ships`). Omitted = always unlocked. */
  unlock?: string;
  /** Shown on the select screen while locked: how to get it. */
  unlockHint?: string;
  /** Short unlock requirement shown under the silhouette in the ship builder while locked. */
  requirement?: string;
  /** No guns at all: firing and the weapon rings are off (the escape pod). */
  noWeapons?: boolean;
  /**
   * Empire technology (the commandeered empire fighter): its weapons fire on the empire's own frequency, so the capital ship's
   * armour can be hit (src/finale/armour.ts, `armourResonance`). Omitted = false.
   */
  empireTech?: boolean;
}

/** The redesigned looks (DESIGN.md "Ship redesign"): drawn in a large coordinate space and scaled by `scale` down to the old in-game size. */
const VANGUARD_LOOK: ShipLook = {
  scale: 0.55,
  hull: { id: 'body', color: '#6ee7ff', points: [[0, -52], [8, -20], [10, 10], [6, 30], [0, 24], [-6, 30], [-10, 10], [-8, -20]] },
  details: [
    { id: 'wing', color: '#2fa8c9', points: [[10, -4], [40, 30], [38, 38], [12, 26]] },
    { id: 'wing', color: '#2fa8c9', points: [[-10, -4], [-40, 30], [-38, 38], [-12, 26]] },
    { id: 'canard', color: '#2fa8c9', points: [[8, -22], [22, -12], [8, -10]] },
    { id: 'canard', color: '#2fa8c9', points: [[-8, -22], [-22, -12], [-8, -10]] },
    { id: 'nose', color: '#e8fbff', points: [[0, -52], [3, -30], [-3, -30]] },
    { id: 'trim', color: '#1b6f88', points: [[12, 8], [36, 30], [34, 33], [12, 22]] },
    { id: 'trim', color: '#1b6f88', points: [[-12, 8], [-36, 30], [-34, 33], [-12, 22]] },
  ],
  cockpit: { color: '#0b2a36', x: -3.5, y: -24, w: 7, h: 16, r: 3.5, highlight: { color: '#bff3ff', x: -2, y: -22, w: 4, h: 8 } },
  flame: { color: '#ff8a3c', x: -8, y: 30, w: 5, len: 5, flicker: 5, xs: [3] },
};

const VANGUARD_SKINS: ShipSkin[] = [
  { id: 'default', name: 'Blue', palette: {} },
  {
    id: 'rookie',
    name: 'Rookie',
    palette: { body: '#4cc76a', wing: '#2f9a4c', trim: '#1b5e2e', canard: '#ffd21f', nose: '#fff0a0', cockpit: '#0b2a14', highlight: '#eaffc8', flame: '#ffb347' },
    details: [
      // Two racing stripes down the body, then a yellow delta emblem with a green cut-out on each wing surface.
      { color: '#ffd21f', points: [[-4.5, -30], [-2.3, -30], [-2.3, 24], [-4.5, 24]] },
      { color: '#ffd21f', points: [[2.3, -30], [4.5, -30], [4.5, 24], [2.3, 24]] },
      { color: '#ffd21f', points: [[20, 9], [26, 20], [14, 20]] },
      { color: '#2f9a4c', points: [[20, 13.5], [23, 18], [17, 18]] },
      { color: '#ffd21f', points: [[-20, 9], [-26, 20], [-14, 20]] },
      { color: '#2f9a4c', points: [[-20, 13.5], [-23, 18], [-17, 18]] },
    ],
    unlock: 'vanguard-rookie',
    clearRegion: 'empire-base',
    requirement: 'Clear Empire Base in Conquest',
  },
];

const WARDEN_LOOK: ShipLook = {
  scale: 0.5,
  hull: { id: 'body', color: '#ff9f43', points: [[0, -46], [14, -28], [16, 18], [9, 36], [-9, 36], [-16, 18], [-14, -28]] },
  details: [
    { id: 'strut', color: '#8a4d14', points: [[-20, 2], [-13, 2], [-13, 12], [-20, 12]] },
    { id: 'strut', color: '#8a4d14', points: [[20, 2], [13, 2], [13, 12], [20, 12]] },
    { id: 'pod', color: '#b8651a', points: [[-40, -20], [-18, -20], [-18, 32], [-40, 32]] },
    { id: 'pod', color: '#b8651a', points: [[18, -20], [40, -20], [40, 32], [18, 32]] },
    { id: 'barrel', color: '#ffd9a8', points: [[-31.5, -36], [-28.5, -36], [-28.5, -20], [-31.5, -20]] },
    { id: 'barrel', color: '#ffd9a8', points: [[28.5, -36], [31.5, -36], [31.5, -20], [28.5, -20]] },
    { id: 'stripe', color: '#ffd23a', points: [[-40, -6], [-18, -6], [-18, -2], [-40, -2]] },
    { id: 'stripe', color: '#ffd23a', points: [[18, -6], [40, -6], [40, -2], [18, -2]] },
    { id: 'stripe', color: '#ffd23a', points: [[-40, 14], [-18, 14], [-18, 18], [-40, 18]] },
    { id: 'stripe', color: '#ffd23a', points: [[18, 14], [40, 14], [40, 18], [18, 18]] },
    { id: 'nose', color: '#ffe3b8', points: [[0, -46], [6, -34], [-6, -34]] },
  ],
  cockpit: { color: '#2a1608', x: -5, y: -30, w: 10, h: 14 },
  flame: { color: '#ffd23a', x: -33, y: 32, w: 8, len: 5, flicker: 6, xs: [-4, 25] },
};

const WISP_LOOK: ShipLook = {
  scale: 0.45,
  hull: { id: 'body', color: '#c77dff', points: [[0, -56], [5, -10], [4, 26], [0, 18], [-4, 26], [-5, -10]] },
  details: [
    { id: 'wing', color: '#7dff9a', points: [[5, 2], [30, 36], [28, 40], [6, 24]] },
    { id: 'wing', color: '#7dff9a', points: [[-5, 2], [-30, 36], [-28, 40], [-6, 24]] },
    { id: 'fin', color: '#9a4fd8', points: [[4, 18], [10, 40], [4, 34]] },
    { id: 'fin', color: '#9a4fd8', points: [[-4, 18], [-10, 40], [-4, 34]] },
  ],
  cockpit: { color: '#f4e6ff', x: -1.5, y: -32, w: 3, h: 20 },
  flame: { color: '#7dff9a', x: -2.5, y: 26, w: 5, len: 6, flicker: 6 },
};

export const DEFAULT_SHIP_ID = 'vanguard';

export const SHIPS: ShipDefinition[] = [
  {
    // The original ship: same numbers and the same polygon as before ships existed.
    id: DEFAULT_SHIP_ID,
    name: 'Vanguard',
    desc: 'Balanced all-rounder. Chain gun with Gauss, Rocket and Arc.',
    look: VANGUARD_LOOK,
    skins: VANGUARD_SKINS,
    baseStats: { maxHealth: TUNING.player.maxHealth, speed: TUNING.ship.speed, dodgeCooldown: TUNING.dodge.cooldown, hitbox: TUNING.player.hitbox },
    startingWeapons: { main: 'chain', aux: ['gauss', 'rocket', 'arc'] },
  },
  {
    id: 'warden',
    name: 'Warden',
    desc: 'Heavy hull, slow to turn. Scatter shotgun with Blades, Rocket and Lance.',
    look: WARDEN_LOOK,
    skins: [{ id: 'default', name: 'Bronze', palette: {} }],
    baseStats: { maxHealth: 7, speed: 390, dodgeCooldown: 3, hitbox: 6, minY: 290 },
    startingWeapons: { main: 'scatter', aux: ['blades', 'rocket', 'lance'] },
    unlock: 'warden',
    unlockHint: 'Defeat the first boss in a run.',
    requirement: 'Defeat the first boss in an Endless run',
  },
  {
    id: 'wisp',
    name: 'Wisp',
    desc: 'Frail and fast, tiny hitbox. Needler with Swarm, Gauss and Arc.',
    look: WISP_LOOK,
    skins: [{ id: 'default', name: 'Violet', palette: {} }],
    baseStats: { maxHealth: 3, speed: 560, dodgeCooldown: 2, hitbox: 4 },
    startingWeapons: { main: 'needle', aux: ['swarm', 'gauss', 'arc'] },
    unlock: 'wisp',
    unlockHint: 'Clear a whole run.',
    requirement: 'Clear a whole Endless run',
  },
  {
    // The commandeered empire fighter (Fallen Peace chapters 5 to 7), a hero version of the empire fighter unit: angular, forward-swept
    // wings, slate plating with a bronze nose, the red chevron insignia. A little tougher and faster than the Vanguard, reaches higher.
    id: 'empire-fighter',
    name: 'Empire Fighter',
    desc: 'Captured empire tech: tougher and faster. Its weapons hurt empire armour. Pulse Orbs with a Energy Bomb.',
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
    startingWeapons: { main: 'pulse', aux: ['flak'] },
    unlock: 'empire-fighter',
    unlockHint: 'Finish the Fallen Peace campaign.',
    requirement: 'Finish Fallen Peace',
    empireTech: true,
  },
];

/**
 * Campaign-only ships: never shown in the Endless ship select (they are not in `SHIPS`), but `shipById` and `Game.setShip` know them.
 * `delta-rookie` is the Fallen Peace ship: the Vanguard's numbers and silhouette in the default blue Vanguard skin (blue never reads as an empire ship), preset weapons chain + Gauss, Rocket, Arc.
 */
export const DELTA_ROOKIE_ID = 'delta-rookie';
export const CAMPAIGN_SHIPS: ShipDefinition[] = [
  {
    id: DELTA_ROOKIE_ID,
    name: 'Delta Rookie',
    desc: 'Delta squad standard issue. Twin chain guns with Gauss, Rocket and Arc.',
    look: VANGUARD_LOOK, // the squad flies the default blue skin of the redesigned hull, never the Rookie skin
    // Campaign tuning (chapters 1 and 2): the rookie's chain gun fires 25% faster and hits 22% harder than the Endless Vanguard's.
    baseStats: { maxHealth: TUNING.player.maxHealth, speed: TUNING.ship.speed, dodgeCooldown: TUNING.dodge.cooldown, hitbox: TUNING.player.hitbox, statMul: { 'chain.fireRate': 1.25, 'chain.damage': 1.22 }, twinMuzzles: 2, muzzleGap: 22, muzzleDamage: 0.6 },
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

/** A skin is owned when it has no unlock flag or the flag is in `save.unlocks.skins`. */
export function skinUnlocked(s: ShipSkin): boolean {
  return !s.unlock || isUnlocked('skins', s.unlock);
}

/** The ship's skins (always at least the default one). */
export function skinsOf(s: ShipDefinition): ShipSkin[] {
  return s.skins && s.skins.length > 0 ? s.skins : [{ id: 'default', name: 'Standard', palette: {} }];
}

/** Save key of a skin for the `seen` list. */
export const skinKey = (shipId: string, skinId: string): string => `${shipId}:${skinId}`;

const skinCache = new Map<string, ShipLook>();

/** The ship's look wearing a skin (cached, so the same skin always gives the same object). The default skin gives `look` itself. */
export function skinLook(ship: ShipDefinition, skinId: string): ShipLook {
  const skins = skinsOf(ship);
  const skin = skins.find((k) => k.id === skinId) ?? skins[0];
  if (skin === skins[0]) return ship.look;
  const key = skinKey(ship.id, skin.id);
  let out = skinCache.get(key);
  if (!out) {
    const pal = skin.palette;
    const col = (p: ShipPart): ShipPart => (p.id && pal[p.id] ? { ...p, color: pal[p.id] } : p);
    const c = ship.look.cockpit;
    out = {
      ...ship.look,
      hull: col(ship.look.hull),
      details: [...(ship.look.details ?? []).map(col), ...(skin.details ?? [])],
      cockpit: { ...c, color: pal.cockpit ?? c.color, highlight: c.highlight ? { ...c.highlight, color: pal.highlight ?? c.highlight.color } : undefined },
      flame: { ...ship.look.flame, color: pal.flame ?? ship.look.flame.color },
    };
    skinCache.set(key, out);
  }
  return out;
}

/** The skin the player has equipped on a body (the default when none is saved or the saved one is locked or unknown). Campaign ships have no skins: always the default. */
export function equippedSkin(ship: ShipDefinition): ShipSkin {
  const skins = skinsOf(ship);
  const k = saveStore.current.skins[ship.id];
  const s = skins.find((x) => x.id === k);
  return s && skinUnlocked(s) ? s : skins[0];
}

/** The look a run draws for this body: the equipped skin. */
export function equippedLook(shipId: string): ShipLook {
  const ship = shipById(shipId);
  return skinLook(ship, equippedSkin(ship).id);
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

/** Draws a ship centred at (x, y) at `scale` (1 = in-game size); `silhouette` draws it as a plain black shape. The flame flickers with Math.random, as the in-game ship always did. */
export function drawShipLook(g: CanvasRenderingContext2D, look: ShipLook, x: number, y: number, scale = 1, silhouette = false): void {
  g.save();
  g.translate(Math.round(x), Math.round(y));
  scale *= look.scale ?? 1;
  if (scale !== 1) g.scale(scale, scale);
  const poly = (p: ShipPart): void => {
    g.fillStyle = silhouette ? '#000' : p.color;
    g.beginPath();
    p.points.forEach(([px, py], i) => (i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
    g.closePath();
    g.fill();
  };
  if (!silhouette) poly(look.hull);
  if (silhouette) {
    // A locked body: the hull and detail shapes in one black fill (details can reach past the hull), no cockpit or flame.
    // Two passes: the parts with the caller's glow, then again without it on top, so the glow has no seams where parts overlap.
    const parts = [look.hull, ...(look.details ?? [])];
    for (const p of parts) poly(p);
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    for (const p of parts) poly(p);
    g.restore();
    return;
  }
  for (const d of look.details ?? []) poly(d);
  const c = look.cockpit;
  g.fillStyle = c.color;
  if (c.r) {
    g.beginPath();
    g.roundRect(c.x, c.y, c.w, c.h, c.r);
    g.fill();
  } else g.fillRect(c.x, c.y, c.w, c.h);
  if (c.highlight) {
    g.fillStyle = c.highlight.color;
    g.fillRect(c.highlight.x, c.highlight.y, c.highlight.w, c.highlight.h);
  }
  const f = look.flame;
  g.fillStyle = f.color;
  for (const fx of [f.x, ...(f.xs ?? [])]) g.fillRect(fx, f.y, f.w, f.len + Math.random() * f.flicker);
  g.restore();
}
