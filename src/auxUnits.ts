import type { BlastSpec } from './components';
import type { TagSet } from './tags';
import type { ProjectileInit } from './weapons';

/**
 * The three "things that stay in the field" aux weapons (DESIGN.md "Content pass", section 4): the Mine Layer's mines, the Drone's drones and the
 * Shield Pulse's bubble. Each is a small state holder with `update` and `draw`; `WeaponSystem` owns them and gives them a `UnitsHost` for everything that
 * touches the targets or the enemy shots. None of them can ever hurt the player: mines and shots only carve targets, the bubble only removes enemy bullets.
 */

/** What the units need from the weapon system. */
export interface UnitsHost {
  ship: { x: number; y: number };
  /** Is any live target's solid pixel or component within `r` px of (x, y)? (the mine trigger) */
  touching(x: number, y: number, r: number): boolean;
  /** A boss-style blast at (x, y) on every target within reach (a mine burst). `tags` = the burn of the card stack. */
  blast(x: number, y: number, blast: BlastSpec, tags: TagSet | undefined): void;
  /** Fire a player shot (a drone's chip shot). */
  shoot(p: ProjectileInit): void;
  /** A random solid pixel of the nearest live target, screen coordinates, or null when nothing is left. */
  aimNear(x: number, y: number): { x: number; y: number } | null;
  /** Is there anything left to shoot at? */
  hasTargets(): boolean;
  /** Remove the enemy bullets within `r` px of (x, y); returns where they were (for sparks). */
  absorb(x: number, y: number, r: number): { x: number; y: number }[];
  /** A short additive flash (colour, seconds, start radius). */
  flash(x: number, y: number, color: string, t: number, r: number): void;
}

// --- mines ----------------------------------------------------------------------------------------

export interface MineInit {
  x: number;
  y: number;
  /** Upward drift, px/s. */
  drift: number;
  /** Seconds until armed, and until it bursts by itself. */
  arm: number;
  life: number;
  /** Trigger radius, px. */
  trigger: number;
  blast: BlastSpec;
  tags?: TagSet;
}

interface Mine extends MineInit {
  age: number;
  /** Set once it burst (it is removed at the end of the update). */
  done: boolean;
}

export class MineField {
  private mines: Mine[] = [];

  get count(): number {
    return this.mines.length;
  }

  /** Lay a mine; over `cap` live mines the oldest bursts early (like the Energy Bomb cap). */
  lay(m: MineInit, cap: number, host: UnitsHost): void {
    this.mines.push({ ...m, age: 0, done: false });
    const live = this.mines.filter((x) => !x.done);
    for (let i = 0; i < live.length - cap; i++) this.burst(live[i], host);
    this.mines = this.mines.filter((x) => !x.done);
  }

  clear(): void {
    this.mines = [];
  }

  update(dt: number, host: UnitsHost): void {
    for (const m of this.mines) {
      m.age += dt;
      m.y -= m.drift * dt;
      if (m.y < -20) {
        m.done = true; // drifted off the top without meeting anything
        continue;
      }
      if (m.age >= m.life || (m.age >= m.arm && host.hasTargets() && host.touching(m.x, m.y, m.trigger))) this.burst(m, host);
    }
    this.mines = this.mines.filter((m) => !m.done);
  }

  private burst(m: Mine, host: UnitsHost): void {
    if (m.done) return;
    m.done = true;
    host.blast(m.x, m.y, m.blast, m.tags);
    host.flash(m.x, m.y, '#ffb347', 0.22, m.blast.radius * 0.35);
  }

  draw(g: CanvasRenderingContext2D, t: number): void {
    g.save();
    for (const m of this.mines) {
      const armed = m.age >= m.arm;
      const late = m.life - m.age < 1.5; // about to expire: blinks faster
      const blink = Math.sin(t * (late ? 28 : 9)) > 0;
      if (armed) {
        g.strokeStyle = 'rgba(255, 179, 71, 0.22)';
        g.lineWidth = 1;
        g.setLineDash([3, 4]);
        g.beginPath();
        g.arc(m.x, m.y, m.trigger, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      g.fillStyle = '#2b3140';
      g.strokeStyle = armed ? '#ffb347' : '#6b7794';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(m.x, m.y, 6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = armed ? (blink ? '#ff5a3c' : '#7a2a1c') : '#556080';
      g.beginPath();
      g.arc(m.x, m.y, 2.4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

// --- drones ---------------------------------------------------------------------------------------

export interface DroneInit {
  weapon: string;
  /** Number of drones; they sit at alternating sides of the ship, then further out. */
  count: number;
  duration: number;
  /** Chip shots per second per drone, carve energy per shot (already scaled by power), shot speed and pierce. */
  rate: number;
  energy: number;
  speed: number;
  pierce: number;
  /** Side offset of the first drone, px. */
  offset: number;
  tags?: TagSet;
}

interface Drone {
  weapon: string;
  x: number;
  y: number;
  /** Fixed offset from the ship. */
  ox: number;
  oy: number;
  age: number;
  life: number;
  shot: number;
  rate: number;
  energy: number;
  speed: number;
  pierce: number;
  tags?: TagSet;
}

export class DroneBay {
  private drones: Drone[] = [];

  /** Launch the drones of `d.weapon` (a drone weapon that is still out is replaced). */
  deploy(d: DroneInit, host: UnitsHost): void {
    this.drones = this.drones.filter((x) => x.weapon !== d.weapon);
    for (let i = 0; i < d.count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const ring = Math.floor(i / 2);
      const ox = side * (d.offset + ring * 34);
      const oy = 6 - ring * 10;
      this.drones.push({
        weapon: d.weapon,
        x: host.ship.x + ox,
        y: host.ship.y + oy + 30,
        ox,
        oy,
        age: 0,
        life: d.duration,
        shot: 0.15 + i * 0.12, // staggered first shots
        rate: d.rate,
        energy: d.energy,
        speed: d.speed,
        pierce: d.pierce,
        tags: d.tags,
      });
    }
  }

  clear(): void {
    this.drones = [];
  }

  /** True while a drone of this weapon is out. */
  out(weapon: string): boolean {
    return this.drones.some((d) => d.weapon === weapon);
  }

  update(dt: number, host: UnitsHost): void {
    const k = Math.min(1, dt * 10);
    for (const d of this.drones) {
      d.age += dt;
      d.x += (host.ship.x + d.ox - d.x) * k;
      d.y += (host.ship.y + d.oy + Math.sin(d.age * 3 + d.ox) * 3 - d.y) * k;
      d.shot -= dt;
      if (d.shot <= 0 && d.age < d.life && host.hasTargets()) {
        const aim = host.aimNear(d.x, d.y);
        if (aim) {
          d.shot += 1 / d.rate;
          const angle = Math.atan2(aim.y - d.y, aim.x - d.x);
          host.shoot({ weapon: d.weapon, x: d.x, y: d.y - 6, angle, speed: d.speed, energy: d.energy, pierce: d.pierce, shape: 'default', tags: d.tags, trailLife: 0.12 });
        } else d.shot = 0.2;
      } else if (d.shot <= 0) d.shot = 0.1;
    }
    this.drones = this.drones.filter((d) => d.age < d.life);
  }

  draw(g: CanvasRenderingContext2D): void {
    g.save();
    for (const d of this.drones) {
      const fadeIn = Math.min(1, d.age / 0.3);
      const left = d.life - d.age;
      const fade = left < 1 ? (Math.sin(d.age * 30) > -0.3 ? Math.max(0.15, left) : 0.1) : 1; // blinks out in the last second
      g.globalAlpha = fadeIn * fade;
      g.translate(d.x, d.y);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(110, 231, 255, 0.28)';
      g.beginPath();
      g.arc(0, 0, 13, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#9fe9ff';
      g.strokeStyle = '#0b2a36';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(7, 4);
      g.lineTo(0, 8);
      g.lineTo(-7, 4);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#0b2a36';
      g.fillRect(-2, -3, 4, 5);
      g.fillStyle = '#ffd21f';
      g.fillRect(-1, 8, 2, 3 + Math.random() * 3);
      g.translate(-d.x, -d.y);
    }
    g.restore();
  }
}

// --- shield ---------------------------------------------------------------------------------------

export interface ShieldInit {
  weapon: string;
  duration: number;
  radius: number;
}

interface Bubble extends ShieldInit {
  age: number;
  /** Seconds of the "hit" glow left. */
  glow: number;
}

/** A bubble around the ship that removes enemy bullets touching it. Beams, hazard blasts and contact damage ignore it (they are not bullets). */
export class ShieldBubble {
  private bubble: Bubble | null = null;

  get active(): boolean {
    return this.bubble !== null;
  }

  start(s: ShieldInit): void {
    this.bubble = { ...s, age: 0, glow: 0 };
  }

  clear(): void {
    this.bubble = null;
  }

  update(dt: number, host: UnitsHost): void {
    const b = this.bubble;
    if (!b) return;
    b.age += dt;
    b.glow = Math.max(0, b.glow - dt);
    if (b.age >= b.duration) {
      this.bubble = null;
      return;
    }
    const hit = host.absorb(host.ship.x, host.ship.y, b.radius);
    if (hit.length) {
      b.glow = 0.18;
      for (const p of hit) host.flash(p.x, p.y, '#bff3ff', 0.14, 5);
    }
  }

  draw(g: CanvasRenderingContext2D, ship: { x: number; y: number }, t: number): void {
    const b = this.bubble;
    if (!b) return;
    const grow = Math.min(1, b.age / 0.15);
    const left = b.duration - b.age;
    // Fade at the end: the last 0.7 s the ring thins, dims and flickers, so the timing is readable.
    const end = left < 0.7 ? (0.25 + 0.75 * (left / 0.7)) * (Math.sin(t * 40) > -0.2 ? 1 : 0.55) : 1;
    const r = b.radius * (0.55 + 0.45 * grow) * (left < 0.7 ? 0.94 + 0.06 * (left / 0.7) : 1);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = end * grow;
    const fill = g.createRadialGradient(ship.x, ship.y, r * 0.4, ship.x, ship.y, r);
    fill.addColorStop(0, 'rgba(110, 231, 255, 0)');
    fill.addColorStop(1, `rgba(110, 231, 255, ${0.22 + b.glow * 1.6})`);
    g.fillStyle = fill;
    g.beginPath();
    g.arc(ship.x, ship.y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(191, 243, 255, ${0.75 + b.glow * 2})`;
    g.lineWidth = 2.5 + b.glow * 8;
    g.beginPath();
    g.arc(ship.x, ship.y, r, 0, Math.PI * 2);
    g.stroke();
    // A slow highlight sweeping round the rim.
    g.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    g.lineWidth = 3;
    g.beginPath();
    const a = t * 2.4;
    g.arc(ship.x, ship.y, r, a, a + 0.7);
    g.stroke();
    g.restore();
  }
}
