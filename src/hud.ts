import { H, W } from './config';
import type { Boss } from './boss';

/** Per-layer progress bars plus room status. Reads boss state only; owns no game logic. */

const LAYER_COLORS = ['#e0525a', '#c4cddb', '#3fb6bf'];
const PANEL_X = 10;
const BAR_W = 120;

interface RoomInfo {
  /** Pixel indices of the room in the initial rooms mask. */
  pixels: number[];
  hasCore: boolean;
}

export class Hud {
  private rooms: RoomInfo[] = [];
  private fractions: number[] = [];
  private lastRemaining = -1;

  private boss: Boss | null = null;

  /** Re-label rooms whenever a new boss instance appears (e.g. after restart). */
  private bind(boss: Boss): void {
    if (this.boss === boss) return;
    this.boss = boss;
    this.rooms = [];
    this.fractions = [];
    this.lastRemaining = -1;
    this.labelRooms();
  }

  /** Flood-fill the rooms layer into connected rooms (4-connectivity). */
  private labelRooms(): void {
    const boss = this.boss!;
    const layer = boss.layers[boss.layers.length - 1];
    const { width: w, height: h } = boss;
    const seen = new Uint8Array(w * h);
    const { core } = boss;
    const coreIdx = Math.round(core.y) * w + Math.round(core.x);
    for (let start = 0; start < w * h; start++) {
      if (!layer.mask[start] || seen[start]) continue;
      const pixels: number[] = [];
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const i = stack.pop()!;
        pixels.push(i);
        const x = i % w;
        const y = (i / w) | 0;
        const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const n of next) {
          if (n >= 0 && layer.mask[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      if (pixels.length > 40) this.rooms.push({ pixels, hasCore: false });
    }
    for (const r of this.rooms) r.hasCore = r.pixels.includes(coreIdx);
    // Core room first, then top-to-bottom.
    this.rooms.sort((a, b) => Number(b.hasCore) - Number(a.hasCore) || a.pixels[0] - b.pixels[0]);
  }

  private refreshRooms(): void {
    const boss = this.boss!;
    const layer = boss.layers[boss.layers.length - 1];
    if (layer.remaining === this.lastRemaining) return;
    this.lastRemaining = layer.remaining;
    this.fractions = this.rooms.map((r) => {
      let n = 0;
      for (const i of r.pixels) if (layer.mask[i]) n++;
      return n / r.pixels.length;
    });
  }

  /** "ENRAGED" badge, top centre (clear of the top-right health bar). Pulses with `time`. */
  drawEnraged(ctx: CanvasRenderingContext2D, time: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.save();
    ctx.font = 'bold 18px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = 128;
    ctx.fillStyle = `rgba(90, 8, 8, ${0.75 + 0.2 * pulse})`;
    ctx.fillRect(W / 2 - w / 2, 14, w, 28);
    ctx.strokeStyle = `rgba(255, 90, 60, ${0.6 + 0.4 * pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - w / 2 + 1, 15, w - 2, 26);
    ctx.fillStyle = pulse > 0.5 ? '#ffd0c0' : '#ff7a5a';
    ctx.fillText('ENRAGED', W / 2, 29);
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, boss: Boss): void {
    this.bind(boss);
    this.refreshRooms();
    const rows = boss.layers.length;
    const lineH = 16;
    const panelH = 12 + rows * lineH + 16 + 14;
    const y0 = H - panelH - 10;

    ctx.save();
    ctx.font = '12px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(5, 6, 13, 0.7)';
    ctx.fillRect(PANEL_X - 6, y0 - 6, BAR_W + 120, panelH + 6);

    boss.layers.forEach((l, i) => {
      const y = y0 + i * lineH;
      const frac = boss.layerRemaining(i);
      const color = LAYER_COLORS[i % LAYER_COLORS.length];
      ctx.fillStyle = '#9aa7c7';
      ctx.fillText(l.name.padEnd(5), PANEL_X, y);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(PANEL_X + 48, y + 2, BAR_W, 9);
      ctx.fillStyle = color;
      ctx.fillRect(PANEL_X + 48, y + 2, BAR_W * frac, 9);
      ctx.fillStyle = '#e8ecf8';
      // Show carved progress (how much of the layer is gone).
      ctx.fillText(`${Math.round((1 - frac) * 100)}%`, PANEL_X + 48 + BAR_W + 6, y);
    });

    // Room status: one pip per room — filled = intact, outlined = breached, gold ring = core room.
    const ry = y0 + rows * lineH + 4;
    ctx.fillStyle = '#9aa7c7';
    ctx.fillText('Rooms', PANEL_X, ry);
    this.rooms.forEach((r, i) => {
      const f = this.fractions[i] ?? 1;
      const x = PANEL_X + 48 + i * 22;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, ry, 16, 12);
      ctx.fillStyle = f > 0 ? LAYER_COLORS[2] : '#555d72';
      ctx.fillRect(x, ry + 12 * (1 - f), 16, 12 * f);
      ctx.strokeStyle = r.hasCore ? '#ffd21f' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, ry + 0.5, 15, 11);
    });
    const cleared = this.fractions.filter((f) => f <= 0).length;
    ctx.fillStyle = '#e8ecf8';
    ctx.fillText(`${cleared}/${this.rooms.length} cleared`, PANEL_X + 48 + this.rooms.length * 22 + 4, ry);
    ctx.restore();
  }
}
