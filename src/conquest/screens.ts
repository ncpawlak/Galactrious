import { H, W } from '../config';
import { describeUnlock } from '../finale/unlocks';
import type { NodeHost } from '../flow/node';
import { drawCentered } from '../flow/screens';
import { saveStore } from '../save';
import { REGIONS, regionUnlocked } from './regions';
import type { ConquestResult } from './tracker';
import type { ChallengeDef, RegionDefinition } from './types';

const MONO = 'ui-monospace, Consolas, monospace';
const LOCKOUT = 0.25;

interface Btn {
  x: number;
  y: number;
  w: number;
  h: number;
}
const hit = (b: Btn, p: { x: number; y: number }): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

function dim(g: CanvasRenderingContext2D, a = 0.82): void {
  g.save();
  g.fillStyle = `rgba(5, 6, 13, ${a})`;
  g.fillRect(0, 0, W, H);
  g.restore();
}

function button(g: CanvasRenderingContext2D, b: Btn, label: string, color: string, enabled = true): void {
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

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left'): void {
  g.save();
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.font = font;
  g.fillStyle = color;
  g.fillText(s, x, y);
  g.restore();
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Wrap `s` into lines of at most `n` characters (monospace). */
function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if ((line ? line.length + 1 : 0) + w.length > n && line) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

// --- region select -----------------------------------------------------------------------------------------------

const ROW = { x: 30, y0: 170, w: W - 60, h: 132, gap: 14 };
const BACK: Btn = { x: W / 2 - 110, y: 856, w: 220, h: 56 };

export type RegionSelectResult = { kind: 'back' } | { kind: 'open'; region: RegionDefinition } | null;

/** The Conquest region list (from the title): each region, locked with its hint until its campaign is finished. */
export class RegionSelectScreen {
  private t = 0;
  private index = 0;

  update(dt: number, host: NodeHost): RegionSelectResult {
    this.t += dt;
    const tap = host.takeTap();
    const key = host.takeKey();
    if (this.t < LOCKOUT) return null;
    if (key === 'Escape') return { kind: 'back' };
    if (key === 'ArrowUp' && this.index > 0) this.index--;
    if (key === 'ArrowDown' && this.index < REGIONS.length - 1) this.index++;
    if ((key === 'Enter' || key === 'Space') && regionUnlocked(REGIONS[this.index])) return { kind: 'open', region: REGIONS[this.index] };
    if (!tap) return null;
    if (hit(BACK, tap)) return { kind: 'back' };
    REGIONS.forEach((_r, i) => {
      const y = ROW.y0 + i * (ROW.h + ROW.gap);
      if (hit({ x: ROW.x, y, w: ROW.w, h: ROW.h }, tap)) this.index = i;
    });
    const r = REGIONS[this.index];
    const y = ROW.y0 + this.index * (ROW.h + ROW.gap);
    if (r && hit({ x: ROW.x, y, w: ROW.w, h: ROW.h }, tap) && regionUnlocked(r)) return { kind: 'open', region: r };
    return null;
  }

  draw(g: CanvasRenderingContext2D): void {
    dim(g);
    drawCentered(g, 'CONQUEST', 80, `bold 40px ${MONO}`, '#ffd21f');
    drawCentered(g, 'a long run through one region, one life', 114, `14px ${MONO}`, '#6ee7ff');
    drawCentered(g, 'challenges unlock new cards, ships and weapons', 136, `12px ${MONO}`, '#8fa0c8');
    REGIONS.forEach((r, i) => {
      const y = ROW.y0 + i * (ROW.h + ROW.gap);
      const open = regionUnlocked(r);
      const done = saveStore.challengesDone(r.id).length;
      g.save();
      g.fillStyle = open ? '#0b1424' : '#080d18';
      g.fillRect(ROW.x, y, ROW.w, ROW.h);
      g.fillStyle = open ? r.theme.accent : '#3a4560';
      g.fillRect(ROW.x, y, 8, ROW.h);
      if (i === this.index) {
        g.lineWidth = 2;
        g.strokeStyle = open ? '#ffffff' : '#3a4560';
        g.strokeRect(ROW.x + 1, y + 1, ROW.w - 2, ROW.h - 2);
      }
      g.restore();
      text(g, open ? r.name : '??? LOCKED', ROW.x + 26, y + 36, `bold 24px ${MONO}`, open ? '#ffffff' : '#6b7488');
      if (open) {
        wrap(r.blurb, 56).slice(0, 3).forEach((l, k) => text(g, l, ROW.x + 26, y + 60 + k * 16, `12px ${MONO}`, '#b6c2e0'));
        text(g, `challenges ${done}/${r.challenges.length}`, ROW.x + 26, y + 112, `bold 13px ${MONO}`, done === r.challenges.length ? '#4ade80' : '#ffd21f');
        const best = saveStore.current.conquest.best[r.id];
        text(g, best?.cleared ? 'CLEARED' : best ? 'not cleared yet' : 'not played yet', ROW.x + ROW.w - 16, y + 112, `bold 13px ${MONO}`, best?.cleared ? '#4ade80' : '#8fa0c8', 'right');
      } else {
        text(g, r.unlockHint, ROW.x + 26, y + 66, `13px ${MONO}`, '#8fa0c8');
      }
    });
    button(g, BACK, 'BACK', '#ffffff');
  }
}

// --- one region: challenges and start ----------------------------------------------------------------------------

const START: Btn = { x: 30, y: 856, w: 300, h: 56 };
const BACK2: Btn = { x: W - 190, y: 856, w: 160, h: 56 };

/** Progress text of an unfinished challenge ("best 143 / 200"), from the save. */
function progress(r: RegionDefinition, c: ChallengeDef): string {
  const b = saveStore.current.conquest.best[r.id];
  const m = c.metric;
  if (m.kind === 'kills') return `best ${b?.kills ?? 0} / ${m.n}`;
  if (m.kind === 'time') return `best ${fmtTime(b?.timeSec ?? 0)} / ${fmtTime(m.seconds)}`;
  if (m.kind === 'hidden') return `best ${b?.hidden ?? 0} / ${m.n}`;
  return '';
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class RegionScreen {
  private t = 0;

  constructor(readonly region: RegionDefinition) {}

  update(dt: number, host: NodeHost): 'back' | 'start' | null {
    this.t += dt;
    const tap = host.takeTap();
    const key = host.takeKey();
    if (this.t < LOCKOUT) return null;
    if (key === 'Escape') return 'back';
    if (key === 'Enter' || key === 'Space') return 'start';
    if (!tap) return null;
    if (hit(START, tap)) return 'start';
    if (hit(BACK2, tap)) return 'back';
    return null;
  }

  draw(g: CanvasRenderingContext2D): void {
    const r = this.region;
    dim(g);
    drawCentered(g, r.name, 62, `bold 36px ${MONO}`, r.theme.accent);
    wrap(r.blurb, 64).forEach((l, i) => drawCentered(g, l, 92 + i * 17, `12px ${MONO}`, '#b6c2e0'));
    const enemies = [...r.roster.bosses, ...r.roster.hazards].join('  ·  ');
    wrap(enemies, 70).slice(0, 2).forEach((l, i) => drawCentered(g, l, 148 + i * 14, `11px ${MONO}`, '#8fa0c8'));
    drawCentered(g, 'about 15 to 25 minutes  ·  one life  ·  cards after every stage', 182, `12px ${MONO}`, '#6ee7ff');
    const done = new Set(saveStore.challengesDone(r.id));
    drawCentered(g, `CHALLENGES ${done.size}/${r.challenges.length}`, 204, `bold 15px ${MONO}`, '#ffd21f');
    // The cards share the space between the header and the buttons (the list never runs under them); the reward line follows the description.
    const gap = 6;
    const top = 216;
    const n = Math.max(1, r.challenges.length);
    const rowH = Math.min(104, Math.floor((846 - top - gap * (n - 1)) / n));
    r.challenges.forEach((c, i) => {
      const y = top + i * (rowH + gap);
      const ok = done.has(c.id);
      g.save();
      g.fillStyle = ok ? '#0c1c18' : '#0b1424';
      g.fillRect(30, y, W - 60, rowH);
      g.fillStyle = ok ? '#4ade80' : r.theme.accent;
      g.fillRect(30, y, 6, rowH);
      g.restore();
      text(g, c.name, 52, y + 24, `bold 17px ${MONO}`, ok ? '#7dffb0' : '#ffffff');
      text(g, ok ? 'DONE' : progress(r, c), W - 46, y + 24, `bold 13px ${MONO}`, ok ? '#4ade80' : '#ffd21f', 'right');
      const lines = wrap(c.desc, 54).slice(0, 2);
      lines.forEach((l, k) => text(g, l, 52, y + 45 + k * 16, `13px ${MONO}`, '#c9d3ee'));
      const rw = c.rewards.map((u) => describeUnlock(u).name).join(', ');
      text(g, `${ok ? 'unlocked' : 'unlocks'}: ${clip(rw, 48)}`, 52, y + 45 + lines.length * 16 + 8, `12px ${MONO}`, ok ? '#4ade80' : '#6ee7ff');
    });
    button(g, START, 'CHOOSE SHIP  [ENTER]', '#ffd21f');
    button(g, BACK2, 'BACK', '#ffffff');
  }
}

// --- result ------------------------------------------------------------------------------------------------------

/** The end of a Conquest run: won or lost, the figures, and every challenge it completed with what that unlocked. */
export function drawConquestResult(g: CanvasRenderingContext2D, t: number, res: ConquestResult, region: RegionDefinition): void {
  dim(g, 0.7);
  const won = res.outcome === 'won';
  drawCentered(g, won ? 'BASE CAPTURED' : 'RUN OVER', 190, `bold 44px ${MONO}`, won ? '#ffd21f' : '#ff5a5a');
  drawCentered(g, region.name, 224, `bold 16px ${MONO}`, region.theme.accent);
  drawCentered(g, won ? 'the flagship is down' : 'your ship was destroyed', 252, `15px ${MONO}`, '#ffffff');
  const rows: [string, string][] = [
    ['enemies defeated', String(res.kills)],
    ['time survived', fmtTime(res.timeSec)],
    ['hidden items', `${res.hidden} / ${res.hiddenTotal}`],
  ];
  rows.forEach(([k, v], i) => {
    text(g, k, 110, 304 + i * 26, `15px ${MONO}`, '#8fa0c8');
    text(g, v, W - 110, 304 + i * 26, `bold 15px ${MONO}`, '#ffffff', 'right');
  });
  drawCentered(g, res.earned.length ? 'CHALLENGES COMPLETE' : 'no new challenges this run', 408, `bold 16px ${MONO}`, res.earned.length ? '#4ade80' : '#8fa0c8');
  res.earned.forEach((c, i) => {
    const y = 440 + i * 56;
    drawCentered(g, c.name, y, `bold 16px ${MONO}`, '#7dffb0');
    drawCentered(g, c.rewards.map((u) => `unlocked: ${describeUnlock(u).name}`).join('   '), y + 20, `12px ${MONO}`, '#6ee7ff');
  });
  const left = region.challenges.length - saveStore.challengesDone(region.id).length;
  drawCentered(g, left > 0 ? `${left} challenge${left > 1 ? 's' : ''} still open` : 'every challenge of this region is done', 760, `13px ${MONO}`, '#ffd21f');
  if (t > 1 && Math.floor(t * 2) % 2 === 0) drawCentered(g, 'tap or press any key', 820, `18px ${MONO}`, '#ffffff');
}
