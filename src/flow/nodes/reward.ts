import { H, W } from '../../config';
import type { FlowNode, NodeContext, NodeOutcome, RewardNodeDefinition, Upgrade } from '../node';
import { drawCentered } from '../screens';

/** Placeholder cards: they carry no modifiers yet. The upgrade-card work replaces this pool with real stat cards. */
const POOL: Upgrade[] = [
  { id: 'placeholder-a', name: 'Placeholder A', modifiers: [] },
  { id: 'placeholder-b', name: 'Placeholder B', modifiers: [] },
  { id: 'placeholder-c', name: 'Placeholder C', modifiers: [] },
  { id: 'placeholder-d', name: 'Placeholder D', modifiers: [] },
  { id: 'placeholder-e', name: 'Placeholder E', modifiers: [] },
];

const CARD_W = 440;
const CARD_H = 130;
const CARD_X = (W - CARD_W) / 2;
const CARD_Y0 = 300;
const CARD_GAP = 24;

/** STUB reward screen: pick one card (tap it, or press 1/2/3); the pick is added to `run.upgrades`. */
export class RewardNode implements FlowNode {
  private ctx!: NodeContext;
  private cards: Upgrade[] = [];
  private picked = -1;
  private t = 0;

  constructor(private readonly def: RewardNodeDefinition) {}

  start(ctx: NodeContext): void {
    this.ctx = ctx;
    // Seeded draw without replacement.
    const pool = [...POOL];
    const n = Math.min(this.def.choices ?? 3, pool.length);
    for (let i = 0; i < n; i++) this.cards.push(pool.splice(Math.floor(ctx.run.rng() * pool.length), 1)[0]);
  }

  update(dt: number): void {
    this.t += dt;
    const host = this.ctx.host;
    const tap = host.takeTap();
    const key = host.takeKey();
    if (this.picked >= 0 || this.t < 0.4) return; // brief lockout so the press that ended the last node cannot pick
    let i = -1;
    if (tap) i = this.cards.findIndex((_, k) => tap.x >= CARD_X && tap.x <= CARD_X + CARD_W && tap.y >= this.cardY(k) && tap.y <= this.cardY(k) + CARD_H);
    const m = key && /^(Digit|Numpad)([1-9])$/.exec(key);
    if (m && +m[2] <= this.cards.length) i = +m[2] - 1;
    if (i < 0) return;
    this.picked = i;
    this.ctx.run.upgrades.push(this.cards[i]);
    this.t = 0; // reuse the clock for the short confirmation beat
  }

  outcome(): NodeOutcome | null {
    return this.picked >= 0 && this.t > 0.5 ? 'done' : null;
  }

  private cardY(i: number): number {
    return CARD_Y0 + i * (CARD_H + CARD_GAP);
  }

  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.fillStyle = 'rgba(5, 6, 13, 0.6)';
    g.fillRect(0, 0, W, H);
    g.restore();
    drawCentered(g, 'LEVEL CLEARED', 150, 'bold 34px monospace', '#ffd21f');
    drawCentered(g, 'choose a reward  (tap a card or press 1-3)', 200, '16px monospace', '#ffffff');
    drawCentered(g, 'hull fully repaired', 232, '14px monospace', '#4ade80');
    this.cards.forEach((c, i) => {
      const y = this.cardY(i);
      const chosen = i === this.picked;
      g.save();
      g.fillStyle = chosen ? '#16314f' : '#0b1424';
      g.fillRect(CARD_X, y, CARD_W, CARD_H);
      g.lineWidth = 3;
      g.strokeStyle = chosen ? '#ffd21f' : '#26324d';
      g.strokeRect(CARD_X + 1.5, y + 1.5, CARD_W - 3, CARD_H - 3);
      g.restore();
      g.save();
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#6ee7ff';
      g.font = 'bold 14px monospace';
      g.fillText(`[${i + 1}]`, CARD_X + 18, y + 34);
      g.fillStyle = '#ffffff';
      g.font = 'bold 24px monospace';
      g.fillText(c.name, CARD_X + 18, y + 74);
      g.fillStyle = '#8fa0c8';
      g.font = '14px monospace';
      g.fillText('no effect yet (stub card)', CARD_X + 18, y + 104);
      g.restore();
    });
  }
}
