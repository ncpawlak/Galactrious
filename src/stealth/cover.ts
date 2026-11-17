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

type Rect = { x: number; y: number; w: number; h: number };

/** A deterministic 0..1 hash for the look of one structure (so it never flickers between frames). */
function h01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const SAFE = 'rgba(110,231,200,';

/** A small blinking beacon on a roof: a red lamp (so the building reads as lit, living architecture). */
function beacon(g: CanvasRenderingContext2D, x: number, y: number, time: number, seed: number): void {
  const k = 0.5 + 0.5 * Math.sin(time * 3 + seed * 5);
  g.fillStyle = `rgba(255,90,70,${(0.35 + 0.6 * k).toFixed(2)})`;
  g.beginPath();
  g.arc(x, y, 2.4, 0, Math.PI * 2);
  g.fill();
}

/** A flat-roofed building: concrete roof with a raised parapet, rooftop vents, a hatch and tar seams. */
function drawBuilding(g: CanvasRenderingContext2D, r: Rect, seed: number, time: number): void {
  g.fillStyle = '#12161f';
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = '#3b4658';
  g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  g.fillStyle = '#262e3c';
  g.fillRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
  g.fillStyle = '#2f3949';
  g.fillRect(r.x + 8, r.y + 8, r.w - 16, 3);
  g.strokeStyle = 'rgba(10,14,22,0.7)';
  g.lineWidth = 2;
  g.beginPath();
  for (let x = r.x + 46; x < r.x + r.w - 20; x += 46) {
    g.moveTo(Math.round(x), r.y + 10);
    g.lineTo(Math.round(x), r.y + r.h - 10);
  }
  g.stroke();
  const nv = 2 + Math.floor(h01(seed) * 3);
  for (let i = 0; i < nv; i++) {
    const vx = r.x + 16 + h01(seed + i * 3.1) * (r.w - 70);
    const vy = r.y + 16 + h01(seed + i * 5.7) * (r.h - 56);
    g.fillStyle = '#4b586c';
    g.fillRect(vx, vy, 26, 22);
    g.fillStyle = '#1b2230';
    g.fillRect(vx + 3, vy + 3, 20, 16);
    g.strokeStyle = '#59677d';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < 4; k++) {
      g.moveTo(vx + 4, vy + 6 + k * 4);
      g.lineTo(vx + 22, vy + 6 + k * 4);
    }
    g.stroke();
  }
  g.fillStyle = '#566379';
  g.fillRect(r.x + r.w - 44, r.y + r.h - 40, 28, 24);
  g.strokeStyle = '#8a9ab3';
  g.strokeRect(r.x + r.w - 43.5, r.y + r.h - 39.5, 28, 24);
  beacon(g, r.x + 14, r.y + 14, time, seed);
}

/** A stack of shipping containers seen from above: rows of ribbed, colour-coded boxes with a gap between. */
function drawContainers(g: CanvasRenderingContext2D, r: Rect, seed: number, time: number): void {
  g.fillStyle = '#0d1018';
  g.fillRect(r.x, r.y, r.w, r.h);
  const cols = ['#5a4638', '#35505a', '#57553a', '#434b60', '#5e3d3d'];
  const rows = Math.max(2, Math.round(r.h / 46));
  const rh = r.h / rows;
  for (let j = 0; j < rows; j++) {
    let x = r.x;
    let i = 0;
    while (x < r.x + r.w - 6) {
      const cw = Math.min(r.x + r.w - x, 64 + Math.floor(h01(seed + j * 9 + i) * 24));
      g.fillStyle = cols[Math.floor(h01(seed * 2 + j * 7 + i * 13) * cols.length)];
      g.fillRect(x + 1.5, r.y + j * rh + 1.5, cw - 3, rh - 3);
      g.strokeStyle = 'rgba(0,0,0,0.32)';
      g.lineWidth = 1;
      g.beginPath();
      for (let rx = x + 7; rx < x + cw - 5; rx += 6) {
        g.moveTo(Math.round(rx) + 0.5, r.y + j * rh + 4);
        g.lineTo(Math.round(rx) + 0.5, r.y + (j + 1) * rh - 4);
      }
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 1.5, r.y + j * rh + 1.5, cw - 3, 3);
      x += cw;
      i++;
    }
  }
  beacon(g, r.x + r.w - 10, r.y + 10, time, seed);
}

/** A concrete bunker: a sloped slab, a blast-door hatch with hazard chevrons and vent slits. */
function drawBunker(g: CanvasRenderingContext2D, r: Rect, seed: number, time: number): void {
  g.fillStyle = '#10141c';
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = '#4a5568';
  g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  g.fillStyle = '#394354';
  g.fillRect(r.x + 14, r.y + 14, r.w - 28, r.h - 28);
  g.strokeStyle = 'rgba(20,26,38,0.8)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(r.x + 2, r.y + 2);
  g.lineTo(r.x + 14, r.y + 14);
  g.moveTo(r.x + r.w - 2, r.y + 2);
  g.lineTo(r.x + r.w - 14, r.y + 14);
  g.moveTo(r.x + 2, r.y + r.h - 2);
  g.lineTo(r.x + 14, r.y + r.h - 14);
  g.moveTo(r.x + r.w - 2, r.y + r.h - 2);
  g.lineTo(r.x + r.w - 14, r.y + r.h - 14);
  g.stroke();
  const dw = Math.min(70, r.w * 0.4);
  const dx = r.x + r.w / 2 - dw / 2;
  const dy = r.y + r.h / 2 - 16;
  g.fillStyle = '#242c3a';
  g.fillRect(dx, dy, dw, 32);
  g.save();
  g.beginPath();
  g.rect(dx, dy, dw, 32);
  g.clip();
  g.strokeStyle = 'rgba(240,190,60,0.7)';
  g.lineWidth = 5;
  g.beginPath();
  for (let k = -32; k < dw + 32; k += 14) {
    g.moveTo(dx + k, dy + 32);
    g.lineTo(dx + k + 20, dy);
  }
  g.stroke();
  g.restore();
  g.strokeStyle = '#7b889e';
  g.lineWidth = 1;
  g.strokeRect(dx + 0.5, dy + 0.5, dw, 32);
  g.fillStyle = '#161c27';
  for (let k = 0; k < 3; k++) {
    g.fillRect(r.x + 24 + k * 8, r.y + 22, 4, 14);
    g.fillRect(r.x + r.w - 24 - k * 8 - 4, r.y + r.h - 36, 4, 14);
  }
  beacon(g, r.x + r.w - 22, r.y + 22, time, seed);
}

/** The big hangar: a long barrel roof with ribs and shaded halves, a yellow-black stripe along the bottom edge. */
function drawHangar(g: CanvasRenderingContext2D, r: Rect, time: number): void {
  g.fillStyle = '#0f131b';
  g.fillRect(r.x, r.y, r.w, r.h);
  const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  grad.addColorStop(0, '#2a3342');
  grad.addColorStop(0.5, '#5a667c');
  grad.addColorStop(1, '#2a3342');
  g.fillStyle = grad;
  g.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
  g.strokeStyle = 'rgba(8,12,20,0.6)';
  g.lineWidth = 2;
  g.beginPath();
  for (let x = r.x + 24; x < r.x + r.w - 10; x += 24) {
    g.moveTo(Math.round(x), r.y + 4);
    g.lineTo(Math.round(x), r.y + r.h - 4);
  }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.fillRect(r.x + 3, r.y + r.h / 2 - 1, r.w - 6, 2);
  g.save();
  g.beginPath();
  g.rect(r.x, r.y + r.h - 12, r.w, 12);
  g.clip();
  g.strokeStyle = 'rgba(240,190,60,0.75)';
  g.lineWidth = 6;
  g.beginPath();
  for (let k = -12; k < r.w + 12; k += 16) {
    g.moveTo(r.x + k, r.y + r.h);
    g.lineTo(r.x + k + 12, r.y + r.h - 12);
  }
  g.stroke();
  g.restore();
  beacon(g, r.x + 12, r.y + 12, time, 3);
  beacon(g, r.x + r.w - 12, r.y + 12, time, 4);
}

/** A domed silo/bunker (the ellipse cover): rings, radial panel seams and a hatch. */
function drawDome(g: CanvasRenderingContext2D, r: Rect, time: number, seed: number): void {
  g.save();
  g.translate(r.x + r.w / 2, r.y + r.h / 2);
  g.scale(1, r.h / r.w);
  const R = r.w / 2;
  const grad = g.createRadialGradient(-R * 0.25, -R * 0.25, R * 0.1, 0, 0, R);
  grad.addColorStop(0, '#586479');
  grad.addColorStop(0.7, '#364154');
  grad.addColorStop(1, '#1d2431');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(8,12,20,0.7)';
  g.lineWidth = 2;
  for (const f of [0.78, 0.5]) {
    g.beginPath();
    g.arc(0, 0, R * f, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3;
    g.moveTo(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5);
    g.lineTo(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98);
  }
  g.stroke();
  g.fillStyle = '#242c3a';
  g.beginPath();
  g.arc(0, 0, R * 0.2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(240,190,60,0.7)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, R * 0.2, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  beacon(g, r.x + r.w / 2, r.y + r.h * 0.2, time, seed);
}

/**
 * Draw a cover zone as a real structure: `roof` = a building, a container stack or a concrete bunker (picked from the zone's position, so
 * it is stable; the label `HANGAR` draws the big barrel-roofed hangar), `shadow` = a domed silo (its hit area is an ellipse). All are
 * opaque and dark so they hide any beam drawn under them, and each carries a solid teal-green safety edge (never dotted) so "you are
 * safe here" reads at once against the light cones and the red and amber of danger.
 */
export function drawCover(g: CanvasRenderingContext2D, c: CoverDef, dist: number, time: number): void {
  const r = coverRect(c, dist);
  if (r.y > 980 || r.y + r.h < -20) return;
  g.save();
  const seed = c.at * 0.011 + c.x * 0.37 + c.w * 0.05;
  if (c.kind === 'shadow') {
    drawDome(g, r, time, seed);
    g.strokeStyle = `${SAFE}0.6)`;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 - 1, r.h / 2 - 1, 0, 0, Math.PI * 2);
    g.stroke();
  } else {
    if (c.label === 'HANGAR') drawHangar(g, r, time);
    else {
      const v = Math.floor(h01(seed) * 3);
      if (v === 0) drawBuilding(g, r, seed, time);
      else if (v === 1) drawContainers(g, r, seed, time);
      else drawBunker(g, r, seed, time);
    }
    g.strokeStyle = `${SAFE}0.6)`;
    g.lineWidth = 2;
    g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  }
  if (c.label) {
    g.font = 'bold 12px ui-monospace, Consolas, monospace';
    const tw = g.measureText(c.label).width;
    g.fillStyle = 'rgba(14,20,30,0.78)';
    g.fillRect(r.x + r.w / 2 - tw / 2 - 5, r.y + r.h / 2 - 9, tw + 10, 18);
    g.fillStyle = `${SAFE}0.95)`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(c.label, r.x + r.w / 2, r.y + r.h / 2);
  }
  g.restore();
}
