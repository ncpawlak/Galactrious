import { JUICE } from './config';

interface DamageNumber {
  x: number;
  y: number;
  value: number;
  age: number;
  core: boolean;
}

/** Game-feel state: hit stop, screen shake and floating damage numbers. */
export class Effects {
  enabled = true;
  private trauma = 0;
  private stop = 0;
  private stopCooldown = 0;
  private numbers: DamageNumber[] = [];
  private time = 0;
  private shakeX = 0;
  private shakeY = 0;

  /** Advances effect timers by real time; returns the dt gameplay should use (0 during hit stop). */
  step(dt: number): number {
    this.time += dt;
    this.stopCooldown -= dt;
    this.trauma = Math.max(0, this.trauma - JUICE.shake.decay * dt);
    for (const n of this.numbers) n.age += dt;
    this.numbers = this.numbers.filter((n) => n.age < JUICE.numbers.life);

    const t = this.enabled ? this.trauma * this.trauma : 0;
    const m = JUICE.shake.maxOffset * t;
    this.shakeX = (Math.random() * 2 - 1) * m;
    this.shakeY = (Math.random() * 2 - 1) * m;

    if (!this.enabled) return dt;
    if (this.stop > 0) {
      this.stop -= dt;
      return 0;
    }
    return dt;
  }

  reset(): void {
    this.trauma = 0;
    this.stop = 0;
    this.numbers = [];
  }

  /** A bullet hit the boss. */
  onHit(x: number, y: number, carved: number, spent: number, core: boolean): void {
    if (!this.enabled) return;
    const { hitStop: hs, shake, numbers } = JUICE;
    this.addTrauma(core ? shake.core : carved * shake.perPixel);

    const heavy = core ? hs.core : carved >= hs.carveThreshold ? carved * hs.perPixel : 0;
    if (heavy > 0 && this.stopCooldown <= 0) {
      this.stop = Math.min(hs.max, heavy);
      this.stopCooldown = hs.cooldown;
    }

    const value = Math.round(spent);
    if (value < numbers.minValue) return;
    const near = this.numbers.find(
      (n) => n.core === core && n.age < numbers.mergeWindow && Math.abs(n.x - x) < 40 && Math.abs(n.y - y) < 40,
    );
    if (near) near.value += value;
    else this.numbers.push({ x, y, value, age: 0, core });
  }

  /** A bullet hit a boss component: a tiny shake, no number. */
  onComponentHit(): void {
    if (!this.enabled) return;
    this.addTrauma(0.03);
  }

  /** A room's first console showed: a short jolt. */
  onRoomExposed(): void {
    if (!this.enabled) return;
    this.addTrauma(0.3);
  }

  /** A component blew up: shake and hit stop grow with the blast radius (px). */
  onComponentDestroy(radius: number): void {
    if (!this.enabled) return;
    const { destroy } = JUICE;
    this.addTrauma(Math.min(destroy.maxShake, destroy.shakeBase + radius * destroy.shakePerPx), destroy.maxTrauma);
    if (this.stopCooldown <= 0) {
      this.stop = Math.min(destroy.maxStop, destroy.stopBase + radius * destroy.stopPerPx);
      this.stopCooldown = JUICE.hitStop.cooldown;
    }
  }

  onExplosion(): void {
    if (!this.enabled) return;
    this.addTrauma(JUICE.shake.explosion);
  }

  /** Enrage transition: a heavy shake. */
  onEnrage(): void {
    if (!this.enabled) return;
    this.trauma = 1;
  }

  /** A soft, low rumble (thunder): a small trauma kick, never above 0.3. */
  rumble(a: number): void {
    if (this.enabled) this.addTrauma(a, 0.3);
  }

  private addTrauma(a: number, cap = JUICE.shake.maxTrauma): void {
    this.trauma = Math.min(1, Math.max(this.trauma, Math.min(cap, this.trauma + a)));
  }

  /** Call before drawing the world. Pair with `endShake`. */
  beginShake(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    if (this.enabled) ctx.translate(Math.round(this.shakeX), Math.round(this.shakeY));
  }

  endShake(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  drawNumbers(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled || this.numbers.length === 0) return;
    ctx.save();
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.numbers) {
      const k = n.age / JUICE.numbers.life;
      ctx.globalAlpha = 1 - k * k;
      const y = n.y - 8 - JUICE.numbers.rise * k;
      const text = String(n.value);
      ctx.fillStyle = '#000';
      ctx.fillText(text, Math.round(n.x) + 1, Math.round(y) + 1);
      ctx.fillStyle = n.core ? '#ffd21f' : '#fff7a8';
      ctx.fillText(text, Math.round(n.x), Math.round(y));
    }
    ctx.restore();
  }
}
