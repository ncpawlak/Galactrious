import type { CoverDef } from './types';

/** Screen rectangle of a cover zone at scroll distance `dist`. */
export function coverRect(c: CoverDef, dist: number): { x: number; y: number; w: number; h: number } {
  return { x: c.x, y: (c.y ?? 0) + (dist - c.at), w: c.w, h: c.h };
}

/** Is the point inside the zone (an ellipse for `shadow`, the rectangle for `roof`)? */
export function inCover(c: CoverDef, dist: number, px: number, py: number): boolean {
  const r = coverRect(c, dist);
  if (c.kind === 'shadow') {
    const nx = (px - (r.x + r.w / 2)) / (r.w / 2);
    const ny = (py - (r.y + r.h / 2)) / (r.h / 2);
    return nx * nx + ny * ny <= 1;
  }
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/**
 * Draw a cover zone. Roofs are dark with panel seams and a hatched edge, shadows a soft dark ellipse; both are dark enough to dim
 * any light drawn under them, with a thin teal outline so "safe" reads at once.
 */
export function drawCover(g: CanvasRenderingContext2D, c: CoverDef, dist: number, time: number): void {
  const r = coverRect(c, dist);
  if (r.y > 980 || r.y + r.h < -20) return;
  g.save();
  const label = c.label ?? 'COVER';
  if (c.kind === 'shadow') {
    g.translate(r.x + r.w / 2, r.y + r.h / 2);
    g.scale(1, r.h / r.w);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r.w / 2);
    grad.addColorStop(0, 'rgba(1,3,8,0.9)');
    grad.addColorStop(0.7, 'rgba(1,3,8,0.78)');
    grad.addColorStop(1, 'rgba(1,3,8,0.5)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, r.w / 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(110,231,200,0.45)';
    g.lineWidth = 2;
    g.setLineDash([5, 7]);
    g.lineDashOffset = -time * 8;
    g.stroke();
    g.setLineDash([]);
    g.restore();
    g.save();
  } else {
    g.fillStyle = 'rgba(2,4,10,0.86)';
    g.fillRect(r.x, r.y, r.w, r.h);
    // Panel seams.
    g.strokeStyle = 'rgba(70,86,120,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = r.x + 40; x < r.x + r.w - 10; x += 40) {
      g.moveTo(Math.round(x) + 0.5, r.y + 4);
      g.lineTo(Math.round(x) + 0.5, r.y + r.h - 4);
    }
    for (let y = r.y + 40; y < r.y + r.h - 10; y += 40) {
      g.moveTo(r.x + 4, Math.round(y) + 0.5);
      g.lineTo(r.x + r.w - 4, Math.round(y) + 0.5);
    }
    g.stroke();
    // Hatched edge ticks.
    g.save();
    g.beginPath();
    g.rect(r.x, r.y, r.w, r.h);
    g.clip();
    g.strokeStyle = 'rgba(110,231,200,0.18)';
    g.lineWidth = 2;
    g.beginPath();
    for (let k = -12; k < r.w + 12; k += 14) {
      g.moveTo(r.x + k, r.y + r.h);
      g.lineTo(r.x + k + 10, r.y + r.h - 10);
      g.moveTo(r.x + k, r.y);
      g.lineTo(r.x + k + 10, r.y + 10);
    }
    g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(110,231,200,0.5)';
    g.lineWidth = 2;
    g.setLineDash([8, 6]);
    g.lineDashOffset = -time * 10;
    g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    g.setLineDash([]);
  }
  if (label) {
    g.fillStyle = 'rgba(110,231,200,0.55)';
    g.font = 'bold 12px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  }
  g.restore();
}
