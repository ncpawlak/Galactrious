import { W } from '../config';
import { AllySystem } from './allies';
import { ScrollBackground } from './background';
import { mulberry32, ObstacleSystem } from './obstacles';
import type { MotionPreset, ObstacleField, ObstacleSpawn, ScrollEntry, ScrollEvent, ScrollHost, ScrollLevelDef, ScrollRunner } from './types';

/** Expand every `field` into individual obstacle spawns (deterministic per seed) and sort the timeline by distance. */
export function compileTimeline(entries: ScrollEntry[]): Exclude<ScrollEntry, ObstacleField>[] {
  const out: Exclude<ScrollEntry, ObstacleField>[] = [];
  for (const e of entries) {
    if (e.kind !== 'field') {
      out.push(e);
      continue;
    }
    const rnd = mulberry32(e.seed ?? Math.floor(e.at) + 1);
    const n = Math.max(0, Math.round((e.density * (e.to - e.at)) / 1000));
    const total = e.shapes.reduce((a, s) => a + (s.weight ?? 1), 0);
    const motions: MotionPreset[] = e.motions?.length ? e.motions : ['straight'];
    for (let i = 0; i < n; i++) {
      let pick = rnd() * total;
      let shape = e.shapes[0].shape;
      for (const s of e.shapes) {
        pick -= s.weight ?? 1;
        if (pick <= 0) {
          shape = s.shape;
          break;
        }
      }
      let x = 30 + rnd() * (W - 60);
      if (e.lane) {
        // Push centres out of the free lane.
        const half = e.lane.width / 2;
        if (Math.abs(x - e.lane.x) < half) x = x < e.lane.x ? e.lane.x - half - rnd() * 40 : e.lane.x + half + rnd() * 40;
        x = Math.min(W - 10, Math.max(10, x));
      }
      // Spread entries evenly with a little jitter so the field does not clump.
      const at = e.at + ((i + 0.2 + rnd() * 0.6) / n) * (e.to - e.at);
      out.push({ at, kind: 'obstacle', shape, x, motion: motions[Math.floor(rnd() * motions.length)], carvable: e.carvable, seed: Math.floor(rnd() * 1e6) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Runs a `ScrollLevelDef`: advances the scroll distance, fires timeline entries, owns the background, the obstacles and the
 * cosmetic allies. The game (or a flow node) creates one with a `ScrollHost`, calls `start(def)`, `update(dt)` every frame
 * and draws it. Pure bookkeeping: nothing here touches combat state besides the host calls.
 */
export class ScrollRunnerImpl implements ScrollRunner {
  readonly obstacles = new ObstacleSystem();
  readonly allies = new AllySystem();
  background: ScrollBackground | null = null;
  def: ScrollLevelDef | null = null;
  distance = 0;
  onEvent: ((e: ScrollEvent) => void) | null = null;
  private timeline: Exclude<ScrollEntry, ObstacleField>[] = [];
  private next = 0;
  private curSpeed = 0;
  private fromSpeed = 0;
  private toSpeed = 0;
  private easeLeft = 0;
  private easeTime = 0;
  /** Every event emitted so far (debug and tests). */
  readonly log: ScrollEvent[] = [];
  /** Debug: hold the scroll (distance and obstacles stop; everything else keeps running). */
  paused = false;

  constructor(private readonly host: ScrollHost) {}

  get speed(): number {
    return this.curSpeed;
  }

  get done(): boolean {
    return !!this.def && this.distance >= this.def.length;
  }

  /** Index of the next timeline entry to fire (debug). */
  get nextIndex(): number {
    return this.next;
  }

  get entries(): readonly Exclude<ScrollEntry, ObstacleField>[] {
    return this.timeline;
  }

  start(def: ScrollLevelDef): void {
    this.def = def;
    this.distance = 0;
    this.timeline = compileTimeline(def.timeline);
    this.next = 0;
    this.curSpeed = this.fromSpeed = this.toSpeed = def.speed;
    this.easeLeft = 0;
    this.obstacles.clear();
    this.allies.clear();
    this.log.length = 0;
    this.background = new ScrollBackground(def.theme);
    this.host.setWeaponsLocked(!!def.weaponsLocked);
    if (def.allies) this.allies.set(def.allies.count, def.allies.pattern);
    this.emit('level-start');
    this.fireDue(0);
  }

  setSpeed(v: number, ease = 0.6): void {
    this.fromSpeed = this.curSpeed;
    this.toSpeed = v;
    this.easeTime = this.easeLeft = Math.max(0, ease);
    if (ease <= 0) this.curSpeed = v;
  }

  /** Debug: jump to scroll distance `d`, firing every entry on the way (obstacles appear already scrolled in; speed changes apply at once). */
  skipTo(d: number): void {
    if (!this.def) return;
    const target = Math.min(d, this.def.length);
    if (target <= this.distance) return;
    this.distance = target;
    this.fireDue(target);
    this.obstacles.update(0, 0);
  }

  update(dt: number): void {
    if (!this.def) return;
    if (this.easeLeft > 0) {
      this.easeLeft = Math.max(0, this.easeLeft - dt);
      const k = this.easeTime > 0 ? 1 - this.easeLeft / this.easeTime : 1;
      const s = k * k * (3 - 2 * k);
      this.curSpeed = this.fromSpeed + (this.toSpeed - this.fromSpeed) * s;
    }
    const wasDone = this.done;
    const v = this.paused ? 0 : this.curSpeed;
    this.distance = Math.min(this.def.length, this.distance + v * dt);
    this.fireDue(this.distance);
    this.obstacles.update(dt, v);
    this.allies.update(dt);
    this.background?.update(dt);
    if (!wasDone && this.done) this.emit('level-end');
  }

  private emit(name: string, data?: unknown): void {
    const e: ScrollEvent = { name, distance: this.distance, data };
    this.log.push(e);
    this.onEvent?.(e);
  }

  private fireDue(distance: number): void {
    while (this.next < this.timeline.length && this.timeline[this.next].at <= distance) {
      const e = this.timeline[this.next++];
      this.fire(e, distance - e.at);
    }
  }

  private fire(e: Exclude<ScrollEntry, ObstacleField>, lag: number): void {
    switch (e.kind) {
      case 'obstacle': {
        const o = this.obstacles.spawn(e as ObstacleSpawn);
        // Entries fired late (skipTo, a big frame) start already scrolled in by the distance they missed.
        if (lag > 0) o.y += lag;
        break;
      }
      case 'unit':
        this.host.spawnUnit(e.unit, e.x, e.y ?? 150);
        break;
      case 'wave':
        this.host.spawnWave(e.wave);
        break;
      case 'boss':
        this.host.spawnBoss(e.bossId);
        this.emit('boss-spawned', e.bossId);
        break;
      case 'speed':
        this.setSpeed(e.speed, e.ease ?? 1);
        break;
      case 'weapons':
        this.host.setWeaponsLocked(e.locked);
        break;
      case 'allies':
        if (e.on) this.allies.set(e.count ?? 4, e.pattern);
        else this.allies.dismiss();
        break;
      case 'theme':
        this.background?.setTheme(e.theme, e.fade ?? 2);
        break;
      case 'pickup':
        this.emit('pickup', { name: e.name, x: e.x });
        break;
      case 'event':
        this.emit(e.name, e.data);
        break;
    }
  }

  drawBackground(ctx: CanvasRenderingContext2D): void {
    this.background?.draw(ctx, this.distance);
    this.allies.draw(ctx);
  }

  drawObstacles(ctx: CanvasRenderingContext2D): void {
    this.obstacles.draw(ctx);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.drawBackground(ctx);
    this.drawObstacles(ctx);
  }
}
