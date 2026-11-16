/** Shared helpers for painting boss layers from code (used by the demo boss and Bulwark). */

export type Rect = [x: number, y: number, w: number, h: number];

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx };
}

export function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export interface ShadeOpts {
  noise: number;
  /** Brightness multiplier for pixels on the silhouette edge. */
  edge: number;
  seamEvery?: number;
}

/** Adds per-pixel noise, edge highlights/lowlights and optional panel seams to a painted canvas. */
export function shade(ctx: CanvasRenderingContext2D, opts: ShadeOpts): void {
  const BW = ctx.canvas.width;
  const BH = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, BW, BH);
  const d = img.data;
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < BW && y < BH && d[(y * BW + x) * 4 + 3] > 0;
  const out = new Uint8ClampedArray(d);

  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const i = (y * BW + x) * 4;
      if (d[i + 3] === 0) continue;
      let f = 1 - opts.noise / 2 + hash(x, y) * opts.noise;
      const onEdge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
      if (onEdge) f *= opts.edge;
      if (opts.seamEvery && (x % opts.seamEvery === 0 || y % opts.seamEvery === 0)) f *= 0.78;
      out[i] = d[i] * f;
      out[i + 1] = d[i + 1] * f;
      out[i + 2] = d[i + 2] * f;
    }
  }
  ctx.putImageData(new ImageData(out, BW, BH), 0, 0);
}

export function fillRects(ctx: CanvasRenderingContext2D, rects: Rect[], color: string): void {
  ctx.fillStyle = color;
  for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
}

/** Snap alpha to 0/255 so anti-aliased shape edges become crisp, fully solid or empty pixels. */
export function crisp(ctx: CanvasRenderingContext2D): void {
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
}
