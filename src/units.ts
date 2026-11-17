import type { Attacks } from './attacks';
import type { AttackStep } from './attackSchedulers';
import type { ScriptedScheduler } from './attackSchedulers';
import type { BossSpec } from './boss';
import { BossFight } from './bossFight';
import type { ComponentSpec, CoreArmorSpec } from './components';
import type { BossDefinition } from './bosses/types';
import type { Movement } from './movement';
import { still } from './movement';
import type { Point } from './hazards';

/**
 * Enemy units (DESIGN.md "Enemy units are small bosses"): a `UnitDefinition` is a slimmed-down `BossDefinition`
 * (one phase, no rooms, no regrowth) and every live unit runs on a `BossFight`, so carving, anchoring, components,
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
  components?: ComponentSpec[];
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
}

/** How a unit is placed when it spawns. */
export interface UnitPlacement {
  /** Formation slot: where the unit's centre ends up. */
  slot: Point;
  /** Flight from the spawn point to the slot: screen-space centre positions, u = 0..1. Omitted = appears at the slot. */
  entrance?: (u: number) => Point;
  /** Seconds the entrance takes. */
  entranceTime?: number;
  /** Optional dives out of the slot: after `first` s of holding, every `every` s fly `path` (relative to the slot) over `time` s and return. */
  dive?: { first: number; every: number; time: number; path: (u: number) => Point };
}

const smooth = (u: number): number => { const c = Math.min(1, Math.max(0, u)); return c * c * (3 - 2 * c); };

/** Entrance, then idle in the slot with optional dives, as one `Movement` (offsets from the slot centre; t = seconds since spawn). */
function placementMovement(def: UnitDefinition, p: UnitPlacement): Movement {
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
    coreArmor: def.coreArmor ?? { min: 1 },
    phases: [{ name: 'unit', movement: placementMovement(def, p), attacks: def.attacks, attackDelay: eT + attackDelay }],
  };
  return { def: bossDef, spec };
}

/** Seconds a dying unit takes to flash out before it is removed. */
const DYING_TIME = { small: 0.22, big: 0.5 };

export class Unit {
  readonly fight: BossFight;
  readonly sched: ScriptedScheduler;
  readonly big: boolean;
  state: 'alive' | 'dying' = 'alive';
  dyingFor = 0;
  /** True once removed from play (the system drops it next frame). */
  gone = false;
  private readonly deathFraction: number;

  constructor(
    readonly def: UnitDefinition,
    placement: UnitPlacement,
    jitter: number,
    ship: Point,
  ) {
    const { def: bd } = toBossDefinition(def, placement, (def.attackDelay ?? 1) + jitter);
    this.fight = new BossFight(bd);
    this.fight.components.target = ship;
    this.sched = this.fight.makeScheduler();
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

  /** Core gone or mostly carved away. */
  get shouldDie(): boolean {
    return this.state === 'alive' && (this.fight.boss.defeated || this.fight.pixelDamagePercent >= this.deathFraction * 100);
  }

  die(): void {
    this.state = 'dying';
    this.dyingFor = 0;
    this.fight.boss.core.hp = 0;
    this.fight.components.silenceAll();
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
}

/** The units in play at once, plus the spawn queue of the current wave. */
export class UnitSystem {
  units: Unit[] = [];
  private pending: PendingSpawn[] = [];
  /** Seconds since the first spawn was queued. */
  time = 0;
  /** Debug: draw hit areas, bounding boxes and hp. */
  debug = false;
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
  spawn(def: UnitDefinition, placement: UnitPlacement): Unit {
    const jitter = ((this.counter++ * 0.6180339887) % 1) * 1.4;
    const u = new Unit(def, placement, jitter, this.ship);
    u.fight.components.debug = this.debug;
    this.units.push(u);
    return u;
  }

  /** Alive units (the ones bullets can hit). */
  live(): Unit[] {
    return this.units.filter((u) => u.state === 'alive');
  }

  /** Units alive, dying or still waiting to spawn: the wave ends at 0. */
  remaining(): number {
    return this.units.length + this.pending.length;
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
        for (const p of due) this.spawn(p.def, p.placement);
      }
    }
    for (const u of this.units) {
      u.fight.update(dt);
      if (u.state === 'dying') {
        u.dyingFor += dt;
        if (u.dyingFor >= u.dyingTime) u.gone = true;
        continue;
      }
      if (!firing) continue;
      const p = u.sched.update(dt);
      if (!p) continue;
      const src = u.sched.lastSource;
      const sources = src ? u.fight.components.fireFrom(src) : u.fight.components.fireFromAny();
      for (const s of sources) attacks.firePattern(p, s.origin, p.aimAtPlayer ? player : s.target, s.alive);
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
