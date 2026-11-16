import { drawBullet, drawDamageZone, drawTelegraph, type HazardShape } from './attackStyles';

export interface Point {
  x: number;
  y: number;
}

/** Visual-only lobbed bomb (no collision): flies from `from` to `to` over the telegraph time. */
export interface Lob {
  from: Point;
  to: Point;
  height: number;
}

/**
 * A timed area hazard: warns (non-damaging) for `telegraph` s, then damages for `active` s, then
 * ends. `shapeAt` is called every frame so a hazard can follow its anchor (the boss) and animate;
 * never cache a boss position in it.
 */
export interface Hazard {
  telegraph: number;
  active: number;
  damage: number;
  /** `phase` is 'telegraph' or 'live'; `p` is progress 0..1 within that phase. */
  shapeAt(phase: 'telegraph' | 'live', p: number): HazardShape;
  lob?: Lob;
  age: number;
}

export function hazardPhase(h: Hazard): { phase: 'telegraph' | 'live'; p: number } | null {
  if (h.age < h.telegraph) return { phase: 'telegraph', p: h.age / h.telegraph };
  if (h.age < h.telegraph + h.active) return { phase: 'live', p: (h.age - h.telegraph) / h.active };
  return null;
}

/** Does a circle (x, y, r) overlap the shape? Lines are wedges widening from the vertex. */
export function shapeHits(s: HazardShape, x: number, y: number, r: number): boolean {
  if (s.kind === 'circle') return Math.hypot(x - s.x, y - s.y) <= s.r + r;
  if (s.kind === 'ring') return Math.abs(Math.hypot(x - s.x, y - s.y) - s.r) <= s.width / 2 + r;
  const dx = Math.cos(s.angle);
  const dy = Math.sin(s.angle);
  const rx = x - s.x;
  const ry = y - s.y;
  const along = rx * dx + ry * dy;
  const perp = Math.abs(-rx * dy + ry * dx);
  if (along < -r || along > s.length + r) return false;
  return perp <= (s.width / 2) * Math.max(0, along / s.length) + r;
}

export function drawHazard(ctx: CanvasRenderingContext2D, h: Hazard, clock: number): void {
  const ph = hazardPhase(h);
  if (!ph) return;
  const shape = h.shapeAt(ph.phase, ph.p);
  if (ph.phase === 'live') drawDamageZone(ctx, shape);
  else drawTelegraph(ctx, shape, clock, ph.p);
  if (h.lob && ph.phase === 'telegraph') {
    const { from, to, height } = h.lob;
    const t = ph.p;
    drawBullet(ctx, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * height, 'bomb');
  }
}
