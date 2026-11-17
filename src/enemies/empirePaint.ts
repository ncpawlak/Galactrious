import type { BossSpec } from '../boss';
import type { FactionKit } from '../factions';

/**
 * Empire paint helpers (DESIGN.md "The enemy empire"). Every empire unit and the capital ship paint through these, so the
 * look is one family: symmetric angular polygons, forward-swept wings, the nested-chevron INSIGNIA and the accent stripe.
 * Units are drawn facing DOWN (the nose is at the bottom of the canvas, toward the player).
 */

export type Pt = [number, number];

/** Fill a polygon and its mirror image about the vertical centre line (`width` = canvas width). */
export function symPoly(ctx: CanvasRenderingContext2D, width: number, color: string, pts: Pt[]): void {
  ctx.fillStyle = color;
  for (const mirror of [false, true]) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const px = mirror ? width - x : x;
      if (i === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    });
    ctx.closePath();
    ctx.fill();
  }
}

export function poly(ctx: CanvasRenderingContext2D, color: string, pts: Pt[]): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

/**
 * The empire insignia: two nested chevrons pointing along the heading (`dir` +1 = down, the nose; -1 = up), centred on
 * (cx, cy), `s` px wide. Red with a dark red shadow.
 */
export function insignia(ctx: CanvasRenderingContext2D, kit: FactionKit, cx: number, cy: number, s: number, dir: 1 | -1 = 1): void {
  const h = s * 0.5;
  const t = Math.max(2, s * 0.2);
  for (const [k, color] of [[1, kit.accentDark], [0, kit.accent]] as const) {
    const o = k * 1; // the shadow is offset one pixel
    for (const lift of [0, t * 1.7]) {
      const y0 = cy - dir * (h * 0.5) - dir * lift + o;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - s / 2 + o, y0);
      ctx.lineTo(cx + o, y0 + dir * h);
      ctx.lineTo(cx + s / 2 + o, y0);
      ctx.lineTo(cx + s / 2 + o, y0 + dir * t);
      ctx.lineTo(cx + o, y0 + dir * (h + t));
      ctx.lineTo(cx - s / 2 + o, y0 + dir * t);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** A horizontal accent stripe across the whole canvas width (clip to the silhouette first). */
export function stripe(ctx: CanvasRenderingContext2D, kit: FactionKit, y: number, h: number, width: number): void {
  ctx.fillStyle = kit.accent;
  ctx.fillRect(0, y, width, h);
  ctx.fillStyle = kit.accentDark;
  ctx.fillRect(0, y + h, width, 1);
}

/** A glowing slit (canopy, engine light, console light). */
export function glowSlit(ctx: CanvasRenderingContext2D, kit: FactionKit, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = kit.canopy;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = kit.glow;
  ctx.fillRect(x, y + h - 1, w, 1);
}

/** The same layout flipped upside down (nose up): layers, core and anchors. Used for ships that fly away from the player. */
export function flipVertical(spec: BossSpec): BossSpec {
  const layers = spec.layers.map((l) => {
    const c = document.createElement('canvas');
    c.width = l.canvas.width;
    c.height = l.canvas.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.translate(0, c.height);
    ctx.scale(1, -1);
    ctx.drawImage(l.canvas, 0, 0);
    return { ...l, canvas: c };
  });
  const anchors = spec.anchors ? Object.fromEntries(Object.entries(spec.anchors).map(([k, a]) => [k, { x: a.x, y: spec.height - a.y }])) : undefined;
  return { ...spec, layers, core: { ...spec.core, y: spec.height - spec.core.y }, anchors };
}
