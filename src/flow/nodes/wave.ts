import type { FlowNode, NodeContext, NodeOutcome, WaveNodeDefinition } from '../node';
import { waveSize } from '../../waves';

/** Seconds the "WAVE n" banner stays up. */
const BANNER_TIME = 2;
/** Beat between the last unit dying and the node ending, so the explosion reads. */
const CLEAR_BEAT = 0.9;

/**
 * Runs one wave: asks the host to start combat with the wave's units, then waits until every unit is dead
 * (no timeout in v1) and reports `done`. The ship being destroyed reports `lost`.
 */
export class WaveNode implements FlowNode {
  private ctx!: NodeContext;
  private t = 0;
  private cleared = 0;
  private result: NodeOutcome | null = null;
  private readonly total: number;

  constructor(private readonly def: WaveNodeDefinition) {
    this.total = waveSize(def.wave);
  }

  start(ctx: NodeContext): void {
    this.ctx = ctx;
    ctx.host.startWave(this.def.wave, this.def.scroll);
  }

  update(dt: number): void {
    this.t += dt;
    const host = this.ctx.host;
    if (host.combatResult() === 'lost') {
      this.result = 'lost';
      return;
    }
    if (this.t > 0.1 && host.waveRemaining() === 0) {
      this.cleared += dt;
      if (this.cleared >= CLEAR_BEAT) this.result = 'done';
    }
  }

  outcome(): NodeOutcome | null {
    return this.result;
  }

  draw(g: CanvasRenderingContext2D): void {
    const p = this.ctx.position;
    const left = this.ctx.host.waveRemaining();
    g.save();
    g.textAlign = 'center';
    if (this.t < BANNER_TIME && !this.def.hud) {
      const k = Math.min(1, (BANNER_TIME - this.t) / 0.6);
      g.globalAlpha = k;
      g.fillStyle = '#6ee7ff';
      g.font = 'bold 34px monospace';
      g.fillText(`WAVE ${p.index} / ${p.count}`, 270, 470);
      if (this.def.wave.name) {
        g.fillStyle = '#8fa0c8';
        g.font = '16px monospace';
        g.fillText(this.def.wave.name, 270, 500);
      }
      g.globalAlpha = 1;
    }
    if (left === 0 && this.cleared > 0) {
      g.fillStyle = '#ffd21f';
      g.font = 'bold 28px monospace';
      g.fillText('WAVE CLEARED', 270, 470);
    }
    g.textAlign = 'center';
    g.font = '12px ui-monospace, Consolas, monospace';
    g.fillStyle = '#6ee7ff';
    g.fillText(`ENEMIES ${left}/${this.total}`, 360, 950);
    g.restore();
  }

  end(): void {
    this.ctx.host.endCombat();
  }
}
