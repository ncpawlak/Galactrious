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

/** Title touch targets: the Endless run, the two modes that are not built yet (disabled), and the Unlocks screen. */
export const ENDLESS_BTN = { x: W / 2 - 140, y: 430, w: 280, h: 60 };
export const CAMPAIGN_BTN = { x: W / 2 - 140, y: 506, w: 280, h: 60 };
export const CONQUEST_BTN = { x: W / 2 - 140, y: 582, w: 280, h: 60 };
export const UNLOCKS_BTN = { x: W / 2 - 140, y: 680, w: 280, h: 56 };

function titleButton(g: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }, label: string, color: string, sub?: string): void {
  g.save();
  g.fillStyle = '#0b1424';
  g.fillRect(b.x, b.y, b.w, b.h);
  g.lineWidth = 3;
  g.strokeStyle = color;
  g.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
  g.restore();
  drawCentered(g, label, b.y + (sub ? 28 : b.h / 2 + 6), 'bold 20px monospace', color);
  if (sub) drawCentered(g, sub, b.y + 48, '12px monospace', color);
}

export function drawTitle(g: CanvasRenderingContext2D, t: number, levels: number): void {
  dim(g, 0.35);
  drawCentered(g, 'GALACTRIOUS', 250, 'bold 56px monospace', '#ffd21f');
  drawCentered(g, 'carve the bosses', 292, '18px monospace', '#6ee7ff');
  drawCentered(g, `${levels} levels  /  waves, then a boss  /  one life`, 340, '14px monospace', '#8fa0c8');
  titleButton(g, ENDLESS_BTN, 'ENDLESS [ENTER]', '#ffd21f', Math.floor(t * 2) % 2 === 0 ? 'tap to choose ship and loadout' : undefined);
  titleButton(g, CAMPAIGN_BTN, 'CAMPAIGN', '#3a4560', 'coming soon');
  titleButton(g, CONQUEST_BTN, 'CONQUEST', '#3a4560', 'coming soon');
  titleButton(g, UNLOCKS_BTN, 'UNLOCKS [U]', '#6ee7ff');
  drawCentered(g, 'move: drag / arrows / WASD    dodge: Shift / X / button', 860, '12px monospace', '#8fa0c8');
  drawCentered(g, 'debug: [Z] one-boss test mode', 880, '12px monospace', '#5b6a8c');
}

export interface RunSummary {
  level: number;
  levels: number;
  time: number;
  upgrades: string[];
  /** Names of ships unlocked during this run. */
  unlocked: string[];
}

function drawUnlocked(g: CanvasRenderingContext2D, s: RunSummary, y: number): void {
  s.unlocked.forEach((n, i) => drawCentered(g, `NEW SHIP UNLOCKED: ${n}`, y + i * 24, 'bold 16px monospace', '#4ade80'));
}

export function drawRunOver(g: CanvasRenderingContext2D, t: number, s: RunSummary): void {
  dim(g, 0.6);
  drawCentered(g, 'RUN OVER', 380, 'bold 48px monospace', '#ff5a5a');
  drawCentered(g, 'your ship was destroyed', 420, '16px monospace', '#ffffff');
  drawCentered(g, `reached level ${s.level} of ${s.levels}   time ${s.time.toFixed(0)}s`, 470, '16px monospace', '#8fa0c8');
  drawUnlocked(g, s, 520);
  if (t > 1) prompt(g, 'tap or press any key', 600, t);
}

export function drawRunWon(g: CanvasRenderingContext2D, t: number, s: RunSummary): void {
  dim(g, 0.6);
  drawCentered(g, 'RUN COMPLETE', 380, 'bold 48px monospace', '#ffd21f');
  drawCentered(g, `all ${s.levels} levels cleared`, 420, '16px monospace', '#ffffff');
  drawCentered(g, `time ${s.time.toFixed(0)}s   upgrades ${s.upgrades.length ? s.upgrades.length : 'none'}`, 470, '14px monospace', '#8fa0c8');
  drawUnlocked(g, s, 520);
  if (t > 1) prompt(g, 'tap or press any key', 600, t);
}
