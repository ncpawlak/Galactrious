import type { Boss } from './boss';
import type { BlastSpec, ComponentSystem } from './components';
import type { Point } from './hazards';
import type { Regrowth, RegrowthSpec } from './regrowth';
import type { Room, RoomHost } from './rooms';

/**
 * Room function catalog (DESIGN.md "Rooms and consoles", "As built"). A room's FUNCTION is what it does while it is
 * online and what stops (or breaks) when its last console goes. A function is data on the room (`RoomSpec.functions`)
 * plus ONE handler in `HANDLERS` below, so a boss, or a big unit, is assembled from parts:
 *
 *   power    online powers the listed components (turrets); offline they go dark and stop firing.
 *   shield   online armors the core (counts as an armor source) or a zone around the room; offline the armor drops.
 *   repair   online regrows a hull layer (src/regrowth.ts) and/or heals components, all fight long; offline it stops.
 *   spawner  online periodically launches drones (small units), capped; offline it stops.
 *   sensor   online the listed turrets track the player; offline they fire dumb (rest angle, no aimed lobs).
 *   reactor  nothing while online; offline (all consoles destroyed) it explodes and chains into its neighbours.
 *   engine   online scales the boss's movement speed (`online`, default x1.5); offline it eases down to `offline` (x0.4).
 *
 * Effects run continuously (`update` every frame), not only on exposure. A handler has: `init` (runtime state),
 * `onOnline` / `onOffline` (state changes, also used by the debug force-online/offline), `update`, `cue` (the readable
 * in-world cue) and `describe` (parameters for the [H] overlay). Adding a function: add a spec to the union, a handler
 * to `HANDLERS`. Nothing else changes.
 */

export type RoomFunctionSpec =
  | { kind: 'power'; /** Component ids or groups to power. */ targets: string[] }
  | { kind: 'shield'; /** Omitted = armors the core. Given = components within `radius` px of the room take `factor` (default 0.35) of the damage. */ zone?: { radius: number; factor?: number } }
  | {
      kind: 'repair';
      /** Layer index to regrow (default 0, the hull). Set `rate: 0` for heal-only. */
      layer?: number;
      /** Regrowth rate, fraction of the layer's original pixels per second (default 0.004). */
      rate?: number;
      /** 'slow' always (default), 'idle' only when the boss has not been hit for `idleDelay`, 'both'. */
      mode?: RegrowthSpec['mode'];
      idleDelay?: number;
      /** Also heal these components (ids or groups), `perSecond` hp each. */
      heal?: { targets: string[]; perSecond: number };
    }
  | {
      kind: 'spawner';
      /** Unit id from `src/enemies` (a small one, e.g. 'drone'). */
      unit: string;
      /** Seconds between launches (default 4). */
      interval?: number;
      /** Most drones of this room alive at once (default 3). */
      max?: number;
      /** Most drones launched in the whole fight (default 6). The room then stops by itself. */
      total?: number;
      /** Seconds before the first launch once online (default 2). */
      first?: number;
    }
  | { kind: 'sensor'; /** Turret ids or groups that track while online and fire dumb while offline. */ targets: string[] }
  | { kind: 'reactor'; /** Overrides for the blast (default `BLAST.defaults.room`). */ blast?: Partial<BlastSpec> }
  | { kind: 'engine'; /** Speed multiplier while online (default 1.5). */ online?: number; /** While offline (default 0.4). */ offline?: number };

export type RoomFunctionKind = RoomFunctionSpec['kind'];

/** What a handler can reach. Built once per RoomSystem. */
export interface RoomFnEnv {
  readonly boss: Boss;
  readonly components: ComponentSystem;
  /** Where reactions, drones and bullets go (set by the game; null in headless use). */
  host(): RoomHost | null;
  /** A new regrowth on the boss (BossFight.makeRegrowth), driven and drawn by the boss. */
  makeRegrowth(spec: RegrowthSpec): Regrowth;
  /** Centre of the room's consoles, screen px. */
  origin(room: Room): Point;
}

/** A function attached to a room: its data, its handler and the handler's runtime state. */
export interface RoomFn<S extends RoomFunctionSpec = RoomFunctionSpec, T = unknown> {
  readonly spec: S;
  readonly handler: RoomFunctionHandler<S, T>;
  state: T;
}

export interface RoomFunctionHandler<S extends RoomFunctionSpec, T> {
  /** HUD tag, upper case. */
  label: string;
  /** Cue colour 'r, g, b'. */
  color: string;
  /** One-character glyph on the badge. */
  glyph: string;
  init(spec: S, room: Room, env: RoomFnEnv): T;
  /** The function starts (also once at construction) or comes back (debug). */
  onOnline?(fn: RoomFn<S, T>, room: Room, env: RoomFnEnv): void;
  /** Every console is gone (`natural`) or the debug forced it. */
  onOffline?(fn: RoomFn<S, T>, room: Room, env: RoomFnEnv, natural: boolean): void;
  /** Every frame, online or offline (handlers check `room.offline`). */
  update?(dt: number, fn: RoomFn<S, T>, room: Room, env: RoomFnEnv): void;
  /** In-world cue, screen space, drawn after the boss. `seen` = the room has been exposed. */
  cue?(g: CanvasRenderingContext2D, fn: RoomFn<S, T>, room: Room, env: RoomFnEnv, seen: boolean, time: number): void;
  /** One line of parameters and live values for the [H] overlay. */
  describe(fn: RoomFn<S, T>, room: Room): string;
}

type SpecOf<K extends RoomFunctionKind> = Extract<RoomFunctionSpec, { kind: K }>;

const ring = (g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number, width = 2, dash: number[] = []): void => {
  g.save();
  g.strokeStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
  g.lineWidth = width;
  g.setLineDash(dash);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  g.restore();
};

const matching = (env: RoomFnEnv, keys: string[]) => env.components.items.filter((c) => keys.some((k) => c.matches(k)));

// --- power -----------------------------------------------------------------------------------------------

const power: RoomFunctionHandler<SpecOf<'power'>, null> = {
  label: 'POWER',
  color: '255, 214, 74',
  glyph: 'P',
  init: () => null,
  onOnline: (fn, _room, env) => {
    for (const c of matching(env, fn.spec.targets)) c.powered = true;
  },
  onOffline: (fn, _room, env) => {
    for (const c of matching(env, fn.spec.targets)) c.powered = false;
  },
  cue: (g, fn, room, env, seen, time) => {
    if (!seen || room.offline) return;
    // Power lines to what the room feeds, with a travelling spark.
    const o = env.origin(room);
    g.save();
    g.strokeStyle = 'rgba(255, 214, 74, 0.45)';
    g.lineWidth = 1;
    g.setLineDash([3, 4]);
    for (const c of matching(env, fn.spec.targets)) {
      if (c.state !== 'active') continue;
      const p = env.components.pos(c);
      g.beginPath();
      g.moveTo(o.x, o.y);
      g.lineTo(p.x, p.y);
      g.stroke();
      const k = (time * 1.2) % 1;
      g.fillStyle = 'rgba(255, 240, 160, 0.95)';
      g.fillRect(Math.round(o.x + (p.x - o.x) * k) - 1, Math.round(o.y + (p.y - o.y) * k) - 1, 3, 3);
    }
    g.restore();
  },
  describe: (fn) => `power -> ${fn.spec.targets.join(',')}`,
};

// --- shield ----------------------------------------------------------------------------------------------

const shield: RoomFunctionHandler<SpecOf<'shield'>, null> = {
  label: 'SHIELD',
  color: '110, 190, 255',
  glyph: 'S',
  init: () => null,
  onOnline: (fn, room, env) => setGuard(fn.spec, room, env, fn.spec.zone?.factor ?? 0.35),
  onOffline: (fn, room, env) => setGuard(fn.spec, room, env, 1),
  cue: (g, fn, room, env, _seen, time) => {
    if (room.offline) return;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    if (fn.spec.zone) {
      const o = env.origin(room);
      ring(g, o.x, o.y, fn.spec.zone.radius, shield.color, 0.25 + 0.2 * pulse, 2, [6, 5]);
    } else {
      const b = env.boss;
      if (b.defeated || b.core.hp <= 0) return;
      ring(g, b.x + b.core.x, b.y + b.core.y, b.core.radius + 14 + pulse * 2, shield.color, 0.3 + 0.3 * pulse, 2, [4, 4]);
    }
  },
  describe: (fn) => (fn.spec.zone ? `shield zone r${fn.spec.zone.radius} x${fn.spec.zone.factor ?? 0.35}` : 'shield core armor'),
};

/** Zone shield: components in range (not the room's own consoles) take `factor` of the damage. Core mode has no state: `RoomSystem.shieldKeys` feeds the armor. */
function setGuard(spec: SpecOf<'shield'>, room: Room, env: RoomFnEnv, factor: number): void {
  if (!spec.zone) return;
  for (const c of env.components.items) {
    if (room.consoles.includes(c)) continue;
    if (Math.hypot(c.lx - room.lx, c.ly - room.ly) <= spec.zone.radius) c.guard = factor;
  }
}

// --- repair ----------------------------------------------------------------------------------------------

interface RepairState {
  rg: Regrowth | null;
  pulses: number[];
  nextPulse: number;
}

const repair: RoomFunctionHandler<SpecOf<'repair'>, RepairState> = {
  label: 'REPAIR',
  color: '90, 235, 130',
  glyph: '+',
  init: (spec, _room, env) => ({
    rg:
      (spec.rate ?? 0.004) > 0
        ? env.makeRegrowth({ layer: spec.layer ?? 0, mode: spec.mode ?? 'slow', rate: spec.rate ?? 0.004, idleDelay: spec.idleDelay })
        : null,
    pulses: [],
    nextPulse: 0,
  }),
  onOnline: (fn) => {
    if (fn.state.rg) fn.state.rg.enabled = true;
  },
  onOffline: (fn) => {
    if (fn.state.rg) fn.state.rg.enabled = false;
  },
  update: (dt, fn, room, env) => {
    const s = fn.state;
    s.pulses = s.pulses.map((a) => a + dt).filter((a) => a < 1);
    if (room.offline) return;
    let working = !!s.rg?.active;
    const h = fn.spec.heal;
    if (h) {
      for (const c of matching(env, h.targets)) {
        if (c.state === 'active' && c.hp < c.maxHp) {
          env.components.heal(c, h.perSecond * dt);
          working = true;
        }
      }
    }
    s.nextPulse -= dt;
    if (working && s.nextPulse <= 0) {
      s.nextPulse = 0.9;
      s.pulses.push(0);
    }
  },
  cue: (g, fn, room, env, seen) => {
    const o = env.origin(room);
    for (const a of fn.state.pulses) ring(g, o.x, o.y, 8 + a * (room.radius + 16), repair.color, 0.7 * (1 - a), 2);
    if (seen && !room.offline && fn.state.pulses.length === 0) ring(g, o.x, o.y, room.radius + 4, repair.color, 0.22, 1, [2, 4]);
  },
  describe: (fn) => {
    const s = fn.spec;
    const rg = fn.state.rg;
    return `repair layer ${s.layer ?? 0} ${((rg?.rate ?? 0) * 100).toFixed(2)}%/s ${rg ? (rg.active ? 'growing' : 'idle') : 'heal-only'}${s.heal ? ` heal ${s.heal.targets.join(',')} ${s.heal.perSecond}hp/s` : ''}`;
  },
};

// --- spawner ---------------------------------------------------------------------------------------------

interface SpawnerState {
  timer: number;
  spawned: number;
  live: { alive(): boolean }[];
  flash: number;
}

const spawner: RoomFunctionHandler<SpecOf<'spawner'>, SpawnerState> = {
  label: 'SPAWNER',
  color: '255, 150, 70',
  glyph: 'D',
  init: (spec) => ({ timer: spec.first ?? 2, spawned: 0, live: [], flash: 0 }),
  update: (dt, fn, room, env) => {
    const s = fn.state;
    s.flash = Math.max(0, s.flash - dt);
    s.live = s.live.filter((u) => u.alive());
    if (room.offline) return;
    s.timer -= dt;
    if (s.timer > 0) return;
    const host = env.host();
    if (!host?.spawnUnit) return;
    // Cap: at most `max` alive at once and `total` launched in all. At the cap it waits (timer stays 0) and launches the moment one dies.
    if (s.live.length >= (fn.spec.max ?? 3) || s.spawned >= (fn.spec.total ?? 6)) return;
    const o = env.origin(room);
    const u = host.spawnUnit(fn.spec.unit, o);
    if (!u) return;
    s.live.push(u);
    s.spawned++;
    s.flash = 0.45;
    s.timer = fn.spec.interval ?? 4;
  },
  cue: (g, fn, room, env, seen) => {
    const o = env.origin(room);
    const s = fn.state;
    if (s.flash > 0) {
      const k = s.flash / 0.45;
      g.save();
      g.fillStyle = `rgba(255, 220, 160, ${(0.7 * k).toFixed(2)})`;
      g.beginPath();
      g.arc(o.x, o.y, 8 + (1 - k) * 26, 0, Math.PI * 2);
      g.fill();
      g.restore();
      ring(g, o.x, o.y, 10 + (1 - k) * 40, spawner.color, k, 3);
    }
    if (seen && !room.offline) {
      // Charge arc: fills as the next launch nears.
      const total = fn.spec.interval ?? 4;
      const done = s.spawned >= (fn.spec.total ?? 6);
      const p = done ? 0 : 1 - Math.max(0, Math.min(1, s.timer / total));
      g.save();
      g.strokeStyle = `rgba(${spawner.color}, ${done ? 0.25 : 0.8})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(o.x, o.y, room.radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (done ? 1 : p));
      g.stroke();
      g.restore();
    }
  },
  describe: (fn) => `spawner ${fn.spec.unit} alive ${fn.state.live.length}/${fn.spec.max ?? 3} launched ${fn.state.spawned}/${fn.spec.total ?? 6} every ${fn.spec.interval ?? 4}s`,
};

// --- sensor ----------------------------------------------------------------------------------------------

const sensor: RoomFunctionHandler<SpecOf<'sensor'>, null> = {
  label: 'SENSOR',
  color: '120, 225, 235',
  glyph: 'T',
  init: () => null,
  onOnline: (fn, _room, env) => {
    for (const c of matching(env, fn.spec.targets)) if (c.spec.type === 'turret') c.sensor = 'track';
  },
  onOffline: (fn, _room, env) => {
    for (const c of matching(env, fn.spec.targets)) if (c.spec.type === 'turret') c.sensor = 'dumb';
  },
  cue: (g, _fn, room, env, seen, time) => {
    if (!seen || room.offline) return;
    // A radar sweep.
    const o = env.origin(room);
    const a = time * 3;
    g.save();
    g.strokeStyle = 'rgba(120, 225, 235, 0.7)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(o.x, o.y);
    g.lineTo(o.x + Math.cos(a) * (room.radius + 6), o.y + Math.sin(a) * (room.radius + 6));
    g.stroke();
    g.restore();
    ring(g, o.x, o.y, room.radius + 6, sensor.color, 0.3, 1);
  },
  describe: (fn) => `sensor -> ${fn.spec.targets.join(',')}`,
};

// --- reactor ---------------------------------------------------------------------------------------------

const reactor: RoomFunctionHandler<SpecOf<'reactor'>, null> = {
  label: 'REACTOR',
  color: '255, 90, 60',
  glyph: '!',
  init: () => null,
  onOffline: (fn, room, env, natural) => {
    if (natural) env.components.roomBlast(room.lx, room.ly, fn.spec.blast);
  },
  cue: (g, _fn, room, env, seen, time) => {
    if (!seen || room.offline) return;
    const o = env.origin(room);
    ring(g, o.x, o.y, room.radius + 3 + Math.sin(time * 5) * 2, reactor.color, 0.35 + 0.25 * Math.sin(time * 5), 2);
  },
  describe: (fn) => `reactor blast r${fn.spec.blast?.radius ?? 'default'}`,
};

// --- engine ----------------------------------------------------------------------------------------------

const engine: RoomFunctionHandler<SpecOf<'engine'>, { k: number }> = {
  label: 'ENGINE',
  color: '255, 190, 80',
  glyph: 'E',
  init: (spec) => ({ k: spec.online ?? 1.5 }),
  update: (dt, fn, room) => {
    const target = room.offline ? (fn.spec.offline ?? 0.4) : (fn.spec.online ?? 1.5);
    fn.state.k += (target - fn.state.k) * Math.min(1, dt * 2.5);
  },
  cue: (g, fn, room, env, seen, time) => {
    if (!seen || room.offline) return;
    // Thrust chevrons pointing down the boss, flicker faster at higher speed.
    const o = env.origin(room);
    const f = 0.5 + 0.5 * Math.sin(time * 8 * fn.state.k);
    g.save();
    g.strokeStyle = `rgba(${engine.color}, ${(0.4 + 0.5 * f).toFixed(2)})`;
    g.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const y = o.y + room.radius * 0.4 + i * 6 + f * 3;
      g.beginPath();
      g.moveTo(o.x - 6, y);
      g.lineTo(o.x, y + 5);
      g.lineTo(o.x + 6, y);
      g.stroke();
    }
    g.restore();
  },
  describe: (fn) => `engine x${fn.state.k.toFixed(2)} (online x${fn.spec.online ?? 1.5}, offline x${fn.spec.offline ?? 0.4})`,
};

/** The catalog. One handler per kind. */
export const HANDLERS: { [K in RoomFunctionKind]: RoomFunctionHandler<SpecOf<K>, any> } = { power, shield, repair, spawner, sensor, reactor, engine };

/** Every function kind in the catalog. */
export const FUNCTION_KINDS = Object.keys(HANDLERS) as RoomFunctionKind[];

export function instantiate(spec: RoomFunctionSpec, room: Room, env: RoomFnEnv): RoomFn {
  const handler = HANDLERS[spec.kind] as RoomFunctionHandler<RoomFunctionSpec, unknown>;
  const fn: RoomFn = { spec, handler, state: undefined };
  fn.state = handler.init(spec, room, env);
  return fn;
}

/** The functions of a room spec: the explicit list, plus the legacy `powers` and `explodeOnDisable` fields folded in. */
export function resolveFunctions(spec: { functions?: RoomFunctionSpec[]; powers?: string[]; explodeOnDisable?: boolean | Partial<BlastSpec> }): RoomFunctionSpec[] {
  const out = [...(spec.functions ?? [])];
  if (spec.powers?.length) out.push({ kind: 'power', targets: spec.powers });
  if (spec.explodeOnDisable) out.push({ kind: 'reactor', blast: spec.explodeOnDisable === true ? undefined : spec.explodeOnDisable });
  return out;
}

/** Draw the badge of a room (function glyph on a dark disc) above its centre. */
export function drawBadge(g: CanvasRenderingContext2D, room: Room, o: Point, time: number): void {
  const fns = room.fns;
  if (fns.length === 0) return;
  const off = room.offline;
  fns.forEach((fn, i) => {
    const x = o.x + (i - (fns.length - 1) / 2) * 17;
    const y = o.y - room.radius - 11;
    const col = off ? '120, 128, 150' : fn.handler.color;
    g.save();
    g.fillStyle = 'rgba(8, 10, 20, 0.85)';
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(${col}, ${off ? 0.8 : 0.6 + 0.3 * Math.sin(time * 4)})`;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = `rgb(${col})`;
    g.font = 'bold 10px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(fn.handler.glyph, x, y + 1);
    if (off) {
      g.strokeStyle = 'rgba(255, 90, 90, 0.9)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 6, y + 6);
      g.lineTo(x + 6, y - 6);
      g.stroke();
    }
    g.restore();
  });
}
