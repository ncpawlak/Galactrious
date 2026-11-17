import { H, W } from '../config';

/** One line of centred text. */
export function drawCentered(g: CanvasRenderingContext2D, text: string, y: number, font: string, color: string): void {
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = font;
  g.fillStyle = color;
  g.fillText(text, W / 2, y);
  g.restore();
}

function dim(g: CanvasRenderingContext2D, a: number): void {
  g.save();
  g.fillStyle = `rgba(5, 6, 13, ${a})`;
  g.fillRect(0, 0, W, H);
  g.restore();
}

/** Blinking prompt line. */
function prompt(g: CanvasRenderingContext2D, text: string, y: number, t: number): void {
  if (Math.floor(t * 2) % 2 === 0) drawCentered(g, text, y, '18px monospace', '#ffffff');
}

export function drawTitle(g: CanvasRenderingContext2D, t: number, levels: number): void {
  dim(g, 0.35);
  drawCentered(g, 'GALACTRIOUS', 330, 'bold 56px monospace', '#ffd21f');
  drawCentered(g, 'carve the bosses', 372, '18px monospace', '#6ee7ff');
  drawCentered(g, `${levels} levels  /  waves, then a boss  /  one life`, 430, '14px monospace', '#8fa0c8');
  prompt(g, 'tap or press any key to start', 560, t);
  drawCentered(g, 'move: drag / arrows / WASD    dodge: Shift / X / button', 860, '12px monospace', '#8fa0c8');
  drawCentered(g, 'debug: [Z] one-boss test mode', 880, '12px monospace', '#5b6a8c');
}

export interface RunSummary {
  level: number;
  levels: number;
  time: number;
  upgrades: string[];
}

export function drawRunOver(g: CanvasRenderingContext2D, t: number, s: RunSummary): void {
  dim(g, 0.6);
  drawCentered(g, 'RUN OVER', 380, 'bold 48px monospace', '#ff5a5a');
  drawCentered(g, 'your ship was destroyed', 420, '16px monospace', '#ffffff');
  drawCentered(g, `reached level ${s.level} of ${s.levels}   time ${s.time.toFixed(0)}s`, 470, '16px monospace', '#8fa0c8');
  if (t > 1) prompt(g, 'tap or press any key', 560, t);
}

export function drawRunWon(g: CanvasRenderingContext2D, t: number, s: RunSummary): void {
  dim(g, 0.6);
  drawCentered(g, 'RUN COMPLETE', 380, 'bold 48px monospace', '#ffd21f');
  drawCentered(g, `all ${s.levels} levels cleared`, 420, '16px monospace', '#ffffff');
  drawCentered(g, `time ${s.time.toFixed(0)}s   upgrades ${s.upgrades.length ? s.upgrades.length : 'none'}`, 470, '14px monospace', '#8fa0c8');
  if (t > 1) prompt(g, 'tap or press any key', 560, t);
}
