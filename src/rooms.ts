import type { AttackPattern } from './attacks';
import type { BlastSpec, BossComponent, ComponentSpec, ComponentSystem } from './components';
import type { Hazard, Point } from './hazards';

/**
 * Rooms and consoles (DESIGN.md "Rooms and consoles"). A ROOM is a named group of CONSOLES with a
 * function. Consoles are an ordinary component type (`type: 'console'`): embedded in the rooms layer,
 * hidden hp, damage states, hit area only once the layers above are carved away over them.
 *
 *  - Exposed: the first time any console of a room can be seen (its layers above are empty over its
 *    centre) the room's `onExposed` reaction runs, once per fight: a telegraph (consoles flash, ring,
 *    sound, shake, a HUD warning) and then the effects.
 *  - Disabled: when every console is destroyed (or torn off), the room's function goes offline: the
 *    components it `powers` stop working and look dead, and with `explodeOnDisable` the room blows up
 *    (crater plus chain reaction, boss-only like every blast).
 */

/** What a room does when first exposed. Add a kind here and a case in `RoomSystem.run` to extend. */
export type RoomEffect =
  /** Fire an existing attack pattern from the room's position (`count` times, `gap` s apart). */
  | { kind: 'attack'; pattern: AttackPattern; count?: number; gap?: number; delay?: number }
  /** A shield-burst: a short-lived expanding ring hazard that damages the player. */
  | { kind: 'pulse'; radius: number; damage?: number; telegraph?: number; active?: number; width?: number; delay?: number };
// Later effects: drones/spawners (not built yet, see DESIGN.md).

export interface ConsoleSpec {
  /** Named anchor in `BossSpec.anchors` (layout px, mirrored with the layout). */
  anchor: string;
  /** Hit area radius (default 9). */
  radius?: number;
  /** Hidden hp (default 90). */
  hp?: number;
}

export interface RoomSpec {
  id: string;
  name: string;
  /** What the room powers, for the HUD ("Weapons control"). */
  function: string;
  /** Components (ids or groups) that go offline when the room is disabled. */
  powers?: string[];
  /** Layer the consoles sit in (default: the last layer, the rooms layer). */
  layer?: number;
  consoles: ConsoleSpec[];
  /** Reactions when the room is first exposed, in order (each after its `delay`, default 0.6 s: the telegraph). */
  onExposed?: RoomEffect[];
  /** Blow the room up when its last console goes. `true` uses `DEFAULT_ROOM_BLAST`. */
  explodeOnDisable?: boolean | BlastSpec;
}

export const DEFAULT_ROOM_BLAST: BlastSpec = { radius: 90, energy: 8000, damage: 420, coreDamage: 150, falloff: 1 };
/** Seconds between the warning (flash, sound, banner) and the room's effects. */
export const EXPOSE_TELEGRAPH = 0.6;
/** Seconds the HUD warning banner stays up. */
export const ALERT_BANNER = 2;

export const roomGroup = (id: string): string => `room:${id}`;

/** The console components of `rooms`, as ComponentSpecs (group `room:<id>`, embedded in the rooms layer). */
export function consoleSpecs(rooms: RoomSpec[], defaultLayer: number): ComponentSpec[] {
  return rooms.flatMap((r) =>
    r.consoles.map(
      (c, i): ComponentSpec => ({
        id: `${r.id}-c${i + 1}`,
        type: 'console',
        anchor: c.anchor,
        radius: c.radius ?? 9,
        hp: c.hp ?? 90,
        mount: 'embedded',
        layer: r.layer ?? defaultLayer,
        group: roomGroup(r.id),
      }),
    ),
  );
}

/** Where a room's reaction fires: the centre of its consoles, live (follows the boss). */
export interface RoomHost {
  fire(pattern: AttackPattern, origin: () => Point): void;
  hazard(h: Omit<Hazard, 'age'>): void;
}

export class Room {
  exposed = false;
  offline = false;
  /** Counts down from ALERT_BANNER after exposure (HUD warning). */
  alert = 0;
  readonly consoles: BossComponent[];
  /** Centre of the consoles, boss-local layout px. */
  readonly lx: number;
  readonly ly: number;
  readonly radius: number;

  constructor(
    readonly spec: RoomSpec,
    consoles: BossComponent[],
  ) {
    this.consoles = consoles;
    this.lx = consoles.reduce((a, c) => a + c.lx, 0) / Math.max(1, consoles.length);
    this.ly = consoles.reduce((a, c) => a + c.ly, 0) / Math.max(1, consoles.length);
    this.radius = Math.max(24, ...consoles.map((c) => Math.hypot(c.lx - this.lx, c.ly - this.ly) + c.spec.radius));
  }

  get name(): string {
    return this.spec.name;
  }

  /** Consoles still working (not destroyed or torn off). */
  get liveConsoles(): number {
    return this.consoles.filter((c) => c.state === 'active' || c.state === 'dying').length;
  }

  get state(): 'online' | 'exposed' | 'offline' {
    return this.offline ? 'offline' : this.exposed ? 'exposed' : 'online';
  }
}

interface Pending {
  room: Room;
  effect: RoomEffect;
  t: number;
  /** Remaining repeats of an `attack` effect. */
  left: number;
}

export class RoomSystem {
  readonly rooms: Room[] = [];
  /** Set by the game: where room reactions put bullets and hazards. */
  host: RoomHost | null = null;
  private pending: Pending[] = [];

  constructor(
    private readonly components: ComponentSystem,
    specs: RoomSpec[],
    private readonly onRoomOffline?: (room: Room) => void,
  ) {
    for (const spec of specs) {
      const cs = components.items.filter((c) => c.spec.group === roomGroup(spec.id));
      this.rooms.push(new Room(spec, cs));
    }
    if (this.rooms.length > 0) components.extraDebug = (ctx) => this.drawDebug(ctx);
  }

  get active(): boolean {
    return this.rooms.length > 0;
  }

  /** Rooms currently offline, for the core-armor rule (`requires: ['room:<id>']`). */
  offlineCount(keys: string[]): number {
    return this.rooms.filter((r) => r.offline && keys.includes(roomGroup(r.spec.id))).length;
  }

  totalCount(keys: string[]): number {
    return this.rooms.filter((r) => keys.includes(roomGroup(r.spec.id))).length;
  }

  find(id: string): Room | undefined {
    return this.rooms.find((r) => r.spec.id === id);
  }

  /** Where a room's effects originate (screen px, live). */
  origin(room: Room): Point {
    return { x: this.components.boss.x + room.lx, y: this.components.boss.y + room.ly };
  }

  /** Debug: force a room's exposure reaction now (once, like the real thing). Returns false if already exposed. */
  forceExpose(id?: string): boolean {
    const room = id ? this.find(id) : this.rooms.find((r) => !r.exposed && !r.offline);
    if (!room || room.exposed) return false;
    this.expose(room);
    return true;
  }

  update(dt: number): void {
    if (this.rooms.length === 0) return;
    for (const room of this.rooms) {
      room.alert = Math.max(0, room.alert - dt);
      if (!room.exposed && room.consoles.some((c) => c.state === 'destroyed' || c.state === 'detached' || (c.state !== 'dying' && this.components.isExposed(c)))) {
        this.expose(room);
      }
      if (!room.offline && room.consoles.every((c) => c.state === 'destroyed' || c.state === 'detached')) this.disable(room);
    }
    for (const p of this.pending) p.t -= dt;
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i];
      if (p.t > 0) continue;
      this.run(p);
      if (p.effect.kind === 'attack' && --p.left > 0) p.t = p.effect.gap ?? 0.25;
      else {
        this.pending.splice(i, 1);
        i--;
      }
    }
  }

  private expose(room: Room): void {
    room.exposed = true;
    room.alert = ALERT_BANNER;
    const o = this.origin(room);
    this.components.alertConsoles(room.consoles, EXPOSE_TELEGRAPH + 0.5);
    this.components.pingAt(room.lx, room.ly, room.radius + 30);
    this.components.events.push({ kind: 'roomExposed', x: o.x, y: o.y, name: room.name });
    for (const effect of room.spec.onExposed ?? []) {
      this.pending.push({ room, effect, t: effect.delay ?? EXPOSE_TELEGRAPH, left: effect.kind === 'attack' ? (effect.count ?? 1) : 1 });
    }
  }

  private disable(room: Room): void {
    room.offline = true;
    for (const key of room.spec.powers ?? []) for (const c of this.components.items) if (c.matches(key)) c.powered = false;
    const o = this.origin(room);
    const boom = room.spec.explodeOnDisable;
    this.components.events.push({ kind: 'roomOffline', x: o.x, y: o.y, name: room.name, blast: !!boom });
    this.onRoomOffline?.(room);
    if (boom) this.components.roomBlast(room.lx, room.ly, boom === true ? DEFAULT_ROOM_BLAST : boom);
  }

  private run(p: Pending): void {
    if (!this.host) return;
    const room = p.room;
    const origin = () => this.origin(room);
    const e = p.effect;
    if (e.kind === 'attack') {
      this.host.fire(e.pattern, origin);
    } else if (e.kind === 'pulse') {
      const width = e.width ?? 26;
      this.host.hazard({
        telegraph: e.telegraph ?? 0.5,
        active: e.active ?? 0.9,
        damage: e.damage ?? 1,
        // Telegraph: the outline of the final ring. Live: the ring expands from the room to `radius`.
        shapeAt: (phase, k) => {
          const o = origin();
          return phase === 'telegraph' ? { kind: 'ring', x: o.x, y: o.y, r: e.radius, width: 6 } : { kind: 'ring', x: o.x, y: o.y, r: Math.max(6, e.radius * k), width };
        },
      });
    }
  }

  // --- debug --------------------------------------------------------------------------------

  /** Room outlines, state and which consoles can be seen (cyan = exposed now). */
  private drawDebug(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 1;
    for (const room of this.rooms) {
      const o = this.origin(room);
      const col = room.offline ? '#ff4d4d' : room.exposed ? '#4dd9ff' : '#ffd23a';
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(o.x, o.y, room.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const c of room.consoles) {
        const p = this.components.pos(c);
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (c.state === 'active' && this.components.isExposed(c)) {
          ctx.strokeStyle = '#4dd9ff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, c.spec.radius + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = col;
        }
      }
      ctx.fillText(`${room.spec.id}: ${room.state} ${room.liveConsoles}/${room.consoles.length}  ->${(room.spec.powers ?? []).join(',') || room.spec.function}${room.spec.explodeOnDisable ? ' *boom*' : ''}`, o.x, o.y + room.radius + 12);
    }
    ctx.restore();
  }
}
