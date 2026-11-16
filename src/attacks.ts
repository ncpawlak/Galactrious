import { H, TUNING, W } from './config';
import { DebugScheduler, type AttackScheduler } from './attackSchedulers';
import type { FireSource } from './components';
import { drawBullet, dimBoss, type StyleName } from './attackStyles';
import { drawHazard, hazardPhase, shapeHits, type Hazard, type Point } from './hazards';

/** A boss projectile. Velocity in px/s. */
export interface EnemyBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  /** Look; defaults to the pattern's style, then 'aimed'. */
  style?: StyleName;
  alive: boolean;
}

export interface AttackContext {
  /** Where the attack comes from, read live (the boss moves): call it each frame, never cache the result. */
  origin: () => Point;
  /** Current player position. */
  target: Point;
  /** Spawn a bullet. */
  spawn(b: Omit<EnemyBullet, 'alive'>): void;
  /** Add a timed area hazard (telegraph, then damage). */
  spawnHazard(h: Omit<Hazard, 'age'>): void;
}

/**
 * An attack pattern is a small self-contained definition: `interval` seconds of pause after it,
 * and `fire` spawns bullets and/or hazards. New attacks are added by appending to PATTERNS; the
 * scheduler below needs no changes. A pattern only sees its `origin` getter, so it can later be
 * tied to a turret instead of the boss core.
 */
export interface AttackPattern {
  name: string;
  interval: number;
  /** Default bullet style for this pattern's spawns. */
  style?: StyleName;
  fire(ctx: AttackContext): void;
}

export const aimedShot: AttackPattern = {
  name: 'aimed',
  interval: TUNING.attacks.aimed.interval,
  style: 'aimed',
  fire({ origin, target, spawn }) {
    const o = origin();
    const { speed, damage } = TUNING.attacks.aimed;
    const dx = target.x - o.x;
    const dy = target.y - o.y;
    const len = Math.hypot(dx, dy) || 1;
    spawn({ x: o.x, y: o.y, vx: (dx / len) * speed, vy: (dy / len) * speed, damage });
  },
};

export const directVolley: AttackPattern = {
  name: 'direct',
  interval: TUNING.attacks.direct.interval,
  style: 'direct',
  fire({ origin, spawn }) {
    const { count, spacing, speed, damage } = TUNING.attacks.direct;
    const o = origin();
    for (let i = 0; i < count; i++) spawn({ x: o.x + (i - (count - 1) / 2) * spacing, y: o.y, vx: 0, vy: speed, damage });
  },
};

const RAD = Math.PI / 180;

export const lineSweep: AttackPattern = {
  name: 'sweep',
  interval: TUNING.attacks.sweep.interval,
  fire({ origin, spawnHazard }) {
    const c = TUNING.attacks.sweep;
    const half = (c.arc / 2) * RAD;
    const center = c.centerAngle * RAD;
    // Canvas angles run clockwise, so the left side (angle > 90) is the larger one.
    const from = c.leftToRight ? center + half : center - half;
    const to = c.leftToRight ? center - half : center + half;
    spawnHazard({
      telegraph: c.telegraph,
      active: c.active,
      damage: c.damage,
      // The vertex follows the boss every frame. The telegraph shows the whole arc about to be swept.
      shapeAt: (phase, p) => {
        const o = origin();
        if (phase === 'telegraph') return { kind: 'line', x: o.x, y: o.y, angle: center, length: c.length, width: 2 * c.length * Math.tan(half) };
        return { kind: 'line', x: o.x, y: o.y, angle: from + (to - from) * p, length: c.length, width: c.beamWidth };
      },
    });
  },
};

export const bomb: AttackPattern = {
  name: 'bomb',
  interval: TUNING.attacks.bomb.interval,
  fire({ origin, target, spawnHazard }) {
    const c = TUNING.attacks.bomb;
    const to = { x: target.x, y: target.y };
    spawnHazard({
      telegraph: c.telegraph,
      active: c.active,
      damage: c.damage,
      shapeAt: () => ({ kind: 'circle', x: to.x, y: to.y, r: c.radius }),
      // Visual lob only: launches from where the boss is now, no contact damage (see issue #27).
      lob: { from: origin(), to, height: c.lobHeight },
    });
  },
};

export const PATTERNS: AttackPattern[] = [aimedShot, directVolley, lineSweep, bomb];

/** 'phase' = the current boss phase's scripted attack set; 'cycle' / 'random' = debug schedulers over every pattern. */
export type ScheduleMode = 'phase' | 'cycle' | 'random';

/** Owns enemy bullets, hazards and the active scheduler. Knows nothing about the player's health. */
export class Attacks {
  enabled = true;
  mode: ScheduleMode = 'phase';
  /** Debug: pattern index used by `fireSelected`. */
  selected = 0;
  bullets: EnemyBullet[] = [];
  hazards: Hazard[] = [];
  private readonly debugScheduler = new DebugScheduler(PATTERNS);
  /** Resolves a step's `source` (turret id or group) to firing positions; set by the game from the boss's components. */
  sources: { fireFrom(source: string): FireSource[] } | null = null;
  private script: AttackScheduler | null = null;
  private clock = 0;

  /** Set the scripted scheduler (the boss phase's attack set). Called on fight start and on each phase change. */
  setScript(s: AttackScheduler): void {
    this.script = s;
  }

  reset(): void {
    this.clear();
    this.debugScheduler.reset();
    this.script?.reset();
  }

  clear(): void {
    this.bullets = [];
    this.hazards = [];
  }

  /** Debug [N]: phase script -> cycle all -> random all -> phase script. */
  toggleMode(): void {
    this.mode = this.mode === 'phase' ? 'cycle' : this.mode === 'cycle' ? 'random' : 'phase';
    this.debugScheduler.mode = this.mode === 'random' ? 'random' : 'cycle';
    this.debugScheduler.reset();
  }

  private get scheduler(): AttackScheduler | null {
    return this.mode === 'phase' ? this.script : this.debugScheduler;
  }

  /** Fire pattern `i` of PATTERNS now, regardless of the schedule. */
  fire(i: number, origin: () => Point, target: Point): void {
    this.firePattern(PATTERNS[i], origin, target);
  }

  firePattern(p: AttackPattern, origin: () => Point, target: Point): void {
    p.fire({
      origin,
      target,
      spawn: (b) => this.bullets.push({ style: p.style, ...b, alive: true }),
      spawnHazard: (h) => this.hazards.push({ ...h, age: 0 }),
    });
  }

  /** Add a timed hazard directly (room reactions, scripted effects). */
  spawnHazard(h: Omit<Hazard, 'age'>): void {
    this.hazards.push({ ...h, age: 0 });
  }

  fireSelected(origin: () => Point, target: Point): void {
    this.fire(this.selected, origin, target);
  }

  update(dt: number, origin: () => Point, target: Point, firing: boolean): void {
    if (this.enabled && firing) {
      const sched = this.scheduler;
      const p = sched?.update(dt);
      if (p) {
        const src = sched!.lastSource;
        if (src && this.sources) for (const s of this.sources.fireFrom(src)) this.firePattern(p, s.origin, s.target);
        else this.firePattern(p, origin, target);
      }
    }
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) b.alive = false;
    }
    this.bullets = this.bullets.filter((b) => b.alive);
    for (const h of this.hazards) h.age += dt;
    this.hazards = this.hazards.filter((h) => hazardPhase(h) !== null);
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

  /**
   * Damage of the live hazards overlapping the player circle (largest one, not summed). Not
   * consumed: a zone keeps hurting while you stand in it; the player's i-frames and dodge gate it.
   */
  collectHazards(x: number, y: number, r: number): number {
    let dmg = 0;
    for (const h of this.hazards) {
      const ph = hazardPhase(h);
      if (ph && ph.phase === 'live' && shapeHits(h.shapeAt('live', ph.p), x, y, r)) dmg = Math.max(dmg, h.damage);
    }
    return dmg;
  }

  /** Dim the boss slightly while any hazard is active. Call right after drawing the boss. */
  drawBossDim(ctx: CanvasRenderingContext2D): void {
    if (this.hazards.length > 0) dimBoss(ctx, W, H, TUNING.hazards.bossDim);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.clock += 1 / 60;
    ctx.save();
    for (const h of this.hazards) drawHazard(ctx, h, this.clock);
    for (const b of this.bullets) drawBullet(ctx, b.x, b.y, b.style);
    ctx.restore();
  }
}
