import { H } from '../config';
import type { BarrierEntry } from './types';

/** Contact damage of an energy barrier to the ship (same as a wall scrape: never an instant kill). */
export const BARRIER_DAMAGE = 1;
/** Half the thickness of the lethal band in px, and the thickness of the drawn beam. */
const HALF = 7;
const PYLON = 15;

interface Barrier {
  x0: number;
  x1: number;
  y: number;
  damage: number;
  seed: number;
}

/**
 * Indestructible energy barriers (chapter 5 owner pass): a bright cyan-white beam stretched between two pylons, scrolling with the ground.
 * It is NOT a unit: nothing can carve or shoot it away. Player shots stop on it (a spark), touching it is a wall-style scrape (1 hull,
 * i-frames, the dodge roll passes through). Authoring rule (DESIGN.md standard): every barrier leaves an opening of at least 150 px
 * and is drawn in the ground layer above the background, so it is never hidden.
 */
export class BarrierSystem {
  readonly list: Barrier[] = [];

  clear(): void {
    this.list.length = 0;
  }

  /** Start a barrier from a timeline entry (`lag` = scroll px it is late by). */
  fire(e: BarrierEntry, lag: number): void {
    const w = Math.max(40, e.width);
    this.list.push({ x0: e.x - w / 2, x1: e.x + w / 2, y: -PYLON - 6 + lag, damage: e.damage ?? BARRIER_DAMAGE, seed: e.seed ?? Math.round(e.x * 7 + w) });
  }

  update(dt: number, speed: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.y += speed * dt;
      if (b.y > H + 40) this.list.splice(i, 1);
    }
  }

  /** Contact damage if the ship circle overlaps a barrier beam or pylon, else 0. */
  touch(x: number, y: number, r: number): number {
    for (const b of this.list) {
      if (y < b.y - HALF - r || y > b.y + HALF + r) continue;
      if (x >= b.x0 - PYLON * 0.6 - r && x <= b.x1 + PYLON * 0.6 + r) return b.damage;
    }
    return 0;
  }

  /** Does a player shot at (x, y) hit a barrier (and stop)? */
  absorb(x: number, y: number): boolean {
    for (const b of this.list) if (Math.abs(y - b.y) <= HALF + 4 && x >= b.x0 - 8 && x <= b.x1 + 8) return true;
    return false;
  }

  draw(g: CanvasRenderingContext2D, time: number): void {
    for (const b of this.list) {
      if (b.y < -40 || b.y > H + 40) continue;
      const w = b.x1 - b.x0;
      const flick = 0.82 + 0.18 * Math.sin(time * 14 + b.seed);
      g.save();
      // A wide soft glow so the barrier is seen long before it is close.
      const glow = g.createLinearGradient(0, b.y - 34, 0, b.y + 34);
      glow.addColorStop(0, 'rgba(90,220,255,0)');
      glow.addColorStop(0.5, `rgba(90,220,255,${(0.35 * flick).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(90,220,255,0)');
      g.fillStyle = glow;
      g.fillRect(b.x0, b.y - 34, w, 68);
      // The beam: a translucent cyan band with a white-hot core and scrolling energy ticks.
      g.fillStyle = `rgba(40,170,230,${(0.55 * flick).toFixed(3)})`;
      g.fillRect(b.x0, b.y - HALF, w, HALF * 2);
      g.fillStyle = `rgba(230,252,255,${(0.95 * flick).toFixed(3)})`;
      g.fillRect(b.x0, b.y - 2, w, 4);
      g.save();
      g.beginPath();
      g.rect(b.x0, b.y - HALF, w, HALF * 2);
      g.clip();
      g.strokeStyle = 'rgba(200,245,255,0.8)';
      g.lineWidth = 2;
      g.beginPath();
      const off = (time * 70) % 18;
      for (let x = b.x0 - 18 + off; x < b.x1; x += 18) {
        g.moveTo(x, b.y + HALF);
        g.lineTo(x + 9, b.y - HALF);
      }
      g.stroke();
      g.restore();
      // Hexagon edge studs on the beam's top and bottom, so a long barrier reads as a solid field.
      g.fillStyle = 'rgba(200,245,255,0.9)';
      for (let x = b.x0 + 10; x < b.x1 - 6; x += 22) {
        g.fillRect(x, b.y - HALF - 2, 8, 2);
        g.fillRect(x, b.y + HALF, 8, 2);
      }
      // The pylons: dark hex housings with a bright core and amber caution ticks.
      for (const px of [b.x0, b.x1]) {
        g.fillStyle = 'rgba(5,10,18,0.45)';
        g.beginPath();
        g.arc(px + 4, b.y + 6, PYLON + 2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#2b3646';
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const hx = px + Math.cos(a) * PYLON;
          const hy = b.y + Math.sin(a) * PYLON;
          if (k === 0) g.moveTo(hx, hy);
          else g.lineTo(hx, hy);
        }
        g.closePath();
        g.fill();
        g.strokeStyle = '#7f93ad';
        g.lineWidth = 2;
        g.stroke();
        g.strokeStyle = 'rgba(255,196,60,0.9)';
        g.lineWidth = 2;
        g.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + time * 0.8;
          g.moveTo(px + Math.cos(a) * 6, b.y + Math.sin(a) * 6);
          g.lineTo(px + Math.cos(a) * 11, b.y + Math.sin(a) * 11);
        }
        g.stroke();
        g.fillStyle = `rgba(210,250,255,${flick.toFixed(3)})`;
        g.beginPath();
        g.arc(px, b.y, 4.5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }
}
