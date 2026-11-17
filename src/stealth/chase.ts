import { H, W } from '../config';
import type { ChaseControl, Pt } from './types';

/** What a chaser needs to know about the stealth state (implemented by `StealthSystem`). */
export interface ChaseContext {
  /** Where the player was last in the open (chasers fly to it; while the player hides they circle there). */
  lastSeen(): Pt;
  /** True while the player is inside cover (line of sight broken: hold fire). */
  playerHidden(): boolean;
  /** True once every chaser should give up (the player stayed in cover long enough). */
  giveUp(): boolean;
}

const TAU = Math.PI * 2;
const wrap = (a: number): number => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const OFF = 90;

/**
 * One chaser's flight: it steers toward the last place the player was seen with a limited turn rate (so a sharp turn or a dodge
 * loses it), shoots while it can see the player, and once the context says give up it turns for the nearest screen edge and
 * leaves (removed, not a kill). Plugs into `UnitPlacement.chase`; the unit sprite itself always faces down like every empire unit.
 */
export class ChaseController implements ChaseControl {
  x: number;
  y: number;
  heading: number;
  fleeing = false;
  private flee: Pt | null = null;
  private last = 0;
  private fleeTime = 0;
  private gone = false;

  constructor(
    private readonly ctx: ChaseContext,
    start: Pt,
    private readonly speed: number,
    private readonly turnRate: number,
  ) {
    this.x = start.x;
    this.y = start.y;
    const t = ctx.lastSeen();
    this.heading = Math.atan2(t.y - start.y, t.x - start.x);
  }

  step(t: number): Pt {
    const dt = Math.min(0.1, Math.max(0, t - this.last));
    this.last = t;
    if (dt > 0) this.advance(dt);
    return { x: this.x, y: this.y };
  }

  private advance(dt: number): void {
    if (!this.fleeing && this.ctx.giveUp()) {
      this.fleeing = true;
      // Leave by the nearest side or the top: away from where the player is.
      const toLeft = this.x < W / 2;
      this.flee = this.y < 260 ? { x: this.x, y: -400 } : { x: toLeft ? -400 : W + 400, y: this.y - 200 };
    }
    const target = this.fleeing ? this.flee! : this.ctx.lastSeen();
    const want = Math.atan2(target.y - this.y, target.x - this.x);
    const diff = wrap(want - this.heading);
    const maxTurn = this.turnRate * dt;
    this.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
    // Slow a little when the target is close and the turn is sharp, so the pass reads as a swoop and not a ram.
    const d = Math.hypot(target.x - this.x, target.y - this.y);
    const v = this.fleeing ? this.speed * 1.3 : this.speed * (d < 90 ? 0.7 : 1);
    this.x += Math.cos(this.heading) * v * dt;
    this.y += Math.sin(this.heading) * v * dt;
    if (this.fleeing) {
      this.fleeTime += dt;
      if (this.x < -OFF || this.x > W + OFF || this.y < -OFF || this.y > H + OFF || this.fleeTime > 9) this.gone = true;
    }
  }

  done(): boolean {
    return this.gone;
  }

  canFire(): boolean {
    return !this.fleeing && !this.ctx.playerHidden();
  }
}
