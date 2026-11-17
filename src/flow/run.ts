import { TUNING } from '../config';
import type { FlowNode, NodeContext, NodeDefinition, NodeHost, NodePosition, RunDefinition, RunState } from './node';
import { createNode } from './nodes';
import { drawRunOver, drawRunWon, drawTitle } from './screens';

/** title -> node (the current level's nodes, then its reward) -> ... -> won; death at any node -> over. */
export type RunPhase = 'title' | 'node' | 'over' | 'won';

/** Seconds a result screen ignores input, so the press that ended the last node cannot skip it. */
const SCREEN_LOCKOUT = 1;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The flow engine: walks a RunDefinition, one node at a time. It knows nothing about what nodes do; it only
 * starts them, updates them, reads their outcome and moves on. All game access goes through the `NodeHost`.
 */
export class Run {
  phase: RunPhase = 'title';
  state: RunState = this.freshState(0);
  private node: FlowNode | null = null;
  /** Seconds in the current phase (screen blink and lockout). */
  private phaseTime = 0;

  constructor(
    readonly def: RunDefinition,
    private readonly host: NodeHost,
  ) {}

  /** Node definitions of the current level in play order: its nodes, then its reward (not after the last level). */
  private levelNodes(levelIndex = this.state.levelIndex): NodeDefinition[] {
    const level = this.def.levels[levelIndex];
    const last = levelIndex === this.def.levels.length - 1;
    return level.reward && !last ? [...level.nodes, { type: 'reward', ...level.reward }] : level.nodes;
  }

  private freshState(seed: number): RunState {
    return { seed, rng: mulberry32(seed), levelIndex: 0, nodeIndex: 0, maxHealth: TUNING.player.maxHealth, loadout: [], upgrades: [], time: 0 };
  }

  /** Begin a new run at level 1, node 1. */
  start(seed: number = (Date.now() & 0x7fffffff) >>> 0): void {
    this.endNode();
    this.state = this.freshState(seed);
    this.host.healFull();
    this.enterNode();
  }

  /** Abandon whatever is running and go back to the title. */
  toTitle(): void {
    this.endNode();
    this.setPhase('title');
  }

  private setPhase(p: RunPhase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  private position(defs: NodeDefinition[]): NodePosition {
    const type = defs[this.state.nodeIndex].type;
    const same = defs.filter((d) => d.type === type);
    return {
      level: this.state.levelIndex + 1,
      levels: this.def.levels.length,
      index: defs.slice(0, this.state.nodeIndex + 1).filter((d) => d.type === type).length,
      count: same.length,
    };
  }

  private enterNode(): void {
    const defs = this.levelNodes();
    const def = defs[this.state.nodeIndex];
    const node = createNode(def);
    this.node = node;
    this.setPhase('node');
    const ctx: NodeContext = { host: this.host, run: this.state, position: this.position(defs) };
    node.start(ctx);
  }

  private endNode(): void {
    this.node?.end?.();
    this.node = null;
  }

  /** Move to the next node, the next level (full heal) or the win. */
  private advance(): void {
    this.endNode();
    const s = this.state;
    s.nodeIndex++;
    if (s.nodeIndex >= this.levelNodes().length) {
      s.levelIndex++;
      s.nodeIndex = 0;
      if (s.levelIndex >= this.def.levels.length) {
        s.levelIndex = this.def.levels.length - 1;
        s.nodeIndex = this.levelNodes().length - 1;
        this.setPhase('won');
        return;
      }
      this.host.healFull();
    }
    this.enterNode();
  }

  update(dt: number): void {
    this.phaseTime += dt;
    if (this.phase === 'node') {
      this.state.time += dt;
      const node = this.node!;
      node.update(dt);
      const out = node.outcome();
      if (out === 'done') this.advance();
      else if (out === 'lost') {
        this.endNode();
        this.setPhase('over');
      }
      return;
    }
    // title / over / won: any tap or key continues (result screens after a short lockout).
    const tap = this.host.takeTap();
    const key = this.host.takeKey();
    if (!tap && !key) return;
    if (this.phase === 'title') {
      const seed = new URLSearchParams(location.search).get('seed');
      this.start(seed !== null && seed !== '' && !Number.isNaN(+seed) ? +seed : undefined);
    } else if (this.phaseTime > SCREEN_LOCKOUT) this.toTitle();
  }

  /** True while a node is current (as opposed to the title and result screens). */
  get active(): boolean {
    return this.phase === 'node';
  }

  /** Draws the current node or screen, plus a small progress label while a node is running. */
  draw(g: CanvasRenderingContext2D): void {
    const summary = { level: this.state.levelIndex + 1, levels: this.def.levels.length, time: this.state.time, upgrades: this.state.upgrades.map((u) => u.name) };
    switch (this.phase) {
      case 'title':
        drawTitle(g, this.phaseTime, this.def.levels.length);
        break;
      case 'over':
        drawRunOver(g, this.phaseTime, summary);
        break;
      case 'won':
        drawRunWon(g, this.phaseTime, summary);
        break;
      case 'node': {
        this.node!.draw(g);
        const defs = this.levelNodes();
        const p = this.position(defs);
        const type = defs[this.state.nodeIndex].type;
        g.save();
        g.font = '12px ui-monospace, Consolas, monospace';
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.fillStyle = '#6ee7ff';
        g.fillText(`LEVEL ${p.level}/${p.levels} · ${type.toUpperCase()}${p.count > 1 ? ` ${p.index}/${p.count}` : ''}`, 12, 950);
        g.restore();
        break;
      }
    }
  }
}
