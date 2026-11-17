import { H, W } from '../config';
import type { UnitPlacement } from '../units';
import { ChaseController, type ChaseContext } from './chase';
import { drawCover, inCover } from './cover';
import { drawLight, lightExtent, lightHits, lightPose, type LightPose } from './lights';
import { DEFAULT_DETECTION, type DetectionConfig, type DetectState, type LightDef, type Pt, type StealthDef } from './types';

/** What the stealth system needs from the game (part of `ScrollHost`). */
export interface StealthHost {
  /** The player ship position (live object). */
  readonly ship: { x: number; y: number };
  /** Collision circle radius of the player ship, px. */
  hitbox(): number;
  /** Spawn a chaser unit now (through the unit pipeline); the handle says whether it is still in play. */
  spawnChaser(unit: string, placement: UnitPlacement): { alive(): boolean };
}

const STATE_COLOR: Record<DetectState, string> = { undetected: '#4ade80', alert: '#ffd21f', chased: '#ff4a4a' };
const MONO = 'ui-monospace, Consolas, monospace';
const TAU = Math.PI * 2;

interface Chaser {
  ctl: ChaseController;
  handle: { alive(): boolean };
}

interface Sweep {
  seconds: number;
  dir: 1 | -1;
  t: number;
  y: number;
}

const SWEEP_LAMP: LightDef = { at: 0, x: 0, shape: 'cone', size: 170, spread: 26, pattern: { type: 'sweep', center: 90, amp: 0, period: 1 }, color: '#ff9a7a' };

/**
 * The stealth runtime of one scroll level (DESIGN.md "As built: stealth systems"): owns the searchlights and cover zones, the
 * detection state machine, the chasers and the patrol sweep. Created by `ScrollRunnerImpl` when the level has a `stealth` block,
 * updated after the scroll advances, drawn between the background and the units (`drawGround`) and over the scene (`drawHud`).
 */
export class StealthSystem implements ChaseContext {
  readonly cfg: DetectionConfig;
  readonly def: StealthDef;
  time = 0;
  state: DetectState = 'undetected';
  /** Seconds the player has been overlapping a lit region (detection fires at `cfg.grace`). */
  exposure = 0;
  /** True while the player is inside a cover zone / inside a lit region (this frame). */
  hidden = false;
  lit = false;
  /** Seconds in cover without a break. */
  hiddenFor = 0;
  /** Alerts raised so far. */
  detections = 0;
  /** Detections not yet handed to the campaign counter. */
  private unreported = 0;
  private cooldownLeft = 0;
  private alertLeft = 0;
  private seen: Pt;
  private giveUpFlag = false;
  private chasers: Chaser[] = [];
  private queue: { at: number; k: number }[] = [];
  private poses: LightPose[];
  private dist = 0;
  /** Scroll speed seen last frame (px/s), for look-ahead probes. */
  private speed = 0;
  private sweep: Sweep | null = null;
  /** Patrol sweep: set by the objective, true = the player is safe at the goal. */
  sweepExempt: () => boolean = () => false;
  /** The sweep passed over the player in the open since this was last cleared. */
  caught = false;
  private flash = 0;

  constructor(
    private readonly host: StealthHost,
    def: StealthDef,
  ) {
    this.def = def;
    this.cfg = { ...DEFAULT_DETECTION, ...def.detection };
    this.poses = def.lights.map(() => ({ x: 0, y: 0, angle: 0, power: 1, lit: true, warnIn: -1 }));
    this.seen = { x: host.ship.x, y: host.ship.y };
  }

  // --- ChaseContext --------------------------------------------------------------------------------------

  lastSeen(): Pt {
    return this.seen;
  }

  playerHidden(): boolean {
    return this.hidden;
  }

  giveUp(): boolean {
    return this.giveUpFlag;
  }

  // --- queries -------------------------------------------------------------------------------------------

  /** Chasers in play that have not given up. */
  get chaserCount(): number {
    return this.chasers.filter((c) => !c.ctl.fleeing && c.handle.alive() && !c.ctl.done()).length + this.queue.length;
  }

  /** Take the detections raised since the last call (the campaign adds them to its `detections` counter). */
  takeDetections(): number {
    const n = this.unreported;
    this.unreported = 0;
    return n;
  }

  /** The player circle used for the "is it lit" test. */
  private radius(): number {
    return this.host.hitbox() + this.cfg.pad;
  }

  /** Would a ship centred at (x, y) be lit right now (and not in cover)? For authoring checks and scripted runs. */
  probe(x: number, y: number, ahead = 0): { lit: boolean; covered: boolean } {
    const dist = this.dist + this.speed * ahead;
    const covered = (this.def.covers ?? []).some((c) => inCover(c, dist, x, y));
    const r = this.radius();
    const pose: LightPose = { x: 0, y: 0, angle: 0, power: 1, lit: true, warnIn: -1 };
    const lit = !covered && this.def.lights.some((l) => lightHits(l, lightPose(l, this.time + ahead, dist, pose), x, y, r));
    return { lit, covered };
  }

  /** True while a patrol sweep is crossing the screen. */
  get sweeping(): boolean {
    return this.sweep !== null;
  }

  /** Start a patrol sweep: a line of lamps crossing the whole screen in `seconds` (from the top going down, or from the bottom going up). */
  startSweep(seconds: number, dir: 'down' | 'up' = 'down'): void {
    this.sweep = { seconds, dir: dir === 'down' ? 1 : -1, t: 0, y: dir === 'down' ? -40 : H + 40 };
    this.caught = false;
  }

  cancelSweep(): void {
    this.sweep = null;
  }

  // --- update --------------------------------------------------------------------------------------------

  update(dt: number, dist: number): void {
    this.time += dt;
    if (dt > 0) this.speed = (dist - this.dist) / dt;
    this.dist = dist;
    const s = this.host.ship;
    const r = this.radius();
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
    this.alertLeft = Math.max(0, this.alertLeft - dt);
    this.flash = Math.max(0, this.flash - dt);

    this.hidden = (this.def.covers ?? []).some((c) => inCover(c, dist, s.x, s.y));
    this.hiddenFor = this.hidden ? this.hiddenFor + dt : 0;
    if (!this.hidden) this.seen = { x: s.x, y: s.y };

    let lit = false;
    this.def.lights.forEach((l, i) => {
      const pose = lightPose(l, this.time, dist, this.poses[i]);
      if (!lit && !this.hidden && lightHits(l, pose, s.x, s.y, r)) lit = true;
    });
    this.lit = lit;
    this.exposure = lit ? this.exposure + dt : Math.max(0, this.exposure - dt * 3);
    if (this.exposure >= this.cfg.grace) {
      this.exposure = 0;
      this.detect();
    }

    // The sweep line.
    if (this.sweep) {
      const sw = this.sweep;
      const prev = sw.y;
      sw.t += dt;
      sw.y = sw.dir > 0 ? -40 + ((H + 80) * sw.t) / sw.seconds : H + 40 - ((H + 80) * sw.t) / sw.seconds;
      const crossed = (s.y - prev) * (s.y - sw.y) <= 0;
      if (crossed && !this.hidden && !this.sweepExempt()) {
        this.caught = true;
        this.detect();
      }
      if (sw.t >= sw.seconds) this.sweep = null;
    }

    // Chasers: queued spawns, bookkeeping, giving up.
    for (const q of this.queue) if (this.time >= q.at) this.spawnChaser(q.k);
    this.queue = this.queue.filter((q) => this.time < q.at);
    this.giveUpFlag = this.chasers.length > 0 && this.hiddenFor >= this.cfg.loseAfter;
    this.chasers = this.chasers.filter((c) => c.handle.alive() && !c.ctl.done());
    if (this.chasers.length === 0 && this.queue.length === 0) this.giveUpFlag = false;
    const active = this.chaserCount;
    this.state = this.alertLeft > 0 ? 'alert' : active > 0 ? 'chased' : 'undetected';
  }

  /** The alert: count it, start the beat, spawn chasers (within the cap and the cooldown). */
  detect(): void {
    this.flash = 0.5;
    this.giveUpFlag = false;
    if (this.cooldownLeft > 0) return; // re-sighted inside the cooldown: the chasers just keep the target (not a new alert)
    this.detections++;
    this.unreported++;
    this.cooldownLeft = this.cfg.cooldown;
    this.alertLeft = this.cfg.alertBeat;
    const room = Math.max(0, this.cfg.maxChasers - this.chaserCount);
    const n = Math.min(this.cfg.chasers, room);
    for (let k = 0; k < n; k++) this.queue.push({ at: this.time + 0.3 + k * this.cfg.stagger, k: this.chasers.length + this.queue.length });
  }

  private spawnChaser(k: number): void {
    const s = this.host.ship;
    const side = k % 2 === 0 ? -1 : 1;
    const x = Math.max(40, Math.min(W - 40, s.x + side * (110 + (k % 3) * 55)));
    const start = { x, y: -60 };
    const ctl = new ChaseController(this, start, this.cfg.chaseSpeed * (0.94 + 0.06 * (k % 3)), this.cfg.turnRate);
    const handle = this.host.spawnChaser(this.cfg.unit, { slot: start, chase: ctl });
    this.chasers.push({ ctl, handle });
  }

  /** Debug: raise an alert now. */
  forceDetect(): void {
    this.cooldownLeft = 0;
    this.detect();
  }

  // --- drawing -------------------------------------------------------------------------------------------

  /** Lights, the patrol sweep, then cover over them (cover hides the beams inside it). World space, under the units. */
  drawGround(g: CanvasRenderingContext2D): void {
    this.drawFloor(g);
    const lights = this.def.lights;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const p = this.poses[i];
      const e = lightExtent(l) + 20;
      if (p.y - e > H || p.y + e < 0 || p.x - e > W || p.x + e < 0) {
        // Far from the screen? A patrol/roam light may still reach in; the extent test above covers the lamp's reach.
        if (l.pattern.type !== 'patrol' && l.pattern.type !== 'roam') continue;
        if (p.y - e > H + 200 || p.y + e < -200) continue;
      }
      drawLight(g, l, p, this.time, i);
    }
    if (this.sweep) this.drawSweep(g, this.sweep);
    for (const c of this.def.covers ?? []) drawCover(g, c, this.dist, this.time);
  }

  private drawFloor(g: CanvasRenderingContext2D): void {
    const f = this.def.floor;
    if (f === false) return;
    const sp = f?.spacing ?? 120;
    g.save();
    g.strokeStyle = f?.color ?? 'rgba(90,120,170,0.09)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= W; x += sp) {
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, H);
    }
    for (let y = this.dist % sp; y <= H; y += sp) {
      g.moveTo(0, Math.round(y) + 0.5);
      g.lineTo(W, Math.round(y) + 0.5);
    }
    g.stroke();
    g.restore();
  }

  private drawSweep(g: CanvasRenderingContext2D, sw: Sweep): void {
    const trail = 150;
    const y0 = sw.y - sw.dir * trail;
    const grad = g.createLinearGradient(0, y0, 0, sw.y);
    grad.addColorStop(0, 'rgba(255,90,60,0)');
    grad.addColorStop(1, 'rgba(255,110,80,0.5)');
    g.save();
    g.fillStyle = grad;
    g.fillRect(0, Math.min(y0, sw.y), W, trail);
    g.fillStyle = '#ffd6c8';
    g.fillRect(0, sw.y - 2, W, 4);
    g.restore();
    const n = 7;
    const pose: LightPose = { x: 0, y: sw.y, angle: sw.dir > 0 ? Math.PI / 2 : -Math.PI / 2, power: 1, lit: true, warnIn: -1 };
    for (let i = 0; i < n; i++) {
      pose.x = 40 + (i * (W - 80)) / (n - 1);
      drawLight(g, SWEEP_LAMP, pose, this.time, i);
    }
  }

  /** The player's markers, the state icon and the edge tint (screen space, over everything but the other HUD). */
  drawHud(g: CanvasRenderingContext2D): void {
    const s = this.host.ship;
    g.save();
    // Edge tint: red pulse while chased, an amber flash on the alert, and a faint red hint while in a lit region.
    const tint = this.state === 'chased' ? 0.2 + 0.08 * Math.sin(this.time * 6) : this.flash > 0 ? this.flash * 0.5 : this.exposure > 0 ? 0.1 : 0;
    if (tint > 0.01) {
      const col = this.state === 'chased' || this.exposure > 0 ? '255,40,40' : '255,200,40';
      const grad = g.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.72);
      grad.addColorStop(0, `rgba(${col},0)`);
      grad.addColorStop(1, `rgba(${col},${tint.toFixed(3)})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    // Around the ship: a dashed teal ring while hidden, a red arc filling while exposed to a light.
    if (this.hidden) {
      g.strokeStyle = 'rgba(110,231,200,0.8)';
      g.lineWidth = 2;
      g.setLineDash([4, 4]);
      g.lineDashOffset = -this.time * 12;
      g.beginPath();
      g.arc(s.x, s.y, 17, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    } else if (this.exposure > 0) {
      g.strokeStyle = '#ff5a4a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(s.x, s.y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, this.exposure / this.cfg.grace));
      g.stroke();
    }
    // The state icon, top left.
    const col = STATE_COLOR[this.state];
    const x = 12;
    const y = 12;
    g.fillStyle = 'rgba(5,6,13,0.72)';
    g.fillRect(x, y, 150, 50);
    const cx = x + 26;
    const cy = y + 25;
    g.strokeStyle = col;
    g.fillStyle = col;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(cx - 16, cy);
    g.quadraticCurveTo(cx, cy - 13, cx + 16, cy);
    g.quadraticCurveTo(cx, cy + 13, cx - 16, cy);
    g.stroke();
    const pr = this.state === 'chased' ? 4 + Math.sin(this.time * 12) : 4.5;
    g.beginPath();
    g.arc(cx, cy, pr, 0, TAU);
    g.fill();
    if (this.state === 'undetected') {
      g.beginPath(); // a slash: the eye is closed on you
      g.moveTo(cx - 14, cy + 12);
      g.lineTo(cx + 14, cy - 12);
      g.stroke();
    } else {
      g.font = `bold 15px ${MONO}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('!', cx + 20, cy - 12);
    }
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.font = `bold 12px ${MONO}`;
    g.fillText(this.state === 'undetected' ? 'UNDETECTED' : this.state === 'alert' ? 'ALERT!' : `CHASED x${this.chaserCount}`, x + 50, y + 22);
    g.font = `11px ${MONO}`;
    g.fillStyle = this.hidden ? '#6ee7c8' : '#8fa0c8';
    const lose = this.chasers.length > 0 && this.hidden ? `LOSING THEM ${Math.max(0, this.cfg.loseAfter - this.hiddenFor).toFixed(1)}s` : this.hidden ? 'IN COVER' : this.lit ? 'IN THE LIGHT' : 'IN THE OPEN';
    g.fillText(lose, x + 50, y + 38);
    g.restore();
  }
}
