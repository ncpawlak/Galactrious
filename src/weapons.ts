import type { Boss, HitResult } from './boss';
import type { CarveShapeName } from './carveShapes';
import type { BlastSpec, ComponentSystem } from './components';
import { H, W, WEAPONS } from './config';

/**
 * Auto-firing player weapons (issue #12). Each weapon is DATA (`WeaponDef`): id, name, cooldown and a `fire`
 * function that spawns projectiles described by plain fields (energy, pierce, carve shape, blast, steering).
 * Upgrades later are modifiers on these definitions (copy a def and change cooldown / counts / angles) and on the
 * base gun; nothing here is special-cased by weapon id except drawing. All weapons are boss-only, like blasts.
 * The base machine gun stays in `Game` (it is the pre-existing bullet path and is not expressed in this format).
 */

export type WeaponId = 'gauss' | 'rocket' | 'arc';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Debug key label, for the HUD and overlay. */
  key: string;
  color: string;
  /** Base cooldown in seconds (before `WEAPONS.cooldownScale`). */
  cooldown: () => number;
  /** Spawn this weapon's projectiles. */
  fire(c: FireContext): void;
}

/** What a weapon's `fire` gets: the ship, the damage scale, and a spawner. */
export interface FireContext {
  ship: { x: number; y: number };
  /** Live ship damage / default damage: the debug damage keys scale weapon energy through this. */
  power: number;
  spawn(p: ProjectileInit): void;
  /** A random solid pixel of the boss in boss-local coordinates, or null when nothing is left. */
  pickTarget(): { lx: number; ly: number } | null;
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
  steer?: { lx: number; ly: number; turn: number; amp: number; freq: number; phase: number; wanderTime: number };
  /** Seconds the trail stays visible. */
  trailLife: number;
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
    cooldown: () => WEAPONS.gauss.cooldown,
    fire: (c) => {
      const g = WEAPONS.gauss;
      c.spawn({
        weapon: 'gauss',
        x: c.ship.x,
        y: c.ship.y - 26,
        angle: -Math.PI / 2,
        speed: g.speed,
        energy: g.energy * c.power,
        pierce: g.pierce,
        shape: g.shape,
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
    cooldown: () => WEAPONS.rocket.cooldown,
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
        blast: { ...r.blast, energy: r.blast.energy * c.power, damage: r.blast.damage * c.power, coreDamage: r.blast.coreDamage * c.power },
        trailLife: 0.28,
      });
    },
  },
  {
    id: 'arc',
    name: 'Arc',
    key: 'L',
    color: '#7dff9a',
    cooldown: () => WEAPONS.arc.cooldown,
    fire: (c) => {
      const a = WEAPONS.arc;
      // One out each side at the same time, slightly up; each picks its own random spot on the boss.
      for (const side of [-1, 1]) {
        const t = c.pickTarget();
        if (!t) continue;
        c.spawn({
          weapon: 'arc',
          x: c.ship.x + side * 14,
          y: c.ship.y - 4,
          angle: (side < 0 ? Math.PI + 0.35 : -0.35) + (Math.random() - 0.5) * 0.4,
          speed: a.speed,
          energy: a.energy * c.power,
          pierce: a.pierce,
          shape: a.shape,
          componentPierce: true,
          steer: {
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

/** What the weapons need from the game (kept narrow so game.ts stays small). */
export interface WeaponHost {
  ship: { x: number; y: number };
  boss(): Boss;
  components(): ComponentSystem;
  /** Live ship damage / default damage. */
  power(): number;
  /** Carve at a screen point (core armor, juice and sound are the game's business). */
  carve(x: number, y: number, energy: number, shape: CarveShapeName): HitResult | null;
  /** A weapon fired (sound). */
  onFire(id: WeaponId): void;
}

function solidAt(boss: Boss, x: number, y: number): boolean {
  const lx = Math.floor(x - boss.x);
  const ly = Math.floor(y - boss.y);
  for (let i = 0; i < boss.layers.length; i++) if (boss.isSolid(i, lx, ly)) return true;
  return false;
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

  /** 0..1 progress of a weapon's cooldown (1 = fires now). */
  progress(id: WeaponId): number {
    const d = this.defs.find((w) => w.id === id)!;
    return Math.min(1, this.timers[id] / (d.cooldown() * WEAPONS.cooldownScale));
  }

  secondsLeft(id: WeaponId): number {
    const d = this.defs.find((w) => w.id === id)!;
    return Math.max(0, d.cooldown() * WEAPONS.cooldownScale - this.timers[id]);
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

  /** Random solid pixel of the boss (any layer), boss-local. */
  private pickTarget(): { lx: number; ly: number } | null {
    const boss = this.host.boss();
    if (boss.defeated) return null;
    for (let i = 0; i < 400; i++) {
      const lx = Math.floor(Math.random() * boss.width);
      const ly = Math.floor(Math.random() * boss.height);
      for (let li = 0; li < boss.layers.length; li++) if (boss.isSolid(li, lx, ly)) return { lx, ly };
    }
    // Almost nothing left: scan for any solid pixel.
    for (let ly = 0; ly < boss.height; ly++) {
      for (let lx = 0; lx < boss.width; lx++) {
        for (let li = 0; li < boss.layers.length; li++) if (boss.isSolid(li, lx, ly)) return { lx, ly };
      }
    }
    return null;
  }

  /** `active` = the ship is alive and playing: timers only run then. */
  update(dt: number, active: boolean): void {
    if (active && !this.host.boss().defeated) {
      for (const d of this.defs) {
        if (!this.enabled[d.id]) {
          this.timers[d.id] = 0;
          continue;
        }
        this.timers[d.id] += dt;
        if (this.timers[d.id] >= d.cooldown() * WEAPONS.cooldownScale) this.fire(d);
      }
    }
    this.updateProjectiles(dt);
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
  }

  private updateProjectiles(dt: number): void {
    const boss = this.host.boss();
    const endX = boss.x;
    const endY = boss.y;
    const mx = endX - boss.prevX;
    const my = endY - boss.prevY;
    const bossMove = Math.hypot(mx, my);
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
          const f = (i + 1) / steps;
          boss.x = boss.prevX + mx * f;
          boss.y = boss.prevY + my * f;
          this.impact(p);
        }
        boss.x = endX;
        boss.y = endY;
        p.trail.push({ x: p.x, y: p.y, age: 0 });
      }
      p.trail = p.trail.filter((t) => t.age < p.trailLife);
    }
    this.projectiles = this.projectiles.filter((p) => p.alive || p.trail.length > 0);
  }

  /** Arc missiles: turn toward the (boss-local) target with wander; retarget when it is carved away; fizzle if the boss is gone. */
  private steer(p: Projectile, dt: number): void {
    const s = p.steer!;
    const boss = this.host.boss();
    if (boss.defeated) {
      p.alive = false;
      return;
    }
    if (!solidAtLocal(boss, s.lx, s.ly)) {
      const t = this.pickTarget();
      if (!t) {
        p.alive = false;
        return;
      }
      s.lx = t.lx;
      s.ly = t.ly;
    }
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
      this.host.carve(p.x, p.y, energy, p.shape ?? 'default');
      p.alive = false;
    }
  }

  private impact(p: Projectile): void {
    const boss = this.host.boss();
    const comps = this.host.components();
    if (p.blast) {
      if (comps.componentAt(p.x, p.y) || solidAt(boss, p.x, p.y)) {
        comps.playerBlast(p.x, p.y, p.blast);
        p.alive = false;
      }
      return;
    }
    let energy = p.energy ?? 0;
    if (p.componentPierce) {
      energy -= comps.hitThrough(p.x, p.y, energy, p.seen);
      if (energy < 1) {
        p.alive = false;
        return;
      }
    }
    const pierce = p.pierce ?? 0;
    const budget = energy * (1 - pierce);
    const res = this.host.carve(p.x, p.y, budget, p.shape ?? 'default');
    if (!res) {
      p.energy = energy;
      return;
    }
    if (res.core || res.carved === 0) {
      p.alive = false;
      return;
    }
    p.energy = energy - res.spent;
    if (p.energy < 1 || pierce === 0) p.alive = false;
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
