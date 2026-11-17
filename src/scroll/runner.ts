import { W } from '../config';
import { StealthSystem } from '../stealth/system';
import { AllySystem } from './allies';
import { ScrollBackground } from './background';
import { isRockShape, mulberry32, ObstacleSystem, SIZES } from './obstacles';
import { TerrainSystem } from '../terrain/system';
import type { MotionPreset, ObstacleField, ObstacleSpawn, ScrollEntry, ScrollEvent, ScrollHost, ScrollLevelDef, ScrollRunner } from './types';

type EdgeChoice = 'top' | 'bottom' | 'left' | 'right';

const CROSS_MOTIONS: MotionPreset[] = ['cross', 'cross-fast', 'cross-tumble'];

/** One entry edge for the i-th obstacle of a field: a fixed edge, 'sides' alternating left and right, or a weighted mix. */
function pickEdge(edge: ObstacleField['edge'], rnd: () => number, i: number): EdgeChoice {
  const one = (e: 'top' | 'bottom' | 'sides' | 'cross'): EdgeChoice => (e === 'sides' || e === 'cross' ? (rnd() < 0.5 ? 'left' : 'right') : e);
  if (!edge) return 'top';
  if (typeof edge === 'string') return one(edge);
  const total = edge.reduce((a, c) => a + (c.weight ?? 1), 0);
  let pick = rnd() * total;
  for (const c of edge) {
    pick -= c.weight ?? 1;
    if (pick <= 0) return one(c.edge);
  }
  void i;
  return one(edge[0].edge);
}

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
      // Spread entries evenly with a little jitter so the field does not clump.
      const at = e.at + ((i + 0.2 + rnd() * 0.6) / n) * (e.to - e.at);
      let x = 30 + rnd() * (W - 60);
      if (e.lane) {
        // Keep the lane free of obstacle BODIES (the centre stays out by half the lane plus half the shape's width), so a corridor
        // always exists. `laneDrift` makes the corridor meander left and right with the distance.
        // A tall shape covers a stretch of the winding lane (it spans `h` px of scroll), so it must clear the lane over all of it.
        const laneAt = (d: number): number => e.lane!.x + (e.laneDrift ? e.laneDrift.amp * Math.sin(((d - e.at) / e.laneDrift.period) * Math.PI * 2) : 0);
        let minL = Infinity;
        let maxL = -Infinity;
        for (let k = 0; k <= 6; k++) {
          const l = laneAt(at + (k / 6) * SIZES[shape].h);
          minL = Math.min(minL, l);
          maxL = Math.max(maxL, l);
        }
        const body = SIZES[shape].w * (isRockShape(shape) ? 0.52 : 0.72) * (1 + 0.1 * rnd());
        const half = e.lane.width / 2 + body;
        if (x > minL - half && x < maxL + half) {
          const leftX = minL - half - rnd() * 30;
          const rightX = maxL + half + rnd() * 30;
          x = Math.abs(x - leftX) < Math.abs(x - rightX) ? leftX : rightX;
        }
        x = Math.min(W + 60, Math.max(-60, x));
      }
      const motion = motions[Math.floor(rnd() * motions.length)];
      const edge = pickEdge(e.edge, rnd, i);
      const o: ObstacleSpawn = { at, kind: 'obstacle', shape, x, motion, carvable: e.carvable, seed: Math.floor(rnd() * 1e6), damage: e.damage };
      if (edge === 'bottom') o.edge = 'bottom';
      else if (edge === 'left' || edge === 'right') {
        // Side drifters: slide in from the edge to a small inset, starting mid-screen so they cross the ship's zone going up.
        o.edge = edge;
        const inset = 40 + rnd() * 110;
        o.x = edge === 'left' ? inset : W - inset;
        o.y = 420 + rnd() * 460;
        // Crossing debris: a height spread by a golden-ratio sequence (neighbours in time are far apart in height, so a pass is never a wall).
        if (CROSS_MOTIONS.includes(motion)) o.y = 190 + ((i * 0.618034 + rnd() * 0.25) % 1) * 690;
      }
      out.push(o);
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
  /** Carvable walls, defence lines and ground turrets (src/terrain); its entries are fired from the timeline like any other. */
  readonly terrain: TerrainSystem;
  background: ScrollBackground | null = null;
  /** Searchlights, cover and detection when the level has a `stealth` block. */
  stealth: StealthSystem | null = null;
  def: ScrollLevelDef | null = null;
  distance = 0;
  onEvent: ((e: ScrollEvent) => void) | null = null;
  /** Called when thunder arrives after a lightning flash (strength 0 to 1): the game adds a small screen shudder. */
  onThunder: ((strength: number) => void) | null = null;
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

  constructor(private readonly host: ScrollHost) {
    this.terrain = new TerrainSystem(host);
  }

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
    this.terrain.clear();
    this.terrain.setTimeline(this.timeline);
    this.log.length = 0;
    this.stealth = def.stealth ? new StealthSystem(this.host, def.stealth) : null;
    this.background = new ScrollBackground(def.theme, def.weather ?? 0);
    this.background.onThunder = (s) => this.onThunder?.(s);
    this.background.setSkyFlip(!!def.skyFlip);
    this.host.setEnemyFireScale(def.fireScale ?? 1);
    this.host.setWeaponsLocked(!!def.weaponsLocked);
    if (def.allies) this.allies.set(def.allies.count, def.allies.pattern);
    this.emit('level-start');
    this.fireDue(0);
  }

  /** Set the weather intensity (0 to 1), easing over `ease` seconds. */
  setWeather(intensity: number, ease = 3): void {
    this.background?.setWeather(intensity, ease);
  }

  /** Grow the background planet (cinematics): 0 normal, 1 fills most of the screen. */
  setPlanetZoom(k: number): void {
    this.background?.setPlanetZoom(k);
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
    this.terrain.update(0, 0);
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
    this.terrain.update(dt, v);
    this.allies.update(dt);
    this.background?.update(dt, v);
    this.stealth?.update(dt, this.distance);
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
        if (lag > 0) {
          // A late entry (skipTo, a big frame) has already been in the world for `lag / speed` seconds.
          if (o.rise === 0 && o.edge === 'top') o.y += lag;
          else o.update(lag / Math.max(60, this.curSpeed), this.curSpeed);
        }
        break;
      }
      case 'unit':
        this.host.spawnUnit(e.unit, e.x, e.y ?? 150);
        break;
      case 'flyby': {
        const n = e.count ?? 1;
        for (let k = 0; k < n; k++) {
          const side = e.alternate ? (((e.side ?? 'left') === 'left') === (k % 2 === 0) ? 'left' : 'right') : e.side;
          this.host.spawnFlyby({ unit: e.unit, preset: e.preset, x: e.x === undefined ? undefined : e.x + k * (e.xStep ?? 0), y: e.y, side, time: e.time, delay: k * (e.spacing ?? 0.35) });
        }
        break;
      }
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
      case 'setWeather':
        this.background?.setWeather(e.intensity, e.ease ?? 3);
        break;
      case 'pickup':
        this.emit('pickup', { name: e.name, x: e.x });
        break;
      case 'event':
        this.emit(e.name, e.data);
        break;
      case 'wall':
      case 'wallLine':
      case 'turret':
      case 'turretCluster':
      case 'turretTally':
      case 'barrier':
      case 'hidden':
        this.terrain.fire(e, lag);
        break;
    }
  }

  drawBackground(ctx: CanvasRenderingContext2D): void {
    this.background?.draw(ctx, this.distance, this.curSpeed);
    this.allies.draw(ctx);
    this.stealth?.drawGround(ctx);
  }

  drawObstacles(ctx: CanvasRenderingContext2D): void {
    this.obstacles.draw(ctx);
    this.terrain.draw(ctx);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.drawBackground(ctx);
    this.drawObstacles(ctx);
  }
}
