/**
 * The reactor look of a boss/unit core ("nuclear heart"): a white-hot centre in a coloured glow halo,
 * rotating energy arcs (big cores only) and a heartbeat pulse. Visual only: nothing here touches hitboxes or damage.
 *
 * Cost: the halo+centre is one gradient sprite per (colour, radius) drawn with one scaled drawImage; the arcs are a few
 * path strokes, skipped for `simple` cores (small units).
 */

export type RGB = [number, number, number];

export const DEFAULT_CORE_COLOR: RGB = [90, 225, 255];
/** Seconds the overload flash + shrink lasts after the core dies. */
export const CORE_DEATH_TIME = 0.3;

export interface CoreLook {
  /** Heartbeat phase in cycles (advanced by the boss, faster when hurt / exposed). */
  phase: number;
  /** Seconds the boss has been alive-visible; drives ring rotation. */
  time: number;
  color: RGB;
  simple: boolean;
  /** 0..1 share of core hp lost. */
  damage: number;
  /** 0..1 core damage multiplier (low = shielded). */
  vuln: number;
  /** 0..1 hit flicker. */
  flash: number;
  /** Seconds since death, or -1 while alive. */
  dead: number;
}

const sprites = new Map<string, HTMLCanvasElement>();

function glowSprite(color: RGB, radius: number): HTMLCanvasElement {
  const key = `${color[0]},${color[1]},${color[2]}|${radius}`;
  let c = sprites.get(key);
  if (c) return c;
  const half = Math.ceil(radius * 3);
  c = document.createElement('canvas');
  c.width = c.height = half * 2;
  const g = c.getContext('2d')!;
  const [r, gr, b] = color;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.17, 'rgba(255,255,255,1)');
  grad.addColorStop(0.27, `rgba(${(r + 255) >> 1},${(gr + 255) >> 1},${(b + 255) >> 1},0.95)`);
  grad.addColorStop(0.4, `rgba(${r},${gr},${b},0.55)`);
  grad.addColorStop(0.7, `rgba(${r},${gr},${b},0.16)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, half * 2, half * 2);
  sprites.set(key, c);
  return c;
}

/** Draw the reactor centred at (cx, cy). `radius` is the core's (hit) radius. */
export function drawReactor(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, k: CoreLook): void {
  const dying = k.dead >= 0;
  const sprite = glowSprite(k.color, radius);
  const half = sprite.width / 2;
  const beat = 0.5 + 0.5 * Math.sin(k.phase * Math.PI * 2);
  // Shielded cores burn dim; exposed and hurt ones burn bright.
  let bright = 0.42 + 0.4 * k.vuln + 0.25 * k.damage;
  let scale = 0.85 + 0.2 * beat * (0.6 + 0.4 * k.vuln) + 0.12 * k.damage;

  let overload = 0;
  if (dying) {
    const p = Math.min(1, k.dead / CORE_DEATH_TIME);
    const swell = 0.35;
    if (p < swell) {
      const q = p / swell;
      scale = 1 + 1.1 * q;
      overload = 1;
    } else {
      const q = (p - swell) / (1 - swell);
      scale = 2.1 * (1 - q) * (1 - q);
      overload = 1 - q;
    }
    bright = 1;
  } else if (k.flash > 0) {
    // Hit flicker: alternate flare / dip every frame-ish.
    const odd = Math.floor(k.time * 60) & 1;
    scale *= odd ? 1.28 : 1.1;
    bright = odd ? 1 : 0.8;
  }
  if (scale <= 0.02) return;

  ctx.save();
  const s = scale;
  if (!dying) {
    // Dark backing disc so the glow reads on any room colour (pink-on-red otherwise).
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#04061a';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.45 * Math.min(1.1, s), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = Math.min(1, bright);
  ctx.drawImage(sprite, cx - half * s, cy - half * s, half * 2 * s, half * 2 * s);

  if (!k.simple && !dying) {
    // Energy arcs: two counter-rotating rings of short arcs, speed up with damage.
    const spin = k.time * (1.4 + 2.2 * k.damage);
    ctx.lineCap = 'round';
    const [r, g, b] = k.color;
    ctx.strokeStyle = `rgb(${(r + 255) >> 1},${(g + 255) >> 1},${(b + 255) >> 1})`;
    ctx.globalAlpha = Math.min(1, 0.45 + 0.45 * bright);
    ctx.lineWidth = Math.max(1.5, radius * 0.14);
    ctx.beginPath();
    const r1 = radius * (1.05 + 0.08 * beat);
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * Math.PI * 2) / 3;
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.arc(cx, cy, r1, a, a + 1.0);
    }
    ctx.stroke();
    ctx.lineWidth = Math.max(1, radius * 0.09);
    ctx.beginPath();
    const r2 = radius * 1.6;
    for (let i = 0; i < 2; i++) {
      const a = -spin * 0.7 + i * Math.PI;
      ctx.moveTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.arc(cx, cy, r2, a, a + 1.5);
    }
    ctx.stroke();
  }
  ctx.restore();

  if (overload > 0) {
    ctx.save();
    ctx.globalAlpha = overload;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.9 * Math.max(0.3, scale * 0.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (!dying && k.vuln < 0.75) {
    // Shield ring: a visible dashed blue-white barrier, stronger the more armored the core is.
    const a = (0.75 - k.vuln) / 0.75;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.5 * a;
    ctx.strokeStyle = '#bfe6ff';
    ctx.lineWidth = Math.max(1.5, radius * 0.12);
    ctx.setLineDash([radius * 0.5, radius * 0.3]);
    ctx.lineDashOffset = -k.time * radius * 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
