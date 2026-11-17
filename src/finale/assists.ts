import { H, W } from '../config';
import type { Point } from '../hazards';
import { drawAllySprite } from '../scroll/allies';

/**
 * Squad assists (DESIGN.md "As built: finale systems and the empire ship"): scripted events the Delta wingmen perform on a timer
 * the player cannot control. Each is DATA (`AssistSpec`) with a warning: the HUD shows "ASSIST INCOMING" and a draining countdown
 * ring for `warn` seconds, then the wingmen come through. They are cosmetic wingmen with real, narrow effects:
 *  - `strafeRun`: a line of wingmen sweeps up a lane and damages UNITS and TURRET components in it. It never touches a boss layer, so
 *    the capital ship's armour (and everything else it is made of) is unharmed; only its gun housings in the lane are hit.
 *  - `distract`: the enemies' aim is diverted to a decoy wingman for `seconds` (a bright tracer pulls their fire).
 *  - `coverFire`: a barrage from below clears enemy bullets inside a circle for `seconds`.
 * Fire an assist from a campaign beat (`{ at, do: 'assist', assist }`), a scroll-level `event` entry named `assist` (`data` = the spec)
 * or by hand (`game.debug.finale.assist(spec)`).
 */
export type AssistSpec = { warn?: number } & (
  /** `x` = lane centre, `width` the lane width (default 150), `wingmen` abreast (default 5), `seconds` the pass takes (default 2.4), `damage` per hit (default 60). */
  | { kind: 'strafeRun'; x: number; width?: number; wingmen?: number; seconds?: number; damage?: number }
  | { kind: 'distract'; seconds: number }
  /** A circle of screen px that the barrage keeps clear of enemy bullets. */
  | { kind: 'coverFire'; x: number; y: number; r: number; seconds?: number }
);

export type AssistKind = AssistSpec['kind'];

export const ASSIST_LABEL: Record<AssistKind, string> = { strafeRun: 'STRAFING RUN', distract: 'DECOY', coverFire: 'COVER FIRE' };

/** What the assists need from the game. */
export interface AssistHost {
  /** Damage units and boss gun housings (never a boss layer) around (x, y). */
  hitAt(x: number, y: number, r: number, energy: number): void;
  /** Mark enemy bullets inside the circle dead; returns how many. */
  clearBullets(x: number, y: number, r: number): number;
  /** Centres of the enemies currently shooting (for the decoy's tracer lines). */
  enemyPoints(): Point[];
}

interface Pending {
  spec: AssistSpec;
  left: number;
  warn: number;
}

interface Active {
  spec: AssistSpec;
  t: number;
  /** Seconds the effect lasts. */
  dur: number;
  hitClock: number;
  /** Strafe: the line's y at the last hit pass (hits are swept from there to the current y so a small target cannot be skipped). */
  lastY?: number;
}

const DEFAULT_WARN = 4;

/** The assist runner. `update` every combat frame; `aimPoint` replaces the player's position as the enemies' aim; `draw` after the entities. */
export class AssistSystem {
  pending: Pending[] = [];
  active: Active[] = [];
  /** Log of assists that fired (for the debug panel and verification): kind and the time the system clock was at. */
  readonly fired: { kind: AssistKind; at: number }[] = [];
  /** Enemy bullets cleared and unit/turret hits dealt so far (verification). */
  stats = { cleared: 0, hits: 0 };
  private clock = 0;
  /** The squad stands down (the core is going): nothing new is scheduled until `reset`. */
  halted = false;
  private decoy: Point = { x: W / 2, y: 190 };
  private sparks: { x: number; y: number; vy: number; life: number }[] = [];

  constructor(private readonly host: AssistHost) {}

  reset(): void {
    this.pending = [];
    this.active = [];
    this.sparks = [];
    this.clock = 0;
    this.halted = false;
  }

  /** Queue an assist: it fires `spec.warn` seconds from now (default 4). */
  schedule(spec: AssistSpec): void {
    if (this.halted) return;
    const warn = spec.warn ?? DEFAULT_WARN;
    this.pending.push({ spec, left: warn, warn });
  }

  /** True while a decoy is pulling the enemies' aim. */
  get distracting(): boolean {
    return this.active.some((a) => a.spec.kind === 'distract');
  }

  /** Where the enemies aim: the decoy while a `distract` is on, otherwise the player's ship (the same object, so nothing changes). */
  aimPoint(ship: Point): Point {
    return this.distracting ? this.decoy : ship;
  }

  private start(spec: AssistSpec): void {
    this.fired.push({ kind: spec.kind, at: +this.clock.toFixed(2) });
    const dur = spec.kind === 'strafeRun' ? (spec.seconds ?? 2.4) : spec.kind === 'distract' ? spec.seconds : (spec.seconds ?? 1.8);
    this.active.push({ spec, t: 0, dur, hitClock: 0 });
  }

  update(dt: number): void {
    this.clock += dt;
    for (const p of this.pending) p.left -= dt;
    if (this.pending.some((p) => p.left <= 0)) {
      for (const p of this.pending) if (p.left <= 0) this.start(p.spec);
      this.pending = this.pending.filter((p) => p.left > 0);
    }
    for (const a of this.active) {
      a.t += dt;
      a.hitClock -= dt;
      const s = a.spec;
      if (s.kind === 'strafeRun' && a.hitClock <= 0) {
        a.hitClock = 0.16;
        const n = s.wingmen ?? 5;
        const w = s.width ?? 150;
        const y = this.strafeY(a);
        const from = a.lastY ?? y;
        a.lastY = y;
        // Sweep from the last pass to here in 18 px steps (the line climbs fast; a gun housing is only 32 px across).
        const steps = Math.max(1, Math.ceil((from - y) / 18));
        for (let k = 1; k <= steps; k++) {
          const yy = from + ((y - from) * k) / steps;
          for (let i = 0; i < n; i++) {
            const x = s.x + (n === 1 ? 0 : (i / (n - 1) - 0.5) * w);
            this.host.hitAt(x, yy - 40, 18, (s.damage ?? 60) / 2);
            this.stats.hits++;
          }
        }
      } else if (s.kind === 'distract') {
        const u = a.t / 1.6;
        this.decoy = { x: W / 2 + Math.sin(u * 2.1) * 200, y: 170 + Math.sin(u * 3.3) * 30 };
      } else if (s.kind === 'coverFire') {
        this.stats.cleared += this.host.clearBullets(s.x, s.y, s.r);
        if (this.sparks.length < 90) for (let k = 0; k < 2; k++) this.sparks.push({ x: s.x + (Math.random() * 2 - 1) * s.r * 0.9, y: H + 10, vy: -900 - Math.random() * 400, life: 1 });
      }
    }
    this.active = this.active.filter((a) => a.t < a.dur);
    for (const sp of this.sparks) {
      sp.y += sp.vy * dt;
      sp.life -= dt;
    }
    if (this.sparks.length > 0) this.sparks = this.sparks.filter((sp) => sp.life > 0 && sp.y > -20);
  }

  /** The strafe line's y: it climbs from below the screen to above it over the pass. */
  private strafeY(a: Active): number {
    const k = Math.min(1, a.t / a.dur);
    return H + 60 - k * (H + 160);
  }

  /** Wingmen, lanes, decoy and tracer lines: drawn with the world (under the HUD). */
  drawWorld(g: CanvasRenderingContext2D): void {
    if (this.pending.length === 0 && this.active.length === 0) return;
    g.save();
    // Warned lanes and circles: visible before they happen.
    for (const p of this.pending) {
      const s = p.spec;
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 8);
      g.strokeStyle = `rgba(126, 255, 192, ${0.35 + 0.25 * pulse})`;
      g.fillStyle = 'rgba(126, 255, 192, 0.06)';
      g.lineWidth = 2;
      g.setLineDash([10, 8]);
      if (s.kind === 'strafeRun') {
        const w = s.width ?? 150;
        g.fillRect(s.x - w / 2, 0, w, H);
        g.strokeRect(s.x - w / 2, 0, w, H);
      } else if (s.kind === 'coverFire') {
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      g.setLineDash([]);
    }
    for (const a of this.active) {
      const s = a.spec;
      if (s.kind === 'strafeRun') {
        const n = s.wingmen ?? 5;
        const w = s.width ?? 150;
        const y = this.strafeY(a);
        g.fillStyle = 'rgba(126, 255, 192, 0.1)';
        g.fillRect(s.x - w / 2, Math.max(0, y - 240), w, Math.min(H, 240 + y));
        for (let i = 0; i < n; i++) {
          const x = s.x + (n === 1 ? 0 : (i / (n - 1) - 0.5) * w);
          // Tracers streaming ahead of each wingman.
          g.fillStyle = '#fff3b0';
          for (let k = 1; k <= 5; k++) g.fillRect(Math.round(x) - 1, Math.round(y - 20 - k * 34), 2, 14);
          drawAllySprite(g, x, y, 1.15);
        }
      } else if (s.kind === 'coverFire') {
        g.strokeStyle = 'rgba(126, 255, 192, 0.55)';
        g.lineWidth = 3;
        g.setLineDash([12, 8]);
        g.lineDashOffset = -this.clock * 40;
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      } else if (s.kind === 'distract') {
        const d = this.decoy;
        const pts = this.host.enemyPoints().slice(0, 8);
        g.strokeStyle = 'rgba(255, 243, 176, 0.65)';
        g.lineWidth = 2;
        g.setLineDash([6, 6]);
        g.lineDashOffset = -this.clock * 90;
        for (const p of pts) {
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(d.x, d.y);
          g.stroke();
        }
        g.setLineDash([]);
        const r = 22 + 4 * Math.sin(this.clock * 10);
        g.strokeStyle = '#7effc0';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(d.x, d.y, r, 0, Math.PI * 2);
        g.stroke();
        drawAllySprite(g, d.x, d.y, 1.25);
        g.fillStyle = '#7effc0';
        g.font = 'bold 10px ui-monospace, Consolas, monospace';
        g.textAlign = 'center';
        g.fillText('DECOY', d.x, d.y + 40);
      }
    }
    g.fillStyle = '#fff3b0';
    for (const sp of this.sparks) g.fillRect(Math.round(sp.x) - 1, Math.round(sp.y) - 8, 2, 16);
    g.restore();
  }

  /** The "ASSIST INCOMING" cue: a countdown ring per pending assist, stacked down the right edge. */
  drawHud(g: CanvasRenderingContext2D): void {
    if (this.pending.length === 0) return;
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const mono = 'ui-monospace, Consolas, monospace';
    this.pending.slice(0, 3).forEach((p, i) => {
      const cx = W - 52;
      const cy = 196 + i * 92;
      const frac = Math.max(0, p.left / p.warn);
      const late = p.left < 1.2 && Math.floor(this.clock * 6) % 2 === 0;
      g.fillStyle = 'rgba(5, 6, 13, 0.78)';
      g.beginPath();
      g.arc(cx, cy, 28, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(126, 255, 192, 0.25)';
      g.beginPath();
      g.arc(cx, cy, 24, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = late ? '#ffd21f' : '#7effc0';
      g.beginPath();
      g.arc(cx, cy, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      g.stroke();
      g.fillStyle = '#ffffff';
      g.font = `bold 18px ${mono}`;
      g.fillText(String(Math.ceil(p.left)), cx, cy + 1);
      g.fillStyle = late ? '#ffd21f' : '#7effc0';
      g.font = `bold 9px ${mono}`;
      g.fillText('ASSIST INCOMING', cx - 6, cy + 38);
      g.fillStyle = '#c8f5e0';
      g.fillText(ASSIST_LABEL[p.spec.kind], cx - 6, cy + 49);
    });
    g.restore();
  }
}
