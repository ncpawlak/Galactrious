import { W } from '../config';
import type { Unit } from '../units';

const MONO = 'ui-monospace, Consolas, monospace';
const BANNER_SECONDS = 2.8;

interface Banner {
  callsign: string;
  accent: string;
  left: number;
}

/**
 * HUD for named aces (`UnitDefinition.ace`): a callsign tag with a hull bar above each live ace and a short banner when one enters.
 * Reads the unit system's units each frame; nothing to wire per ace. Banners queue (one at a time, 2.8 s each).
 */
export class AceHud {
  private readonly seen = new WeakSet<Unit>();
  private queue: Banner[] = [];
  private current: Banner | null = null;
  /** Callsigns announced so far this fight (verification). */
  readonly announced: string[] = [];

  reset(): void {
    this.queue = [];
    this.current = null;
    this.announced.length = 0;
  }

  update(dt: number, units: readonly Unit[]): void {
    for (const u of units) {
      if (!u.def.ace || this.seen.has(u) || u.state !== 'alive') continue;
      this.seen.add(u);
      const callsign = u.def.callsign ?? u.def.name;
      this.announced.push(callsign);
      this.queue.push({ callsign, accent: u.def.accent ?? '#ffd21f', left: BANNER_SECONDS });
    }
    if (this.current) {
      this.current.left -= dt;
      if (this.current.left <= 0) this.current = null;
    }
    if (!this.current && this.queue.length > 0) this.current = this.queue.shift()!;
  }

  /** Callsign tags (world space, with the units). */
  drawTags(g: CanvasRenderingContext2D, units: readonly Unit[]): void {
    for (const u of units) {
      if (!u.def.ace || u.state !== 'alive') continue;
      const b = u.fight.boss;
      const cx = b.x + b.width / 2;
      const top = b.y;
      if (cx < -40 || cx > W + 40 || top < -20) continue;
      const accent = u.def.accent ?? '#ffd21f';
      const frac = Math.max(0, 1 - u.fight.pixelDamagePercent / ((u.def.deathFraction ?? 0.75) * 100));
      g.save();
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = `bold 11px ${MONO}`;
      g.fillStyle = 'rgba(5, 6, 13, 0.7)';
      g.fillRect(cx - 34, top - 22, 68, 18);
      g.fillStyle = accent;
      g.fillText(u.def.callsign ?? '', cx, top - 15);
      g.fillStyle = '#2a2f40';
      g.fillRect(cx - 30, top - 10, 60, 3);
      g.fillStyle = accent;
      g.fillRect(cx - 30, top - 10, 60 * frac, 3);
      g.restore();
    }
  }

  /** The entry banner (screen space). */
  drawBanner(g: CanvasRenderingContext2D): void {
    const b = this.current;
    if (!b) return;
    const k = BANNER_SECONDS - b.left;
    const slide = Math.min(1, k / 0.3);
    const fade = Math.min(1, b.left / 0.5);
    const y = 300;
    g.save();
    g.globalAlpha = fade;
    const w = 380;
    const x = W / 2 - w / 2 + (1 - slide) * (W / 2 + w / 2);
    g.fillStyle = 'rgba(5, 6, 13, 0.82)';
    g.fillRect(x, y - 30, w, 64);
    g.fillStyle = b.accent;
    g.fillRect(x, y - 30, 6, 64);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.font = `bold 12px ${MONO}`;
    g.fillStyle = '#ff8a5a';
    g.fillText('EMPIRE ACE INBOUND', x + 20, y - 8);
    g.font = `bold 30px ${MONO}`;
    g.fillStyle = b.accent;
    g.fillText(b.callsign, x + 20, y + 24);
    g.restore();
  }
}
