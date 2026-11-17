import { H, W } from '../config';
import type { Medal } from './types';

export const MONO = 'ui-monospace, Consolas, monospace';
export const MEDAL_COLOR: Record<Medal, string> = { bronze: '#cd7f32', silver: '#c8d0e0', gold: '#ffd21f' };

export interface Btn {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const hit = (b: Btn, p: { x: number; y: number }): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

export function backdrop(g: CanvasRenderingContext2D, a = 0.82): void {
  g.save();
  g.fillStyle = `rgba(5, 6, 13, ${a})`;
  g.fillRect(0, 0, W, H);
  g.restore();
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left'): void {
  g.save();
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.font = font;
  g.fillStyle = color;
  g.fillText(s, x, y);
  g.restore();
}

export function button(g: CanvasRenderingContext2D, b: Btn, label: string, color: string, enabled = true, hot = false): void {
  g.save();
  g.globalAlpha = enabled ? 1 : 0.35;
  g.fillStyle = hot ? '#152a47' : '#0b1424';
  g.fillRect(b.x, b.y, b.w, b.h);
  g.lineWidth = 3;
  g.strokeStyle = color;
  g.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
  g.fillStyle = color;
  g.font = `bold 18px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  g.restore();
}

/** Greedy word wrap using the font currently set on `g`. */
export function wrap(g: CanvasRenderingContext2D, s: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** A medal disc; `medal` undefined draws an empty ring. */
export function medalIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number, medal?: Medal): void {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  if (medal) {
    g.fillStyle = MEDAL_COLOR[medal];
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = '#05060d';
    g.beginPath();
    g.arc(x, y, r * 0.6, 0, Math.PI * 2);
    g.stroke();
  } else {
    g.lineWidth = 2;
    g.strokeStyle = '#3a4560';
    g.stroke();
  }
  g.restore();
}
