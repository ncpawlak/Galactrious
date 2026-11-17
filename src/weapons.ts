import type { Boss, HitResult } from './boss';
import type { CarveShapeName } from './carveShapes';
import { resolveBlast, type BlastSpec, type ComponentSystem } from './components';
import { H, MAINS, W, WEAPONS } from './config';
import type { TagSet } from './tags';
import { gaussShape } from './upgrades/stats';

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
}

/** An auto-firing aux weapon: fires on its own timer. */
export interface AuxDef extends WeaponBase {
  slot: 'aux';
  /** Cooldown in seconds with upgrades applied (before `WEAPONS.cooldownScale`). */
  cooldown: (stat: StatFn) => number;
  /** Spawn this weapon's projectiles. */
  fire(c: FireContext): void;
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
  bullet: { color: string; w: number; h: number; /** Charged-beam look: additive glow colour as 'r,g,b' (muzzle glow-in, streak, impact flare). */ glow?: string };
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
    cooldown: (s) => s('lance.cooldown', WEAPONS.lance.cooldown),
    fire: (c) => {
      const l = WEAPONS.lance;
      c.effect({ kind: 'beam', weapon: 'lance', duration: l.duration, tick: l.tick, energy: c.stat('lance.energy', l.energy) * c.power, pierce: l.pierce, shape: l.shape, tags: c.tags });
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
    cooldown: (s) => s('blades.cooldown', WEAPONS.blades.cooldown),
    fire: (c) => {
      const b = WEAPONS.blades;
      c.effect({ kind: 'blades', weapon: 'blades', duration: b.duration, tick: b.tick, energy: b.energy * c.power, shape: b.shape, count: Math.max(1, Math.round(c.stat('blades.count', b.count))), radius: b.radius, spin: b.spin, tags: c.tags });
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
    id: 'wave',
    name: 'Energy Wave',
    slot: 'aux',
    desc: 'Half-moon blast: strong up close, fading with distance.',
    color: '#8f9bff',
    unlock: 'energy-wave',
    unlockHint: 'Complete Fallen Peace with gold.',
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
    ...MAINS.needle,
    bullet: { color: '#e9c8ff', w: 2, h: 14 },
  },
  {
    id: 'laser',
    name: 'Laser',
    slot: 'main',
    desc: 'Slow heavy bolt: bores a deep, narrow tunnel.',
    color: '#ff5a7a',
    unlock: 'laser',
    unlockHint: 'Complete Fallen Peace with gold.',
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
  return {
    damage: stat(`${def.id}.damage`, base.damage * def.damageMul),
    fireRate: stat(`${def.id}.fireRate`, base.fireRate * def.rateMul),
    projectiles: Math.max(1, Math.round(def.projectiles + stat(`${def.id}.barrels`, 1) - 1)),
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
  /** Tags a weapon's shots carry. */
  tags(weapon: string): TagSet | undefined;
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

  constructor(private readonly host: WeaponHost) {
    this.equip(this.defs);
  }

  /** Equip these aux weapons (slots in order, max 3). Timers, effects and projectiles restart. */
  equip(aux: readonly AuxDef[]): void {
    this.defs = aux.slice(0, 3);
    for (const d of this.defs) {
      this.enabled[d.id] ??= true;
      this.timers[d.id] = 0;
    }
    this.projectiles = [];
    this.effects = [];
  }

  /** Debug: scale every cooldown (0.1 .. 10). */
  get cooldownScale(): number {
    return WEAPONS.cooldownScale;
  }
  set cooldownScale(v: number) {
    WEAPONS.cooldownScale = Math.min(10, Math.max(0.1, Math.round(v * 100) / 100));
  }

  reset(): void {
    this.projectiles = [];
    this.effects = [];
    this.flashes = [];
    for (const d of this.defs) this.timers[d.id] = 0;
  }

  /** Reset debug toggles and the cooldown scale (panel RESET ALL). */
  resetDebug(): void {
    for (const d of this.defs) this.enabled[d.id] = true;
    WEAPONS.cooldownScale = 1;
  }

  /** Effective cooldown of a weapon in seconds (upgrades and the debug scale applied). */
  cd(d: AuxDef): number {
    return d.cooldown(this.host.stat) * WEAPONS.cooldownScale;
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
    this.flashes.push({ x: ship.x, y: ship.y - 22, color: d.color, t: 0.12 });
    d.fire({
      ship,
      power: this.host.power(),
      stat: this.host.stat,
      tags: this.host.tags(d.id),
      spawn: (p) => this.spawn(p),
      effect: (e) => this.effects.push({ ...e, age: 0, acc: 0, endY: 0, angle: 0, seen: new Set() }),
      pickTarget: () => this.pickTarget(),
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
      const target = all[(first + k) % all.length];
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
    }
    return null;
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
    this.updateEffects(dt);
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
      if (p.alive) {
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
        }
        sweep.end();
        p.trail.push({ x: p.x, y: p.y, age: 0 });
      }
      p.trail = p.trail.filter((t) => t.age < p.trailLife);
    }
    this.projectiles = this.projectiles.filter((p) => p.alive || p.trail.length > 0);
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
    for (const p of this.projectiles) this.drawProjectile(ctx, p);
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
    const col = p.weapon === 'gauss' ? '191,246,255' : p.weapon === 'rocket' ? '255,169,77' : p.weapon === 'swarm' ? '255,120,220' : '125,255,154';
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
