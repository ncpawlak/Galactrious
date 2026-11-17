import type { FlowNode, NodeContext, NodeOutcome, ScrollNodeDefinition } from '../node';

/**
 * A scrolling level as a node: starts it through the host, reports `done` when the scroll distance reaches the level's
 * length and `lost` when the ship is destroyed. Objectives built on top (campaign framework) can use `host.scroll()` for the
 * distance, speed and events instead of this node.
 */
/** Seconds of the SECTOR CLEAR beat (the scroll eases down) before a chained section ends. */
const CLEAR_BEAT = 2.2;
/** Scroll speed (share of normal) while the section waits for stragglers after its end, so the ground never rushes past an empty sky. */
const WAIT_SPEED = 0.45;

export class ScrollNode implements FlowNode {
  private ctx!: NodeContext;
  private result: NodeOutcome | null = null;
  // chain state
  private t = 0;
  private spawned = 0;
  private sinceSpawn = 0;
  private sinceClear = 0;
  private beat = -1;
  private slowed = false;

  constructor(private readonly def: ScrollNodeDefinition) {}

  start(ctx: NodeContext): void {
    this.ctx = ctx;
    ctx.host.startScroll(this.def.level);
  }

  update(dt = 0): void {
    const host = this.ctx.host;
    if (host.combatResult() === 'lost') {
      this.result = 'lost';
      return;
    }
    const chain = this.def.chain;
    if (!chain) {
      if (host.scroll()?.done && (!this.def.waitForUnits || host.waveRemaining() === 0)) this.result = 'done';
      return;
    }
    const s = host.scroll();
    if (!s) return;
    this.t += dt;
    const len = typeof this.def.level === 'string' ? 0 : this.def.level.length;
    const left = host.waveRemaining();
    if (this.beat >= 0) {
      this.beat += dt;
      if (this.beat >= CLEAR_BEAT) this.result = 'done';
      return;
    }
    if (left === 0) this.sinceClear += dt;
    else this.sinceClear = 0;
    this.sinceSpawn += dt;
    // Next wave: the first on a timer; later ones when the field has been clear for `gap` (and the last spawn is old enough), or on the `every` timer.
    if (this.spawned < chain.waves.length) {
      const first = this.spawned === 0;
      const due = first
        ? this.t >= chain.first
        : (left === 0 && this.sinceClear >= chain.gap && this.sinceSpawn >= chain.minSpacing) || this.sinceSpawn >= chain.every || s.done;
      if (due) {
        host.spawnWave(chain.waves[this.spawned], 'chain');
        this.spawned++;
        this.sinceSpawn = 0;
        this.sinceClear = 0;
      }
      return;
    }
    // All waves out. Stragglers past the section's end: slow the scroll. Otherwise end with a clear beat once far enough in.
    if (left > 0) {
      if (s.done && !this.slowed) {
        this.slowed = true;
        s.setSpeed(s.speed * WAIT_SPEED, 1.5);
      }
      return;
    }
    if (len <= 0 || s.distance >= len * chain.minEnd || s.done) {
      this.beat = 0;
      s.setSpeed(s.speed * 0.35, CLEAR_BEAT * 0.8);
    }
  }

  outcome(): NodeOutcome | null {
    return this.result;
  }

  draw(g: CanvasRenderingContext2D): void {
    const s = this.ctx.host.scroll();
    if (!s) return;
    g.save();
    const len = typeof this.def.level === 'string' ? 0 : this.def.level.length;
    if (len > 0) {
      // A thin progress bar along the bottom edge (a section of a Conquest run).
      g.fillStyle = 'rgba(5,6,13,0.55)';
      g.fillRect(0, 956, 540, 4);
      g.fillStyle = '#6ee7ff';
      g.fillRect(0, 956, Math.min(1, s.distance / len) * 540, 4);
      if (this.def.chain) {
        const left = this.ctx.host.waveRemaining();
        g.font = '12px ui-monospace, Consolas, monospace';
        g.fillStyle = '#6ee7ff';
        g.textAlign = 'center';
        if (this.beat >= 0) {
          g.globalAlpha = Math.min(1, this.beat / 0.4);
          g.fillStyle = '#ffd21f';
          g.font = 'bold 28px monospace';
          g.fillText('SECTOR CLEAR', 270, 470);
          g.globalAlpha = 1;
        } else if (left > 0) g.fillText(`ENEMIES ${left}`, 360, 950);
      } else if (this.def.waitForUnits) {
        const left = this.ctx.host.waveRemaining();
        g.font = '12px ui-monospace, Consolas, monospace';
        g.fillStyle = '#6ee7ff';
        g.textAlign = 'center';
        g.fillText(s.done && left > 0 ? `CLEAR THE ${left} REMAINING` : left > 0 ? `ENEMIES ${left}` : '', 360, 950);
      }
    } else {
      g.fillStyle = 'rgba(5,6,13,0.6)';
      g.fillRect(8, 940, 124, 14);
      g.fillStyle = '#6ee7ff';
      g.font = '10px monospace';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`DIST ${Math.floor(s.distance)}  ${Math.round(s.speed)}px/s`, 12, 947);
    }
    g.restore();
  }

  end(): void {
    this.ctx.host.endCombat();
  }
}
