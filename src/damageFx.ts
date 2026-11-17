import { H, JUICE, W } from './config';
import { drawShipLook, type ShipLook } from './ships';

/** Spawns one particle (the game's shared particle list). */
export type Emit = (x: number, y: number, vx: number, vy: number, life: number, color: string, size: number) => void;

/**
 * Player damage feedback (all tunables in `JUICE.damage`): hit flash, red vignette, sparks, i-frame blink,
 * low-health smoke / fire with embers and the warning alarm. Draws only; the game owns the state it reads.
 * Particles go into the game's shared list; the vignette is a pre-rendered sprite, so a frame costs a few draws.
 */
export class DamageFx {
  private since = 99;
  private heavy = false;
  private smokeAcc = 0;
  private fireAcc = 0;
  private emberAcc = 0;
  private alarmAcc = 0;
  private time = 0;
  private vignette: HTMLCanvasElement | null = null;
  private tint: HTMLCanvasElement | null = null;
  private lastLook: ShipLook | null = null;
  /** A level flag (`CampaignLevel.forceDamageFx`): the ship smokes and burns whatever its hull (a crippled ship). No alarm and no warning pulse until the hull is really at 1. */
  force = false;
  private half = { w: 20, h: 24 };

  /** Cache the ship's extent (half width/height) for effect offsets. */
  private measure(look: ShipLook): void {
    if (look === this.lastLook) return;
    this.lastLook = look;
    let w = 0;
    let h = 0;
    for (const [x, y] of look.hull.points) {
      w = Math.max(w, Math.abs(x));
      h = Math.max(h, Math.abs(y));
    }
    this.half = { w: Math.max(10, w), h: Math.max(12, h) };
  }

  reset(): void {
    this.since = 99;
    this.smokeAcc = this.fireAcc = this.emberAcc = this.alarmAcc = 0;
  }

  /** A hit landed at the ship: starts the flash and vignette and bursts sparks. */
  onHit(x: number, y: number, scrape: boolean, look: ShipLook, emit: Emit): void {
    const d = JUICE.damage;
    if (!d.enabled) return;
    this.measure(look);
    this.since = 0;
    this.heavy = scrape;
    const n = scrape ? d.sparks.scrape : d.sparks.hit;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 300;
      const life = 0.25 + Math.random() * 0.35;
      const r = Math.random();
      // Scrape: sparks sprayed along the ship's flanks (the contact point).
      const ox = scrape ? (Math.random() - 0.5) * this.half.w * 2 : (Math.random() - 0.5) * this.half.w;
      const oy = scrape ? (Math.random() - 0.3) * this.half.h : (Math.random() - 0.5) * this.half.h;
      emit(x + ox, y + oy, Math.cos(a) * sp, Math.sin(a) * sp - 40, life, r < 0.4 ? '#ffffff' : r < 0.75 ? '#ffd21f' : '#ff5a3a', 1.5 + Math.random() * 2.5);
    }
  }

  /** Per frame while playing. `hp`/`max` decide smoke (below ~40%) and fire (1 hp or ~20%). */
  update(dt: number, x: number, y: number, hp: number, max: number, look: ShipLook, emit: Emit, beep: (vol: number) => void): void {
    this.since += dt;
    this.time += dt;
    const d = JUICE.damage;
    if (!d.enabled || hp <= 0) return;
    this.measure(look);
    const lo = d.lowHealth;
    const frac = hp / max;
    const fire = this.force || hp <= 1 || frac <= lo.fire;
    const smoke = this.force || frac <= lo.smoke;
    if (!smoke && !fire) {
      this.alarmAcc = 0;
      return;
    }
    const hw = this.half.w;
    const hh = this.half.h;
    this.smokeAcc += dt * lo.smokeRate * (fire ? 0.6 : 1);
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      const g = 120 + ((Math.random() * 70) | 0);
      emit(x + (Math.random() - 0.5) * hw, y + hh * 0.2, (Math.random() - 0.5) * 20, 50 + Math.random() * 60, 0.5 + Math.random() * 0.5, `rgb(${g},${g},${g + 6})`, 3 + Math.random() * 3);
    }
    if (!fire) return;
    this.emberAcc += dt * lo.emberRate;
    while (this.emberAcc >= 1) {
      this.emberAcc -= 1;
      emit(x + (Math.random() - 0.5) * hw * 1.2, y + hh * 0.1, (Math.random() - 0.5) * 50, 70 + Math.random() * 90, 0.4 + Math.random() * 0.5, Math.random() < 0.5 ? '#ffb347' : '#ff6a2e', 1.5 + Math.random() * 1.5);
    }
    this.fireAcc += dt * lo.fireRate;
    while (this.fireAcc >= 1) {
      this.fireAcc -= 1;
      emit(x + (Math.random() - 0.5) * hw * 0.9, y + (Math.random() - 0.2) * hh * 0.6, (Math.random() - 0.5) * 30, 20 + Math.random() * 40, 0.15 + Math.random() * 0.2, Math.random() < 0.5 ? '#ffd21f' : '#ff4a1a', 2.5 + Math.random() * 3);
    }
    if (this.force && hp > 1) return;
    this.alarmAcc += dt;
    if (this.alarmAcc >= d.alarm.interval) {
      this.alarmAcc = 0;
      beep(d.alarm.volume);
    }
  }

  /** The ship, blinking while invulnerable after a hit and flashing white then red right after one. `dodging` keeps the dodge's own look. */
  drawShip(ctx: CanvasRenderingContext2D, look: ShipLook, x: number, y: number, invuln: number, dodging: boolean): void {
    const d = JUICE.damage;
    if (!d.enabled) {
      drawShipLook(ctx, look, x, y);
      return;
    }
    const blinking = invuln > 0 && !dodging;
    if (blinking && Math.floor(this.time * d.blink.hz) % 2 === 0) ctx.globalAlpha = d.blink.minAlpha;
    if (this.since < d.flash.white + d.flash.red) {
      const white = this.since < d.flash.white;
      const t = this.tintCanvas();
      const c = t.getContext('2d')!;
      c.clearRect(0, 0, t.width, t.height);
      drawShipLook(c, look, t.width / 2, t.height / 2);
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = white ? '#ffffff' : '#ff2a2a';
      c.fillRect(0, 0, t.width, t.height);
      c.globalCompositeOperation = 'source-over';
      ctx.drawImage(t, Math.round(x) - t.width / 2, Math.round(y) - t.height / 2);
    } else drawShipLook(ctx, look, x, y);
    ctx.globalAlpha = 1;
  }

  /** Flames licking over the ship (drawn on top of it) while it is burning. */
  drawFire(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number, max: number): void {
    const lo = JUICE.damage.lowHealth;
    if (!JUICE.damage.enabled || hp <= 0 || !(this.force || hp <= 1 || hp / max <= lo.fire)) return;
    const hw = this.half.w;
    const hh = this.half.h;
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 3; i++) {
      const fx = x + (i - 1) * hw * 0.5;
      const len = hh * (0.7 + 0.5 * Math.random());
      const w = hw * 0.28;
      ctx.fillStyle = i === 1 ? '#ffd21f' : '#ff6a1a';
      ctx.beginPath();
      ctx.moveTo(fx - w, y + hh * 0.2);
      ctx.lineTo(fx, y + hh * 0.2 - len * 0.1);
      ctx.lineTo(fx + w, y + hh * 0.2);
      ctx.lineTo(fx, y + hh * 0.2 + len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private tintCanvas(): HTMLCanvasElement {
    if (!this.tint) {
      this.tint = document.createElement('canvas');
      this.tint.width = this.tint.height = 128;
    }
    return this.tint;
  }

  /** Red screen-edge vignette: a pulse after a hit that fades in `vignette.fade` s, plus a slow warning pulse at 1 hp / low hull. */
  drawVignette(ctx: CanvasRenderingContext2D, hp: number, max: number): void {
    const d = JUICE.damage;
    if (!d.enabled) return;
    let a = 0;
    if (this.since < d.vignette.fade) {
      const k = 1 - this.since / d.vignette.fade;
      a = d.vignette.peak * k * k * (this.heavy ? 1.15 : 1);
    }
    if (hp > 0 && (hp <= 1 || (!this.force && hp / max <= d.lowHealth.fire))) {
      a = Math.max(a, d.vignette.lowPeak * (0.55 + 0.45 * Math.sin(this.time * d.vignette.lowPulse * Math.PI * 2)));
    }
    if (a <= 0.01) return;
    if (!this.vignette) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
      grad.addColorStop(0, 'rgba(255,0,0,0)');
      grad.addColorStop(0.6, 'rgba(230,20,20,0.35)');
      grad.addColorStop(1, 'rgba(200,0,0,0.95)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      this.vignette = c;
    }
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(this.vignette, 0, 0);
    ctx.globalAlpha = 1;
  }
}
