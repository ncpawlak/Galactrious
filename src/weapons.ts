import type { Boss, HitResult } from './boss';
import type { CarveShapeName } from './carveShapes';
import { resolveBlast, type BlastSpec, type ComponentSystem } from './components';
import { H, MAINS, W, WEAPONS } from './config';
import type { StyleName } from './attackStyles';
import type { TagSet } from './tags';
import { gaussShape } from './upgrades/stats';
import { DroneBay, MineField, ShieldBubble, type DroneInit, type MineInit, type ShieldInit, type UnitsHost } from './auxUnits';

/**
 * Auto-firing player weapons (issue #12). Each weapon is DATA (`WeaponDef`): id, name, cooldown and a `fire`
 * function that spawns projectiles described by plain fields (energy, pierce, carve shape, blast, steering).
 * Upgrades later are modifiers on these definitions (copy a def and change cooldown / counts / angles) and on the
 * base gun; nothing here is special-cased by weapon id except drawing. All weapons are boss-only, like blasts.
 * Mains (the constant gun) are data here too (`MainDef`) but fire from `Game`; `WeaponSystem` equips the aux weapons of the run's loadout.
 */

export type WeaponId = string;
export type WeaponSlot = 'main' | 'aux';

/** Fields every weapon has, whatever its slot. */
interface WeaponBase {
  id: WeaponId;
  name: string;
  /** One short line for the loadout builder. */
  desc: string;
  color: string;
  /** Unlock flag (`save.unlocks.weapons`). Omitted = always available. A ship's starting weapons are also available while that ship is unlocked. */
  unlock?: string;
  /** Shown in the loadout builder while locked. */
  unlockHint?: string;
  /** Short unlock requirement shown in the ship builder while locked. */
  requirement?: string;
  /** Builder icon: draws a glyph centred at (x, y) inside a ring of radius `r` (the ring and the lock are the builder's). Omitted = the weapon's initial. */
  icon?: (g: CanvasRenderingContext2D, x: number, y: number, r: number) => void;
  /** Stashed for later: defined and usable through the debug loadout, but hidden from every select screen and never available to a player. */
  stashed?: boolean;
}

/** An auto-firing aux weapon: fires on its own timer. */
export interface AuxDef extends WeaponBase {
  slot: 'aux';
  /** Cooldown in seconds with upgrades applied (before `WEAPONS.cooldownScale`). */
  cooldown: (stat: StatFn) => number;
  /** Spawn this weapon's projectiles. */
  fire(c: FireContext): void;
  /** Which generic aux cards mean something for this weapon: `count` ("Extra Volley") and `radius` ("Wide Blasts"). */
  supports?: { count?: boolean; radius?: boolean };
  /** What one point of the generic `aux.count` is worth for this weapon (default 1; the Swarm gets 2 missiles). */
  countStep?: number;
}

/**
 * A main weapon: the ship's constant gun, fired by `Game`. Numbers are relative to the ship's live damage and fire rate
 * (1 = the chain gun), see `MAINS` in config.ts. Cards modify `<id>.fireRate`, `<id>.damage` and `<id>.barrels`.
 */
export interface MainDef extends WeaponBase {
  slot: 'main';
  rateMul: number;
  damageMul: number;
  projectiles: number;
  spreadDeg: number;
  /** Random extra angle per bullet (degrees, +-). */
  jitterDeg: number;
  pierce: number;
  speedMul: number;
  shape?: CarveShapeName;
  /** Width upgrade tiers: the stat `<id>.width` (0, 1, 2...) picks the carve shape from this list (wider = lower lateral penalty), replacing `shape`. */
  shapeTiers?: CarveShapeName[];
  /** Energy multiplier by distance travelled: `near` up to `start` px, easing to `far` at `end` px where the bullet dies. */
  fall?: { start: number; end: number; near: number; far: number };
  /** Bullet look: colour and size in px. */
  bullet: { color: string; w: number; h: number; /** Draw as the enemy bullet style of this name (an orb) instead of a rectangle. */ orb?: StyleName; /** Charged-beam look: additive glow colour as 'r,g,b' (muzzle glow-in, streak, impact flare). */ glow?: string };
}

export type WeaponDef = AuxDef | MainDef;

/** Effective value of a stat key (`base` + held upgrades): the weapons never read upgrades directly. */
export type StatFn = (key: string, base: number) => number;

/** What a weapon's `fire` gets: the ship, the damage scale, and a spawner. */
export interface FireContext {
  ship: { x: number; y: number };
  /** Live ship damage / default damage: the debug damage keys scale weapon energy through this. */
  power: number;
  stat: StatFn;
  /** Tags this weapon's shots carry (from upgrades), undefined = none. */
  tags: TagSet | undefined;
  spawn(p: ProjectileInit): void;
  /** Start a timed effect that follows the ship (a held beam, orbiting blades). */
  effect(e: EffectInit): void;
  /** A random solid pixel of a random live target (the boss or a unit) in its local coordinates, or null when nothing is left. */
  pickTarget(): { target: Combatant; lx: number; ly: number } | null;
  /** Lay a mine / launch drones / raise the shield bubble (src/auxUnits.ts). */
  mine(m: MineInit, cap: number): void;
  drone(d: DroneInit): void;
  shield(s: ShieldInit): void;
}

export interface ProjectileInit {
  weapon: WeaponId;
  x: number;
  y: number;
  /** Heading in radians (0 = right, -PI/2 = up). */
  angle: number;
  speed: number;
  /** Per-second speed gain up to `maxSpeed` (rockets). */
  accel?: number;
  maxSpeed?: number;
  /** Carve energy; unused for blast projectiles. */
  energy?: number;
  /** Fraction of energy kept after an impact (the projectile continues). */
  pierce?: number;
  shape?: CarveShapeName;
  /** Damages every component it touches once and keeps going (gauss, arc) instead of being stopped by it. */
  componentPierce?: boolean;
  /** Detonates as a boss blast on the first solid pixel or component (rocket). */
  blast?: BlastSpec;
  /** With `blast`: instead of detonating on impact the shell sticks and a fuse of `time` s runs; `range` px of flight ends it too (it lands where it is); at most `cap` live fused bombs (the oldest goes off early). */
  fuse?: { time: number; range: number; cap: number };
  /** Homing on a random solid boss pixel (arc). */
  steer?: { target: Combatant; lx: number; ly: number; turn: number; amp: number; freq: number; phase: number; wanderTime: number };
  /** Seconds the trail stays visible. */
  trailLife: number;
  /** Elemental tags: `onHit` runs for each landed hit (src/tags.ts). */
  tags?: TagSet;
}

/** Timed effects that live on the ship while an aux weapon's cooldown runs. */
export type EffectInit =
  | { kind: 'beam'; weapon: WeaponId; duration: number; tick: number; energy: number; pierce: number; shape: CarveShapeName; tags?: TagSet }
  | { kind: 'blades'; weapon: WeaponId; duration: number; tick: number; energy: number; shape: CarveShapeName; count: number; radius: number; spin: number; tags?: TagSet }
  | { kind: 'wave'; weapon: WeaponId; duration: number; tick: number; energy: number; shape: CarveShapeName; ox: number; oy: number; dir: number; arc: number; reach: number; samples: number; edge: number; tags?: TagSet };

type Effect = EffectInit & { age: number; acc: number; /** beam: where it ends this tick; blades: spin angle. */ endY: number; angle: number; /** wave: components already soaked (each once). */ seen: Set<object> };

interface Projectile extends ProjectileInit {
  vx: number;
  vy: number;
  alive: boolean;
  age: number;
  seen: Set<object>;
  trail: { x: number; y: number; age: number }[];
  /** Fused bomb: set once it landed. `target`/`lx`/`ly` is what it is stuck to (null: the open spot); `left` is the fuse time remaining. */
  stuck?: { target: Combatant | null; lx: number; ly: number; left: number };
  /** Fused bomb: flight left, px. */
  rangeLeft?: number;
}

/** Aux weapons (3 slots). */
const AUX: AuxDef[] = [
  {
    id: 'gauss',
    name: 'Gauss',
    slot: 'aux',
    desc: 'Slow shot that drills a long shaft through layers.',
    color: '#bff6ff',
    cooldown: (s) => s('gauss.cooldown', WEAPONS.gauss.cooldown),
    fire: (c) => {
      const g = WEAPONS.gauss;
      c.spawn({
        weapon: 'gauss',
        x: c.ship.x,
        y: c.ship.y - 26,
        angle: -Math.PI / 2,
        speed: g.speed,
        energy: c.stat('gauss.energy', g.energy) * c.power,
        pierce: g.pierce,
        shape: gaussShape(c.stat('gauss.width', 0)),
        tags: c.tags,
        componentPierce: true,
        trailLife: 0.35,
      });
    },
  },
  {
    id: 'rocket',
    name: 'Rocket',
    slot: 'aux',
    desc: 'Explodes on the first hit: a wide crater and shock.',
    color: '#ffa94d',
    supports: { radius: true },
    cooldown: (s) => s('rocket.cooldown', WEAPONS.rocket.cooldown),
    fire: (c) => {
      const r = WEAPONS.rocket;
      c.spawn({
        weapon: 'rocket',
        x: c.ship.x,
        y: c.ship.y - 24,
        angle: -Math.PI / 2,
        speed: r.speed,
        accel: r.accel,
        maxSpeed: r.maxSpeed,
        blast: { ...r.blast, radius: c.stat('rocket.radius', r.blast.radius), energy: c.stat('rocket.energy', r.blast.energy) * c.power, damage: r.blast.damage * c.power, coreDamage: r.blast.coreDamage * c.power },
        tags: c.tags,
        trailLife: 0.28,
      });
    },
  },
  {
    id: 'arc',
    name: 'Arc',
    slot: 'aux',
    desc: 'Homing pair that curves in to random spots.',
    color: '#7dff9a',
    supports: { count: true },
    cooldown: (s) => s('arc.cooldown', WEAPONS.arc.cooldown),
    fire: (c) => {
      const a = WEAPONS.arc;
      // One out each side at the same time, slightly up (more with upgrades, alternating sides); each picks its own random spot on the boss.
      const count = Math.max(1, Math.round(c.stat('arc.count', 2)));
      for (let n = 0; n < count; n++) {
        const side = n % 2 === 0 ? -1 : 1;
        const t = c.pickTarget();
        if (!t) continue;
        c.spawn({
          weapon: 'arc',
          x: c.ship.x + side * 14,
          y: c.ship.y - 4,
          tags: c.tags,
          angle: (side < 0 ? Math.PI + 0.35 : -0.35) + (Math.random() - 0.5) * 0.4,
          speed: a.speed,
          energy: a.energy * c.power,
          pierce: a.pierce,
          shape: a.shape,
          componentPierce: true,
          steer: {
            target: t.target,
            lx: t.lx,
            ly: t.ly,
            turn: a.turn,
            amp: a.wander.min + Math.random() * (a.wander.max - a.wander.min),
            freq: a.wander.freqMin + Math.random() * (a.wander.freqMax - a.wander.freqMin),
            phase: Math.random() * Math.PI * 2,
            wanderTime: a.wanderTime,
          },
          trailLife: 0.5,
        });
      }
    },
  },
  {
    id: 'lance',
    name: 'Lance',
    slot: 'aux',
    desc: 'Held beam: drills up through shields and layers.',
    color: '#ff6bd6',
    unlock: 'lance',
    unlockHint: 'Unlock the Warden ship.',
    requirement: 'Unlock the Warden (defeat the first boss)',
    cooldown: (s) => s('lance.cooldown', WEAPONS.lance.cooldown),
    fire: (c) => {
      const l = WEAPONS.lance;
      c.effect({ kind: 'beam', weapon: 'lance', duration: c.stat('lance.duration', l.duration), tick: l.tick, energy: c.stat('lance.energy', l.energy) * c.power, pierce: l.pierce, shape: l.shape, tags: c.tags });
    },
  },
  {
    id: 'blades',
    name: 'Blades',
    slot: 'aux',
    desc: 'Orbiting blades shred what they touch. Short range.',
    color: '#e0f0ff',
    unlock: 'blades',
    unlockHint: 'Unlock the Warden ship.',
    requirement: 'Unlock the Warden (defeat the first boss)',
    supports: { count: true, radius: true },
    cooldown: (s) => s('blades.cooldown', WEAPONS.blades.cooldown),
    fire: (c) => {
      const b = WEAPONS.blades;
      c.effect({ kind: 'blades', weapon: 'blades', duration: b.duration, tick: b.tick, energy: b.energy * c.power, shape: b.shape, count: Math.max(1, Math.round(c.stat('blades.count', b.count))), radius: c.stat('blades.radius', b.radius), spin: b.spin, tags: c.tags });
    },
  },
  {
    id: 'swarm',
    name: 'Swarm',
    slot: 'aux',
    desc: 'A cloud of small homing missiles, each a small bite.',
    color: '#ff78dc',
    unlock: 'swarm',
    unlockHint: 'Unlock the Wisp ship.',
    requirement: 'Unlock the Wisp (clear an Endless run)',
    supports: { count: true },
    countStep: 2,
    cooldown: (s) => s('swarm.cooldown', WEAPONS.swarm.cooldown),
    fire: (c) => {
      const w = WEAPONS.swarm;
      const count = Math.max(1, Math.round(c.stat('swarm.count', w.count)));
      for (let n = 0; n < count; n++) {
        const t = c.pickTarget();
        if (!t) continue;
        const fan = count === 1 ? 0 : (n / (count - 1) - 0.5) * 2; // -1..1 across the volley
        c.spawn({
          weapon: 'swarm',
          x: c.ship.x + fan * 12,
          y: c.ship.y - 14,
          tags: c.tags,
          angle: -Math.PI / 2 + fan * 1.1 + (Math.random() - 0.5) * 0.25,
          speed: w.speed,
          energy: w.energy * c.power,
          pierce: w.pierce,
          shape: w.shape,
          componentPierce: true,
          steer: { target: t.target, lx: t.lx, ly: t.ly, turn: w.turn, amp: 0.5, freq: 4 + Math.random() * 3, phase: Math.random() * Math.PI * 2, wanderTime: w.wanderTime },
          trailLife: 0.35,
        });
      }
    },
  },
  {
    id: 'flak',
    name: 'Energy Bomb',
    slot: 'aux',
    desc: 'One slow shell that sticks where it lands, then bursts in a wide blast about 2 s later (3 live at most).',
    color: '#ff5a4a',
    unlock: 'flak',
    unlockHint: 'Complete Fallen Peace with every chapter on gold.',
    requirement: 'Finish Fallen Peace, all chapters gold',
    supports: { radius: true },
    cooldown: (s) => s('flak.cooldown', WEAPONS.flak.cooldown),
    fire: (c) => {
      const r = WEAPONS.flak;
      c.spawn({
        weapon: 'flak',
        x: c.ship.x,
        y: c.ship.y - 24,
        angle: -Math.PI / 2,
        speed: r.speed,
        accel: r.accel,
        maxSpeed: r.maxSpeed,
        blast: { ...r.blast, radius: c.stat('flak.radius', r.blast.radius), energy: c.stat('flak.energy', r.blast.energy) * c.power, damage: r.blast.damage * c.power, coreDamage: r.blast.coreDamage * c.power },
        fuse: { time: c.stat('flak.fuse', r.fuse), range: r.range, cap: r.maxLive },
        tags: c.tags,
        trailLife: 0.2,
      });
    },
  },
  {
    id: 'mine',
    name: 'Mine Layer',
    slot: 'aux',
    desc: 'Drops a mine at your ship. It drifts up, arms, and bursts when an enemy is close.',
    color: '#ffb347',
    unlock: 'mine',
    unlockHint: 'Conquest, Empire Base: defeat 220 enemies in one run.',
    requirement: 'Conquest, Empire Base: defeat 220 enemies in one run',
    supports: { count: true, radius: true },
    icon: (g, x, y, r) => drawMineIcon(g, x, y, r),
    cooldown: (s) => s('mine.cooldown', WEAPONS.mine.cooldown),
    fire: (c) => {
      const m = WEAPONS.mine;
      const n = Math.max(1, Math.round(c.stat('mine.count', 1)));
      const arm = Math.max(0.1, c.stat('mine.arm', m.arm));
      for (let i = 0; i < n; i++) {
        const fan = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2; // -1..1 across the drop
        c.mine(
          {
            x: c.ship.x + fan * 26,
            y: c.ship.y - 8,
            drift: m.drift,
            arm,
            life: m.life,
            trigger: c.stat('mine.trigger', m.trigger),
            blast: { ...m.blast, radius: c.stat('mine.radius', m.blast.radius), energy: m.blast.energy * c.power, damage: m.blast.damage * c.power, coreDamage: m.blast.coreDamage * c.power },
            tags: c.tags,
          },
          m.maxLive + 2 * (n - 1),
        );
      }
    },
  },
  {
    id: 'drone',
    name: 'Drone',
    slot: 'aux',
    desc: 'A drone flies beside your ship for 12 s, firing small shots at the nearest enemy.',
    color: '#6ee7ff',
    unlock: 'drone',
    unlockHint: 'Conquest, Empire Base: find 3 hidden items in one run.',
    requirement: 'Conquest, Empire Base: find 3 hidden items in one run',
    supports: { count: true },
    icon: (g, x, y, r) => drawDroneIcon(g, x, y, r),
    // The cooldown is the whole cycle: the flight time plus the recharge (cards shorten the recharge only).
    cooldown: (s) => s('drone.duration', WEAPONS.drone.duration) + s('drone.cooldown', WEAPONS.drone.recharge),
    fire: (c) => {
      const d = WEAPONS.drone;
      c.drone({
        weapon: 'drone',
        count: Math.max(1, Math.round(c.stat('drone.count', 1))),
        duration: c.stat('drone.duration', d.duration),
        rate: c.stat('drone.fireRate', d.rate),
        energy: d.energy * c.power,
        speed: d.speed,
        pierce: d.pierce,
        offset: d.offset,
        tags: c.tags,
      });
    },
  },
  {
    id: 'shield',
    name: 'Shield Pulse',
    slot: 'aux',
    desc: 'A bubble around your ship for 2.5 s that stops enemy bullets. Not beams, blasts or collisions.',
    color: '#9fe0ff',
    unlock: 'shield-pulse',
    unlockHint: 'Conquest, Empire Base: destroy every gun of the capital ship.',
    requirement: 'Conquest, Empire Base: destroy every gun of the capital ship',
    supports: { radius: true },
    icon: (g, x, y, r) => drawShieldIcon(g, x, y, r),
    cooldown: (s) => s('shield.cooldown', WEAPONS.shield.cooldown),
    fire: (c) => {
      const w = WEAPONS.shield;
      c.shield({ weapon: 'shield', duration: c.stat('shield.duration', w.duration), radius: c.stat('shield.radius', w.radius) });
    },
  },
  {
    id: 'wave',
    name: 'Energy Wave',
    slot: 'aux',
    desc: 'Half-moon blast: strong up close, fading with distance.',
    color: '#8f9bff',
    stashed: true,
    unlock: 'energy-wave',
    unlockHint: 'Stashed for later.',
    cooldown: (s) => s('wave.cooldown', WEAPONS.wave.cooldown),
    fire: (c) => {
      const w = WEAPONS.wave;
      c.effect({
        kind: 'wave',
        weapon: 'wave',
        duration: w.duration,
        tick: w.tick,
        energy: w.energy * c.power,
        shape: w.shape,
        ox: c.ship.x,
        oy: c.ship.y - 18,
        dir: -Math.PI / 2,
        arc: (c.stat('wave.arc', w.arcDeg) * Math.PI) / 180,
        reach: c.stat('wave.reach', w.reach),
        samples: w.samples,
        edge: Math.min(1, c.stat('wave.edge', w.edge)),
        tags: c.tags,
      });
    },
  },
];

/** Main weapons (1 slot): the Game fires these. The chain gun is the original base gun, exactly as before. */
const MAIN: MainDef[] = [
  { id: 'chain', name: 'Chain gun', slot: 'main', desc: 'Steady fast stream of bullets.', color: '#ffd21f', ...MAINS.chain, bullet: { color: '#fff7a8', w: 3, h: 10 } },
  {
    id: 'scatter',
    name: 'Scatter',
    slot: 'main',
    desc: 'Wide shotgun: devastating up close, weak at range.',
    color: '#ff9f43',
    unlock: 'scatter',
    unlockHint: 'Unlock the Warden ship.',
    requirement: 'Unlock the Warden (defeat the first boss)',
    ...MAINS.scatter,
    bullet: { color: '#ffc27a', w: 3, h: 6 },
  },
  {
    id: 'needle',
    name: 'Needler',
    slot: 'main',
    desc: 'Very fast narrow rounds that bore thin deep tunnels.',
    color: '#c77dff',
    unlock: 'needle',
    unlockHint: 'Unlock the Wisp ship.',
    requirement: 'Unlock the Wisp (clear an Endless run)',
    ...MAINS.needle,
    bullet: { color: '#e9c8ff', w: 2, h: 14 },
  },
  {
    id: 'pulse',
    name: 'Pulse Orbs',
    slot: 'main',
    desc: 'Slow round pulse orbs, the enemy fire turned around.',
    color: '#ff2d9a',
    unlock: 'pulse-orb',
    unlockHint: 'Complete Fallen Peace with every chapter on gold.',
    requirement: 'Finish Fallen Peace, all chapters gold',
    ...MAINS.pulse,
    bullet: { color: '#ff2d9a', w: 12, h: 12, orb: 'aimed' },
  },
  {
    id: 'laser',
    name: 'Laser',
    slot: 'main',
    desc: 'Slow heavy bolt: bores a deep, narrow tunnel.',
    color: '#ff5a7a',
    stashed: true,
    unlock: 'laser',
    unlockHint: 'Stashed for later.',
    ...MAINS.laser,
    shapeTiers: ['laser', 'laser1', 'laser2', 'laser3'],
    bullet: { color: '#ffd9e0', w: 4, h: 34, glow: '255,70,110' },
  },
];

/** The weapon registry: every weapon, main and aux. To add one, add a def to `MAIN` or `AUX` above (DESIGN.md "Ships and weapon slots: as built"). */
export const WEAPON_DEFS: WeaponDef[] = [...MAIN, ...AUX];
export const MAIN_DEFS = MAIN;
export const AUX_DEFS = AUX;
export const DEFAULT_MAIN_ID = 'chain';
export const DEFAULT_AUX_IDS = ['gauss', 'rocket', 'arc'];

export function mainById(id: string): MainDef {
  return MAIN.find((d) => d.id === id) ?? MAIN[0];
}
export function auxById(id: string): AuxDef | undefined {
  return AUX.find((d) => d.id === id);
}

/**
 * The main gun's effective numbers: the ship's live base stats (the debug keys adjust them) times the main's multipliers,
 * then the held upgrades (`<id>.fireRate`, `<id>.damage`, `<id>.barrels`). The chain gun with no upgrades equals the base stats.
 */
export interface MainStats {
  damage: number;
  fireRate: number;
  projectiles: number;
}

export function effectiveMain(def: MainDef, base: { damage: number; fireRate: number }, stat: StatFn): MainStats {
  // The weapon's own stat first, then the generic main-slot stat (`main.*`), so a card works for whatever main gun is equipped.
  return {
    damage: stat(`${def.id}.damage`, base.damage * def.damageMul) * stat('main.damage', 1),
    fireRate: stat(`${def.id}.fireRate`, base.fireRate * def.rateMul) * stat('main.fireRate', 1),
    projectiles: Math.max(1, Math.round(def.projectiles + stat(`${def.id}.barrels`, 1) - 1 + stat('main.barrels', 0))),
  };
}

/** Anything the player's shots can hit: the boss's fight or a unit's fight (a `BossFight` satisfies this). */
export interface Combatant {
  readonly boss: Boss;
  readonly components: ComponentSystem;
}

/** What the weapons need from the game (kept narrow so game.ts stays small). */
export interface WeaponHost {
  ship: { x: number; y: number };
  /** Everything currently hittable (the live boss plus live units). Refreshed by the game once per frame. */
  targets(): readonly Combatant[];
  /** Live ship damage / default damage. */
  power(): number;
  /** Carve `target` at a screen point (core armor, juice and sound are the game's business). */
  carve(target: Combatant, x: number, y: number, energy: number, shape: CarveShapeName): HitResult | null;
  /** A weapon fired (sound). */
  onFire(id: WeaponId): void;
  /** Effective stat value (base + upgrades). */
  stat: StatFn;
  /** Tags a weapon's shots carry (`scopes` = the slot scopes that add stacks, e.g. 'aux', 'aux2'). */
  tags(weapon: string, scopes?: readonly string[]): TagSet | undefined;
  /** Remove the enemy bullets within `r` px of (x, y) (the Shield Pulse); returns where they were. Beams, hazards and contact are not bullets. */
  absorb(x: number, y: number, r: number): { x: number; y: number }[];
  /** The tag hook: a tagged projectile landed (see src/tags.ts). */
  onHit(tags: TagSet, x: number, y: number, energy: number, target: Combatant): void;
}

function solidAt(boss: Boss, x: number, y: number): boolean {
  const lx = Math.floor(x - boss.x);
  const ly = Math.floor(y - boss.y);
  for (let i = 0; i < boss.layers.length; i++) if (boss.isSolid(i, lx, ly)) return true;
  return false;
}

/** Cheap pre-check: is (x, y) inside the target's bounding box grown by `margin` px? */
export function nearBox(boss: Boss, x: number, y: number, margin: number): boolean {
  return x >= boss.x - margin && y >= boss.y - margin && x <= boss.x + boss.width + margin && y <= boss.y + boss.height + margin;
}

/**
 * Swept hit tests against several moving targets: during a frame every target moves from `prev` to its end position,
 * so each projectile sub-step tests against the positions interpolated for that sub-step (fast movers cannot be skipped).
 * `at(f)` places every target for fraction f of the frame; `end()` puts them back at their end positions.
 */
export class Sweep {
  readonly maxMove: number;
  private readonly t: readonly Combatant[];
  private readonly ex: number[];
  private readonly ey: number[];

  constructor(targets: readonly Combatant[], enabled = true) {
    this.t = targets;
    this.ex = targets.map((c) => c.boss.x);
    this.ey = targets.map((c) => c.boss.y);
    let m = 0;
    if (enabled) for (const c of targets) m = Math.max(m, Math.hypot(c.boss.x - c.boss.prevX, c.boss.y - c.boss.prevY));
    this.maxMove = m;
  }

  at(f: number): void {
    if (this.maxMove === 0) return;
    for (let i = 0; i < this.t.length; i++) {
      const b = this.t[i].boss;
      b.x = b.prevX + (this.ex[i] - b.prevX) * f;
      b.y = b.prevY + (this.ey[i] - b.prevY) * f;
    }
  }

  end(): void {
    for (let i = 0; i < this.t.length; i++) {
      this.t[i].boss.x = this.ex[i];
      this.t[i].boss.y = this.ey[i];
    }
  }
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Debug key label of aux slot i (I, O, L), shown in the debug text. */
export const AUX_KEYS = ['I', 'O', 'L'];

export class WeaponSystem {
  /** The equipped aux weapons, in slot order (at most 3). */
  defs: AuxDef[] = DEFAULT_AUX_IDS.map((id) => auxById(id)!);
  readonly enabled: Record<WeaponId, boolean> = {};
  private readonly timers: Record<WeaponId, number> = {};
  private projectiles: Projectile[] = [];
  private effects: Effect[] = [];
  private flashes: { x: number; y: number; color: string; t: number; max?: number; r?: number }[] = [];
  private readonly mines = new MineField();
  private readonly drones = new DroneBay();
  private readonly shield = new ShieldBubble();
  /** Seconds since the system was made: the blink and sweep phase of the drawn units. */
  private clock = 0;
  private readonly unitsHost: UnitsHost;

  constructor(private readonly host: WeaponHost) {
    this.unitsHost = {
      ship: host.ship,
      touching: (x, y, r) => this.touching(x, y, r),
      blast: (x, y, blast, tags) => this.blastAt(x, y, blast, tags),
      shoot: (p) => this.spawn(p),
      aimNear: (x, y) => this.aimNear(x, y),
      hasTargets: () => this.host.targets().some((t) => !t.boss.defeated),
      absorb: (x, y, r) => this.host.absorb(x, y, r),
      flash: (x, y, color, t, r) => this.flashes.push({ x, y, color, t, max: t, r }),
    };
    this.equip(this.defs);
  }

  /** Equip these aux weapons (slots in order, max 3). Timers, effects and projectiles restart. */
  equip(aux: readonly AuxDef[]): void {
    this.defs = aux.slice(0, 3);
    for (const d of this.defs) {
      this.enabled[d.id] ??= true;
      this.timers[d.id] = 0;
    }
    this.clearField();
  }

  /** Everything this system left in the field (shots, beams, mines, drones, the bubble). */
  private clearField(): void {
    this.projectiles = [];
    this.effects = [];
    this.mines.clear();
    this.drones.clear();
    this.shield.clear();
  }

  /** Debug: scale every cooldown (0.1 .. 10). */
  get cooldownScale(): number {
    return WEAPONS.cooldownScale;
  }
  set cooldownScale(v: number) {
    WEAPONS.cooldownScale = Math.min(10, Math.max(0.1, Math.round(v * 100) / 100));
  }

  reset(): void {
    this.clearField();
    this.flashes = [];
    for (const d of this.defs) this.timers[d.id] = 0;
  }

  /** Reset debug toggles and the cooldown scale (panel RESET ALL). */
  resetDebug(): void {
    for (const d of this.defs) this.enabled[d.id] = true;
    WEAPONS.cooldownScale = 1;
  }

  /**
   * The stat function of the weapon in aux slot `index`: its own `<weapon>.*` stats, then the slot-scoped ones on top (DESIGN.md "Upgrade rework").
   * `*.cooldown` is multiplied by `aux.cooldown` and `aux<n>.cooldown`, `*.radius` by `aux.radius` and `aux<n>.radius`, and `*.count` gains `aux.count` and `aux<n>.count`
   * (times the weapon's `countStep`). Damage is the other way: it scales the `power` the weapon fires with (`slotPower`).
   */
  slotStat(index: number, d: AuxDef): StatFn {
    const scopes = ['aux', `aux${index + 1}`];
    return (key, base) => {
      let v = this.host.stat(key, base);
      const kind = key.slice(key.lastIndexOf('.') + 1);
      if (kind === 'cooldown') for (const sc of scopes) v *= this.host.stat(`${sc}.cooldown`, 1);
      else if (kind === 'radius') for (const sc of scopes) v *= this.host.stat(`${sc}.radius`, 1);
      else if (kind === 'count') for (const sc of scopes) v += this.host.stat(`${sc}.count`, 0) * (d.countStep ?? 1);
      return v;
    };
  }

  /** The damage scale of slot `index`: the run's power times `aux.damage` and `aux<n>.damage`. */
  private slotPower(index: number): number {
    return this.host.power() * this.host.stat('aux.damage', 1) * this.host.stat(`aux${index + 1}.damage`, 1);
  }

  /** Effective cooldown of a weapon in seconds (upgrades and the debug scale applied). */
  cd(d: AuxDef): number {
    return d.cooldown(this.slotStat(Math.max(0, this.defs.indexOf(d)), d)) * WEAPONS.cooldownScale;
  }

  /** 0..1 progress of a weapon's cooldown (1 = fires now). */
  progress(id: WeaponId): number {
    const d = this.defs.find((w) => w.id === id)!;
    return Math.min(1, this.timers[id] / (this.cd(d)));
  }

  secondsLeft(id: WeaponId): number {
    const d = this.defs.find((w) => w.id === id)!;
    return Math.max(0, this.cd(d) - this.timers[id]);
  }

  /** Debug: fire every enabled weapon now (cooldowns restart). */
  fireAll(): void {
    for (const d of this.defs) if (this.enabled[d.id]) this.fire(d);
  }

  private fire(d: AuxDef): void {
    this.timers[d.id] = 0;
    this.host.onFire(d.id);
    const ship = this.host.ship;
    const slot = Math.max(0, this.defs.indexOf(d));
    this.flashes.push({ x: ship.x, y: ship.y - 22, color: d.color, t: 0.12 });
    d.fire({
      ship,
      power: this.slotPower(slot),
      stat: this.slotStat(slot, d),
      tags: this.host.tags(d.id, ['aux', `aux${slot + 1}`]),
      spawn: (p) => this.spawn(p),
      effect: (e) => this.effects.push({ ...e, age: 0, acc: 0, endY: 0, angle: 0, seen: new Set() }),
      pickTarget: () => this.pickTarget(),
      mine: (m, cap) => this.mines.lay(m, cap, this.unitsHost),
      drone: (dr) => this.drones.deploy(dr, this.unitsHost),
      shield: (sh) => this.shield.start(sh),
    });
  }

  private spawn(p: ProjectileInit): void {
    this.projectiles.push({
      ...p,
      vx: Math.cos(p.angle) * p.speed,
      vy: Math.sin(p.angle) * p.speed,
      alive: true,
      age: 0,
      seen: new Set(),
      trail: [{ x: p.x, y: p.y, age: 0 }],
    });
  }

  /** Random solid pixel (any layer) of a random live target, target-local. */
  private pickTarget(): { target: Combatant; lx: number; ly: number } | null {
    const all = this.host.targets().filter((t) => !t.boss.defeated);
    if (all.length === 0) return null;
    const first = Math.floor(Math.random() * all.length);
    for (let k = 0; k < all.length; k++) {
      const hit = pickSolid(all[(first + k) % all.length]);
      if (hit) return hit;
    }
    return null;
  }

  /** A random solid pixel of the live target nearest to (x, y), in screen coordinates (the drones' aim). */
  private aimNear(x: number, y: number): { x: number; y: number } | null {
    const all = this.host.targets().filter((t) => !t.boss.defeated);
    const d = (t: Combatant): number => Math.hypot(t.boss.x + t.boss.width / 2 - x, t.boss.y + t.boss.height / 2 - y);
    all.sort((a, b) => d(a) - d(b));
    for (const t of all) {
      const hit = pickSolid(t);
      if (hit) return { x: t.boss.x + hit.lx, y: t.boss.y + hit.ly };
    }
    return null;
  }

  /** Is a solid pixel or a component of any live target within `r` px of (x, y)? Samples the centre and two rings: the mine trigger. */
  private touching(x: number, y: number, r: number): boolean {
    for (const t of this.host.targets()) {
      if (t.boss.defeated || !nearBox(t.boss, x, y, r)) continue;
      for (let i = -1; i < 12; i++) {
        const rr = i < 0 ? 0 : i < 6 ? r * 0.5 : r;
        const a = (i * Math.PI * 2) / 6;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (t.components.componentAt(px, py) || solidAt(t.boss, px, py)) return true;
      }
    }
    return false;
  }

  /** A blast at (x, y) on every live target within its reach (a mine burst); the burn of its tags lands on the first target hit. */
  private blastAt(x: number, y: number, blast: BlastSpec, tags: TagSet | undefined): void {
    const radius = resolveBlast('turret', blast).radius;
    let hit: Combatant | undefined;
    for (const o of this.host.targets()) {
      if (o.boss.defeated || !nearBox(o.boss, x, y, radius)) continue;
      o.components.playerBlast(x, y, blast);
      hit ??= o;
    }
    if (tags && hit) this.host.onHit(tags, x, y, blast.energy ?? 0, hit);
  }

  /** `active` = the ship is alive and playing: timers only run then. */
  update(dt: number, active: boolean): void {
    if (active && this.host.targets().some((t) => !t.boss.defeated)) {
      for (const d of this.defs) {
        if (!this.enabled[d.id]) {
          this.timers[d.id] = 0;
          continue;
        }
        this.timers[d.id] += dt;
        if (this.timers[d.id] >= this.cd(d)) this.fire(d);
      }
    }
    this.clock += dt;
    this.updateEffects(dt);
    // The things left in the field only live while the ship is playing (equip and reset clear them).
    if (active) {
      this.mines.update(dt, this.unitsHost);
      this.drones.update(dt, this.unitsHost);
      this.shield.update(dt, this.unitsHost);
    }
    this.updateProjectiles(dt);
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
  }

  /** A throwaway projectile used to run one hit through `impact` (beam ticks and blade touches share the bullets' hit rules). */
  private probe(weapon: WeaponId, x: number, y: number, energy: number, pierce: number, shape: CarveShapeName, tags: TagSet | undefined): Projectile {
    return { weapon, x, y, angle: 0, speed: 0, energy, pierce, shape, componentPierce: true, tags, trailLife: 0, vx: 0, vy: 0, alive: true, age: 0, seen: new Set(), trail: [] };
  }

  private updateEffects(dt: number): void {
    if (this.effects.length === 0) return;
    const ship = this.host.ship;
    const targets = this.host.targets();
    for (const e of this.effects) {
      e.age += dt;
      e.acc += dt;
      if (e.kind === 'blades') e.angle += e.spin * dt;
      if (targets.every((t) => t.boss.defeated)) {
        e.age = e.duration; // nothing left to hit: the effect ends
        continue;
      }
      while (e.acc >= e.tick) {
        e.acc -= e.tick;
        if (e.kind === 'beam') this.beamTick(e, ship.x, ship.y - 26, targets);
        else if (e.kind === 'wave') this.waveTick(e, targets);
        else this.bladeTick(e, ship.x, ship.y, targets);
      }
    }
    this.effects = this.effects.filter((e) => e.age < e.duration);
  }

  /** One beam tick: march up from the ship (starting just below the lowest target box over the beam, for cost) until the beam's energy is spent. */
  private beamTick(e: Effect & { kind: 'beam' }, x: number, y0: number, targets: readonly Combatant[]): void {
    let start = y0;
    let any = false;
    for (const t of targets) {
      const b = t.boss;
      if (b.defeated || x < b.x - 12 || x > b.x + b.width + 12) continue;
      any = true;
      start = Math.min(start, b.y + b.height + 12);
    }
    e.endY = -20;
    if (!any) return;
    const p = this.probe(e.weapon, x, start, e.energy, e.pierce, e.shape, e.tags);
    for (let y = start; y > -20; y -= 5) {
      p.y = y;
      this.impact(p);
      if (!p.alive) {
        e.endY = y;
        return;
      }
    }
  }

  /** Wave radius now: eases out from the ship to `reach`. */
  private waveRadius(e: Effect & { kind: 'wave' }): number {
    const t = Math.min(1, e.age / e.duration);
    return e.reach * (1 - (1 - t) * (1 - t));
  }

  /** Energy factor of the wave at distance r: 1 at the ship easing linearly to `edge` at `reach`. */
  static waveFactor(r: number, reach: number, edge: number): number {
    return 1 - (1 - edge) * Math.min(1, Math.max(0, r / reach));
  }

  /** One wave tick: `samples` bites along the front arc, each with the energy of its distance from the origin; a bite that carves flashes. */
  private waveTick(e: Effect & { kind: 'wave' }, targets: readonly Combatant[]): void {
    const r = this.waveRadius(e);
    if (r < 4) return;
    const k = WeaponSystem.waveFactor(r, e.reach, e.edge);
    for (let i = 0; i < e.samples; i++) {
      const a = e.dir + (e.samples === 1 ? 0 : (i / (e.samples - 1) - 0.5) * e.arc);
      const x = e.ox + Math.cos(a) * r;
      const y = e.oy + Math.sin(a) * r;
      if (!targets.some((t) => !t.boss.defeated && nearBox(t.boss, x, y, 14))) continue;
      const energy = e.energy * k;
      const p = this.probe(e.weapon, x, y, energy, 0, e.shape, e.tags);
      p.seen = e.seen;
      this.impact(p);
      if (p.energy !== undefined && p.energy < energy - 0.5) this.flashes.push({ x, y, color: '#c8d0ff', t: 0.16, max: 0.16, r: 5 + 8 * k });
    }
  }

  /** One blade tick: each blade carves whatever it overlaps (a blade is a point probe at its orbit position). */
  private bladeTick(e: Effect & { kind: 'blades' }, sx: number, sy: number, targets: readonly Combatant[]): void {
    for (let i = 0; i < e.count; i++) {
      const a = e.angle + (i * Math.PI * 2) / e.count;
      const x = sx + Math.cos(a) * e.radius;
      const y = sy + Math.sin(a) * e.radius;
      if (!targets.some((t) => !t.boss.defeated && nearBox(t.boss, x, y, 12))) continue;
      this.impact(this.probe(e.weapon, x, y, e.energy, 0, e.shape, e.tags));
    }
  }

  private updateProjectiles(dt: number): void {
    const sweep = new Sweep(this.host.targets());
    const bossMove = sweep.maxMove;
    for (const p of this.projectiles) {
      p.age += dt;
      for (const t of p.trail) t.age += dt;
      if (p.alive && p.stuck) {
        this.tickFuse(p, dt);
      } else if (p.alive) {
        if (p.accel) {
          p.speed = Math.min(p.maxSpeed ?? p.speed, p.speed + p.accel * dt);
          p.vx = Math.cos(p.angle) * p.speed;
          p.vy = Math.sin(p.angle) * p.speed;
        }
        if (p.steer) this.steer(p, dt);
        const dist = p.speed * dt;
        const steps = Math.max(1, Math.ceil(dist), Math.ceil(bossMove));
        const sx = (p.vx * dt) / steps;
        const sy = (p.vy * dt) / steps;
        for (let i = 0; i < steps && p.alive; i++) {
          p.x += sx;
          p.y += sy;
          if (p.y < -40 || p.x < -40 || p.x > W + 40 || p.y > H + 40) {
            p.alive = false;
            break;
          }
          sweep.at((i + 1) / steps);
          this.impact(p);
          if (p.fuse && p.alive && !p.stuck) {
            p.rangeLeft = (p.rangeLeft ?? p.fuse.range) - Math.hypot(sx, sy);
            if (p.rangeLeft <= 0) this.land(p, null);
          }
        }
        sweep.end();
        p.trail.push({ x: p.x, y: p.y, age: 0 });
      }
      p.trail = p.trail.filter((t) => t.age < p.trailLife);
    }
    this.projectiles = this.projectiles.filter((p) => p.alive || p.trail.length > 0);
  }

  /** A fused bomb lands (stuck to `target`, or on the open spot): the fuse starts; over the live-bomb cap the oldest goes off now. */
  private land(p: Projectile, target: Combatant | null): void {
    p.y = Math.max(24, p.y);
    p.stuck = { target, lx: target ? p.x - target.boss.x : 0, ly: target ? p.y - target.boss.y : 0, left: p.fuse!.time };
    p.speed = 0;
    p.vx = 0;
    p.vy = 0;
    const live = this.projectiles.filter((q) => q.alive && q.stuck);
    if (!live.includes(p)) live.push(p);
    for (let i = 0; i < live.length - p.fuse!.cap; i++) this.detonate(live[i]);
  }

  private tickFuse(p: Projectile, dt: number): void {
    const s = p.stuck!;
    if (s.target) {
      if (s.target.boss.defeated) s.target = null;
      else {
        p.x = s.target.boss.x + s.lx;
        p.y = s.target.boss.y + s.ly;
      }
    }
    s.left -= dt;
    if (s.left <= 0) this.detonate(p);
  }

  /** The blast: every target within reach takes the shock (boss-only, never the player). */
  private detonate(p: Projectile): void {
    if (!p.alive || !p.blast) return;
    const radius = resolveBlast('turret', p.blast).radius;
    let hit: Combatant | undefined;
    for (const o of this.host.targets()) {
      if (o.boss.defeated || !nearBox(o.boss, p.x, p.y, radius)) continue;
      o.components.playerBlast(p.x, p.y, p.blast);
      hit ??= o;
    }
    if (p.tags && hit) this.host.onHit(p.tags, p.x, p.y, p.blast.energy ?? 0, hit);
    p.alive = false;
  }

  /** Arc missiles: turn toward the (target-local) point with wander; retarget when it is carved away; fizzle if nothing is left. */
  private steer(p: Projectile, dt: number): void {
    const s = p.steer!;
    if (s.target.boss.defeated || !solidAtLocal(s.target.boss, s.lx, s.ly)) {
      const t = this.pickTarget();
      if (!t) {
        p.alive = false;
        return;
      }
      s.target = t.target;
      s.lx = t.lx;
      s.ly = t.ly;
    }
    const boss = s.target.boss;
    const tx = boss.x + s.lx;
    const ty = boss.y + s.ly;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.hypot(dx, dy);
    const wander = p.age < s.wanderTime ? s.amp * Math.min(1, Math.max(0, (dist - 60) / 220)) : 0;
    const want = Math.atan2(dy, dx) + wander * Math.sin(p.age * s.freq + s.phase);
    const rate = s.turn * (1 + 5 * (1 - Math.min(1, dist / 160)) + (p.age > s.wanderTime ? 2 : 0));
    const turn = Math.max(-rate * dt, Math.min(rate * dt, wrapAngle(want - p.angle)));
    p.angle += turn;
    p.vx = Math.cos(p.angle) * p.speed;
    p.vy = Math.sin(p.angle) * p.speed;
    // Arrived: spend what is left right here.
    if (dist < 5) {
      const energy = p.energy ?? 0;
      this.host.carve(s.target, p.x, p.y, energy, p.shape ?? 'default');
      if (p.tags) this.host.onHit(p.tags, p.x, p.y, energy, s.target);
      p.alive = false;
    }
  }

  private impact(p: Projectile): void {
    const targets = this.host.targets();
    if (p.blast) {
      // The blast goes off at the first target solid or component under it; neighbours within reach take the shock too.
      for (const t of targets) {
        if (t.boss.defeated || !nearBox(t.boss, p.x, p.y, 12)) continue;
        if (t.components.componentAt(p.x, p.y) || solidAt(t.boss, p.x, p.y)) {
          if (p.fuse) {
            this.land(p, t);
            return;
          }
          const radius = resolveBlast('turret', p.blast).radius;
          for (const o of targets) if (!o.boss.defeated && nearBox(o.boss, p.x, p.y, radius)) o.components.playerBlast(p.x, p.y, p.blast);
          if (p.tags) this.host.onHit(p.tags, p.x, p.y, p.blast.energy ?? 0, t);
          p.alive = false;
          return;
        }
      }
      return;
    }
    let energy = p.energy ?? 0;
    if (p.componentPierce) {
      for (const t of targets) {
        if (t.boss.defeated || !nearBox(t.boss, p.x, p.y, 12)) continue;
        const soaked = t.components.hitThrough(p.x, p.y, energy, p.seen);
        if (soaked > 0 && p.tags) this.host.onHit(p.tags, p.x, p.y, energy, t);
        energy -= soaked;
      }
      if (energy < 1) {
        p.alive = false;
        return;
      }
    }
    const pierce = p.pierce ?? 0;
    const budget = energy * (1 - pierce);
    for (const t of targets) {
      if (t.boss.defeated || !nearBox(t.boss, p.x, p.y, 12)) continue;
      const res = this.host.carve(t, p.x, p.y, budget, p.shape ?? 'default');
      if (!res) continue;
      if (p.tags) this.host.onHit(p.tags, p.x, p.y, budget, t);
      if (res.core || res.carved === 0) {
        p.alive = false;
        return;
      }
      p.energy = energy - res.spent;
      if (p.energy < 1 || pierce === 0) p.alive = false;
      return;
    }
    p.energy = energy;
  }

  // --- drawing ------------------------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const m = f.max ?? 0.12;
      ctx.globalAlpha = Math.min(1, f.t / m);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, Math.max(0, (f.r ?? 10) + (m - f.t) * 90), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    for (const e of this.effects) this.drawEffect(ctx, e);
    this.mines.draw(ctx, this.clock);
    for (const p of this.projectiles) this.drawProjectile(ctx, p);
    this.drones.draw(ctx);
    this.shield.draw(ctx, this.host.ship, this.clock);
  }

  private drawEffect(ctx: CanvasRenderingContext2D, e: Effect): void {
    const ship = this.host.ship;
    const fade = Math.max(0, Math.min(1, (e.duration - e.age) / 0.2, e.age / 0.08));
    if (e.kind === 'wave') {
      this.drawWave(ctx, e);
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (e.kind === 'beam') {
      const x = ship.x;
      const y0 = ship.y - 26;
      const w = 5 + Math.sin(e.age * 60) * 1.5;
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = '#ff6bd6';
      ctx.fillRect(x - w, e.endY, w * 2, y0 - e.endY);
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#ffd6f4';
      ctx.fillRect(x - 2, e.endY, 4, y0 - e.endY);
      ctx.beginPath();
      ctx.arc(x, e.endY, 9 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let i = 0; i < e.count; i++) {
        const a = e.angle + (i * Math.PI * 2) / e.count;
        const x = ship.x + Math.cos(a) * e.radius;
        const y = ship.y + Math.sin(a) * e.radius;
        ctx.globalAlpha = 0.9 * fade;
        ctx.strokeStyle = 'rgba(224,240,255,0.35)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, e.radius, a - 0.5, a);
        ctx.stroke();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + e.age * 12);
        ctx.fillStyle = '#e0f0ff';
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(4, 0);
        ctx.lineTo(0, 11);
        ctx.lineTo(-4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** The crescent: a filled half-moon at the front radius (thick in the middle, tapering to the tips), fainter crescents trailing behind it, a soft fade at the end. */
  private drawWave(ctx: CanvasRenderingContext2D, e: Effect & { kind: 'wave' }): void {
    const r = this.waveRadius(e);
    if (r < 3) return;
    const t = Math.min(1, e.age / e.duration);
    const soft = Math.min(1, (1 - t) / 0.35); // fade out over the last 35%
    const strength = WeaponSystem.waveFactor(r, e.reach, e.edge);
    const a0 = e.dir - e.arc / 2;
    const a1 = e.dir + e.arc / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const crescent = (rad: number, thick: number, alpha: number, color: string): void => {
      if (rad < 2) return;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(e.ox, e.oy, rad, a0, a1);
      ctx.quadraticCurveTo(e.ox + Math.cos(e.dir) * (rad - thick * 2), e.oy + Math.sin(e.dir) * (rad - thick * 2), e.ox + Math.cos(a0) * rad, e.oy + Math.sin(a0) * rad);
      ctx.fill();
    };
    const thick = Math.min(10 + 12 * strength, r * 0.45); // never thicker than the radius lets it be a crescent
    for (let k = 4; k >= 1; k--) crescent(r - k * 11, thick * (1 - k * 0.16), 0.16 * soft * (1 - k * 0.2), '#8f9bff');
    crescent(r, thick * 1.3, 0.5 * soft * (0.45 + 0.55 * strength), '#8f9bff');
    crescent(r, thick * 0.8, 0.9 * soft * (0.5 + 0.5 * strength), '#dfe4ff');
    ctx.restore();
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const col = p.weapon === 'drone' ? '110,231,255' : p.weapon === 'gauss' ? '191,246,255' : p.weapon === 'flak' ? '255,90,74' : p.weapon === 'rocket' ? '255,169,77' : p.weapon === 'swarm' ? '255,120,220' : '125,255,154';
    const width = p.weapon === 'gauss' ? 7 : p.weapon === 'rocket' ? 5 : p.weapon === 'swarm' ? 2.5 : 4;
    ctx.globalCompositeOperation = 'lighter';
    // Trail: segments fade and thin with age.
    for (let i = 1; i < p.trail.length; i++) {
      const a = p.trail[i - 1];
      const b = p.trail[i];
      const k = Math.max(0, 1 - b.age / p.trailLife);
      ctx.strokeStyle = `rgba(${col},${0.55 * k})`;
      ctx.lineWidth = Math.max(1, width * k);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (p.weapon === 'gauss') {
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`;
        ctx.lineWidth = Math.max(1, 2.5 * k);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (p.alive) {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle + Math.PI / 2);
      if (p.weapon === 'gauss') {
        ctx.fillStyle = 'rgba(120,220,255,0.35)';
        ctx.fillRect(-6, -34, 12, 48);
        ctx.fillStyle = '#e8fcff';
        ctx.fillRect(-2, -30, 4, 40);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-1, -34, 2, 8);
      } else if (p.weapon === 'flak') {
        // The Energy Bomb: a red orb inside a dashed ring showing the blast. Once stuck, the fuse runs: the ring shrinks onto the orb and pulses faster.
        ctx.rotate(-(p.angle + Math.PI / 2));
        const br = p.blast?.radius ?? 56;
        const k = p.stuck && p.fuse ? Math.max(0, p.stuck.left / p.fuse.time) : 1;
        const pulse = p.stuck ? 0.5 + 0.5 * Math.sin(p.age * (8 + 22 * (1 - k))) : 0;
        ctx.strokeStyle = `rgba(255,${90 + 120 * pulse | 0},74,${0.45 + 0.4 * pulse})`;
        ctx.lineWidth = 2 + 2 * pulse;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, p.stuck ? br * (0.35 + 0.65 * k) : br, 0, Math.PI * 2);
        ctx.stroke();
        if (p.stuck) {
          ctx.setLineDash([]);
          ctx.strokeStyle = 'rgba(255,90,74,0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, br, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,90,74,${0.08 + 0.12 * pulse})`;
          ctx.fill();
        }
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,90,74,0.3)';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff5a4a';
        ctx.strokeStyle = '#ffe3dc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (p.weapon === 'rocket') {
        // Exhaust flame, then the body.
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath();
        ctx.moveTo(-3, 8);
        ctx.lineTo(3, 8);
        ctx.lineTo(0, 18 + Math.random() * 9);
        ctx.fill();
        ctx.fillStyle = '#ff6a2e';
        ctx.beginPath();
        ctx.moveTo(-2, 8);
        ctx.lineTo(2, 8);
        ctx.lineTo(0, 13 + Math.random() * 5);
        ctx.fill();
        ctx.fillStyle = '#d9dee9';
        ctx.fillRect(-3, -9, 6, 17);
        ctx.fillStyle = '#ff5a3c';
        ctx.beginPath();
        ctx.moveTo(-3, -9);
        ctx.lineTo(3, -9);
        ctx.lineTo(0, -15);
        ctx.fill();
        ctx.fillStyle = '#9aa3b8';
        ctx.fillRect(-6, 3, 3, 6);
        ctx.fillRect(3, 3, 3, 6);
      } else if (p.weapon === 'drone') {
        ctx.fillStyle = 'rgba(110,231,255,0.4)';
        ctx.fillRect(-3, -8, 6, 16);
        ctx.fillStyle = '#eafcff';
        ctx.fillRect(-1, -8, 2, 12);
      } else {
        if (p.weapon === 'swarm') ctx.scale(0.55, 0.55);
        ctx.fillStyle = p.weapon === 'swarm' ? 'rgba(255,120,220,0.4)' : 'rgba(125,255,154,0.35)';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e6ffe9';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(4, 5);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function solidAtLocal(boss: Boss, lx: number, ly: number): boolean {
  for (let i = 0; i < boss.layers.length; i++) if (boss.isSolid(i, Math.floor(lx), Math.floor(ly))) return true;
  return false;
}

/** A random solid pixel (any layer) of one target, target-local; null when it has none left. */
function pickSolid(target: Combatant): { target: Combatant; lx: number; ly: number } | null {
  const boss = target.boss;
  for (let i = 0; i < 400; i++) {
    const lx = Math.floor(Math.random() * boss.width);
    const ly = Math.floor(Math.random() * boss.height);
    for (let li = 0; li < boss.layers.length; li++) if (boss.isSolid(li, lx, ly)) return { target, lx, ly };
  }
  // Almost nothing left: scan for any solid pixel.
  for (let ly = 0; ly < boss.height; ly++) {
    for (let lx = 0; lx < boss.width; lx++) {
      for (let li = 0; li < boss.layers.length; li++) if (boss.isSolid(li, lx, ly)) return { target, lx, ly };
    }
  }
  return null;
}

// --- builder icons of the new aux weapons (drawn inside the builder's ring) -------------------------------

function drawMineIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  g.strokeStyle = '#ffb347';
  g.fillStyle = '#2b3140';
  g.lineWidth = Math.max(2, r * 0.1);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.beginPath();
    g.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
    g.lineTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66);
    g.stroke();
  }
  g.beginPath();
  g.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#ff5a3c';
  g.beginPath();
  g.arc(0, 0, r * 0.15, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawDroneIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#9fe9ff';
  g.strokeStyle = '#0b2a36';
  g.lineWidth = Math.max(1.5, r * 0.07);
  g.beginPath();
  g.moveTo(0, -r * 0.62);
  g.lineTo(r * 0.5, r * 0.28);
  g.lineTo(0, r * 0.52);
  g.lineTo(-r * 0.5, r * 0.28);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#0b2a36';
  g.fillRect(-r * 0.12, -r * 0.2, r * 0.24, r * 0.32);
  g.fillStyle = '#ffd21f';
  g.fillRect(-r * 0.06, r * 0.52, r * 0.12, r * 0.18);
  g.restore();
}

function drawShieldIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  g.strokeStyle = '#bff3ff';
  g.lineWidth = Math.max(2, r * 0.12);
  g.beginPath();
  g.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(110, 231, 255, 0.25)';
  g.fill();
  g.fillStyle = '#e8fbff';
  g.beginPath();
  g.moveTo(0, -r * 0.3);
  g.lineTo(r * 0.2, r * 0.22);
  g.lineTo(-r * 0.2, r * 0.22);
  g.closePath();
  g.fill();
  g.restore();
}
