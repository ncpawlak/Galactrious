import type { Boss, HitResult } from './boss';
import type { CarveShapeName } from './carveShapes';
import { resolveBlast, type BlastSpec, type ComponentSystem } from './components';
import { H, W, WEAPONS } from './config';
import type { TagSet } from './tags';
import { gaussShape } from './upgrades/stats';

/**
 * Auto-firing player weapons (issue #12). Each weapon is DATA (`WeaponDef`): id, name, cooldown and a `fire`
 * function that spawns projectiles described by plain fields (energy, pierce, carve shape, blast, steering).
 * Upgrades later are modifiers on these definitions (copy a def and change cooldown / counts / angles) and on the
 * base gun; nothing here is special-cased by weapon id except drawing. All weapons are boss-only, like blasts.
 * The base chain gun still fires from `Game` but is described here too (`CHAIN_GUN`, `effectiveChain`), so upgrades modify it the same way.
 */

export type WeaponId = 'gauss' | 'rocket' | 'arc';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Debug key label, for the HUD and overlay. */
  key: string;
  color: string;
  /** Cooldown in seconds with upgrades applied (before `WEAPONS.cooldownScale`). */
  cooldown: (stat: StatFn) => number;
  /** Spawn this weapon's projectiles. */
  fire(c: FireContext): void;
}

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

interface Projectile extends ProjectileInit {
  vx: number;
  vy: number;
  alive: boolean;
  age: number;
  seen: Set<object>;
  trail: { x: number; y: number; age: number }[];
}

export const WEAPON_DEFS: WeaponDef[] = [
  {
    id: 'gauss',
    name: 'Gauss',
    key: 'I',
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
    key: 'O',
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
    key: 'L',
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
];

/**
 * The base chain gun in weapon format (enough for upgrades): its stats are the live `ShipStats` (debug keys adjust them),
 * and `effectiveChain` layers the held upgrades on top (`chain.fireRate`, `chain.damage`, `chain.barrels`). Its shots carry
 * the tags of the `chain.tag.*` stats. With no upgrades the result equals the base stats.
 */
export const CHAIN_GUN = { id: 'chain', name: 'Chain gun' } as const;

export interface ChainStats {
  damage: number;
  fireRate: number;
  projectiles: number;
  spreadDeg: number;
  pierce: number;
}

export function effectiveChain(base: ChainStats, stat: StatFn): ChainStats {
  return {
    damage: stat('chain.damage', base.damage),
    fireRate: stat('chain.fireRate', base.fireRate),
    projectiles: Math.max(1, Math.round(base.projectiles + stat('chain.barrels', 1) - 1)),
    spreadDeg: base.spreadDeg,
    pierce: base.pierce,
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

export class WeaponSystem {
  readonly defs = WEAPON_DEFS;
  readonly enabled: Record<WeaponId, boolean> = { gauss: true, rocket: true, arc: true };
  private readonly timers: Record<WeaponId, number> = { gauss: 0, rocket: 0, arc: 0 };
  private projectiles: Projectile[] = [];
  private flashes: { x: number; y: number; color: string; t: number }[] = [];

  constructor(private readonly host: WeaponHost) {}

  /** Debug: scale every cooldown (0.1 .. 10). */
  get cooldownScale(): number {
    return WEAPONS.cooldownScale;
  }
  set cooldownScale(v: number) {
    WEAPONS.cooldownScale = Math.min(10, Math.max(0.1, Math.round(v * 100) / 100));
  }

  reset(): void {
    this.projectiles = [];
    this.flashes = [];
    for (const d of this.defs) this.timers[d.id] = 0;
  }

  /** Reset debug toggles and the cooldown scale (panel RESET ALL). */
  resetDebug(): void {
    for (const d of this.defs) this.enabled[d.id] = true;
    WEAPONS.cooldownScale = 1;
  }

  /** Effective cooldown of a weapon in seconds (upgrades and the debug scale applied). */
  cd(d: WeaponDef): number {
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

  private fire(d: WeaponDef): void {
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
    this.updateProjectiles(dt);
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
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
      ctx.globalAlpha = Math.min(1, f.t / 0.12);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 10 + (0.12 - f.t) * 90, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    for (const p of this.projectiles) this.drawProjectile(ctx, p);
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const col = p.weapon === 'gauss' ? '191,246,255' : p.weapon === 'rocket' ? '255,169,77' : '125,255,154';
    const width = p.weapon === 'gauss' ? 7 : p.weapon === 'rocket' ? 5 : 4;
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
        ctx.fillStyle = 'rgba(125,255,154,0.35)';
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
