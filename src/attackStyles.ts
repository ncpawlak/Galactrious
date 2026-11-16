import { TUNING } from './config';

/**
 * Enemy projectile and hazard looks. The player's bullets are pale yellow, the ship cyan, the boss
 * red/brown; enemy styles use hot magenta / violet / green-lime with a white rim so they stand
 * apart from all of those. Shape carries meaning too, not just color.
 */
export type BulletShape = 'circle' | 'diamond' | 'ring';

export interface BulletStyle {
  fill: string;
  /** Soft halo behind the bullet. */
  glow: string;
  outline: string;
  shape: BulletShape;
  /** Multiplier on TUNING.attacks.bulletRadius (visual only; collision stays the same). */
  scale: number;
}

export const BULLET_STYLES = {
  /** Straight-down projectile: violet diamond. */
  direct: { fill: '#b86bff', glow: 'rgba(160, 80, 255, 0.4)', outline: '#ffffff', shape: 'diamond', scale: 1.25 },
  /** Aimed shot: hot-magenta circle. */
  aimed: { fill: '#ff2d9a', glow: 'rgba(255, 40, 150, 0.4)', outline: '#ffffff', shape: 'circle', scale: 1 },
  /** Bomb: lime core with a dark centre ring, larger. */
  bomb: { fill: '#9dff2e', glow: 'rgba(150, 255, 40, 0.4)', outline: '#ffffff', shape: 'ring', scale: 1.5 },
} satisfies Record<string, BulletStyle>;

export type StyleName = keyof typeof BULLET_STYLES;
export const DEFAULT_STYLE: StyleName = 'aimed';

export function drawBullet(ctx: CanvasRenderingContext2D, x: number, y: number, name: StyleName | undefined): void {
  const s: BulletStyle = BULLET_STYLES[name ?? DEFAULT_STYLE] ?? BULLET_STYLES[DEFAULT_STYLE];
  const r = TUNING.attacks.bulletRadius * s.scale;
  ctx.fillStyle = s.glow;
  ctx.beginPath();
  ctx.arc(x, y, r + 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = s.fill;
  ctx.strokeStyle = s.outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (s.shape === 'diamond') {
    ctx.moveTo(x, y - r * 1.3);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r * 1.3);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  if (s.shape === 'ring') {
    ctx.fillStyle = '#1a0030';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- hazards (issue #25 uses these) -----------------------------------------------------------

/** A circle, or a wedge/line from (x, y) along `angle` (radians) for `length`, `width` wide at the far end. */
export type HazardShape =
  | { kind: 'circle'; x: number; y: number; r: number }
  /** A hollow ring: centre line at radius `r`, `width` thick (a shock wave). */
  | { kind: 'ring'; x: number; y: number; r: number; width: number }
  | { kind: 'line'; x: number; y: number; angle: number; length: number; width: number };

function shapePath(ctx: CanvasRenderingContext2D, s: HazardShape): void {
  ctx.beginPath();
  if (s.kind === 'circle') {
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    return;
  }
  if (s.kind === 'ring') {
    const o = s.r + s.width / 2;
    const i = Math.max(0, s.r - s.width / 2);
    ctx.arc(s.x, s.y, o, 0, Math.PI * 2);
    ctx.moveTo(s.x + i, s.y);
    ctx.arc(s.x, s.y, i, 0, Math.PI * 2, true);
    return;
  }
  const dx = Math.cos(s.angle);
  const dy = Math.sin(s.angle);
  const nx = -dy * (s.width / 2);
  const ny = dx * (s.width / 2);
  const ex = s.x + dx * s.length;
  const ey = s.y + dy * s.length;
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(ex + nx, ey + ny);
  ctx.lineTo(ex - nx, ey - ny);
  ctx.closePath();
}

/**
 * Warning only, never damaging: a thin pulsing dashed outline and a faint fill. `t` is a running
 * clock in seconds (drives the pulse); `progress` 0..1 optionally brightens as detonation nears.
 */
export function drawTelegraph(ctx: CanvasRenderingContext2D, s: HazardShape, t: number, progress = 0): void {
  const h = TUNING.hazards;
  const pulse = 0.5 + 0.5 * Math.sin(t * h.pulseRate * Math.PI * 2);
  ctx.save();
  shapePath(ctx, s);
  ctx.fillStyle = h.telegraphColor;
  ctx.globalAlpha = 0.08 + 0.1 * progress;
  ctx.fill();
  ctx.globalAlpha = 0.45 + 0.4 * pulse;
  ctx.strokeStyle = h.telegraphColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -t * 40;
  ctx.stroke();
  ctx.restore();
}

/** Live damage zone: solid opaque core, bright rim, no dashes; unmistakably different from a telegraph. */
export function drawDamageZone(ctx: CanvasRenderingContext2D, s: HazardShape): void {
  const h = TUNING.hazards;
  ctx.save();
  shapePath(ctx, s);
  ctx.fillStyle = h.zoneFill;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = h.zoneRim;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

/** Darken everything drawn so far (call right after the boss, before bullets/hazards). */
export function dimBoss(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
  if (amount <= 0) return;
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 8, ${amount})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
