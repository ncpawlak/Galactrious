/**
 * The cinematic system (DESIGN.md "Cinematic and mission design standard"). A cinematic is a short, timed, DATA-DRIVEN sequence
 * that takes control from the player and plays tracks side by side: a ship animation, world effects, scenery props, overlays and
 * radio commentary. Author one as a `Cinematic` object; the `CinematicRunner` plays it through a `CinematicHost`.
 *
 * Cinematics are COSMETIC. They never change boss or unit state, health, medal counters or the capital-ship snapshot (that is
 * captured by the session when the objective completes, before an `outro` plays). The only state they change is what they list:
 * the ship pose, the scroll speed, units being sent away (`dismissUnits`), the boss lead-in offset / invincibility and the weather.
 * No audio for now: the radio is subtitles with a 'static' look.
 */
import { H, W } from '../config';
import { drawAllySprite } from '../scroll/allies';

export type Ease = 'linear' | 'in' | 'out' | 'inOut';

/** One keyframe of the ship track. Fields left out keep their value from the previous key (the first key starts from the live ship). */
export interface ShipKey {
  /** Seconds since the cinematic started. */
  t: number;
  /** Absolute screen position (px), or an offset from where the ship was when the cinematic started (`dx`, `dy`). Left out = hold the previous value. */
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  /** 1 = normal. */
  scale?: number;
  /** Radians (0 = nose up). `Math.PI` is the 180 turn. */
  rot?: number;
  /** Horizontal mirror factor: 1 normal, -1 mirrored, in between = a flat "roll". */
  flip?: number;
  /** Easing of the segment that ENDS at this key (default 'inOut'). */
  ease?: Ease;
}

export interface BossKey {
  t: number;
  /** Extra vertical offset of the boss in px (0 = where the fight puts it). */
  offsetY: number;
  ease?: Ease;
}

/** Visual-only trail emitted at the ship for `duration` seconds. */
export type TrailKind = 'smoke' | 'fire' | 'snow' | 'sparks';

export type WorldEvent = { t: number } & (
  /** A cosmetic fireball (particles, shake, a shockwave ring). `at` names a boss anchor (e.g. 'engineA') instead of x/y. */
  | { do: 'explosion'; x?: number; y?: number; at?: string; dx?: number; dy?: number; radius: number; ring?: boolean; shake?: number }
  /** A bolt streaking from `from` to the ship (or a point); `hit` makes it burst on arrival. Drawn by the runner. */
  | { do: 'projectile'; from: [number, number]; to?: [number, number]; duration: number; color?: string; hit?: boolean }
  /** The ship burns (and smokes) from now on: flames and a trail until `burn` false or the cinematic ends. */
  | { do: 'burn'; on: boolean }
  | { do: 'trail'; kind: TrailKind; duration: number; rate?: number }
  | { do: 'shake'; amount: number }
  | { do: 'scrollSpeed'; speed: number; ease?: number }
  /** Grow the background planet: 0 = normal, 1 = the planet fills the screen (space theme). Eases over `duration`. */
  | { do: 'planetZoom'; to: number; duration: number }
  /** Weather intensity 0..1 eased over `ease` seconds (atmosphere / arctic themes). */
  | { do: 'weather'; intensity: number; ease?: number }
  /** Units (all, or by tag) stop shooting, break off and fly away; they do not count as kills. */
  | { do: 'dismissUnits'; tag?: string }
  /** Swap the player's ship (the pod becomes the commandeered fighter). A listed state change: it applies on skip too. */
  | { do: 'setShip'; ship: string }
);

/** One keyframe of a wingman's path (cinematic seconds). `x`/`y` are absolute screen px; `dx`/`dy` are offsets from the ship's LIVE position (formation flying). */
export interface WingKey {
  t: number;
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  /** Radians, 0 = nose up. Default: points along the direction of travel's last value (0). */
  rot?: number;
  /** Easing of the segment that ENDS at this key (default 'inOut'). */
  ease?: Ease;
}

/** A Delta wingman for a cinematic: visible from its first key to its last. */
export interface WingPath {
  /** Callsign tag drawn under the ship (optional). */
  tag?: string;
  keys: WingKey[];
}

/** Scenery drawn by the runner (not part of the combat sim). */
export type Prop = { t: number } & (
  | {
      do: 'slope';
      /** The slope's surface line in its final place, screen px; the mountain mass is the part ABOVE the line (toward the top of the screen). */
      line: [number, number, number, number];
      /** Seconds the slope takes to sweep in from the top of the screen (the world rushing past). */
      enter: number;
    }
  /** Delta wingmen (the squad sprite) flying the given paths, drawn under the ship. The reunion and the victory formation. */
  | { do: 'wingmen'; wings: WingPath[]; scale?: number }
  /** A targeting reticle on the ship (red, "weapons lock") with a label, from this time until `until`; thin lock lines run from each wingman to it. */
  | { do: 'scope'; until: number; label: string }
  /** A pulsing callsign beacon on the ship (green rings and a label) from this time on. */
  | { do: 'beacon'; label: string; until?: number }
  /** Custom scenery: `draw(g, time)` is called every frame from `t` on (time = seconds since the cinematic began). Chapters 4 and 5 paint the wreck and the hangar this way. */
  | { do: 'draw'; draw: (g: CanvasRenderingContext2D, time: number) => void }
);

export interface Overlay {
  t: number;
  /** Layers are independent: 'fade' (default) is the black/white fade, others can run together (e.g. 'vignette'). */
  layer?: string;
  kind?: 'fade' | 'vignette';
  color: string;
  /** Target alpha 0..1, reached after `duration` seconds, starting from the layer's previous value (0 initially). */
  to: number;
  duration: number;
}

export interface RadioLine {
  t: number;
  speaker?: string;
  text: string;
  /** Seconds on screen (default 3.4). */
  duration?: number;
  /** Radio static 0..1 (default 0.25); 1 = the line is mostly noise (a dying signal). */
  static?: number;
}

export interface CinematicLock {
  /** The player cannot steer (default true). The ship is driven by the `ship` track. */
  input?: boolean;
  /** Weapons off (default true). */
  weapons?: boolean;
  /** 'hold' = enemies stop firing but keep moving (default); 'run' = they carry on. */
  enemies?: 'hold' | 'run';
  /** Nothing damages the ship (default true). */
  invulnerable?: boolean;
  /** The boss cannot be hit (the approach build-up). Ends with the cinematic. */
  bossInvincible?: boolean;
  /** Hide the combat HUD (health, dodge button, weapon rings) and the campaign HUD (default: same as `input`). */
  hideHud?: boolean;
}

export interface Cinematic {
  id: string;
  duration: number;
  lock?: CinematicLock;
  ship?: ShipKey[];
  boss?: BossKey[];
  world?: WorldEvent[];
  props?: Prop[];
  overlays?: Overlay[];
  radio?: RadioLine[];
  /** Seconds before a tap or Esc may skip it (default 1.2). `false` = not skippable. */
  skippableAfter?: number | false;
  /** Release the ship pose when the cinematic ends (an intro that hands the ship back to the player). Default: keep it (an outro that sends the ship away). */
  releasePose?: boolean;
  /** What happens at the end: 'continue' (default: the next objective, or the result after the last one) or 'result' (end the level now). */
  then?: 'continue' | 'result';
}

// --- host ------------------------------------------------------------------------------------------------------

export interface ShipPose {
  x: number;
  y: number;
  scale: number;
  rot: number;
  flip: number;
}

/** What a cinematic may do to the game. Implemented by `Game` (see `NodeHost.cine`). Every method is cosmetic or a listed state change. */
export interface CinematicHost {
  begin(lock: Required<Omit<CinematicLock, 'hideHud'>> & { hideHud: boolean }): void;
  end(): void;
  /** Drive the ship (position, scale, rotation, flip). null releases it. */
  setPose(p: ShipPose | null): void;
  shipPos(): { x: number; y: number };
  /** Cosmetic fireball: particles, shake and sound only. Never carves, never damages. */
  explode(x: number, y: number, radius: number, shake: number): void;
  /** Screen position of a boss anchor (`BossSpec.anchors`), or null. */
  anchor(name: string): { x: number; y: number } | null;
  emit(x: number, y: number, vx: number, vy: number, life: number, color: string, size: number): void;
  shake(amount: number): void;
  burn(on: boolean): void;
  dismissUnits(tag?: string): void;
  setBossOffset(y: number): void;
  setScrollSpeed(speed: number, ease: number): void;
  setPlanetZoom(k: number): void;
  setWeather(intensity: number, ease: number): void;
  /** Scenery drawn between the background and the ship (a slope the ship skids along). null clears it. */
  setScenery(draw: ((g: CanvasRenderingContext2D) => void) | null): void;
  /** Swap the player's ship by id (campaign ship ids included). */
  setShip(id: string): void;
}

// --- runner ----------------------------------------------------------------------------------------------------

const easeFn: Record<Ease, (u: number) => number> = {
  linear: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  inOut: (u) => u * u * (3 - 2 * u),
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Value of a keyframe track at time t. `get` reads a field of a key (undefined = inherit). */
function sample<K extends { t: number; ease?: Ease }>(keys: K[], t: number, get: (k: K) => number | undefined, start: number): number {
  let prevT = 0;
  let prevV = start;
  for (const k of keys) {
    const v = get(k) ?? prevV; // a key that leaves a field out holds the previous value
    if (t < k.t) {
      const u = k.t > prevT ? clamp01((t - prevT) / (k.t - prevT)) : 1;
      return prevV + (v - prevV) * easeFn[k.ease ?? 'inOut'](u);
    }
    prevT = k.t;
    prevV = v;
  }
  return prevV;
}

interface Projectile {
  from: [number, number];
  to: [number, number] | null;
  t0: number;
  duration: number;
  color: string;
  hit: boolean;
  burst: boolean;
}

interface Ball {
  x: number;
  y: number;
  age: number;
  max: number;
  radius: number;
}

interface Ring {
  x: number;
  y: number;
  age: number;
  max: number;
  radius: number;
}

/** World events whose effect is visual only: skipping a cinematic drops them, everything else is applied. */
const VISUAL = new Set(['explosion', 'projectile', 'trail', 'shake']);

export class CinematicRunner {
  time = 0;
  done = false;
  private readonly lock: Required<Omit<CinematicLock, 'hideHud'>> & { hideHud: boolean };
  private readonly fired: boolean[];
  private readonly origin: { x: number; y: number };
  private readonly trails: { kind: TrailKind; until: number; rate: number; acc: number }[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly rings: Ring[] = [];
  private readonly balls: Ball[] = [];
  private zoom: { from: number; to: number; t0: number; duration: number } | null = null;
  private zoomNow = 0;
  private radioShown = new Set<number>();
  /** Radio lines to show: the session reads and clears these each frame. */
  readonly newRadio: RadioLine[] = [];
  private lastPose: ShipPose | null = null;

  constructor(
    readonly def: Cinematic,
    private readonly host: CinematicHost,
    /** Skip straight to the end state (a checkpoint restart replays an intro this way). */
    instant = false,
  ) {
    const input = def.lock?.input ?? true;
    this.lock = {
      input,
      weapons: def.lock?.weapons ?? true,
      enemies: def.lock?.enemies ?? 'hold',
      invulnerable: def.lock?.invulnerable ?? true,
      bossInvincible: def.lock?.bossInvincible ?? false,
      hideHud: def.lock?.hideHud ?? input,
    };
    this.fired = (def.world ?? []).map(() => false);
    this.origin = host.shipPos();
    host.begin(this.lock);
    if (def.props?.length && !instant) host.setScenery((g) => this.drawProps(g));
    if (instant) this.skip();
  }

  /** The cinematic's own HUD hiding (the session hides its timer box with it). */
  get hidesHud(): boolean {
    return this.lock.hideHud;
  }

  get canSkip(): boolean {
    const s = this.def.skippableAfter;
    return s !== false && this.time >= (s ?? 1.2);
  }

  update(dt: number): void {
    if (this.done) return;
    this.time = Math.min(this.def.duration, this.time + dt);
    const t = this.time;
    // World events.
    (this.def.world ?? []).forEach((e, i) => {
      if (!this.fired[i] && t >= e.t) {
        this.fired[i] = true;
        this.fire(e, false);
      }
    });
    this.applyTracks(t);
    // Trails.
    for (const tr of this.trails) {
      if (t >= tr.until) continue;
      tr.acc += dt * tr.rate;
      const p = this.lastPose ?? { ...this.host.shipPos(), scale: 1, rot: 0, flip: 1 };
      while (tr.acc >= 1) {
        tr.acc -= 1;
        this.emitTrail(tr.kind, p);
      }
    }
    // Projectiles, rings.
    for (const pr of this.projectiles) {
      if (!pr.burst && t >= pr.t0 + pr.duration) {
        pr.burst = true;
        if (pr.hit) {
          const to = pr.to ?? [this.host.shipPos().x, this.host.shipPos().y];
          this.host.explode(to[0], to[1], 30, 0.9);
          this.balls.push({ x: to[0], y: to[1], age: 0, max: 0.7, radius: 60 });
          this.rings.push({ x: to[0], y: to[1], age: 0, max: 0.6, radius: 90 });
        }
      }
    }
    for (const r of this.rings) r.age += dt;
    for (const b of this.balls) b.age += dt;
    // Overlays are pure functions of time; radio lines hand over to the session.
    (this.def.radio ?? []).forEach((r, i) => {
      if (!this.radioShown.has(i) && t >= r.t) {
        this.radioShown.add(i);
        this.newRadio.push(r);
      }
    });
    if (this.zoom) {
      const u = clamp01((t - this.zoom.t0) / Math.max(0.001, this.zoom.duration));
      this.zoomNow = this.zoom.from + (this.zoom.to - this.zoom.from) * easeFn.inOut(u);
      this.host.setPlanetZoom(this.zoomNow);
    }
    if (this.time >= this.def.duration) this.finish();
  }

  private applyTracks(t: number): void {
    const keys = this.def.ship;
    if (keys && keys.length > 0) {
      const o = this.origin;
      const pose: ShipPose = {
        x: sample(keys, t, (k) => k.x ?? (k.dx === undefined ? undefined : o.x + k.dx), o.x),
        y: sample(keys, t, (k) => k.y ?? (k.dy === undefined ? undefined : o.y + k.dy), o.y),
        scale: sample(keys, t, (k) => k.scale, 1),
        rot: sample(keys, t, (k) => k.rot, 0),
        flip: sample(keys, t, (k) => k.flip, 1),
      };
      this.lastPose = pose;
      this.host.setPose(pose);
    }
    if (this.def.boss && this.def.boss.length > 0) this.host.setBossOffset(sample(this.def.boss, t, (k) => k.offsetY, this.def.boss[0].offsetY));
  }

  private fire(e: WorldEvent, silent: boolean): void {
    switch (e.do) {
      case 'explosion': {
        if (silent) break;
        const a = e.at ? this.host.anchor(e.at) : null;
        const x = (a?.x ?? e.x ?? W / 2) + (e.dx ?? 0);
        const y = (a?.y ?? e.y ?? H / 2) + (e.dy ?? 0);
        this.host.explode(x, y, e.radius, e.shake ?? 0.7);
        this.balls.push({ x, y, age: 0, max: 0.55 + e.radius / 280, radius: e.radius });
        if (e.ring !== false) this.rings.push({ x, y, age: 0, max: 0.55 + e.radius / 260, radius: e.radius * 2.2 });
        break;
      }
      case 'projectile':
        if (!silent) this.projectiles.push({ from: e.from, to: e.to ?? null, t0: e.t, duration: e.duration, color: e.color ?? '#ff9a4a', hit: e.hit ?? true, burst: false });
        break;
      case 'burn':
        this.host.burn(e.on);
        break;
      case 'trail':
        if (!silent) this.trails.push({ kind: e.kind, until: e.t + e.duration, rate: e.rate ?? 40, acc: 0 });
        break;
      case 'shake':
        if (!silent) this.host.shake(e.amount);
        break;
      case 'scrollSpeed':
        this.host.setScrollSpeed(e.speed, e.ease ?? 1);
        break;
      case 'planetZoom':
        this.zoom = { from: this.zoomNow, to: e.to, t0: silent ? -1e9 : e.t, duration: e.duration };
        break;
      case 'weather':
        this.host.setWeather(e.intensity, e.ease ?? 3);
        break;
      case 'dismissUnits':
        this.host.dismissUnits(e.tag);
        break;
      case 'setShip':
        this.host.setShip(e.ship);
        break;
    }
  }

  private emitTrail(kind: TrailKind, p: ShipPose): void {
    const s = Math.max(0.15, p.scale);
    const jx = (Math.random() - 0.5) * 18 * s;
    const jy = (Math.random() - 0.5) * 12 * s;
    const rnd = Math.random;
    switch (kind) {
      case 'smoke': {
        const g = 70 + ((rnd() * 60) | 0);
        this.host.emit(p.x + jx, p.y + jy, (rnd() - 0.5) * 50, 40 + rnd() * 80, 0.8 + rnd() * 0.7, `rgb(${g},${g},${g + 8})`, (3 + rnd() * 5) * Math.max(0.6, s));
        break;
      }
      case 'fire':
        this.host.emit(p.x + jx, p.y + jy, (rnd() - 0.5) * 60, 30 + rnd() * 70, 0.3 + rnd() * 0.35, rnd() < 0.5 ? '#ffd21f' : '#ff5a1a', (3 + rnd() * 4) * Math.max(0.6, s));
        break;
      case 'snow':
        this.host.emit(p.x + jx * 2, p.y + jy, (rnd() - 0.5) * 220, -60 - rnd() * 160, 0.5 + rnd() * 0.6, rnd() < 0.7 ? '#ffffff' : '#cfe2f5', 2 + rnd() * 3.5);
        break;
      case 'sparks':
        this.host.emit(p.x + jx, p.y + jy, (rnd() - 0.5) * 360, -120 - rnd() * 260, 0.25 + rnd() * 0.3, rnd() < 0.5 ? '#fff7a8' : '#ff9a3a', 1.5 + rnd() * 2);
        break;
    }
  }

  /** Skip: apply every state change that is left (burn, scroll speed, units leaving, weather, final poses), drop the pure visuals. */
  skip(): void {
    if (this.done) return;
    (this.def.world ?? []).forEach((e, i) => {
      if (this.fired[i]) return;
      this.fired[i] = true;
      this.fire(e, VISUAL.has(e.do));
    });
    this.time = this.def.duration;
    this.applyTracks(this.time);
    if (this.zoom || (this.def.world ?? []).some((e) => e.do === 'planetZoom')) {
      const z = (this.def.world ?? []).filter((e) => e.do === 'planetZoom').pop();
      if (z && z.do === 'planetZoom') this.host.setPlanetZoom(z.to);
    }
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.host.setScenery(null);
    if (this.def.releasePose) this.host.setPose(null);
    // The pose is released when the session ends the cinematic (it may keep it until the objective swap); the boss lead-in stays at its last offset.
    this.host.end();
  }

  /** Overlay alpha of each layer now: [{ layer, kind, color, alpha }]. */
  overlayState(): { layer: string; kind: 'fade' | 'vignette'; color: string; alpha: number }[] {
    const out = new Map<string, { layer: string; kind: 'fade' | 'vignette'; color: string; alpha: number }>();
    const prev = new Map<string, number>();
    for (const o of [...(this.def.overlays ?? [])].sort((a, b) => a.t - b.t)) {
      const layer = o.layer ?? 'fade';
      const from = prev.get(layer) ?? 0;
      const u = clamp01((this.time - o.t) / Math.max(0.001, o.duration));
      if (this.time >= o.t) {
        out.set(layer, { layer, kind: o.kind ?? 'fade', color: o.color, alpha: from + (o.to - from) * easeFn.inOut(u) });
      }
      prev.set(layer, o.to);
    }
    return [...out.values()];
  }

  draw(g: CanvasRenderingContext2D): void {
    const t = this.time;
    // Projectiles and rings.
    for (const pr of this.projectiles) {
      if (pr.burst) continue;
      const to = pr.to ?? [this.host.shipPos().x, this.host.shipPos().y];
      const u = clamp01((t - pr.t0) / pr.duration);
      const head = [pr.from[0] + (to[0] - pr.from[0]) * u, pr.from[1] + (to[1] - pr.from[1]) * u];
      const tail = [pr.from[0] + (to[0] - pr.from[0]) * Math.max(0, u - 0.28), pr.from[1] + (to[1] - pr.from[1]) * Math.max(0, u - 0.28)];
      g.save();
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(tail[0], tail[1]);
      g.lineTo(head[0], head[1]);
      g.stroke();
      g.strokeStyle = pr.color;
      g.lineWidth = 8;
      g.globalAlpha = 0.45;
      g.stroke();
      g.restore();
    }
    // Fireballs: an additive glow that swells and fades.
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const b of this.balls) {
      const k = b.age / b.max;
      if (k >= 1) continue;
      const r = b.radius * (0.45 + 0.85 * Math.sqrt(k));
      const grad = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      grad.addColorStop(0, 'rgba(255,250,220,1)');
      grad.addColorStop(0.35, 'rgba(255,190,80,0.85)');
      grad.addColorStop(1, 'rgba(255,90,20,0)');
      g.globalAlpha = Math.pow(1 - k, 1.4);
      g.fillStyle = grad;
      g.fillRect(b.x - r, b.y - r, r * 2, r * 2);
    }
    g.restore();
    for (const r of this.rings) {
      const k = r.age / r.max;
      if (k >= 1) continue;
      g.save();
      g.globalAlpha = (1 - k) * 0.8;
      g.strokeStyle = '#ffe2a8';
      g.lineWidth = 6 * (1 - k) + 1;
      g.beginPath();
      g.arc(r.x, r.y, r.radius * (0.15 + 0.85 * Math.sqrt(k)), 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    // Overlays.
    for (const o of this.overlayState()) {
      if (o.alpha <= 0.002) continue;
      g.save();
      g.globalAlpha = Math.min(1, o.alpha);
      if (o.kind === 'fade') {
        g.fillStyle = o.color;
        g.fillRect(0, 0, W, H);
      } else {
        const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, o.color);
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
      }
      g.restore();
    }
  }

  /** Scenery (drawn by the game between the background and the ship). */
  private drawProps(g: CanvasRenderingContext2D): void {
    const ship = this.host.shipPos();
    const wings: { x: number; y: number; rot: number; tag?: string; alpha: number }[] = [];
    for (const p of this.def.props ?? []) {
      if (this.time < p.t) continue;
      if (p.do === 'slope') this.drawSlope(g, p, this.time);
      else if (p.do === 'draw') p.draw(g, this.time);
      else if (p.do === 'wingmen') {
        for (const w of p.wings) {
          const pos = this.wingAt(w, ship);
          if (!pos) continue;
          g.save();
          g.translate(pos.x, pos.y);
          g.rotate(pos.rot);
          drawAllySprite(g, 0, 0, 1.15 * (p.scale ?? 1));
          g.restore();
          wings.push({ ...pos, tag: w.tag, alpha: 1 });
        }
      } else if (p.do === 'scope') {
        if (this.time < p.until) this.drawScope(g, ship, wings, p.label, this.time - p.t);
      } else if (p.do === 'beacon') {
        if (p.until === undefined || this.time < p.until) this.drawBeacon(g, ship, p.label, this.time - p.t);
      }
    }
    g.save();
    g.font = 'bold 11px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(190, 255, 220, 0.85)';
    for (const w of wings) if (w.tag) g.fillText(w.tag, w.x, w.y + 38);
    g.restore();
  }

  /** A wingman's position and heading now, or null before its first key / after its last. */
  private wingAt(w: WingPath, ship: { x: number; y: number }): { x: number; y: number; rot: number; tag?: string } | null {
    const ks = w.keys;
    if (ks.length === 0 || this.time < ks[0].t || this.time > ks[ks.length - 1].t) return null;
    const pt = (k: WingKey): { x: number; y: number; rot: number } => ({
      x: k.x ?? (k.dx === undefined ? ship.x : ship.x + k.dx),
      y: k.y ?? (k.dy === undefined ? ship.y : ship.y + k.dy),
      rot: k.rot ?? 0,
    });
    let i = 0;
    while (i < ks.length - 2 && this.time > ks[i + 1].t) i++;
    if (ks.length === 1) return pt(ks[0]);
    const a = pt(ks[i]);
    const b = pt(ks[i + 1]);
    const u = easeFn[ks[i + 1].ease ?? 'inOut'](clamp01((this.time - ks[i].t) / Math.max(0.001, ks[i + 1].t - ks[i].t)));
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, rot: a.rot + (b.rot - a.rot) * u };
  }

  /** The red weapons-lock look: rotating brackets, lock lines from the wingmen, a warning label. */
  private drawScope(g: CanvasRenderingContext2D, ship: { x: number; y: number }, wings: { x: number; y: number }[], label: string, age: number): void {
    const pulse = 0.6 + 0.4 * Math.sin(age * 9);
    g.save();
    g.strokeStyle = `rgba(255, 70, 60, ${0.55 + 0.4 * pulse})`;
    g.lineWidth = 2;
    for (const w of wings) {
      g.setLineDash([6, 8]);
      g.lineDashOffset = -age * 40;
      g.beginPath();
      g.moveTo(w.x, w.y - 18);
      g.lineTo(ship.x, ship.y);
      g.stroke();
    }
    g.setLineDash([]);
    g.lineWidth = 3;
    const r = 46 - 8 * Math.min(1, age / 1.2);
    g.translate(ship.x, ship.y);
    g.rotate(age * 0.8);
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(0, 0, r, k * (Math.PI / 2) + 0.15, k * (Math.PI / 2) + 1.2);
      g.stroke();
    }
    g.rotate(-age * 0.8);
    g.font = 'bold 12px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.fillStyle = `rgba(255, 110, 100, ${0.65 + 0.35 * pulse})`;
    g.fillText(label, 0, -r - 10);
    g.restore();
  }

  /** The green callsign beacon: rings expanding off the ship and the callsign over it. */
  private drawBeacon(g: CanvasRenderingContext2D, ship: { x: number; y: number }, label: string, age: number): void {
    g.save();
    g.translate(ship.x, ship.y);
    for (let k = 0; k < 3; k++) {
      const u = (age * 0.9 + k / 3) % 1;
      g.strokeStyle = `rgba(120, 255, 190, ${(1 - u) * 0.85})`;
      g.lineWidth = 4 * (1 - u) + 1;
      g.beginPath();
      g.arc(0, 0, 18 + u * 90, 0, Math.PI * 2);
      g.stroke();
    }
    g.font = 'bold 13px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(140, 255, 200, 0.95)';
    g.fillText(label, 0, -52);
    g.restore();
  }

  /** A snow slope that sweeps in from the top and settles with its surface on `line`; the mountain mass is above the line. */
  private drawSlope(g: CanvasRenderingContext2D, p: Extract<Prop, { do: 'slope' }>, t: number): void {
    const u = clamp01((t - p.t) / Math.max(0.01, p.enter));
    const dy = -(1 - easeFn.out(u)) * (H + 260);
    const [x0, y0, x1, y1] = p.line;
    const k = (y1 - y0) / (x1 - x0);
    const xa = -80;
    const xb = W + 80;
    const lineY = (x: number): number => y0 + (x - x0) * k + dy;
    const ya = lineY(xa);
    const yb = lineY(xb);
    const top = Math.min(ya, yb) - 700;
    const lowY = Math.max(ya, yb);
    g.save();
    // Rock mass above the ridge line: bright snow on the slope face, darker rock and shadow higher up.
    const rock = g.createLinearGradient(0, lowY, 0, lowY - 640);
    rock.addColorStop(0, '#f4f9fd');
    rock.addColorStop(0.12, '#d6e3ef');
    rock.addColorStop(0.4, '#8095ad');
    rock.addColorStop(1, '#2c384b');
    g.fillStyle = rock;
    g.beginPath();
    g.moveTo(xa, ya);
    for (let i = 1; i <= 26; i++) {
      const x = xa + ((xb - xa) * i) / 26;
      g.lineTo(x, lineY(x) + Math.sin(i * 12.9898) * 5);
    }
    g.lineTo(xb, top);
    g.lineTo(xa, top);
    g.closePath();
    g.fill();
    // Dark rock teeth breaking through the snow along the ridge, each with a snow-lit edge.
    for (let i = 0; i < 11; i++) {
      const x = -20 + i * 56 + ((i * 37) % 30);
      const ytop = lineY(x) - 38 - ((i * 29) % 50);
      g.fillStyle = '#3d495e';
      g.beginPath();
      g.moveTo(x - 34, lineY(x - 34) + 4);
      g.lineTo(x - 6, ytop);
      g.lineTo(x + 8, ytop + 16);
      g.lineTo(x + 40, lineY(x + 40) + 4);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x - 34, lineY(x - 34) + 4);
      g.lineTo(x - 6, ytop);
      g.stroke();
    }
    // Wind-streaked snow drifts and dark rock ribs running up the slope.
    g.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const x = 20 + ((i * 83) % 520);
      const yy = lineY(x) - 20 - ((i * 47) % 160);
      g.strokeStyle = i % 3 === 0 ? 'rgba(60,72,92,0.55)' : 'rgba(255,255,255,0.5)';
      g.lineWidth = i % 3 === 0 ? 7 : 4;
      g.beginPath();
      g.moveTo(x, yy);
      g.lineTo(x + 70, yy + 70 * k);
      g.stroke();
    }
    // Bright ridge line and the soft cloud / spindrift hanging along it.
    g.strokeStyle = '#ffffff';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(xa, ya);
    g.lineTo(xb, yb);
    g.stroke();
    const lo = Math.min(ya, yb) - 30;
    const hi = Math.max(ya, yb) + 50;
    const skirt = g.createLinearGradient(0, lo, 0, hi);
    skirt.addColorStop(0, 'rgba(255,255,255,0)');
    skirt.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    skirt.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = skirt;
    g.fillRect(0, lo, W, hi - lo);
    g.restore();
  }
}

/** A scrubbed copy of a cinematic's pose for debugging / tests: where the ship is at time t without running anything. */
export function poseAt(c: Cinematic, t: number, from: { x: number; y: number }): ShipPose | null {
  const keys = c.ship;
  if (!keys || keys.length === 0) return null;
  return {
    x: sample(keys, t, (k) => k.x ?? (k.dx === undefined ? undefined : from.x + k.dx), from.x),
    y: sample(keys, t, (k) => k.y ?? (k.dy === undefined ? undefined : from.y + k.dy), from.y),
    scale: sample(keys, t, (k) => k.scale, 1),
    rot: sample(keys, t, (k) => k.rot, 0),
    flip: sample(keys, t, (k) => k.flip, 1),
  };
}
