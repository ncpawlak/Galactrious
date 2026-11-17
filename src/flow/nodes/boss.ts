import type { BossNodeDefinition, FlowNode, NodeContext, NodeOutcome } from '../node';

/** Wraps the existing boss fight: the game runs the fight, this node starts it and reports how it ended. */
export class BossNode implements FlowNode {
  private ctx!: NodeContext;
  private result: NodeOutcome | null = null;

  constructor(private readonly def: BossNodeDefinition) {}

  start(ctx: NodeContext): void {
    this.ctx = ctx;
    ctx.host.startBossFight(this.def.bossId, this.def.scroll);
  }

  update(): void {
    const r = this.ctx.host.combatResult();
    if (r === 'won') this.result = 'done';
    else if (r === 'lost') this.result = 'lost';
  }

  outcome(): NodeOutcome | null {
    return this.result;
  }

  draw(): void {
    // The game draws the combat scene.
  }

  end(): void {
    this.ctx.host.endCombat();
  }
}
