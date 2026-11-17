/**
 * Objective handlers. Each objective type is one small handler (`start / update / isDone / draw / hint`) registered in
 * `OBJECTIVE_FACTORIES`. To add a type: add its definition to `ObjectiveDefinition` (types.ts), write a handler here and add
 * one entry to the table; the compiler refuses a missing entry. The session (session.ts) owns sequencing, checkpoints,
 * the timer and medals; a handler only knows its own goal.
 */
import { H, W } from '../config';
import type { NodeHost } from '../flow/node';
import { PatrolWaveHandler } from '../stealth/patrolWave';
import type { BossFightObjective, DestroyObjective, EscapeObjective, ObjectiveDefinition, ObjectiveType, ReachObjective, ScrollObjective, SurviveObjective, Zone } from './types';

export interface ObjectiveEnv {
  host: NodeHost;
  /** Seconds since this objective attempt started. */
  time: number;
  /** End the attempt as a failure: the objective restarts at its checkpoint and the failure counts as a death. */
  fail(reason: string): void;
  /** Feed a bonus counter that the game cannot see itself (pickups, searchlight detections). */
  bump(counter: 'collected' | 'detections', n?: number): void;
}

export interface ObjectiveHandler {
  start(env: ObjectiveEnv): void;
  update(dt: number, env: ObjectiveEnv): void;
  isDone(): boolean;
  /** World-space visuals (zones, warnings), drawn over the combat scene before the HUD. */
  draw(g: CanvasRenderingContext2D, env: ObjectiveEnv): void;
  /** One short line for the HUD, e.g. `DESTROY 2 LEFT`. */
  hint(env: ObjectiveEnv): string;
}

export const inZone = (z: Zone, x: number, y: number): boolean => ('r' in z ? Math.hypot(x - z.x, y - z.y) <= z.r : x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);

export function drawZone(g: CanvasRenderingContext2D, z: Zone, color: string, t: number, fill = 0.12): void {
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 3;
  g.setLineDash([10, 8]);
  g.lineDashOffset = -t * 30;
  g.globalAlpha = fill;
  g.beginPath();
  if ('r' in z) g.arc(z.x, z.y, z.r, 0, Math.PI * 2);
  else g.rect(z.x, z.y, z.w, z.h);
  g.fill();
  g.globalAlpha = 0.9;
  g.stroke();
  g.restore();
}

/** A jump gate in space: a glowing ring with rotating segments, an inner shimmer and a pulsing halo, sized to the exit zone. */
function drawGate(g: CanvasRenderingContext2D, z: Zone, t: number): void {
  const c = zoneCenter(z);
  const r = 'r' in z ? z.r : Math.min(z.w, z.h) / 2;
  const pulse = 0.6 + 0.4 * Math.sin(t * 3);
  g.save();
  g.translate(c.x, c.y);
  const halo = g.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.15);
  halo.addColorStop(0, 'rgba(110,200,255,0)');
  halo.addColorStop(0.7, `rgba(110,200,255,${0.1 + 0.12 * pulse})`);
  halo.addColorStop(1, 'rgba(110,200,255,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, r * 1.15, 0, Math.PI * 2);
  g.fill();
  // Inner shimmer.
  const inner = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.7);
  inner.addColorStop(0, `rgba(200,235,255,${0.25 + 0.15 * pulse})`);
  inner.addColorStop(1, 'rgba(90,150,255,0.05)');
  g.fillStyle = inner;
  g.beginPath();
  g.arc(0, 0, r * 0.7, 0, Math.PI * 2);
  g.fill();
  // Ring: eight armoured segments, rotating slowly, with bright nodes between them.
  g.lineCap = 'butt';
  for (let i = 0; i < 8; i++) {
    const a0 = t * 0.4 + (i / 8) * Math.PI * 2;
    g.strokeStyle = i % 2 ? '#7fd0ff' : '#cfe9ff';
    g.lineWidth = 12;
    g.beginPath();
    g.arc(0, 0, r * 0.72, a0, a0 + (Math.PI * 2) / 8 - 0.14);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fillRect(Math.cos(a0 - 0.07) * r * 0.72 - 3, Math.sin(a0 - 0.07) * r * 0.72 - 3, 6, 6);
  }
  g.strokeStyle = 'rgba(160,215,255,0.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, r * 0.84, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#cfe9ff';
  g.font = 'bold 14px ui-monospace, Consolas, monospace';
  g.textAlign = 'center';
  g.fillText('JUMP GATE', 0, 5);
  g.restore();
}

export function zoneCenter(z: Zone): { x: number; y: number } {
  return 'r' in z ? { x: z.x, y: z.y } : { x: z.x + z.w / 2, y: z.y + z.h / 2 };
}

/** The hold progress ring around a zone (a circle ring, or a bar under a rectangle): `frac` 0..1 of the hold done. */
export function drawHoldRing(g: CanvasRenderingContext2D, z: Zone, frac: number, color = '#6ee7ff'): void {
  if (frac <= 0) return;
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.globalAlpha = 0.95;
  g.beginPath();
  if ('r' in z) {
    g.arc(z.x, z.y, z.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac));
  } else {
    g.moveTo(z.x, z.y + z.h + 9);
    g.lineTo(z.x + z.w * Math.min(1, frac), z.y + z.h + 9);
  }
  g.stroke();
  g.restore();
}

// --- destroy --------------------------------------------------------------------------------------------

class DestroyHandler implements ObjectiveHandler {
  constructor(private readonly def: DestroyObjective) {}

  start(): void {
    this.cached = -1;
  }

  private left(env: ObjectiveEnv): number {
    let n = 0;
    for (const t of this.def.targets) {
      if ('tag' in t) n += env.host.unitsLeft({ tag: t.tag });
      else if ('unit' in t) n += env.host.unitsLeft({ unit: t.unit });
      else n += env.host.bossTarget('component' in t ? 'component' : 'room', 'component' in t ? t.component : t.room) === 'destroyed' ? 0 : 1;
    }
    return n;
  }

  update(_dt: number, env: ObjectiveEnv): void {
    // Queued spawns count as units left, so the first frame already sees them.
    this.cached = env.time < 0.1 ? -1 : this.left(env);
  }

  isDone(): boolean {
    return this.cached === 0;
  }

  private cached = -1;

  hint(): string {
    return this.cached < 0 ? 'DESTROY' : `DESTROY: ${this.cached} LEFT`;
  }

  draw(): void {}
}

// --- reach / hold ---------------------------------------------------------------------------------------

class ReachHandler implements ObjectiveHandler {
  private held = 0;
  private done = false;

  constructor(private readonly def: ReachObjective) {}

  start(): void {
    this.held = 0;
    this.done = false;
  }

  update(dt: number, env: ObjectiveEnv): void {
    const s = env.host.ship;
    if (env.host.shipAlive() && inZone(this.def.zone, s.x, s.y)) {
      this.held += dt;
      if (this.held >= (this.def.hold ?? 0)) this.done = true;
    } else this.held = 0;
  }

  isDone(): boolean {
    return this.done;
  }

  hint(): string {
    const h = this.def.hold ?? 0;
    return h > 0 ? `HOLD THE ZONE: ${Math.max(0, h - this.held).toFixed(1)}s` : 'REACH THE ZONE';
  }

  draw(g: CanvasRenderingContext2D, env: ObjectiveEnv): void {
    drawZone(g, this.def.zone, '#6ee7ff', env.time, 0.1 + 0.15 * Math.min(1, this.held / Math.max(0.01, this.def.hold ?? 1)));
    if ((this.def.hold ?? 0) > 0) drawHoldRing(g, this.def.zone, this.held / (this.def.hold ?? 1));
    const c = zoneCenter(this.def.zone);
    g.save();
    g.fillStyle = '#6ee7ff';
    g.font = 'bold 14px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.fillText((this.def.hold ?? 0) > 0 ? 'HOLD' : 'REACH', c.x, c.y + 5);
    g.restore();
  }
}

// --- survive --------------------------------------------------------------------------------------------

class SurviveHandler implements ObjectiveHandler {
  private t = 0;

  constructor(private readonly def: SurviveObjective) {}

  start(): void {
    this.t = 0;
  }

  update(_dt: number, env: ObjectiveEnv): void {
    this.t = env.time;
  }

  isDone(): boolean {
    return this.t >= this.def.seconds;
  }

  hint(): string {
    return `${this.def.label ?? 'SURVIVE'}: ${Math.max(0, this.def.seconds - this.t).toFixed(0)}s`;
  }

  draw(): void {}
}

// --- escape ---------------------------------------------------------------------------------------------

class EscapeHandler implements ObjectiveHandler {
  private done = false;

  constructor(private readonly def: EscapeObjective) {}

  start(): void {
    this.done = false;
  }

  /** Y of the closing wall at a time, or null. */
  private wallY(t: number): number | null {
    const c = this.def.closing;
    if (!c) return null;
    return c.fromY + (c.toY - c.fromY) * Math.min(1, t / c.seconds);
  }

  /** True once the exit is open (always, unless a scroll distance gates it). */
  private open(env: ObjectiveEnv): boolean {
    const d = this.def.exitAtDistance;
    return d === undefined || (env.host.scroll()?.distance ?? 0) >= d;
  }

  update(_dt: number, env: ObjectiveEnv): void {
    if (this.done || !env.host.shipAlive()) return;
    const s = env.host.ship;
    if (this.open(env) && inZone(this.def.exit, s.x, s.y)) {
      this.done = true;
      return;
    }
    if (this.def.timer !== undefined && env.time >= this.def.timer) env.fail('out of time');
    const w = this.wallY(env.time);
    if (w !== null && s.y > w) env.fail('caught by the closing wall');
  }

  isDone(): boolean {
    return this.done;
  }

  hint(env: ObjectiveEnv): string {
    const t = this.def.timer;
    const left = t !== undefined ? ` ${Math.max(0, t - env.time).toFixed(0)}s` : '';
    return this.open(env) ? `REACH THE EXIT!${left}` : `ESCAPE: the exit opens ahead${left}`;
  }

  draw(g: CanvasRenderingContext2D, env: ObjectiveEnv): void {
    if (this.open(env) && this.def.gate) {
      drawGate(g, this.def.exit, env.time);
    } else if (this.open(env)) {
      drawZone(g, this.def.exit, '#4ade80', env.time, 0.14);
      const c = zoneCenter(this.def.exit);
      g.save();
      g.fillStyle = '#4ade80';
      g.font = 'bold 14px ui-monospace, Consolas, monospace';
      g.textAlign = 'center';
      g.fillText('EXIT', c.x, c.y + 5);
      g.restore();
    }
    const w = this.wallY(env.time);
    if (w !== null) {
      g.save();
      const grad = g.createLinearGradient(0, w, 0, H);
      grad.addColorStop(0, 'rgba(255,90,60,0.85)');
      grad.addColorStop(1, 'rgba(255,90,60,0.25)');
      g.fillStyle = grad;
      g.fillRect(0, w, W, H - w);
      g.fillStyle = '#ffd21f';
      g.fillRect(0, w - 2, W, 3);
      g.restore();
    }
  }
}

// --- boss fight -----------------------------------------------------------------------------------------

class BossFightHandler implements ObjectiveHandler {
  private done = false;

  constructor(private readonly def: BossFightObjective) {}

  start(): void {
    this.done = false;
  }

  update(_dt: number, env: ObjectiveEnv): void {
    const u = this.def.until;
    if (this.def.phaseSeconds !== undefined) this.done = env.time >= this.def.phaseSeconds || env.host.combatResult() === 'won';
    else if (!u) this.done = env.host.combatResult() === 'won';
    else this.done = env.host.bossTarget('component' in u ? 'component' : 'room', 'component' in u ? u.component : u.room) === 'destroyed';
  }

  isDone(): boolean {
    return this.done;
  }

  hint(): string {
    const u = this.def.until;
    if (this.def.phaseSeconds !== undefined) return 'HOLD ON';
    return u ? `DESTROY THE ${('component' in u ? u.component : u.room).toUpperCase()}` : 'DEFEAT THE BOSS';
  }

  draw(): void {}
}

// --- scroll ---------------------------------------------------------------------------------------------

class ScrollHandler implements ObjectiveHandler {
  private pct = 0;
  private done = false;

  constructor(_def: ScrollObjective) {}

  start(): void {
    this.pct = 0;
    this.done = false;
  }

  update(_dt: number, env: ObjectiveEnv): void {
    const r = env.host.scroll();
    if (!r) return;
    const len = (r as { def?: { length: number } }).def?.length ?? 1;
    this.pct = Math.min(1, r.distance / len);
    this.done = r.done;
  }

  isDone(): boolean {
    return this.done;
  }

  hint(): string {
    return `FLY ON: ${Math.round(this.pct * 100)}%`;
  }

  draw(): void {}
}

// --- registry -------------------------------------------------------------------------------------------

type Factories = { [K in ObjectiveType]: (def: Extract<ObjectiveDefinition, { type: K }>) => ObjectiveHandler };

export const OBJECTIVE_FACTORIES: Factories = {
  destroy: (d) => new DestroyHandler(d),
  reach: (d) => new ReachHandler(d),
  survive: (d) => new SurviveHandler(d),
  escape: (d) => new EscapeHandler(d),
  bossFight: (d) => new BossFightHandler(d),
  scroll: (d) => new ScrollHandler(d),
  patrolWave: (d) => new PatrolWaveHandler(d),
};

/**
 * Hands the searchlight detections of the running scroll level (src/stealth) to the campaign's `detections` counter, whatever the
 * objective type: wraps every handler, so a stealth level can use `reach`, `survive`, `patrolWave` or any other.
 */
function withStealthCounter(h: ObjectiveHandler): ObjectiveHandler {
  const update = h.update.bind(h);
  h.update = (dt, env) => {
    const n = env.host.scroll()?.stealth?.takeDetections() ?? 0;
    if (n > 0) env.bump('detections', n);
    update(dt, env);
  };
  return h;
}

export function createObjective(def: ObjectiveDefinition): ObjectiveHandler {
  return withStealthCounter((OBJECTIVE_FACTORIES[def.type] as (d: ObjectiveDefinition) => ObjectiveHandler)(def));
}
