import type { Attacks } from './attacks';
import type { AttackStep } from './attackSchedulers';
import type { ScriptedScheduler } from './attackSchedulers';
import type { BossSpec } from './boss';
import { BossFight } from './bossFight';
import type { ComponentSpec, CoreArmorSpec, PhaseComponents } from './components';
import type { BossDefinition } from './bosses/types';
import type { Movement } from './movement';
import { still } from './movement';
import type { Point } from './hazards';
import { NO_SCALE, scaleUnit, type EnemyScale } from './difficulty';
import type { RoomHost, RoomSpec } from './rooms';
import type { ChaseControl } from './stealth/types';

/**
 * Enemy units (DESIGN.md "Enemy units are small bosses"): a `UnitDefinition` is a slimmed-down `BossDefinition`
 * (one phase, at most one small room, no regrowth) and every live unit runs on a `BossFight`, so carving, anchoring, components,
 * attack scripts, blasts and debris are the boss pipeline unchanged. `UnitSystem` owns the units alive at once, their
 * spawn queue, their attack timers and their death.
 */
export interface UnitDefinition {
  id: string;
  name: string;
  /** Small: 1 layer, dies in a few hits. Big: 1-2 layers, many hits, turrets and explosives allowed. */
  size: 'small' | 'big';
  /** Builds the layered masks and core (called per spawned unit, since carving mutates them). */
  layout: () => BossSpec;
  mirror?: boolean;
  /** Faction kit id (`src/factions.ts`): paints turrets and the core in the faction's colours. */
  faction?: string;
  components?: ComponentSpec[];
  /** One small room (catalog function, see src/roomFunctions.ts): its consoles are embedded in the last layer, so you dig to them. Big units only. */
  rooms?: RoomSpec[];
  /** Core armor rules. Default for units: none (the core takes full damage once a bullet reaches it). */
  coreArmor?: CoreArmorSpec;
  /** The unit dies when this share (0..1) of its layer pixels is gone, even if the core still stands. Default 0.6 small, 0.75 big. */
  deathFraction?: number;
  /** Idle movement in the formation slot (offsets from the slot). Default: still. */
  hold?: Movement;
  /** Looped attack script; every step needs a `source` (a turret id or group of this unit). */
  attacks: AttackStep[];
  /** Seconds after arriving in the slot before the first shot (default 1; each unit adds a little random jitter). */
  attackDelay?: number;
  /**
   * Ground structure (src/terrain: walls, bunker pads): terrain, not an enemy. It does not count as a wave remnant (`remaining`) or a live
   * target for the autopilot (`live`), and like a flyby it only fires while its centre is on screen. The terrain system moves and removes it.
   */
  ground?: boolean;
  /** A named empire ace (DESIGN.md "As built: finale systems"): the HUD shows its callsign above it and a banner when it enters; counts as a kill like any unit. */
  ace?: boolean;
  /** Callsign shown on the tag and banner (aces). */
  callsign?: string;
  /** Tag / banner colour (aces): the paint accent. */
  accent?: string;
  /** A second attack set, switched to when this share (0..100) of the hull pixels is gone (the unit is a two-phase fight). */
  phase2?: { at: number; attacks: AttackStep[]; attackDelay?: number; components?: PhaseComponents };
  /**
   * A fallback weapon set: once EVERY component matching `keys` (ids or groups) is destroyed, the components in `enable` switch on (they start
   * disabled and have steps in the attack lists, which skip them until then). A mini-boss that loses its visible guns grows new ones.
   */
  lastStand?: { keys: string[]; enable: string[] };
  /**
   * Own entrance and dives, used when the spawn does not bring a flyby: the placement derived from the slot replaces the caller's
   * `entrance`/`entranceTime`/`dive` (campaign `spawn` beats and the debug spawner place units without any, so this is how an ace flies in).
   */
  placement?: (slot: Point) => Pick<UnitPlacement, 'entrance' | 'entranceTime' | 'dive'>;
}

/** How a unit is placed when it spawns. */
export interface UnitPlacement {
  /** Formation slot: where the unit's centre ends up. */
  slot: Point;
  /** Flight from the spawn point to the slot: screen-space centre positions, u = 0..1. Omitted = appears at the slot. */
  entrance?: (u: number) => Point;
  /** Seconds the entrance takes. */
  entranceTime?: number;
  /**
   * A FLYBY: the unit flies `path` (screen-space centre, u = 0..1) over `time` s, shooting as it goes, and is then removed
   * (it left the screen: not a kill). Overrides the entrance, hold and dives; the slot is only the reference point.
   */
  flyby?: { path: (u: number) => Point; time: number };
  /**
   * A CHASE (src/stealth/chase.ts): the controller flies the unit (screen-space centre) every frame, `canFire()` gates its attack
   * script, and the unit is removed when `done()` (it gave up and left: not a kill). Overrides the entrance, hold and dives.
   */
  chase?: ChaseControl;
  /** Optional dives out of the slot: after `first` s of holding, every `every` s fly `path` (relative to the slot) over `time` s and return. */
  dive?: { first: number; every: number; time: number; path: (u: number) => Point };
}

const smooth = (u: number): number => { const c = Math.min(1, Math.max(0, u)); return c * c * (3 - 2 * c); };

/** Entrance, then idle in the slot with optional dives, as one `Movement` (offsets from the slot centre; t = seconds since spawn). */
function placementMovement(def: UnitDefinition, p: UnitPlacement): Movement {
  const fb = p.flyby;
  const ch = p.chase;
  if (ch) {
    return {
      name: 'chase',
      at: (t) => {
        const q = ch.step(t);
        return { x: q.x - p.slot.x, y: q.y - p.slot.y };
      },
    };
  }
  if (fb) {
    return {
      name: 'flyby',
      at: (t) => {
        const q = fb.path(Math.min(1, t / fb.time));
        return { x: q.x - p.slot.x, y: q.y - p.slot.y };
      },
    };
  }
  const hold = def.hold ?? still;
  const eT = p.entrance ? (p.entranceTime ?? 2) : 0;
  const d = p.dive;
  return {
    name: 'unit',
    at: (t) => {
      if (p.entrance && t < eT) {
        const q = p.entrance(t / eT);
        return { x: q.x - p.slot.x, y: q.y - p.slot.y };
      }
      const tt = t - eT;
      const h = hold.at(tt);
      if (d && tt >= d.first) {
        const k = (tt - d.first) % (d.every + d.time);
        if (k >= d.every) {
          const u = (k - d.every) / d.time;
          const q = d.path(u);
          // Fade the idle sway out and back in so the dive starts and ends exactly in the slot.
          const w = 1 - Math.min(smooth(u / 0.1), smooth((1 - u) / 0.1));
          return { x: q.x + h.x * w, y: q.y + h.y * w };
        }
      }
      return h;
    },
  };
}

/** A single-phase BossDefinition for one unit instance (the spec is built once here so the spawn point can use its height). */
export function toBossDefinition(def: UnitDefinition, p: UnitPlacement, attackDelay: number): { def: BossDefinition; spec: BossSpec } {
  const spec = def.layout();
  const eT = p.entrance ? (p.entranceTime ?? 2) : 0;
  const bossDef: BossDefinition = {
    id: def.id,
    name: def.name,
    layout: () => spec,
    spawn: { x: p.slot.x, y: p.slot.y - spec.height / 2 },
    mirror: def.mirror,
    components: def.components,
    rooms: def.rooms,
    faction: def.faction,
    coreArmor: def.coreArmor ?? { min: 1 },
    phases: [
      { name: 'unit', movement: placementMovement(def, p), attacks: def.attacks, attackDelay: eT + attackDelay },
      ...(def.phase2
        ? [{ name: 'unit-2', trigger: { kind: 'damage' as const, percent: def.phase2.at }, movement: placementMovement(def, p), attacks: def.phase2.attacks, attackDelay: def.phase2.attackDelay ?? 0.6, components: def.phase2.components }]
        : []),
    ],
  };
  return { def: bossDef, spec };
}

/** Seconds a dying unit takes to flash out before it is removed. */
const DYING_TIME = { small: 0.22, big: 0.5 };

export class Unit {
  readonly fight: BossFight;
  sched: ScriptedScheduler;
  readonly big: boolean;
  state: 'alive' | 'dying' = 'alive';
  dyingFor = 0;
  /** True once removed from play (the system drops it next frame). */
  gone = false;
  /** Seconds since it spawned; a flyby is removed when it reaches `lifetime`. */
  age = 0;
  readonly lifetime: number | null;
  /** The chase controller of a chaser (see `UnitPlacement.chase`), else null. */
  readonly chase: ChaseControl | null;
  /** Campaign tag it was spawned with (objectives and bonus rules address units by it). */
  tag?: string;
  /** Seconds since a script told it to break off and fly away (null = it fights). A leaving unit never fires and is not a kill when it goes. */
  leaving: number | null = null;
  leaveDirX = 1;
  /** `UnitDefinition.lastStand` has fired. */
  lastStandOn = false;
  private readonly deathFraction: number;

  constructor(
    readonly def: UnitDefinition,
    placement: UnitPlacement,
    jitter: number,
    ship: Point,
  ) {
    const { def: bd } = toBossDefinition(def, placement, (def.attackDelay ?? 1) + jitter);
    this.lifetime = placement.flyby ? placement.flyby.time : null;
    this.chase = placement.chase ?? null;
    this.fight = new BossFight(bd);
    this.fight.components.target = ship;
    this.sched = this.fight.makeScheduler();
    if (def.phase2) this.fight.onPhaseChange = () => (this.sched = this.fight.makeScheduler());
    this.big = def.size === 'big';
    this.fight.boss.coreSimple = !this.big;
    this.deathFraction = def.deathFraction ?? (this.big ? 0.75 : 0.6);
    this.fight.update(0); // place it at its entrance start
  }

  get boss() {
    return this.fight.boss;
  }

  /** Centre of the unit in screen space. */
  center(): Point {
    const b = this.fight.boss;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /** Break off: stop firing and fly away off the top of the screen, sideways away from the middle. */
  leave(): void {
    if (this.leaving !== null || this.state !== 'alive') return;
    this.leaving = 0;
    this.leaveDirX = this.center().x < 270 ? -1 : 1;
  }

  /** Core gone or mostly carved away. */
  get shouldDie(): boolean {
    return this.state === 'alive' && (this.fight.boss.defeated || this.fight.pixelDamagePercent >= this.deathFraction * 100);
  }

  die(): void {
    this.state = 'dying';
    this.dyingFor = 0;
    this.fight.boss.core.hp = 0;
    this.fight.components.silenceAll();
    this.fight.rooms.halted = true;
  }

  get dyingTime(): number {
    return this.big ? DYING_TIME.big : DYING_TIME.small;
  }
}

/** One scheduled spawn. */
export interface PendingSpawn {
  at: number;
  def: UnitDefinition;
  placement: UnitPlacement;
  tag?: string;
}

/** The units in play at once, plus the spawn queue of the current wave. */
export class UnitSystem {
  units: Unit[] = [];
  private pending: PendingSpawn[] = [];
  /** Seconds since the first spawn was queued. */
  time = 0;
  /** Debug: draw hit areas, bounding boxes and hp. */
  debug = false;
  /** Where units' room functions fire and launch drones (set by the game). */
  roomHost: RoomHost | null = null;
  /** Called when a unit starts dying (the game explodes it). */
  onDeath: ((u: Unit) => void) | null = null;
  private counter = 0;

  constructor(private readonly ship: Point) {}

  clear(): void {
    this.units = [];
    this.pending = [];
    this.time = 0;
    this.counter = 0;
  }

  /** Queue a spawn `at` seconds after the clock's zero (`time`). */
  queue(spawn: PendingSpawn): void {
    this.pending.push(spawn);
  }

  /** Spawn now. */
  spawn(def: UnitDefinition, placement: UnitPlacement, tag?: string): Unit {
    const jitter = ((this.counter++ * 0.6180339887) % 1) * 1.4;
    if (def.placement && !placement.flyby) placement = { ...placement, ...def.placement(placement.slot) };
    const u = new Unit(scaleUnit(def, this.scale().hp), placement, placement.flyby || placement.chase ? jitter * 0.15 : jitter, this.ship);
    u.tag = tag;
    u.fight.components.debug = this.debug;
    u.fight.rooms.host = this.roomHost;
    this.units.push(u);
    return u;
  }

  /** Alive units (the ones bullets can hit). */
  live(): Unit[] {
    return this.units.filter((u) => u.state === 'alive' && !u.def.ground);
  }

  /** Enemy fire rate multiplier (1 = as authored). A scroll level sets it (`ScrollLevelDef.fireScale`). */
  fireScale = 1;
  /** Run-level enemy scaling (Conquest difficulty, src/difficulty.ts): read when a unit spawns (hull) and every frame (fire). */
  scale: () => EnemyScale = () => NO_SCALE;

  /** Cosmetic: units (all, or with this tag) stop shooting and fly away; queued spawns with the tag are cancelled. Not kills. */
  dismiss(tag?: string): void {
    this.pending = this.pending.filter((p) => tag !== undefined && p.tag !== tag);
    for (const u of this.units) if (tag === undefined || u.tag === tag) u.leave();
  }

  /** Units alive, dying or queued that match a tag and/or def id (no filter = all). */
  countMatching(match: { tag?: string; unit?: string }): number {
    const ok = (tag: string | undefined, id: string): boolean => (match.tag === undefined || tag === match.tag) && (match.unit === undefined || id === match.unit);
    return this.units.filter((u) => ok(u.tag, u.def.id)).length + this.pending.filter((p) => ok(p.tag, p.def.id)).length;
  }

  /** Units alive, dying or still waiting to spawn: the wave ends at 0. */
  remaining(): number {
    return this.units.filter((u) => !u.def.ground).length + this.pending.length;
  }

  /**
   * Advance movement, spawn queue, attack timers and removal. `firing` = the player is alive and enemy fire is on.
   * Death checks run in `checkDeaths` (after the player's hits land).
   */
  update(dt: number, firing: boolean, attacks: Attacks, player: Point): void {
    this.time += dt;
    if (this.pending.length > 0) {
      const due = this.pending.filter((p) => p.at <= this.time);
      if (due.length > 0) {
        this.pending = this.pending.filter((p) => p.at > this.time);
        for (const p of due) this.spawn(p.def, p.placement, p.tag);
      }
    }
    const fire = this.scale().fire;
    for (const u of this.units) {
      if (u.leaving !== null) {
        u.leaving += dt;
        // Ease off, then pull away faster and faster: up and out sideways.
        const l = u.leaving;
        u.fight.extraOffset = { x: u.leaveDirX * l * l * 120, y: -(l * 140 + l * l * 420) };
        const c = u.center();
        if (c.y < -260 || c.x < -260 || c.x > 800) u.gone = true;
      }
      u.fight.update(dt);
      u.age += dt;
      if (u.lifetime !== null && u.age >= u.lifetime) {
        u.gone = true; // a flyby that left the screen
        continue;
      }
      if (u.chase?.done()) {
        u.gone = true; // a chaser that gave up and left
        continue;
      }
      if (u.state === 'dying') {
        u.dyingFor += dt;
        if (u.dyingFor >= u.dyingTime) u.gone = true;
        continue;
      }
      if (u.def.lastStand && !u.lastStandOn) {
        const ls = u.def.lastStand;
        const comps = u.fight.components;
        if (comps.totalCount(ls.keys) > 0 && comps.goneCount(ls.keys) >= comps.totalCount(ls.keys)) {
          u.lastStandOn = true;
          comps.applyPhase({ enable: ls.enable });
        }
      }
      if (!firing || u.leaving !== null) continue;
      // A chaser holds fire while it has lost sight of the player.
      if (u.chase && !u.chase.canFire()) continue;
      // A flyby, chaser or ground structure only shoots while it is on screen.
      if (u.lifetime !== null || u.chase || u.def.ground) {
        const c = u.center();
        if (c.x < -10 || c.x > 550 || c.y < -10 || c.y > 970) continue;
      }
      const p = u.sched.update(dt * this.fireScale * (u.def.ground ? 1 : fire));
      if (!p) continue;
      const src = u.sched.lastSource;
      const sources = src ? u.fight.components.fireFrom(src) : u.fight.components.fireFromAny();
      for (const s of sources) attacks.firePattern(p, s.origin, p.aimAtPlayer && !s.dumb ? player : s.target, s.alive);
    }
    if (this.units.some((u) => u.gone)) this.units = this.units.filter((u) => !u.gone);
  }

  /** Start the death of every unit that is out of core or mostly carved away. */
  checkDeaths(): void {
    for (const u of this.units) {
      if (!u.shouldDie) continue;
      u.die();
      this.onDeath?.(u);
    }
  }

  setDebug(on: boolean): void {
    this.debug = on;
    for (const u of this.units) u.fight.components.debug = on;
  }
}
