import type { FlowNode, NodeContext, NodeOutcome, WaveNodeDefinition } from '../node';
import { drawCentered } from '../screens';

/** Seconds the placeholder stays up. */
const PLACEHOLDER_TIME = 1.2;

/**
 * STUB. The units-and-waves work replaces the body of this class (spawn the formation, run combat through
 * `NodeHost`, report `done` when every unit is dead and `lost` when the ship is). Keep implementing `FlowNode`
 * and the engine needs no change. Extend `WaveNodeDefinition` in node.ts for the wave's data.
 */
export class WaveNode implements FlowNode {
  private ctx!: NodeContext;
  private t = 0;

  constructor(private readonly def: WaveNodeDefinition) {}

  start(ctx: NodeContext): void {
    this.ctx = ctx;
  }

  update(dt: number): void {
    this.t += dt;
  }

  outcome(): NodeOutcome | null {
    return this.t >= PLACEHOLDER_TIME ? 'done' : null;
  }

  draw(g: CanvasRenderingContext2D): void {
    const p = this.ctx.position;
    drawCentered(g, `WAVE ${p.index} / ${p.count}`, 440, 'bold 34px monospace', '#6ee7ff');
    drawCentered(g, `placeholder${this.def.id ? ` (${this.def.id})` : ''}: no enemies yet`, 482, '16px monospace', '#8fa0c8');
  }
}
