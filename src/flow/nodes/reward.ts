import { H, W } from '../../config';
import { drawUpgradeStrip, groupColor } from '../../upgrades/draw';
import { Loadout, drawCards, previewCard } from '../../upgrades/stats';
import type { CardDef } from '../../upgrades/model';
import type { FlowNode, NodeContext, NodeOutcome, RewardNodeDefinition } from '../node';
import { drawCentered } from '../screens';

const CARD_W = 480;
const CARD_H = 176;
const CARD_X = (W - CARD_W) / 2;
const CARD_Y0 = 150;
const CARD_GAP = 14;
const MONO = 'ui-monospace, Consolas, monospace';

/**
 * The reward screen: offers `choices` (default 3) distinct cards drawn with the run's seeded rng (cards already at their
 * stack limit are not offered). Pick by tapping or clicking a card, or pressing 1-3; the hovered card is highlighted.
 * The pick is pushed to `run.upgrades` (the effective stats are derived from that list, see src/upgrades/stats.ts).
 * Also used as a debug overlay (`game.debug.reward()`).
 */
export class RewardNode implements FlowNode {
  private ctx!: NodeContext;
  private cards: CardDef[] = [];
  private picked = -1;
  private hovered = -1;
  private t = 0;

  constructor(private readonly def: RewardNodeDefinition) {}

  start(ctx: NodeContext): void {
    this.ctx = ctx;
    this.cards = drawCards(ctx.run.rng, ctx.run.upgrades, this.def.choices ?? 3);
  }

  private cardY(i: number): number {
    return CARD_Y0 + i * (CARD_H + CARD_GAP);
  }

  private cardAt(x: number, y: number): number {
    return this.cards.findIndex((_, k) => x >= CARD_X && x <= CARD_X + CARD_W && y >= this.cardY(k) && y <= this.cardY(k) + CARD_H);
  }

  update(dt: number): void {
    this.t += dt;
    const host = this.ctx.host;
    const tap = host.takeTap();
    const key = host.takeKey();
    const ptr = host.pointer();
    this.hovered = ptr ? this.cardAt(ptr.x, ptr.y) : -1;
    if (this.cards.length === 0 && this.t > 0.4) {
      this.picked = 0; // nothing left to offer: skip
      return;
    }
    if (this.picked >= 0 || this.t < 0.4) return; // brief lockout so the press that ended the last node cannot pick
    let i = -1;
    if (tap) i = this.cardAt(tap.x, tap.y);
    const m = key && /^(Digit|Numpad)([1-9])$/.exec(key);
    if (m && +m[2] <= this.cards.length) i = +m[2] - 1;
    if (i < 0) return;
    this.picked = i;
    this.ctx.run.upgrades.push(this.cards[i]);
    this.t = 0; // reuse the clock for the short confirmation beat
  }

  outcome(): NodeOutcome | null {
    return this.picked >= 0 && this.t > 0.55 ? 'done' : null;
  }

  /** Greedy word wrap into at most `max` lines. */
  private wrap(g: CanvasRenderingContext2D, text: string, w: number, max: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > w && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines.slice(0, max);
  }

  draw(g: CanvasRenderingContext2D): void {
    const held = this.ctx.run.upgrades as CardDef[];
    g.save();
    g.fillStyle = 'rgba(5, 6, 13, 0.6)';
    g.fillRect(0, 0, W, H);
    g.restore();
    drawCentered(g, 'CHOOSE AN UPGRADE', 84, `bold 32px ${MONO}`, '#ffd21f');
    drawCentered(g, 'tap a card or press 1-3', 118, `15px ${MONO}`, '#ffffff');
    this.cards.forEach((c, i) => this.drawCard(g, c, i, held));
    const ys = CARD_Y0 + this.cards.length * (CARD_H + CARD_GAP) + 22;
    g.save();
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.font = `bold 13px ${MONO}`;
    g.fillStyle = '#6ee7ff';
    g.fillText(held.length ? `YOUR UPGRADES (${held.length})` : 'YOUR UPGRADES: none yet', CARD_X, ys);
    g.restore();
    drawUpgradeStrip(g, new Loadout(held), CARD_X, ys + 12, CARD_W);
  }

  private drawCard(g: CanvasRenderingContext2D, c: CardDef, i: number, held: readonly CardDef[]): void {
    const y = this.cardY(i);
    const chosen = i === this.picked;
    const hot = i === this.hovered && this.picked < 0;
    const dimmed = this.picked >= 0 && !chosen;
    const col = groupColor(c.id);
    g.save();
    g.globalAlpha = dimmed ? 0.35 : 1;
    g.fillStyle = chosen ? '#1b3a5c' : hot ? '#152a47' : '#0b1424';
    g.fillRect(CARD_X, y, CARD_W, CARD_H);
    g.lineWidth = chosen || hot ? 4 : 3;
    g.strokeStyle = chosen ? '#ffd21f' : hot ? '#6ee7ff' : c.rarity === 'rare' ? '#6a5a2a' : '#26324d';
    g.strokeRect(CARD_X + 1.5, y + 1.5, CARD_W - 3, CARD_H - 3);
    g.fillStyle = col;
    g.fillRect(CARD_X, y, 7, CARD_H);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.font = `bold 15px ${MONO}`;
    g.fillStyle = '#6ee7ff';
    g.fillText(`[${i + 1}]`, CARD_X + 22, y + 28);
    g.fillStyle = col;
    g.fillText(c.group.toUpperCase(), CARD_X + 64, y + 28);
    g.textAlign = 'right';
    g.font = `13px ${MONO}`;
    g.fillStyle = c.rarity === 'rare' ? '#ffd21f' : '#8fa0c8';
    const owned = new Loadout(held).stackOf(c.id);
    g.fillText(`${c.rarity === 'rare' ? 'RARE  ' : ''}owned ${owned}/${c.maxStacks ?? 1}`, CARD_X + CARD_W - 16, y + 28);
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.font = `bold 26px ${MONO}`;
    g.fillText(c.name, CARD_X + 22, y + 64);
    g.fillStyle = '#b6c2e0';
    g.font = `14px ${MONO}`;
    this.wrap(g, c.desc, CARD_W - 44, 2).forEach((l, k) => g.fillText(l, CARD_X + 22, y + 92 + k * 18));
    previewCard(c, held).slice(0, 2).forEach((p, k) => {
      const ry = y + 140 + k * 22;
      g.font = `15px ${MONO}`;
      g.fillStyle = '#8fa0c8';
      g.fillText(p.label, CARD_X + 22, ry);
      g.textAlign = 'right';
      g.fillStyle = p.good ? '#4ade80' : '#ff8a5a';
      g.font = `bold 16px ${MONO}`;
      g.fillText(`${p.now}  →  ${p.next}`, CARD_X + CARD_W - 16, ry);
      g.textAlign = 'left';
    });
    g.restore();
  }
}
