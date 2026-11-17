import type { FlowNode, NodeContext, NodeOutcome, ScrollNodeDefinition } from '../node';

/**
 * A scrolling level as a node: starts it through the host, reports `done` when the scroll distance reaches the level's
 * length and `lost` when the ship is destroyed. Objectives built on top (campaign framework) can use `host.scroll()` for the
 * distance, speed and events instead of this node.
 */
export class ScrollNode implements FlowNode {
  private ctx!: NodeContext;
  private result: NodeOutcome | null = null;

  constructor(private readonly def: ScrollNodeDefinition) {}

  start(ctx: NodeContext): void {
    this.ctx = ctx;
    ctx.host.startScroll(this.def.level);
  }

  update(): void {
    const host = this.ctx.host;
    if (host.combatResult() === 'lost') this.result = 'lost';
    else if (host.scroll()?.done) this.result = 'done';
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
