import { H, W } from '../config';
import { makeCanvas } from '../bosses/paint';
import { drawShipLook, shipById } from '../ships';
import type { AllyPattern } from './types';

/**
 * Cosmetic allies: Delta squad wingmen. They fly scripted paths in the background, UNDER every combat layer (the game draws
 * them right after the background), and fire small pale tracers that hit nothing. No collisions, no hit effects, no
 * influence on enemies or the player: purely a picture. Drawn from the default blue Vanguard look, so they read against the
 * enemy reds and the empire's slate.
 */

const SPRITE_W = 22;
const SPRITE_H = 26;

let sprite: HTMLCanvasElement | null = null;

function allySprite(): HTMLCanvasElement {
  if (sprite) return sprite;
  // The default blue Vanguard skin (the squad never wears the Rookie skin), drawn at twice the logical size for a crisp downscale.
  const { canvas, ctx } = makeCanvas(SPRITE_W * 2, SPRITE_H * 2);
  drawShipLook(ctx, shipById('vanguard').look, SPRITE_W, SPRITE_H + 4);
  sprite = canvas;
  return canvas;
}

/** Draw one wingman sprite centred at (x, y) (used by the squad assists, src/finale/assists.ts). `scale` 1 = the size used under the combat layer. */
export function drawAllySprite(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
  const w = SPRITE_W * 0.85 * scale;
  const h = SPRITE_H * 0.85 * scale;
  ctx.drawImage(allySprite(), Math.round(x - w / 2), Math.round(y - h / 2), w, h);
}

interface Ally {
  i: number;
  /** Seconds since it entered. */
  t: number;
  x: number;
  y: number;
  /** 0..1 blend from the entry point to its path (smoothstep); leaving flies it off the top. */
  blend: number;
  baseX: number;
  baseY: number;
  fire: number;
  leaving: boolean;
}

interface Shot {
  x: number;
  y: number;
}

const smooth = (u: number): number => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

/** Max tracers alive at once (a hard ceiling so the group stays free). */
const MAX_SHOTS = 48;
const SHOT_SPEED = 560;

export class AllySystem {
  allies: Ally[] = [];
  private shots: Shot[] = [];
  private pattern: AllyPattern = 'weave';
  private time = 0;

  get count(): number {
    return this.allies.filter((a) => !a.leaving).length;
  }

  clear(): void {
    this.allies = [];
    this.shots = [];
  }

  /** Bring in `count` wingmen (3 to 4 is the intended group) flying `pattern`. Replaces any group already out. */
  set(count: number, pattern: AllyPattern = 'weave'): void {
    for (const a of this.allies) a.leaving = true;
    this.pattern = pattern;
    for (let i = 0; i < count; i++) {
      const baseX = (W * (i + 1)) / (count + 1);
      this.allies.push({ i, t: 0, x: baseX, y: H + 40, blend: 0, baseX, baseY: 120 + (i % 2) * 90 + (i === 1 || i === 2 ? 40 : 0), fire: 0.2 + i * 0.13, leaving: false });
    }
  }

  /** Send the group off the top of the screen. */
  dismiss(): void {
    for (const a of this.allies) a.leaving = true;
  }

  private path(a: Ally): { x: number; y: number } {
    const t = a.t;
    const i = a.i;
    switch (this.pattern) {
      case 'weave':
        return { x: a.baseX + Math.sin(t * 0.9 + i * 1.7) * 95, y: a.baseY + Math.sin(t * 0.6 + i) * 26 };
      case 'loop': {
        const ang = t * 0.7 + i * 1.6;
        return { x: a.baseX + Math.cos(ang) * 75, y: a.baseY + 60 + Math.sin(ang) * 55 };
      }
      case 'strafe': {
        const span = H + 120;
        const k = (t * 95 + i * 190) % span;
        return { x: a.baseX + Math.sin(t * 0.8 + i) * 34, y: H + 50 - k };
      }
      case 'patrol':
        return { x: a.baseX + Math.sin(t * 0.4 + i) * 18, y: a.baseY + 40 + Math.sin(t * 0.9 + i) * 10 };
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (const a of this.allies) {
      a.t += dt;
      if (a.leaving) {
        a.y -= 340 * dt;
        a.x += Math.sin(a.t + a.i) * 20 * dt;
      } else {
        a.blend = Math.min(1, a.blend + dt / 1.6);
        const p = this.path(a);
        const k = smooth(a.blend);
        a.x = a.x + (p.x - a.x) * Math.min(1, k * dt * 6 + (a.blend >= 1 ? 1 : 0));
        a.y = a.y + (p.y - a.y) * Math.min(1, k * dt * 6 + (a.blend >= 1 ? 1 : 0));
      }
      a.fire -= dt;
      if (a.fire <= 0 && !a.leaving && a.blend > 0.5 && this.shots.length < MAX_SHOTS) {
        a.fire = 0.26 + ((a.i * 0.37 + this.time) % 0.17);
        this.shots.push({ x: a.x, y: a.y - 12 });
      }
    }
    for (const s of this.shots) s.y -= SHOT_SPEED * dt;
    if (this.shots.length > 0 && this.shots.some((s) => s.y < -12)) this.shots = this.shots.filter((s) => s.y > -12);
    if (this.allies.some((a) => a.leaving && a.y < -50)) this.allies = this.allies.filter((a) => !(a.leaving && a.y < -50));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.allies.length === 0 && this.shots.length === 0) return;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#fff3b0';
    for (const s of this.shots) ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 4, 2, 7);
    const img = allySprite();
    for (const a of this.allies) {
      const w = SPRITE_W * 0.85;
      const h = SPRITE_H * 0.85;
      ctx.drawImage(img, Math.round(a.x - w / 2), Math.round(a.y - h / 2), w, h);
    }
    ctx.restore();
  }
}
