import { H, W } from './config';
import type { Boss } from './boss';
import type { BossFight } from './bossFight';
import { ENRAGE_FLASH } from './bossFight';

/**
 * Draws the boss with the enrage look: a white flash at the transition, then a slow red pulse that
 * stays while enraged. The boss is rendered to an offscreen canvas and tinted with `source-atop`, so
 * only boss pixels (hull, frame, rooms, core, fragments) are tinted, never the background.
 */
export class EnrageTint {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d')!;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
  }

  render(ctx: CanvasRenderingContext2D, boss: Boss, fight: BossFight): void {
    if (!fight.enraged && fight.enrageFlash <= 0) {
      boss.render(ctx);
      return;
    }
    const o = this.ctx;
    o.clearRect(0, 0, W, H);
    boss.render(o);
    o.globalCompositeOperation = 'source-atop';
    const rgb = fight.phase.enrage?.tint ?? fight.def.phases.find((p) => p.enrage)?.enrage?.tint ?? '255, 40, 20';
    const pulse = 0.5 + 0.5 * Math.sin(fight.fightTime * 6);
    o.fillStyle = `rgba(${rgb}, ${0.1 + 0.14 * pulse})`;
    o.fillRect(0, 0, W, H);
    if (fight.enrageFlash > 0) {
      const k = fight.enrageFlash / ENRAGE_FLASH;
      // Blink white twice while fading out.
      const blink = Math.sin(k * Math.PI * 4) > -0.2 ? 1 : 0.4;
      o.fillStyle = `rgba(255, 255, 255, ${0.8 * k * blink})`;
      o.fillRect(0, 0, W, H);
    }
    o.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.canvas, 0, 0);
  }
}
