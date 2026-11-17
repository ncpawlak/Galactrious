import { H, W } from '../config';
import type { Point } from '../hazards';
import { drawAllySprite } from '../scroll/allies';

/**
 * Squad assists (DESIGN.md "As built: finale systems and the empire ship"): scripted events the Delta wingmen perform on a timer
 * the player cannot control. Each is DATA (`AssistSpec`) with a warning: the HUD shows "ASSIST INCOMING" and a draining countdown
 * ring for `warn` seconds, then the wingmen come through. They are cosmetic wingmen with real, narrow effects:
 *  - `strafeRun`: a line of wingmen sweeps up a lane and strikes the live enemies, gun housings and exposed room consoles in it. The
 *    lane is chosen from where the targets ARE (the densest cluster, tracked while the warning counts down; `x` is only the fallback
 *    when nothing is on screen), and each wingman homes on a target of its own and hits it with a visible beam. It never touches a
 *    boss layer, so the capital ship's armour is unharmed.
 *  - `distract`: the enemies' aim is diverted to a decoy wingman for `seconds` (a bright tracer pulls their fire).
 *  - `coverFire`: a barrage from below clears enemy bullets inside a circle for `seconds`.
 * Fire an assist from a campaign beat (`{ at, do: 'assist', assist }`), a scroll-level `event` entry named `assist` (`data` = the spec)
 * or by hand (`game.debug.finale.assist(spec)`).
 */
export type AssistSpec = { warn?: number } & (
  /** `x` = lane centre, `width` the lane width (default 150), `wingmen` abreast (default 5), `seconds` the pass takes (default 3), `damage` per strike (default 150); the lane follows the targets and `x` is the fallback. */
  | { kind: 'strafeRun'; x: number; width?: number; wingmen?: number; seconds?: number; damage?: number }
  | { kind: 'distract'; seconds: number }
  /** A circle of screen px that the barrage keeps clear of enemy bullets. */
  | { kind: 'coverFire'; x: number; y: number; r: number; seconds?: number }
);

export type AssistKind = AssistSpec['kind'];

export const ASSIST_LABEL: Record<AssistKind, string> = { strafeRun: 'STRAFING RUN', distract: 'DECOY', coverFire: 'COVER FIRE' };

/** A live thing a strafing run can hit; `pos` is null once it is dead, gone or buried. */
export interface AssistTarget {
  kind: 'unit' | 'turret' | 'room';
  pos(): Point | null;
  /** The game's own object behind it (a unit or a component); the assist system never reads it. */
  ref?: unknown;
}

/** What the assists need from the game. */
export interface AssistHost {
  /** Everything a strafing run may strike right now: live enemy units, boss gun housings and exposed room consoles. */
  targets(): AssistTarget[];
  /** Hit a target hard (never a boss layer): sparks, hit flash, damage, and the usual explosion if it dies. */
  strike(t: AssistTarget, energy: number): void;
  /** Mark enemy bullets inside the circle dead; returns how many. */
  clearBullets(x: number, y: number, r: number): number;
  /** Centres of the enemies currently shooting (for the decoy's tracer lines). */
  enemyPoints(): Point[];
}

interface Pending {
  spec: AssistSpec;
  left: number;
  warn: number;
  /** Strafe: the lane centre the run will use, tracked from the live targets while the warning counts down. */
  laneX?: number;
}

interface Wingman {
  x: number;
  y: number;
  tgt: AssistTarget | null;
  cd: number;
}

interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
}

interface Active {
  spec: AssistSpec;
  t: number;
  /** Seconds the effect lasts. */
  dur: number;
  hitClock: number;
  /** Strafe: the locked lane centre and the wingmen with their targets. */
  laneX?: number;
  wing?: Wingman[];
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
  private beams: Beam[] = [];

  constructor(private readonly host: AssistHost) {}

  reset(): void {
    this.pending = [];
    this.active = [];
    this.sparks = [];
    this.beams = [];
    this.clock = 0;
    this.halted = false;
  }

  /** Queue an assist: it fires `spec.warn` seconds from now (default 4). */
  schedule(spec: AssistSpec): void {
    if (this.halted) return;
    const warn = spec.warn ?? DEFAULT_WARN;
    this.pending.push({ spec, left: warn, warn, laneX: spec.kind === 'strafeRun' ? spec.x : undefined });
  }

  /** True while a decoy is pulling the enemies' aim. */
  get distracting(): boolean {
    return this.active.some((a) => a.spec.kind === 'distract');
  }

  /** Where the enemies aim: the decoy while a `distract` is on, otherwise the player's ship (the same object, so nothing changes). */
  aimPoint(ship: Point): Point {
    return this.distracting ? this.decoy : ship;
  }

  private start(spec: AssistSpec, laneX?: number): void {
    this.fired.push({ kind: spec.kind, at: +this.clock.toFixed(2) });
    const dur = spec.kind === 'strafeRun' ? (spec.seconds ?? 3) : spec.kind === 'distract' ? spec.seconds : (spec.seconds ?? 1.8);
    const a: Active = { spec, t: 0, dur, hitClock: 0 };
    if (spec.kind === 'strafeRun') {
      const n = spec.wingmen ?? 5;
      const w = spec.width ?? 150;
      const lx = laneX ?? spec.x;
      a.laneX = lx;
      a.wing = Array.from({ length: n }, (_, i) => ({ x: lx + (n === 1 ? 0 : (i / (n - 1) - 0.5) * w), y: H + 60 + (i % 2) * 26, tgt: null, cd: i * 0.05 }));
    }
    this.active.push(a);
  }

  /** The lane centre with the most target weight in a `w`-wide window (turrets and rooms count more); null when nothing is on screen. */
  private bestLane(w: number, targets: AssistTarget[]): number | null {
    const pts: { x: number; wt: number }[] = [];
    for (const t of targets) {
      const p = t.pos();
      if (p && p.y > 10 && p.y < H - 40 && p.x > 0 && p.x < W) pts.push({ x: p.x, wt: t.kind === 'unit' ? 1.5 : t.kind === 'room' ? 3 : 2 });
    }
    let best: number | null = null;
    let bestScore = 0;
    for (const c of pts) {
      let sc = 0;
      for (const q of pts) if (Math.abs(q.x - c.x) <= w / 2) sc += q.wt;
      if (sc > bestScore) {
        bestScore = sc;
        best = c.x;
      }
    }
    if (best === null) return null;
    // Centre the window on the targets it holds.
    let sx = 0;
    let n = 0;
    for (const q of pts) {
      if (Math.abs(q.x - best) <= w / 2) {
        sx += q.x;
        n++;
      }
    }
    return Math.max(w / 2, Math.min(W - w / 2, sx / n));
  }

  /** One wingman of a strafing run: pick a target ahead, steer onto it and strike it. */
  private flyWingman(a: Active, m: Wingman, i: number, targets: AssistTarget[], claimed: Set<AssistTarget>, dt: number): void {
    const s = a.spec as Extract<AssistSpec, { kind: 'strafeRun' }>;
    const k = Math.min(1, a.t / a.dur);
    m.y = H + 60 + (i % 2) * 26 - k * (H + 220);
    const w = s.width ?? 150;
    if (m.tgt) {
      const p = m.tgt.pos();
      if (!p || p.y > m.y + 30) m.tgt = null; // dead, buried or already flown past
    }
    if (!m.tgt) {
      let bestD = Infinity;
      for (const t of targets) {
        if (claimed.has(t)) continue;
        const p = t.pos();
        if (!p || p.y > m.y || p.y < -10 || Math.abs(p.x - a.laneX!) > w / 2 + 40) continue;
        const d = Math.abs(p.x - m.x) + (m.y - p.y) * 0.5;
        if (d < bestD) {
          bestD = d;
          m.tgt = t;
        }
      }
    }
    if (m.tgt) claimed.add(m.tgt);
    const tp = m.tgt?.pos() ?? null;
    if (tp) m.x += Math.max(-460 * dt, Math.min(460 * dt, tp.x - m.x));
    m.cd -= dt;
    if (tp && m.cd <= 0 && tp.y < m.y - 8 && tp.y > m.y - 330 && Math.abs(tp.x - m.x) < 30) {
      m.cd = 0.15;
      this.host.strike(m.tgt!, s.damage ?? 150);
      this.stats.hits++;
      this.beams.push({ x1: m.x, y1: m.y - 18, x2: tp.x, y2: tp.y, life: 0.12 });
    }
  }

  update(dt: number): void {
    this.clock += dt;
    for (const p of this.pending) {
      p.left -= dt;
      if (p.spec.kind === 'strafeRun') {
        // The lane follows the live targets until the run goes in (a smooth slide, so the warning shows where the squad will fly).
        const lane = this.bestLane(p.spec.width ?? 150, this.host.targets());
        if (lane !== null) p.laneX = p.laneX === undefined ? lane : p.laneX + Math.max(-220 * dt, Math.min(220 * dt, lane - p.laneX));
      }
    }
    if (this.pending.some((p) => p.left <= 0)) {
      for (const p of this.pending) if (p.left <= 0) this.start(p.spec, p.laneX);
      this.pending = this.pending.filter((p) => p.left > 0);
    }
    for (const a of this.active) {
      a.t += dt;
      a.hitClock -= dt;
      const s = a.spec;
      if (s.kind === 'strafeRun') {
        const targets = this.host.targets();
        const claimed = new Set<AssistTarget>();
        a.wing!.forEach((m, k) => this.flyWingman(a, m, k, targets, claimed, dt));
      } else if (s.kind === 'distract') {
        const u = a.t / 1.6;
        this.decoy = { x: W / 2 + Math.sin(u * 2.1) * 200, y: 170 + Math.sin(u * 3.3) * 30 };
      } else if (s.kind === 'coverFire') {
        this.stats.cleared += this.host.clearBullets(s.x, s.y, s.r);
        if (this.sparks.length < 90) for (let k = 0; k < 2; k++) this.sparks.push({ x: s.x + (Math.random() * 2 - 1) * s.r * 0.9, y: H + 10, vy: -900 - Math.random() * 400, life: 1 });
      }
    }
    this.active = this.active.filter((a) => a.t < a.dur);
    for (const b of this.beams) b.life -= dt;
    if (this.beams.length > 0) this.beams = this.beams.filter((b) => b.life > 0);
    for (const sp of this.sparks) {
      sp.y += sp.vy * dt;
      sp.life -= dt;
    }
    if (this.sparks.length > 0) this.sparks = this.sparks.filter((sp) => sp.life > 0 && sp.y > -20);
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
        const lx = p.laneX ?? s.x;
        g.fillRect(lx - w / 2, 0, w, H);
        g.strokeRect(lx - w / 2, 0, w, H);
        // Brackets on what the squad will hit.
        g.setLineDash([]);
        for (const t of this.host.targets()) {
          const q = t.pos();
          if (!q || q.y < 0 || q.y > H || Math.abs(q.x - lx) > w / 2 + 20) continue;
          g.strokeRect(q.x - 16, q.y - 16, 32, 32);
        }
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
        const w = s.width ?? 150;
        const lx = a.laneX ?? s.x;
        g.fillStyle = 'rgba(126, 255, 192, 0.08)';
        g.fillRect(lx - w / 2, 0, w, H);
        for (const m of a.wing!) {
          // Tracers streaming ahead of each wingman, then the wingman.
          g.fillStyle = '#fff3b0';
          for (let k = 1; k <= 4; k++) g.fillRect(Math.round(m.x) - 1, Math.round(m.y - 20 - k * 30), 2, 12);
          drawAllySprite(g, m.x, m.y, 1.15);
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
    // Strike beams: a hot line from the wingman to what it hit, and a flash on the target.
    for (const b of this.beams) {
      const f = Math.max(0, b.life / 0.12);
      g.strokeStyle = `rgba(255, 243, 176, ${0.5 + 0.5 * f})`;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(b.x1, b.y1);
      g.lineTo(b.x2, b.y2);
      g.stroke();
      g.fillStyle = `rgba(255, 255, 255, ${0.6 * f})`;
      g.beginPath();
      g.arc(b.x2, b.y2, 9 + 8 * (1 - f), 0, Math.PI * 2);
      g.fill();
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
