import { H, TUNING, W } from './config';

/** A boss projectile. Velocity in px/s. */
export interface EnemyBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  alive: boolean;
}

export interface AttackContext {
  /** Where the boss fires from. */
  origin: { x: number; y: number };
  /** Current player position. */
  target: { x: number; y: number };
  /** Spawn a bullet. */
  spawn(b: Omit<EnemyBullet, 'alive'>): void;
}

/**
 * An attack pattern is a small self-contained definition: `interval` seconds between uses, and
 * `fire` spawns bullets. New attack types (sweeps, formations, bombs, AoE: issue #25) are added
 * by appending to PATTERNS; the scheduler below needs no changes.
 */
export interface AttackPattern {
  name: string;
  interval: number;
  fire(ctx: AttackContext): void;
}

const aimedShot: AttackPattern = {
  name: 'aimed',
  interval: TUNING.attacks.aimed.interval,
  fire({ origin, target, spawn }) {
    const { speed, damage } = TUNING.attacks.aimed;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const len = Math.hypot(dx, dy) || 1;
    spawn({ x: origin.x, y: origin.y, vx: (dx / len) * speed, vy: (dy / len) * speed, damage });
  },
};

const PATTERNS: AttackPattern[] = [aimedShot];

/** Owns enemy bullets and pattern timers. Knows nothing about the player's health. */
export class Attacks {
  enabled = true;
  bullets: EnemyBullet[] = [];
  private timers: number[] = PATTERNS.map((p) => p.interval);

  reset(): void {
    this.bullets = [];
    this.timers = PATTERNS.map((p) => p.interval);
  }

  update(dt: number, origin: { x: number; y: number }, target: { x: number; y: number }, firing: boolean): void {
    if (this.enabled && firing) {
      const ctx: AttackContext = { origin, target, spawn: (b) => this.bullets.push({ ...b, alive: true }) };
      PATTERNS.forEach((p, i) => {
        this.timers[i] -= dt;
        if (this.timers[i] <= 0) {
          this.timers[i] += p.interval;
          p.fire(ctx);
        }
      });
    }
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) b.alive = false;
    }
    this.bullets = this.bullets.filter((b) => b.alive);
  }

  /** Remove and return the total damage of bullets touching the player hitbox (circle). */
  collect(x: number, y: number, r: number): number {
    let dmg = 0;
    for (const b of this.bullets) {
      if (Math.hypot(b.x - x, b.y - y) <= r + TUNING.attacks.bulletRadius) {
        dmg += b.damage;
        b.alive = false;
      }
    }
    if (dmg > 0) this.bullets = this.bullets.filter((b) => b.alive);
    return dmg;
  }

  /** Bright, outlined and glowing so they read against the boss (issue #7 refines this). */
  draw(ctx: CanvasRenderingContext2D): void {
    const r = TUNING.attacks.bulletRadius;
    ctx.save();
    for (const b of this.bullets) {
      ctx.fillStyle = 'rgba(255, 40, 120, 0.35)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff2d7a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
