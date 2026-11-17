import { H, W } from '../config';
import { drawHoldRing, drawZone, inZone, zoneCenter, type ObjectiveEnv, type ObjectiveHandler } from '../campaign/objectives';
import type { PatrolWaveObjective } from '../campaign/types';
import type { StealthSystem } from './system';

const SWEEP_SECONDS = 3.5;
const WARN_SECONDS = 5;

/**
 * `patrolWave` objective (DESIGN.md "As built: stealth systems"): reach the goal zone (hold it for `hold` s, the hangar circle) while a
 * countdown runs to a patrol sweep. The sweep crosses the whole screen; being inside a cover zone or inside the goal when it
 * passes is safe, anywhere else fails the attempt. It repeats every `countdown` s, so lingering in the open is never an option.
 */
export class PatrolWaveHandler implements ObjectiveHandler {
  private held = 0;
  private done = false;
  /** Objective time of the next sweep. */
  private next: number;
  private sweepSeconds: number;

  constructor(private readonly def: PatrolWaveObjective) {
    this.next = def.countdown;
    this.sweepSeconds = def.sweep?.seconds ?? SWEEP_SECONDS;
  }

  private stealth(env: ObjectiveEnv): StealthSystem {
    const st = env.host.scroll()?.stealth;
    if (!st) throw new Error('patrolWave objective: its `scroll` level needs a `stealth` block (it may have no lights)');
    return st;
  }

  start(env: ObjectiveEnv): void {
    this.held = 0;
    this.done = false;
    this.next = this.def.countdown;
    const st = this.stealth(env);
    st.cancelSweep();
    st.caught = false;
    st.sweepExempt = () => this.open(env) && inZone(this.def.zone, env.host.ship.x, env.host.ship.y);
  }

  /** True once the zone exists (always, unless `zoneAtDistance` gates it). */
  private open(env: ObjectiveEnv): boolean {
    const d = this.def.zoneAtDistance;
    return d === undefined || (env.host.scroll()?.distance ?? 0) >= d;
  }

  update(dt: number, env: ObjectiveEnv): void {
    const st = this.stealth(env);
    const s = env.host.ship;
    if (this.open(env) && env.host.shipAlive() && inZone(this.def.zone, s.x, s.y)) {
      this.held += dt;
      if (this.held >= (this.def.hold ?? 0)) this.done = true;
    } else this.held = 0;
    if (!st.sweeping && env.time >= this.next) {
      st.startSweep(this.sweepSeconds, this.def.sweep?.direction ?? 'down');
      this.next = env.time + this.sweepSeconds + this.def.countdown;
    }
    if (st.caught && !this.done) {
      st.caught = false;
      env.fail('caught by the patrol');
    }
  }

  isDone(): boolean {
    return this.done;
  }

  /** Seconds to the next sweep (0 while one is crossing). */
  private left(env: ObjectiveEnv): number {
    return Math.max(0, this.next - env.time);
  }

  hint(env: ObjectiveEnv): string {
    const st = env.host.scroll()?.stealth;
    if (st?.sweeping) return 'PATROL SWEEP! HIDE IN COVER';
    const h = this.def.hold ?? 0;
    if (!this.open(env)) return `FIND THE HANGAR  |  PATROL ${this.left(env).toFixed(0)}s`;
    const goal = h > 0 ? `HOLD THE ZONE ${Math.max(0, h - this.held).toFixed(1)}s` : 'REACH THE ZONE';
    return `${goal}  |  PATROL ${this.left(env).toFixed(0)}s`;
  }

  draw(g: CanvasRenderingContext2D, env: ObjectiveEnv): void {
    const hold = this.def.hold ?? 0;
    if (!this.open(env)) return this.drawWarning(g, env);
    drawZone(g, this.def.zone, '#6ee7ff', env.time, 0.1 + 0.15 * Math.min(1, this.held / Math.max(0.01, hold || 1)));
    if (hold > 0) drawHoldRing(g, this.def.zone, this.held / hold);
    const c = zoneCenter(this.def.zone);
    g.save();
    g.fillStyle = '#6ee7ff';
    g.font = 'bold 14px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.fillText(hold > 0 ? 'HOLD' : 'REACH', c.x, c.y + 5);
    g.restore();
    this.drawWarning(g, env);
  }

  private drawWarning(g: CanvasRenderingContext2D, env: ObjectiveEnv): void {
    g.save();
    g.textAlign = 'center';
    // Warning: an amber pulse on the screen edge and a banner for the last seconds before a sweep.
    const left = this.left(env);
    const st = env.host.scroll()?.stealth;
    if (!st?.sweeping && left > 0 && left <= WARN_SECONDS) {
      const k = 0.5 + 0.5 * Math.sin(env.time * 9);
      const grad = g.createLinearGradient(0, 0, 0, 140);
      grad.addColorStop(0, `rgba(255,190,40,${(0.45 * k).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255,190,40,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, 140);
      g.fillStyle = `rgba(255,210,31,${(0.6 + 0.4 * k).toFixed(3)})`;
      g.font = 'bold 22px ui-monospace, Consolas, monospace';
      g.fillText(`PATROL INCOMING ${Math.ceil(left)}`, W / 2, H * 0.55);
      g.font = '13px ui-monospace, Consolas, monospace';
      g.fillText('get into cover or the zone', W / 2, H * 0.55 + 20);
    }
    g.restore();
  }
}
