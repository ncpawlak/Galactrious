import type { Deg, LightDef, Pt } from './types';

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;

/** Where a light is and what it is doing at one moment, in screen space. `power` 0..1 (1 = fully lit); only `power >= LIT` hurts. */
export interface LightPose {
  x: number;
  y: number;
  /** Beam direction in radians (cones). */
  angle: number;
  power: number;
  /** True while the lit region counts for detection. */
  lit: boolean;
  /** Pulse lights in their off phase: seconds until they come on (for the telegraph), else -1. */
  warnIn: number;
}

/** Power above which a pulsing beam is dangerous. */
export const LIT = 0.6;

const wrap = (a: number): number => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** Position along a polyline at arc length `s` (loop or ping-pong). */
function along(path: Pt[], s: number, mode: 'loop' | 'pingpong'): Pt {
  if (path.length === 1) return path[0];
  const pts = mode === 'loop' ? [...path, path[0]] : path;
  let total = 0;
  const segs: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segs.push(l);
    total += l;
  }
  if (total <= 0) return pts[0];
  let d = mode === 'loop' ? ((s % total) + total) % total : ((s % (2 * total)) + 2 * total) % (2 * total);
  if (mode === 'pingpong' && d > total) d = 2 * total - d;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const k = segs[i] > 0 ? Math.min(1, d / segs[i]) : 0;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
    }
    d -= segs[i];
  }
  return pts[pts.length - 1];
}

/**
 * Pose of a light at level time `t`, scroll distance `dist`. Pure: the same inputs give the same pose, so detection and drawing
 * can never disagree.
 */
export function lightPose(l: LightDef, t: number, dist: number, out: LightPose = { x: 0, y: 0, angle: 0, power: 1, lit: true, warnIn: -1 }): LightPose {
  const ax = l.x;
  const ay = (l.y ?? 0) + (dist - l.at);
  const p = l.pattern;
  let ox = 0;
  let oy = 0;
  let angle: Deg = 90;
  let power = 1;
  let warnIn = -1;
  switch (p.type) {
    case 'sweep':
      angle = p.center + p.amp * Math.sin((t / p.period + (p.phase ?? 0)) * TAU);
      break;
    case 'rotate':
      angle = (p.start ?? 0) + p.speed * t;
      break;
    case 'patrol': {
      const q = along(p.path, p.speed * (t + (p.phase ?? 0)), p.mode ?? 'pingpong');
      ox = q.x;
      oy = q.y;
      angle = (p.aim ?? 90) + (p.sweep ? p.sweep.amp * Math.sin((t / p.sweep.period) * TAU) : 0);
      break;
    }
    case 'pulse': {
      angle = p.aim;
      const cycle = p.on + p.off;
      const u = (((t + (p.offset ?? 0)) % cycle) + cycle) % cycle;
      const fade = p.fade ?? 0.35;
      if (u < p.on) {
        // Ramp up over `fade`, and dip out over the last 0.2 s so the beam does not blink off.
        power = Math.min(1, u / Math.max(0.001, fade), (p.on - u) / 0.2);
      } else {
        power = 0;
        warnIn = cycle - u;
      }
      break;
    }
    case 'roam': {
      const k = (t / p.period + (p.phase ?? 0)) * TAU;
      ox = Math.sin(k) * p.rx;
      oy = Math.sin(k * (p.ratio ?? 2)) * p.ry;
      break;
    }
  }
  out.x = ax + ox;
  out.y = ay + oy;
  out.angle = angle * RAD;
  out.power = Math.max(0, power);
  out.lit = out.power >= LIT;
  out.warnIn = warnIn;
  return out;
}

/** Does the circle (cx, cy, r) overlap the lit region of the light in this pose? */
export function lightHits(l: LightDef, pose: LightPose, cx: number, cy: number, r: number): boolean {
  if (!pose.lit) return false;
  const dx = cx - pose.x;
  const dy = cy - pose.y;
  const d = Math.hypot(dx, dy);
  if (l.shape === 'spot') return d <= l.size + r;
  if (d > l.size + r) return false;
  if (d <= r) return true;
  const half = ((l.spread ?? 30) * RAD) / 2;
  const diff = Math.abs(wrap(Math.atan2(dy, dx) - pose.angle));
  return diff <= half + Math.asin(Math.min(1, r / d));
}

/** Rough bounding radius of the lit area around the anchor (for culling). */
export function lightExtent(l: LightDef): number {
  const p = l.pattern;
  let e = l.size;
  if (p.type === 'roam') e += Math.max(p.rx, p.ry);
  if (p.type === 'patrol') for (const q of p.path) e = Math.max(e, l.size + Math.hypot(q.x, q.y));
  return e;
}

// --- drawing -----------------------------------------------------------------------------------------------

function rgb(color: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return [255, 244, 190];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = (c: [number, number, number], a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

export const LIGHT_COLOR = '#fff1b8';

/**
 * Draw one light: a soft cone or spot (radial falloff from the lamp), a brighter core, a faint edge so the boundary always
 * reads, a handful of drifting dust motes, and the lamp. Off-phase pulse lights draw only a dashed outline of where the beam
 * will be (the danger is always visible). `time` drives the dust.
 */
export function drawLight(g: CanvasRenderingContext2D, l: LightDef, pose: LightPose, time: number, seed: number): void {
  const c = rgb(l.color ?? LIGHT_COLOR);
  const P = pose.power;
  g.save();
  const cone = l.shape === 'cone';
  const half = ((l.spread ?? 30) * RAD) / 2;
  const R = l.size;
  const path = (h: number, rr: number): void => {
    g.beginPath();
    if (cone) {
      g.moveTo(pose.x, pose.y);
      g.arc(pose.x, pose.y, rr, pose.angle - h, pose.angle + h);
      g.closePath();
    } else g.arc(pose.x, pose.y, rr, 0, TAU);
  };
  if (P > 0.01) {
    g.globalCompositeOperation = 'lighter';
    const grad = g.createRadialGradient(pose.x, pose.y, 0, pose.x, pose.y, R);
    if (cone) {
      grad.addColorStop(0, rgba(c, 0.5 * P));
      grad.addColorStop(0.55, rgba(c, 0.2 * P));
      grad.addColorStop(1, rgba(c, 0.07 * P));
    } else {
      grad.addColorStop(0, rgba(c, 0.34 * P));
      grad.addColorStop(0.7, rgba(c, 0.2 * P));
      grad.addColorStop(1, rgba(c, 0.12 * P));
    }
    g.fillStyle = grad;
    path(half, R);
    g.fill();
    // Bright core.
    const core = g.createRadialGradient(pose.x, pose.y, 0, pose.x, pose.y, R * (cone ? 0.85 : 0.55));
    core.addColorStop(0, rgba(c, 0.38 * P));
    core.addColorStop(1, rgba(c, 0));
    g.fillStyle = core;
    if (cone) path(half * 0.38, R * 0.85);
    else path(0, R * 0.55);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    // Edge.
    g.strokeStyle = rgba(c, 0.38 * P);
    g.lineWidth = 1.5;
    path(half, R);
    g.stroke();
    // Dust motes.
    g.fillStyle = rgba(c, 0.55 * P);
    for (let i = 0; i < 9; i++) {
      const u = (i * 0.1371 + seed * 0.37 + time * (0.05 + (i % 3) * 0.02)) % 1;
      const r = u * R * 0.95;
      const a = cone ? pose.angle + half * 0.85 * Math.sin(i * 12.9898 + seed + time * 0.45) : (i * 2.399 + time * 0.2 + seed) % TAU;
      g.fillRect(Math.round(pose.x + Math.cos(a) * r), Math.round(pose.y + Math.sin(a) * r), 2, 2);
    }
    // The lamp.
    g.fillStyle = rgba(c, 0.95 * P);
    g.beginPath();
    g.arc(pose.x, pose.y, 4, 0, TAU);
    g.fill();
  } else {
    // Off: a dashed outline, brighter and blinking when about to come on.
    const soon = pose.warnIn >= 0 && pose.warnIn < 0.9;
    const blink = soon ? 0.35 + 0.35 * Math.sin(time * 22) : 0;
    g.strokeStyle = rgba(c, 0.16 + blink);
    g.lineWidth = soon ? 2 : 1;
    g.setLineDash([6, 8]);
    path(half, R);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = rgba(c, 0.35);
    g.beginPath();
    g.arc(pose.x, pose.y, 3, 0, TAU);
    g.fill();
  }
  g.restore();
}
