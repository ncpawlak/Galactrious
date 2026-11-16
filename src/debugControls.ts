/**
 * Debug controls: fast damage scaling, a clickable canvas panel (damage/fire rate/god mode/reset)
 * and the pure helpers behind them. Kept out of game.ts so the game only wires it up.
 */

import { BLAST, setBlastScale } from './config';

export const DAMAGE_MIN = 1;
/** Upper clamp. Bullet energy only feeds bounded loops (fixed carve tables), so this is about sanity, not safety. */
export const DAMAGE_MAX = 1_000_000;
export const RATE_MIN = 1;
export const RATE_MAX = 200;
/** Quick-jump damage presets (the first is replaced by the default ship damage at runtime). */
export const DAMAGE_PRESETS = [90, 450, 2000, 100000] as const;

export function clampDamage(v: number): number {
  if (!Number.isFinite(v)) return DAMAGE_MIN;
  return Math.min(DAMAGE_MAX, Math.max(DAMAGE_MIN, Math.round(v)));
}

/** Step that grows with the magnitude: the power of ten at/below `v` (90 -> 10, 100 -> 100, 2000 -> 1000). */
function magnitude(v: number): number {
  return Math.pow(10, Math.floor(Math.log10(Math.max(1, v))));
}

/** One +/- step. Up adds the current magnitude, down subtracts the magnitude just below (100 -> 90 -> 80). `mult` = modifier (x10 / x100). */
export function stepDamage(v: number, dir: 1 | -1, mult = 1): number {
  const step = (dir > 0 ? magnitude(v) : magnitude(v - 1)) * mult;
  return clampDamage(v + dir * step);
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Modifier multiplier from the held keys / event: Shift = x10, Alt or Ctrl = x100. */
export function modifierMult(m: { shift: boolean; alt: boolean; ctrl: boolean }): number {
  return m.alt || m.ctrl ? 100 : m.shift ? 10 : 1;
}

export interface DebugHost {
  stats: { damage: number; fireRate: number };
  defaultDamage: () => number;
  godMode: boolean;
  /** Reset stats (like [0]) and anything else the host wants back to defaults. */
  resetAll: () => void;
}

interface Button {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  on: () => void;
  active?: () => boolean;
}

const PW = 262;
const ROW = 26;

/** Small collapsible panel at the bottom-left, hit-tested in logical (540x960) coordinates. */
export class DebugPanel {
  open = true;
  private buttons: Button[] = [];
  private px = 8;
  private py = 0;
  private ph = 0;
  private lastMult = 1;

  constructor(
    private readonly host: DebugHost,
    private readonly H: number,
  ) {
    this.layout();
  }

  setDamage(v: number): void {
    this.host.stats.damage = clampDamage(v);
  }

  adjustDamage(dir: 1 | -1, mult = 1): void {
    this.setDamage(stepDamage(this.host.stats.damage, dir, mult));
  }

  scaleDamage(f: number): void {
    this.setDamage(this.host.stats.damage * f);
  }

  /** Cycle through the presets (key [9]). */
  cyclePreset(): void {
    const list = this.presets();
    const i = list.indexOf(this.host.stats.damage);
    this.setDamage(list[(i + 1) % list.length]);
  }

  adjustRate(dir: 1 | -1, mult = 1): void {
    const s = this.host.stats;
    s.fireRate = Math.min(RATE_MAX, Math.max(RATE_MIN, s.fireRate + dir * mult));
  }

  /** Blast size scale (BLAST.scale), one step per press ([-] / [=]); `mult` 4 = coarse. */
  adjustBlast(dir: 1 | -1, mult = 1): number {
    return setBlastScale(BLAST.scale + dir * BLAST.step * mult);
  }

  toggleOpen(): void {
    this.open = !this.open;
    this.layout();
  }

  private presets(): number[] {
    return [this.host.defaultDamage(), ...DAMAGE_PRESETS.slice(1)];
  }

  private layout(): void {
    const b: Button[] = [];
    const x0 = this.px;
    const rows = this.open ? 7 : 1;
    this.ph = rows * ROW + 6;
    this.py = this.H - this.ph - 8;
    const y = (r: number) => this.py + 4 + r * ROW;
    // Header toggles collapse.
    b.push({ label: '', x: x0, y: y(0), w: PW, h: ROW - 2, on: () => this.toggleOpen() });
    if (this.open) {
      const m = () => this.lastMult;
      b.push({ label: '-', x: x0 + 4, y: y(1), w: 34, h: ROW - 4, on: () => this.adjustDamage(-1, m()) });
      b.push({ label: '+', x: x0 + PW - 38, y: y(1), w: 34, h: ROW - 4, on: () => this.adjustDamage(1, m()) });
      const pr = this.presets();
      const labels = ['90', '450', '2k', 'ONE-SHOT'];
      const ws = [44, 52, 52, 98];
      let px = x0 + 4;
      pr.forEach((v, i) => {
        b.push({
          label: i === 0 ? 'DEF' : labels[i],
          x: px,
          y: y(2),
          w: ws[i],
          h: ROW - 4,
          on: () => this.setDamage(v),
          active: () => this.host.stats.damage === v,
        });
        px += ws[i] + 4;
      });
      b.push({ label: 'x0.5', x: x0 + 4, y: y(3), w: 56, h: ROW - 4, on: () => this.scaleDamage(0.5) });
      b.push({ label: 'x2', x: x0 + 64, y: y(3), w: 56, h: ROW - 4, on: () => this.scaleDamage(2) });
      b.push({ label: 'x10', x: x0 + 124, y: y(3), w: 56, h: ROW - 4, on: () => this.scaleDamage(10) });
      b.push({ label: '-', x: x0 + 4, y: y(4), w: 34, h: ROW - 4, on: () => this.adjustRate(-1, m()) });
      b.push({ label: '+', x: x0 + PW - 38, y: y(4), w: 34, h: ROW - 4, on: () => this.adjustRate(1, m()) });
      b.push({ label: '-', x: x0 + 4, y: y(5), w: 34, h: ROW - 4, on: () => this.adjustBlast(-1, m()) });
      b.push({ label: '+', x: x0 + PW - 38, y: y(5), w: 34, h: ROW - 4, on: () => this.adjustBlast(1, m()) });
      b.push({
        label: 'GOD MODE',
        x: x0 + 4,
        y: y(6),
        w: 124,
        h: ROW - 4,
        on: () => (this.host.godMode = !this.host.godMode),
        active: () => this.host.godMode,
      });
      b.push({ label: 'RESET ALL', x: x0 + 132, y: y(6), w: 126, h: ROW - 4, on: () => this.host.resetAll() });
    }
    this.buttons = b;
  }

  /** Handle a pointer press at logical (x, y). Returns true when the panel consumed it (so the ship must not steer). */
  handlePointer(x: number, y: number, e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean }): boolean {
    if (x < this.px || x > this.px + PW || y < this.py || y > this.py + this.ph) return false;
    this.lastMult = modifierMult({ shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey });
    for (const b of this.buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        b.on();
        break;
      }
    }
    this.lastMult = 1;
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const s = this.host.stats;
    const x0 = this.px;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#000';
    ctx.fillRect(x0, this.py, PW, this.ph);
    ctx.globalAlpha = 1;
    ctx.font = '12px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#b9f5c0';
    const hy = this.py + 4 + (ROW - 2) / 2;
    ctx.fillText(`${this.open ? '▾' : '▸'} DEBUG PANEL  [C] ${this.host.godMode ? ' GOD' : ''}`, x0 + 6, hy);
    if (this.open) {
      for (const b of this.buttons.slice(1)) {
        ctx.fillStyle = b.active?.() ? '#2c6b3a' : '#1b2a3d';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = '#4a6a8a';
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      }
      const row = (r: number) => this.py + 4 + r * ROW + (ROW - 4) / 2;
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#ffe27a';
      ctx.fillText(`DMG ${fmt(s.damage)}`, x0 + PW / 2, row(1) + 1);
      ctx.fillStyle = '#9ff6ff';
      ctx.fillText(`RATE ${s.fireRate}/s`, x0 + PW / 2, row(4) + 1);
      ctx.fillStyle = '#ffb27a';
      ctx.fillText(`BLAST x${BLAST.scale.toFixed(2)}`, x0 + PW / 2, row(5) + 1);
    }
    ctx.restore();
  }
}
