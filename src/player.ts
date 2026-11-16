import { H, TUNING, W } from './config';

/** Where the touch/pointer dodge button lives (logical coords). Used for drawing and hit-testing. */
export const DODGE_BUTTON = { x: W - 56, y: H - 56, r: 36 };

export function inDodgeButton(px: number, py: number): boolean {
  const b = DODGE_BUTTON;
  return Math.hypot(px - b.x, py - b.y) <= b.r;
}

/**
 * Dodge: a short dash with invulnerability, on a cooldown. There is no player damage yet, so
 * `invulnerable` is the hook future damage code should check; it is also shown visually.
 */
export class Dodge {
  /** Seconds of dash left (also the invulnerability window). */
  active = 0;
  /** Seconds until the dodge is ready again. */
  cooldown = 0;
  private dirX = 0;
  private dirY = 0;

  get invulnerable(): boolean {
    return this.active > 0;
  }

  get ready(): boolean {
    return this.cooldown <= 0 && this.active <= 0;
  }

  /** 0..1, 1 = ready. */
  get charge(): number {
    return this.cooldown <= 0 ? 1 : 1 - this.cooldown / TUNING.dodge.cooldown;
  }

  /** Try to start a dodge in direction (dx, dy). Returns true if it started. */
  trigger(dx: number, dy: number): boolean {
    if (!this.ready) return false;
    const len = Math.hypot(dx, dy);
    this.dirX = len > 0 ? dx / len : 1;
    this.dirY = len > 0 ? dy / len : 0;
    this.active = TUNING.dodge.invulnTime;
    this.cooldown = TUNING.dodge.cooldown;
    return true;
  }

  /** Advance timers; returns the dash displacement to apply to the ship this frame. */
  update(dt: number): { x: number; y: number } {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.active <= 0) return { x: 0, y: 0 };
    const step = Math.min(dt, this.active);
    this.active -= step;
    const v = TUNING.dodge.distance / TUNING.dodge.invulnTime;
    return { x: this.dirX * v * step, y: this.dirY * v * step };
  }

  reset(): void {
    this.active = 0;
    this.cooldown = 0;
  }

  /** Ghost ring around the ship while invulnerable. */
  drawShipFx(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.invulnerable) return;
    ctx.save();
    ctx.strokeStyle = '#9ff6ff';
    ctx.globalAlpha = 0.5 + 0.5 * (this.active / TUNING.dodge.invulnTime);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Touch button doubling as a cooldown indicator. */
  drawButton(ctx: CanvasRenderingContext2D): void {
    const { x, y, r } = DODGE_BUTTON;
    ctx.save();
    ctx.globalAlpha = this.ready ? 0.85 : 0.5;
    ctx.fillStyle = '#0b1424';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#26324d';
    ctx.stroke();
    ctx.strokeStyle = this.ready ? '#6ee7ff' : '#ffb347';
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.charge);
    ctx.stroke();
    ctx.fillStyle = this.ready ? '#ffffff' : '#8fa0c8';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DODGE', x, y - 5);
    ctx.font = '10px monospace';
    ctx.fillText(this.ready ? '[Shift]' : this.cooldown.toFixed(1) + 's', x, y + 9);
    ctx.restore();
  }
}
