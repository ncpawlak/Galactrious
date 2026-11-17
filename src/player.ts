import { H, TUNING, W } from './config';

/** Where the touch/pointer dodge button lives (logical coords). Used for drawing and hit-testing. */
export const DODGE_BUTTON = { x: W - 56, y: H - 56, r: 36 };

export function inDodgeButton(px: number, py: number): boolean {
  const b = DODGE_BUTTON;
  return Math.hypot(px - b.x, py - b.y) <= b.r;
}

/** Player health with post-hit invulnerability. The dodge's invulnerability is checked by the caller. */
export class Health {
  /** Max hit points (base + upgrades; the game keeps it in sync, see `setMax`). */
  maxHp: number = TUNING.player.maxHealth;
  hp: number = TUNING.player.maxHealth;
  /** Seconds of post-hit invulnerability left. */
  invuln = 0;
  /** Seconds since the last hit, for the bar flash. */
  sinceHit = 99;

  /** Change max hull: a higher max also heals by the difference (the card's point), a lower one clamps. */
  setMax(n: number): void {
    if (n === this.maxHp) return;
    if (!this.dead) this.hp = Math.min(n, this.hp + Math.max(0, n - this.maxHp));
    this.maxHp = n;
  }

  get dead(): boolean {
    return this.hp <= 0;
  }

  update(dt: number): void {
    this.invuln = Math.max(0, this.invuln - dt);
    this.sinceHit += dt;
  }

  /** Apply damage unless invulnerable. Returns true if it landed. */
  hit(dmg: number, invulnerable: boolean): boolean {
    if (invulnerable || this.invuln > 0 || this.dead) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = TUNING.player.hitInvuln;
    this.sinceHit = 0;
    return true;
  }

  reset(): void {
    this.hp = this.maxHp;
    this.invuln = 0;
    this.sinceHit = 99;
  }

  /** Top-right health bar (the left/bottom of the screen belongs to the HUD and debug overlay). */
  draw(ctx: CanvasRenderingContext2D): void {
    const w = 120;
    const h = 14;
    const x = W - w - 12;
    const y = 12;
    const frac = this.hp / this.maxHp;
    ctx.save();
    ctx.fillStyle = 'rgba(5, 6, 13, 0.7)';
    ctx.fillRect(x - 6, y - 6, w + 12, h + 26);
    ctx.fillStyle = '#9aa7c7';
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('HULL', x, y + h + 3);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = this.sinceHit < 0.2 ? '#ffffff' : frac > 0.4 ? '#4ade80' : '#ff5a5a';
    ctx.fillRect(x, y, w * frac, h);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (let i = 1; i < this.maxHp; i++) ctx.fillRect(x + (w * i) / this.maxHp - 1, y, 2, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }
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
  /** Cooldown length after a dodge (base + upgrades; the game keeps it in sync). */
  cooldownTime: number = TUNING.dodge.cooldown;
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
    return this.cooldown <= 0 ? 1 : 1 - this.cooldown / this.cooldownTime;
  }

  /** Try to start a dodge in direction (dx, dy). Returns true if it started. */
  trigger(dx: number, dy: number): boolean {
    if (!this.ready) return false;
    const len = Math.hypot(dx, dy);
    this.dirX = len > 0 ? dx / len : 1;
    this.dirY = len > 0 ? dy / len : 0;
    this.active = TUNING.dodge.invulnTime;
    this.cooldown = this.cooldownTime;
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
