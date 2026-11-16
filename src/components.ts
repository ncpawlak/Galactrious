import type { Boss } from './boss';
import type { Point } from './hazards';
import { driftSpin, driftVelocity, stepDrift } from './debris';
import { BLAST } from './config';

/**
 * Boss components (DESIGN.md "Boss anatomy: components"): objects attached to a boss at named anchor
 * points. Each has a circular hit area and HIDDEN hp (no bar, no numbers: feedback is a hit flash,
 * sound and visible damage states). Two types so far: TURRET (attack steps can fire from it) and
 * EXPLOSIVE (a blast on destruction). Rooms/consoles and the rest reuse this system later.
 */

/** `console` is created from a room's `consoles` (see rooms.ts): it powers its room, and is embedded in the rooms layer. */
export type ComponentType = 'turret' | 'explosive' | 'console';
/** surface: always targetable, drawn over the hull. embedded: sits in `layer`, targetable once every layer above is empty over its centre. */
export type MountType = 'surface' | 'embedded';
export type TurretAim = 'fixed' | 'tracking' | 'rotating';

export interface BlastSpec {
  /** Radius in px. Everything within it is affected, weaker with distance. */
  radius: number;
  /** Carve energy for the boss layers (same density rules as bullets, so tough layers resist). */
  energy: number;
  /** Damage to other components at the blast centre (default energy / 20). */
  damage?: number;
  /** Damage to the core at the blast centre, before core armor (default `damage`). */
  coreDamage?: number;
  /** Falloff exponent on (1 - distance / radius): 1 = linear (default), <1 = flatter, >1 = sharper. */
  falloff?: number;
}

/** Blast kinds with a default size in `BLAST.defaults`. */
export type BlastKind = keyof typeof BLAST.defaults;

export interface ResolvedBlast extends Required<BlastSpec> {
  /** How far the shock reaches other components and the core: grows only with scale^reachExp, so big scales do not chain the whole boss. */
  reach: number;
}

/**
 * The effective blast for a type: defaults, then `over`, with the global `BLAST.scale` applied
 * (radius x scale^radiusExp, energy x scale^energyExp, damage and coreDamage x scale^damageExp).
 */
export function resolveBlast(kind: BlastKind, over?: Partial<BlastSpec>): ResolvedBlast {
  const d = BLAST.defaults[kind];
  const radius = over?.radius ?? d.radius;
  const areaK = (radius / d.radius) ** 2;
  const s = BLAST.scale;
  const rK = s ** BLAST.radiusExp;
  const eK = s ** BLAST.energyExp;
  const dK = s ** BLAST.damageExp;
  const energy = (over?.energy ?? d.energy * areaK) * eK;
  const damage = (over?.damage ?? d.damage) * dK;
  return { radius: radius * rK, reach: radius * s ** BLAST.reachExp, energy, damage, coreDamage: (over?.coreDamage ?? d.coreDamage) * dK, falloff: over?.falloff ?? d.falloff };
}

export interface TurretSpec {
  aim: TurretAim;
  /** Degrees, 90 = straight down. fixed: the aim; rotating: the start angle; tracking: the rest angle. */
  angle?: number;
  /** tracking: barrel turn speed in deg/s (default 160). */
  trackRate?: number;
  /** rotating: spin in deg/s (default 70; negative = other way). */
  spin?: number;
  /** Seconds of glow before each shot (default 0.5). */
  telegraph?: number;
}

export interface ComponentSpec {
  id: string;
  type: ComponentType;
  /** Named point in `BossSpec.anchors` (layout px; mirrored with the layout). */
  anchor: string;
  /** Hit area radius in px. */
  radius: number;
  hp: number;
  mount: MountType;
  /** Layer index. embedded: required. surface: the layer it is attached to (default 0, the hull). */
  layer?: number;
  /** One destruction/phase/source key can address several components. */
  group?: string;
  /** Start inert (turrets do not fire; still shootable). Phases can enable it. Default true. */
  enabled?: boolean;
  turret?: TurretSpec;
  /** Overrides for this component's blast; missing fields come from `BLAST.defaults` for its type. Every turret, explosive and console blasts. */
  blast?: Partial<BlastSpec>;
  /** Crater carved on destruction (defaults radius = spec radius, energy = radius^2 * 6). */
  crater?: { radius?: number; energy?: number };
  /** On destruction, disable these components (ids or groups). */
  disables?: string[];
}

/** Phase-level control over components. Targets are ids or groups. */
export interface PhaseComponents {
  enable?: string[];
  disable?: string[];
  /** `intervalScale` multiplies the pause after steps that fire from the target (e.g. 0.6 = faster). */
  modifiers?: { target: string; intervalScale?: number }[];
}

/** Core armor owned by the boss definition. With no `requires` and defaults it equals the old formula. */
export interface CoreArmorSpec {
  /** Vulnerability while fully walled in (default TUNING.coreArmor.min). */
  min?: number;
  /** Weight of the "layers dug" term (default 1). */
  digWeight?: number;
  /** Destroying each of these (ids/groups) raises vulnerability by `perComponent`. */
  requires?: string[];
  /** Default (1 - min) / number of required components. */
  perComponent?: number;
}

/** A firing position for an attack step: where it comes from (live) and where the aim point is. */
export interface FireSource {
  origin: () => Point;
  target: Point;
  /** False once the source is destroyed, detached, disabled or unpowered: hazards it started end. */
  alive: () => boolean;
}

/** Lets a scheduler ask whether a step's source can fire and show the telegraph glow. */
export interface SourceGate {
  usable(source: string): boolean;
  /** Called every frame while a step from `source` is `secondsLeft` away from firing. */
  warn(source: string, secondsLeft: number): void;
}

export type ComponentEvent =
  | { kind: 'hit'; x: number; y: number }
  | { kind: 'state'; x: number; y: number; level: number }
  | { kind: 'destroy'; x: number; y: number; blast: boolean; radius: number; type: ComponentType | 'room' }
  | { kind: 'detach'; x: number; y: number }
  /** A room's first console just became visible: its reaction starts (telegraph, sound, shake). */
  | { kind: 'roomExposed'; x: number; y: number; name: string }
  /** Every console of a room is gone: its function went offline. `blast` when the room also blew up. */
  | { kind: 'roomOffline'; x: number; y: number; name: string; blast: boolean };

type State = 'active' | 'dying' | 'destroyed' | 'detached';

const RAD = Math.PI / 180;
const HIT_FLASH = 0.09;
const CHAIN_DELAY = 0.07;
const DRIFT_LIFE = 2.4;
const DEFAULT_TELEGRAPH = 0.5;

interface Crack {
  a: number;
  len: number;
  bend: number;
}

export class BossComponent {
  hp: number;
  readonly maxHp: number;
  state: State = 'active';
  enabled: boolean;
  /** False while a room that powers this component is offline: no fire, drawn dark. Phases cannot turn it back on. */
  powered = true;
  /** Room alert (s): a console glows while its room's reaction is telegraphed. */
  alert = 0;
  /** Layout position (boss-local px, already mirrored). */
  readonly lx: number;
  readonly ly: number;
  flash = 0;
  glow = 0;
  muzzle = 0;
  /** 0 = healthy, 1..3 = below 75 / 50 / 25 %. */
  level = 0;
  /** Turret barrel angle, radians (canvas: 0 = +x, pi/2 = down). */
  angle: number;
  readonly layer: number;
  readonly cracks: Crack[] = [];
  smokeTimer = Math.random() * 0.2;
  sparkTimer = Math.random() * 0.4;
  /** Support samples (layout px offsets) and how many were solid at the start. */
  supportBase = 1;
  /** Free-floating state once detached (screen space). */
  drift = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, age: 0 };
  dyingFor = 0;

  constructor(
    readonly spec: ComponentSpec,
    lx: number,
    ly: number,
    mirrored: boolean,
  ) {
    this.hp = this.maxHp = spec.hp;
    this.enabled = spec.enabled ?? true;
    this.lx = lx;
    this.ly = ly;
    this.layer = spec.mount === 'embedded' ? (spec.layer ?? 0) : (spec.layer ?? 0);
    const t = spec.turret;
    let a = (t?.angle ?? 90) * RAD;
    if (mirrored) a = Math.PI - a;
    this.angle = a;
    let seed = 0;
    for (let i = 0; i < spec.id.length; i++) seed = (seed * 31 + spec.id.charCodeAt(i)) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 6; i++) this.cracks.push({ a: rnd() * Math.PI * 2, len: 0.55 + rnd() * 0.55, bend: (rnd() - 0.5) * 1.2 });
  }

  matches(key: string): boolean {
    return this.spec.id === key || this.spec.group === key;
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'spark' | 'smoke' | 'shard' | 'ring' | 'flash';
  /** ring/flash: final radius */
  r1: number;
}

/** Runtime for one boss's components. Owned by BossFight; drawn through hooks on the Boss. */
export class ComponentSystem implements SourceGate {
  readonly items: BossComponent[] = [];
  /** Events for the game to turn into juice and sound; drain with splice(0). */
  readonly events: ComponentEvent[] = [];
  /** Player position, for tracking turrets (set by the game). */
  target: Point = { x: 270, y: 800 };
  /** Debug: draw hit areas and ids. */
  debug = false;
  /** Extra debug drawing (the room system adds room and exposure info). */
  extraDebug: ((ctx: CanvasRenderingContext2D) => void) | null = null;
  /** Core vulnerability, 0..1 (set by BossFight): blast damage to the core is scaled by it. */
  vulnerability: () => number = () => 1;
  private particles: Particle[] = [];
  private queue: { c: BossComponent; t: number }[] = [];
  private time = 0;
  private seenVersion = -1;

  constructor(
    readonly boss: Boss,
    private readonly specs: ComponentSpec[],
    private readonly mirrored: boolean,
  ) {
    for (const s of specs) {
      const a = boss.anchors[s.anchor];
      if (!a) throw new Error(`component ${s.id}: unknown anchor "${s.anchor}"`);
      const c = new BossComponent(s, a.x, a.y, mirrored);
      c.supportBase = this.support(c);
      if (c.supportBase < 0.5) console.warn(`component ${s.id}: only ${(c.supportBase * 100) | 0}% of its footprint is solid in layer ${c.layer}; check its anchor`);
      this.items.push(c);
    }
    if (this.items.length > 0) {
      boss.layerHook = (ctx, li, ox, oy) => this.drawLayer(ctx, li, ox, oy);
      boss.topHook = (ctx, ox, oy) => this.drawTop(ctx, ox, oy);
      boss.onDetach = (li, isOrphan) => this.onDetach(li, isOrphan);
    }
  }

  get active(): boolean {
    return this.items.length > 0;
  }

  // --- queries ------------------------------------------------------------------------------

  pos(c: BossComponent): Point {
    return c.state === 'detached' ? { x: c.drift.x, y: c.drift.y } : { x: this.boss.x + c.lx, y: this.boss.y + c.ly };
  }

  /** Boss layers above the component's own are empty over its centre (you can see it). */
  isExposed(c: BossComponent): boolean {
    return this.boss.isExposed(c.layer, Math.floor(c.lx), Math.floor(c.ly));
  }

  targetable(c: BossComponent): boolean {
    return c.state === 'active' && (c.spec.mount === 'surface' || this.isExposed(c));
  }

  /** Number of destroyed components matching any of `keys` (ids or groups). */
  destroyedCount(keys: string[]): number {
    return this.items.filter((c) => c.state === 'destroyed' && keys.some((k) => c.matches(k))).length;
  }

  totalCount(keys: string[]): number {
    return this.specs.filter((s) => keys.some((k) => s.id === k || s.group === k)).length;
  }

  // --- turret sources -----------------------------------------------------------------------

  private firing(source: string): BossComponent[] {
    return this.items.filter((c) => c.spec.type === 'turret' && c.matches(source) && c.state === 'active' && c.enabled && c.powered);
  }

  usable(source: string): boolean {
    return this.firing(source).length > 0;
  }

  warn(source: string, secondsLeft: number): void {
    for (const c of this.firing(source)) {
      const tel = c.spec.turret?.telegraph ?? DEFAULT_TELEGRAPH;
      if (secondsLeft < tel) c.glow = Math.max(c.glow, 1 - Math.max(0, secondsLeft) / tel);
    }
  }

  /** Fire from every live turret matching `source`: returns their live origins and aim points. */
  fireFrom(source: string): FireSource[] {
    return this.firing(source).map((c) => this.sourceOf(c));
  }

  /** Debug schedulers and [F]: fire from one live turret, taking them in turn. Empty when none is left. */
  fireFromAny(): FireSource[] {
    const live = this.items.filter((c) => c.spec.type === 'turret' && c.state === 'active' && c.enabled && c.powered);
    if (live.length === 0) return [];
    return [this.sourceOf(live[this.anyTurn++ % live.length])];
  }

  private anyTurn = 0;

  private sourceOf(c: BossComponent): FireSource {
    c.glow = 0;
    c.muzzle = 0.12;
    const muzzle = () => {
      const p = this.pos(c);
      return { x: p.x + Math.cos(c.angle) * c.spec.radius * 0.9, y: p.y + Math.sin(c.angle) * c.spec.radius * 0.9 };
    };
    const o = muzzle();
    return {
      origin: muzzle,
      target: { x: o.x + Math.cos(c.angle) * 400, y: o.y + Math.sin(c.angle) * 400 },
      alive: () => c.state === 'active' && c.enabled && c.powered,
    };
  }

  /** True when `source` (id or group) names at least one turret: used to validate boss definitions. */
  hasTurret(source: string): boolean {
    return this.items.some((c) => c.spec.type === 'turret' && c.matches(source));
  }

  // --- phases -------------------------------------------------------------------------------

  applyPhase(pc: PhaseComponents | undefined): void {
    if (!pc) return;
    for (const k of pc.enable ?? []) for (const c of this.items) if (c.matches(k)) c.enabled = true;
    for (const k of pc.disable ?? []) for (const c of this.items) if (c.matches(k)) c.enabled = false;
  }

  // --- damage -------------------------------------------------------------------------------

  /** A player bullet at (px, py): damages and consumes itself on the first targetable component it touches. */
  hit(px: number, py: number, energy: number): boolean {
    if (this.items.length === 0) return false;
    for (const c of this.items) {
      if (!this.targetable(c)) continue;
      const p = this.pos(c);
      if (Math.hypot(px - p.x, py - p.y) > c.spec.radius) continue;
      c.flash = HIT_FLASH;
      this.boss.sinceHit = 0;
      this.events.push({ kind: 'hit', x: px, y: py });
      this.spark(px, py, 3, '#fff2b0');
      this.damage(c, energy);
      this.flush();
      return true;
    }
    return false;
  }

  private damage(c: BossComponent, amount: number): void {
    if (c.state !== 'active') return;
    c.hp -= amount;
    if (c.hp <= 0) {
      c.hp = 0;
      c.state = 'dying';
      this.queue.push({ c, t: 0 });
      return;
    }
    const level = c.hp / c.maxHp > 0.75 ? 0 : c.hp / c.maxHp > 0.5 ? 1 : c.hp / c.maxHp > 0.25 ? 2 : 3;
    if (level > c.level) {
      c.level = level;
      const p = this.pos(c);
      this.events.push({ kind: 'state', x: p.x, y: p.y, level });
      this.spark(p.x, p.y, 6 + level * 2, '#ffb43a');
      this.smoke(p.x, p.y, 3);
    }
  }

  /** Run every queued destruction that is due. Chains re-enter the queue; each component dies once. */
  private flush(): void {
    for (let guard = 0; guard < 500; guard++) {
      const i = this.queue.findIndex((q) => q.t <= 0);
      if (i < 0) return;
      const { c } = this.queue.splice(i, 1)[0];
      this.explode(c);
    }
  }

  private explode(c: BossComponent): void {
    const p = this.pos(c);
    c.state = 'destroyed';
    const blast = resolveBlast(c.spec.type, c.spec.blast);
    this.events.push({ kind: 'destroy', x: p.x, y: p.y, blast: true, radius: blast.radius, type: c.spec.type });

    // Own footprint first (explicit `crater` overrides the default hit-radius crater); the blast then carves wider.
    const cr = c.spec.crater;
    const cRad = cr?.radius ?? c.spec.radius;
    this.boss.carveRadial(c.lx, c.ly, cRad, cr?.energy ?? cRad * cRad * 6, 1);

    this.destroyEffect(p.x, p.y, c, blast.radius);
    this.blastAt(c.lx, c.ly, p, blast, c);
    for (const k of c.spec.disables ?? []) for (const o of this.items) if (o.matches(k)) o.enabled = false;
  }

  /** Carve, damage neighbours (chains) and hurt the core around layout point (lx, ly), screen position `p`. Never touches the player. */
  private blastAt(lx: number, ly: number, p: Point, blast: ResolvedBlast, self: BossComponent | null): void {
    this.boss.carveRadial(lx, ly, blast.radius, blast.energy, blast.falloff ?? 1);
    const f = blast.falloff ?? 1;
    const dmg = blast.damage ?? blast.energy / 20;
    for (const o of this.items) {
      if (o === self || o.state !== 'active') continue;
      const op = this.pos(o);
      const d = Math.hypot(op.x - p.x, op.y - p.y);
      if (d > blast.radius) continue;
      const w = Math.pow(1 - d / blast.radius, f);
      o.flash = HIT_FLASH;
      this.damage(o, dmg * w);
      if ((o.state as State) === 'dying') {
        // Chain: queue with a short delay so the reaction reads as a ripple.
        const q = this.queue.find((e) => e.c === o);
        if (q) q.t = CHAIN_DELAY + d / 900;
      }
    }
    // The core takes damage scaled by its current armor.
    const cx = this.boss.x + this.boss.core.x;
    const cy = this.boss.y + this.boss.core.y;
    const dc = Math.max(0, Math.hypot(cx - p.x, cy - p.y) - this.boss.core.radius);
    if (dc < blast.radius && this.boss.core.hp > 0) {
      const w = Math.pow(1 - dc / blast.radius, f);
      this.boss.damageCore((blast.coreDamage ?? dmg) * w * this.vulnerability());
    }
  }

  /** A room blows up (explodeOnDisable): the same blast, crater and chain as an explosive piece, boss-only. */
  roomBlast(lx: number, ly: number, over?: Partial<BlastSpec>): void {
    const p = { x: this.boss.x + lx, y: this.boss.y + ly };
    const blast = resolveBlast('room', over);
    this.events.push({ kind: 'destroy', x: p.x, y: p.y, blast: true, radius: blast.radius, type: 'room' });
    this.blastEffect(p.x, p.y, blast.radius, '#ff9a3c', '#b8541f');
    this.blastAt(lx, ly, p, blast, null);
    this.flush();
  }

  /** Telegraph glow on a room's consoles (they pulse for `seconds`). */
  alertConsoles(cs: BossComponent[], seconds: number): void {
    for (const c of cs) c.alert = Math.max(c.alert, seconds);
  }

  /** A little ring and sparks at a room, for the telegraph moment. */
  pingAt(lx: number, ly: number, radius: number): void {
    const p = { x: this.boss.x + lx, y: this.boss.y + ly };
    this.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 0, color: '255, 70, 70', kind: 'ring', r1: radius });
    this.spark(p.x, p.y, 10, '#ff6a6a');
  }

  // --- anchoring ----------------------------------------------------------------------------

  /** Fraction of sample points under the component that are solid in its attach layer. */
  private support(c: BossComponent): number {
    const r = c.spec.radius * 0.9;
    let solid = 0;
    let n = 0;
    for (const [fx, fy] of SAMPLES) {
      n++;
      if (this.boss.isSolid(c.layer, Math.floor(c.lx + fx * r), Math.floor(c.ly + fy * r))) solid++;
    }
    return solid / n;
  }

  /**
   * Surface or embedded, the part needs solid pixels in its attach layer under it. It lets go once little
   * is left: under 30% of the sample points, or under half of what it started with, whichever is lower
   * (and always when none is left).
   */
  private mountLost(c: BossComponent): boolean {
    const s = this.support(c);
    return s <= 0 || s < Math.min(0.3, c.supportBase * 0.5);
  }

  /** The anchoring pass is about to cut orphan pixels loose in layer `li`: take along components attached there. */
  private onDetach(li: number, isOrphan: (x: number, y: number) => boolean): void {
    for (const c of this.items) {
      if (c.layer !== li || (c.state !== 'active' && c.state !== 'dying')) continue;
      const r = c.spec.radius * 0.5;
      let solid = 0;
      let orphan = 0;
      for (const [fx, fy] of SAMPLES) {
        const x = Math.floor(c.lx + fx * r);
        const y = Math.floor(c.ly + fy * r);
        if (!this.boss.isSolid(li, x, y)) continue;
        solid++;
        if (isOrphan(x, y)) orphan++;
      }
      if (solid > 0 && orphan * 2 >= solid) this.detach(c);
    }
  }

  private detach(c: BossComponent): void {
    const p = this.pos(c);
    const cx = this.boss.x + this.boss.core.x;
    const cy = this.boss.y + this.boss.core.y;
    const v = driftVelocity(p, { x: cx, y: cy });
    this.queue = this.queue.filter((q) => q.c !== c);
    c.state = 'detached';
    c.drift = { x: p.x, y: p.y, vx: v.vx, vy: v.vy, rot: 0, spin: driftSpin(v.vx), age: 0 };
    this.events.push({ kind: 'detach', x: p.x, y: p.y });
  }

  // --- update -------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.items.length === 0) return;
    this.time += dt;

    // Surface mounts lose their hold when the hull under them is gone.
    if (this.boss.version !== this.seenVersion) {
      this.seenVersion = this.boss.version;
      for (const c of this.items) {
        if (c.state !== 'active' || c.supportBase <= 0) continue;
        if (this.mountLost(c)) {
          // Nothing left to hold it (carved away, not cut off as a chunk): it is destroyed, with its normal
          // effect (crater, blast for explosives). Chunks that break away carry their parts off in `onDetach`.
          c.state = 'dying';
          this.queue.push({ c, t: 0 });
        }
      }
    }

    for (const q of this.queue) q.t -= dt;
    this.flush();

    for (const c of this.items) {
      c.flash = Math.max(0, c.flash - dt);
      c.muzzle = Math.max(0, c.muzzle - dt);
      c.glow = Math.max(0, c.glow - dt * 3);
      c.alert = Math.max(0, c.alert - dt);
      if (c.state === 'dying') c.dyingFor += dt;
      if (c.state === 'detached') {
        const d = c.drift;
        d.age += dt;
        stepDrift(d, dt);
        continue;
      }
      if (c.state !== 'active') continue;
      this.updateTurret(c, dt);
      if (c.level >= 1) {
        const p = this.pos(c);
        c.sparkTimer -= dt;
        if (c.sparkTimer <= 0) {
          c.sparkTimer = 0.5 / c.level + Math.random() * 0.4;
          this.spark(p.x + (Math.random() - 0.5) * c.spec.radius, p.y + (Math.random() - 0.5) * c.spec.radius, 2, '#ffd23a');
        }
      }
      if (c.level >= 2) {
        const p = this.pos(c);
        c.smokeTimer -= dt;
        if (c.smokeTimer <= 0) {
          c.smokeTimer = 0.22 / (c.level - 1) + Math.random() * 0.1;
          this.smoke(p.x, p.y, 1);
        }
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const c = this.items[i];
      if (c.state === 'detached' && c.drift.age > DRIFT_LIFE) this.items.splice(i, 1);
    }

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') p.size += dt * 6;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private updateTurret(c: BossComponent, dt: number): void {
    const t = c.spec.turret;
    if (!t || !c.enabled || !c.powered) return;
    const m = this.mirrored ? -1 : 1;
    if (t.aim === 'rotating') {
      c.angle += (t.spin ?? 70) * RAD * dt * m;
    } else if (t.aim === 'tracking') {
      const p = this.pos(c);
      const want = Math.atan2(this.target.y - p.y, this.target.x - p.x);
      let diff = want - c.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const step = (t.trackRate ?? 160) * RAD * dt;
      c.angle += Math.max(-step, Math.min(step, diff));
    }
  }

  // --- effects ------------------------------------------------------------------------------

  private spark(x: number, y: number, n: number, color: string, speed = 1): void {
    for (let i = 0; i < n && this.particles.length < 600; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (60 + Math.random() * 140) * speed;
      const life = 0.2 + Math.random() * 0.25;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size: 2, color, kind: 'spark', r1: 0 });
    }
  }

  private smoke(x: number, y: number, n: number): void {
    for (let i = 0; i < n && this.particles.length < 600; i++) {
      const life = 0.7 + Math.random() * 0.5;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 18,
        vy: -10 - Math.random() * 16,
        life,
        max: life,
        size: 4 + Math.random() * 3,
        color: '60, 60, 66',
        kind: 'smoke',
        r1: 0,
      });
    }
  }

  private destroyEffect(x: number, y: number, c: BossComponent, R: number): void {
    const shard = c.spec.type === 'turret' ? '#59627a' : c.spec.type === 'console' ? '#3f8f9a' : '#b8541f';
    this.blastEffect(x, y, R, c.spec.type === 'explosive' ? '#ff9a3c' : '#ffc468', shard);
  }

  /** Visuals for a blast of radius R: shock ring, flash, sparks, smoke and drifting shards, all growing with R. */
  private blastEffect(x: number, y: number, R: number, sparkColor: string, shard: string): void {
    const k = R / 100;
    const ringLife = 0.25 + R / 330;
    this.particles.push({ x, y, vx: 0, vy: 0, life: ringLife, max: ringLife, size: 0, color: '255, 170, 60', kind: 'ring', r1: R });
    this.particles.push({ x, y, vx: 0, vy: 0, life: ringLife * 0.6, max: ringLife * 0.6, size: 0, color: '255, 235, 190', kind: 'ring', r1: R * 0.6 });
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.14 + R / 900, max: 0.14 + R / 900, size: 0, color: '255, 250, 220', kind: 'flash', r1: R * 0.7 });
    this.spark(x, y, Math.round(10 + R / 4), sparkColor, 1 + k * 0.6);
    this.smoke(x, y, Math.round(3 + R / 12));
    // Shards drift outward (debris floats away, it never falls): more, bigger and faster with the blast.
    const n = Math.round(6 + R / 8);
    for (let i = 0; i < n && this.particles.length < 600; i++) {
      const v = driftVelocity({ x, y }, { x, y }, 0.8 + k * 0.7);
      const life = 1.2 + Math.random() * 1.0;
      this.particles.push({ x, y, vx: v.vx, vy: v.vy, life, max: life, size: 2 + Math.random() * (2 + k * 2), color: shard, kind: 'shard', r1: 0 });
    }
  }

  // --- drawing ------------------------------------------------------------------------------

  private drawLayer(ctx: CanvasRenderingContext2D, li: number, ox: number, oy: number): void {
    for (const c of this.items) {
      if (c.spec.mount !== 'embedded' || c.layer !== li || c.state === 'detached' || c.state === 'destroyed') continue;
      this.drawBody(ctx, c, ox + c.lx, oy + c.ly, true);
    }
  }

  private drawTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    for (const c of this.items) {
      if (c.spec.mount === 'embedded' || c.state === 'destroyed') continue;
      if (c.state === 'detached') {
        const d = c.drift;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (DRIFT_LIFE - d.age) / 0.8));
        ctx.translate(Math.round(d.x), Math.round(d.y));
        ctx.rotate(d.rot);
        this.drawBody(ctx, c, 0, 0, false);
        ctx.restore();
        continue;
      }
      this.drawBody(ctx, c, ox + c.lx, oy + c.ly, false);
    }
    for (const c of this.items) {
      // Detached embedded ones also float off, over everything.
      if (c.spec.mount !== 'embedded' || c.state !== 'detached') continue;
      const d = c.drift;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (DRIFT_LIFE - d.age) / 0.8));
      ctx.translate(Math.round(d.x), Math.round(d.y));
      ctx.rotate(d.rot);
      this.drawBody(ctx, c, 0, 0, false);
      ctx.restore();
    }
  }

  private drawBody(ctx: CanvasRenderingContext2D, c: BossComponent, x: number, y: number, embedded: boolean): void {
    const r = c.spec.radius;
    // Heavily damaged parts flicker.
    if (c.state === 'active' && c.level >= 3 && Math.sin(this.time * 47) > 0.55) return;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    const dim = c.state === 'active' && !c.powered ? 0.4 : c.state === 'active' && !c.enabled ? 0.55 : 1;
    ctx.globalAlpha *= dim;

    if (c.spec.type === 'turret') {
      ctx.fillStyle = '#2f3544';
      ctx.strokeStyle = '#9aa6bd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#434c61';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.rotate(c.angle);
      ctx.fillStyle = '#c3cad8';
      ctx.fillRect(0, -r * 0.2, r * 1.15, r * 0.4);
      ctx.fillStyle = '#6b7690';
      ctx.fillRect(r * 0.9, -r * 0.3, r * 0.3, r * 0.6);
      if (c.muzzle > 0) {
        ctx.fillStyle = '#fff0a0';
        ctx.beginPath();
        ctx.arc(r * 1.25, 0, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (c.glow > 0) this.glowAt(ctx, r * (1.1 + 0.5 * c.glow), c.glow);
    } else if (c.spec.type === 'console') {
      // Console: a dark panel with a screen and a status lamp; the lamp goes red and pulses during the room alert.
      const alertK = c.alert > 0 ? 0.5 + 0.5 * Math.sin(this.time * 28) : 0;
      ctx.fillStyle = '#1c2230';
      ctx.strokeStyle = '#6fd3df';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-r, -r * 0.8, r * 2, r * 1.6, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0c3c44';
      ctx.fillRect(-r * 0.7, -r * 0.5, r * 1.4, r * 0.7);
      ctx.fillStyle = `rgba(110, 230, 240, ${0.5 + 0.3 * Math.sin(this.time * 4 + c.lx)})`;
      ctx.fillRect(-r * 0.7, -r * 0.5 + r * 0.5 * ((this.time * 0.8 + c.ly) % 1), r * 1.4, 2);
      ctx.fillStyle = c.alert > 0 ? `rgba(255, ${60 + 120 * alertK | 0}, 60, 1)` : '#58f08a';
      ctx.beginPath();
      ctx.arc(0, r * 0.5, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      if (c.alert > 0) this.glowAt(ctx, r * (1.6 + alertK), 0.5 + 0.5 * alertK);
    } else {
      // Fuel tank: warm drum with hazard stripes and a pulsing cap.
      ctx.fillStyle = '#7a3516';
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = '#ffcf4a';
      ctx.lineWidth = r * 0.22;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(-r + k * r * 0.5, r);
        ctx.lineTo(r + k * r * 0.5, -r);
        ctx.stroke();
      }
      ctx.restore();
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 5 + c.lx);
      ctx.fillStyle = `rgba(255, ${120 + 100 * pulse | 0}, 60, 1)`;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      if (embedded) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Damage states: cracks grow with each threshold.
    if (c.level > 0) {
      ctx.strokeStyle = 'rgba(10, 10, 14, 0.85)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < Math.min(c.cracks.length, c.level * 2); i++) {
        const k = c.cracks[i];
        const ex = Math.cos(k.a) * r * k.len;
        const ey = Math.sin(k.a) * r * k.len;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(ex * 0.5 + Math.cos(k.a + 1.57) * r * k.bend * 0.3, ey * 0.5 + Math.sin(k.a + 1.57) * r * k.bend * 0.3);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      if (c.level >= 2) {
        ctx.fillStyle = `rgba(255, 120, 40, ${0.12 * c.level})`;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Hit flash, and a strobe while waiting to blow in a chain.
    const strobe = c.state === 'dying' && Math.sin(c.dyingFor * 70) > 0;
    if (c.flash > 0 || strobe) {
      ctx.globalAlpha = strobe ? 0.9 : (c.flash / HIT_FLASH) * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (c.state === 'active' && !c.powered) {
      // Offline: dead and dark.
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#05060d';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private glowAt(ctx: CanvasRenderingContext2D, rad: number, k: number): void {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, `rgba(255, 190, 70, ${0.9 * k})`);
    g.addColorStop(1, 'rgba(255, 120, 20, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Sparks, smoke, rings and shards, in screen space. Call after the boss is drawn. */
  drawFx(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;
    ctx.save();
    for (const p of this.particles) {
      const k = Math.max(0, p.life / p.max);
      if (p.kind === 'ring') {
        ctx.strokeStyle = `rgba(${p.color}, ${k})`;
        ctx.lineWidth = 2 + 4 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r1 * (1 - k * k), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'flash') {
        ctx.fillStyle = `rgba(${p.color}, ${k * 0.8})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r1 * (1.2 - k * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(${p.color}, ${k * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /** Debug overlay: hit areas, ids, groups and whether a bullet can reach each one right now. */
  drawDebug(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 1;
    for (const c of this.items) {
      const p = this.pos(c);
      const live = this.targetable(c);
      ctx.strokeStyle = c.state === 'active' ? (live ? '#3dff6a' : '#8a8f9c') : c.state === 'detached' ? '#6aa8ff' : '#ff4d4d';
      ctx.beginPath();
      ctx.arc(p.x, p.y, c.spec.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(`${c.spec.id}${c.spec.group ? ' [' + c.spec.group + ']' : ''} ${c.spec.mount[0]}${c.spec.mount === 'embedded' ? c.layer : ''}${c.enabled ? '' : ' off'}`, p.x, p.y - c.spec.radius - 4);
    }
    ctx.restore();
    this.extraDebug?.(ctx);
  }
}

/** Unit-disc sample points for support and orphan tests: the centre, a ring and the axis ends. */
const SAMPLES: [number, number][] = [
  [0, 0],
  ...Array.from({ length: 8 }, (_, i): [number, number] => [Math.cos((i * Math.PI) / 4) * 0.55, Math.sin((i * Math.PI) / 4) * 0.55]),
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
