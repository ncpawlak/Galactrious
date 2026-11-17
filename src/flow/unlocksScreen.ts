import { H, W } from '../config';
import { saveStore } from '../save';
import { CARDS } from '../upgrades/cards';
import { groupColor } from '../upgrades/draw';
import { cardUnlocked } from '../upgrades/stats';
import { drawCentered } from './screens';
import type { NodeHost } from './node';

const MONO = 'ui-monospace, Consolas, monospace';
const X = 30;
const ROW_W = W - 60;
const ROW_Y0 = 150;
const ROW_H = 56;
const ROW_GAP = 6;
const PER_PAGE = 10;

interface Btn {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PREV: Btn = { x: 30, y: 790, w: 120, h: 52 };
const NEXT: Btn = { x: W - 150, y: 790, w: 120, h: 52 };
const RESET: Btn = { x: 30, y: 856, w: 220, h: 56 };
const BACK: Btn = { x: W - 250, y: 856, w: 220, h: 56 };
const YES: Btn = { x: 30, y: 856, w: 220, h: 56 };
const NO: Btn = { x: W - 250, y: 856, w: 220, h: 56 };

const hit = (b: Btn, p: { x: number; y: number }): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** The Unlocks screen (from the title): every card, unlocked or "???" with how to get it, paging, and a confirmed save reset. */
export class UnlocksScreen {
  private page = 0;
  private confirming = false;
  private t = 0;

  /** Returns true when the player leaves the screen. */
  update(dt: number, host: NodeHost): boolean {
    this.t += dt;
    const tap = host.takeTap();
    const key = host.takeKey();
    const pages = Math.ceil(CARDS.length / PER_PAGE);
    if (this.t < 0.25) return false; // the press that opened the screen cannot act on it
    if (key === 'ArrowRight' && this.page < pages - 1) this.page++;
    if (key === 'ArrowLeft' && this.page > 0) this.page--;
    if (key === 'Escape') {
      if (this.confirming) this.confirming = false;
      else return true;
    }
    if (!tap) return false;
    if (this.confirming) {
      if (hit(YES, tap)) {
        saveStore.reset();
        this.confirming = false;
      } else if (hit(NO, tap)) this.confirming = false;
      return false;
    }
    if (hit(PREV, tap) && this.page > 0) this.page--;
    else if (hit(NEXT, tap) && this.page < pages - 1) this.page++;
    else if (hit(RESET, tap)) this.confirming = true;
    else if (hit(BACK, tap)) return true;
    return false;
  }

  private button(g: CanvasRenderingContext2D, b: Btn, label: string, color: string, enabled = true): void {
    g.save();
    g.globalAlpha = enabled ? 1 : 0.35;
    g.fillStyle = '#0b1424';
    g.fillRect(b.x, b.y, b.w, b.h);
    g.lineWidth = 3;
    g.strokeStyle = color;
    g.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
    g.fillStyle = color;
    g.font = `bold 18px ${MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    g.restore();
  }

  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.fillStyle = 'rgba(5, 6, 13, 0.82)';
    g.fillRect(0, 0, W, H);
    g.restore();
    const have = CARDS.filter(cardUnlocked).length;
    drawCentered(g, 'UNLOCKS', 70, `bold 36px ${MONO}`, '#ffd21f');
    drawCentered(g, `cards ${have}/${CARDS.length} unlocked`, 104, `15px ${MONO}`, '#6ee7ff');
    if (!saveStore.persistent) drawCentered(g, 'in-memory save: nothing is stored', 128, `12px ${MONO}`, '#ff8a5a');
    else if (saveStore.degraded) drawCentered(g, 'storage unavailable: progress is not stored', 128, `12px ${MONO}`, '#ff8a5a');
    const pages = Math.ceil(CARDS.length / PER_PAGE);
    CARDS.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((c, i) => {
      const y = ROW_Y0 + i * (ROW_H + ROW_GAP);
      const open = cardUnlocked(c);
      g.save();
      g.fillStyle = open ? '#0b1424' : '#080d18';
      g.fillRect(X, y, ROW_W, ROW_H);
      g.fillStyle = open ? groupColor(c.id) : '#3a4560';
      g.fillRect(X, y, 6, ROW_H);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.font = `bold 18px ${MONO}`;
      g.fillStyle = open ? '#ffffff' : '#6b7488';
      g.fillText(open ? c.name : '???', X + 20, y + 24);
      g.font = `12px ${MONO}`;
      g.fillStyle = open ? '#b6c2e0' : '#8fa0c8';
      const line = open ? c.desc : (c.unlockHint ?? 'unlock requirement unknown');
      g.fillText(line.length > 60 ? `${line.slice(0, 59)}…` : line, X + 20, y + 44);
      g.textAlign = 'right';
      g.font = `bold 12px ${MONO}`;
      g.fillStyle = open ? '#4ade80' : '#ff8a5a';
      g.fillText(open ? (c.unlock ? 'UNLOCKED' : 'ALWAYS') : 'LOCKED', X + ROW_W - 12, y + 24);
      g.restore();
    });
    drawCentered(g, `page ${this.page + 1}/${pages}`, 822, `14px ${MONO}`, '#8fa0c8');
    this.button(g, PREV, '< PREV', '#6ee7ff', this.page > 0);
    this.button(g, NEXT, 'NEXT >', '#6ee7ff', this.page < pages - 1);
    if (this.confirming) {
      drawCentered(g, 'Reset all unlocks and medals?', 846, `bold 15px ${MONO}`, '#ffd21f');
      this.button(g, YES, 'YES, RESET', '#ff5a5a');
      this.button(g, NO, 'CANCEL', '#6ee7ff');
    } else {
      this.button(g, RESET, 'RESET SAVE', '#ff8a5a');
      this.button(g, BACK, 'BACK', '#ffffff');
    }
  }
}
