/** Campaign menu screens: campaign select, level select, briefing, story overlay and result. 540x960 portrait, tap or keyboard. */
import { H, W } from '../config';
import type { NodeHost } from '../flow/node';
import { saveStore } from '../save';
import { formatTime } from './medals';
import type { CampaignDefinition, CampaignLevel, LevelResult } from './types';
import { backdrop, button, hit, medalIcon, MEDAL_COLOR, MONO, text, wrap, type Btn } from './ui';

/** Seconds a screen ignores input after opening, so the press that opened it cannot act on it. */
const LOCKOUT = 0.25;

const BACK: Btn = { x: 30, y: 856, w: 150, h: 56 };

/** Level `i` is playable when it is the first, the one before has a medal, or the debug unlock is on. */
export function levelUnlocked(c: CampaignDefinition, i: number, unlockAll: boolean): boolean {
  return unlockAll || i === 0 || !!saveStore.current.medals[c.levels[i - 1].id]?.best;
}

// --- story overlay ----------------------------------------------------------------------------------------

/** Paragraphs of story or briefing text over the starfield; any tap or Enter continues. */
export class StoryScreen {
  private t = 0;

  constructor(
    private readonly title: string,
    private readonly paragraphs: string[],
  ) {}

  /** Returns true when the player continues. */
  update(dt: number, host: NodeHost): boolean {
    this.t += dt;
    const tap = host.takeTap();
    const key = host.takeKey();
    return this.t > LOCKOUT && (!!tap || key === 'Enter' || key === 'Space' || key === 'Escape');
  }

  draw(g: CanvasRenderingContext2D): void {
    backdrop(g, 0.85);
    text(g, this.title, W / 2, 150, `bold 34px ${MONO}`, '#ffd21f', 'center');
    g.save();
    g.font = `17px ${MONO}`;
    let y = 220;
    for (const p of this.paragraphs) {
      for (const line of wrap(g, p, W - 90)) {
        text(g, line, 45, y, `17px ${MONO}`, '#e6ecff');
        y += 26;
      }
      y += 16;
    }
    g.restore();
    if (this.t > LOCKOUT && Math.floor(this.t * 2) % 2 === 0) text(g, 'tap to continue', W / 2, 880, `18px ${MONO}`, '#ffffff', 'center');
  }
}

// --- campaign select --------------------------------------------------------------------------------------

export type CampaignSelectResult = { kind: 'open'; campaign: CampaignDefinition } | { kind: 'back' } | null;

export class CampaignSelectScreen {
  private sel = 0;
  private t = 0;
  private readonly rowY = (i: number): number => 160 + i * 112;

  constructor(private readonly campaigns: CampaignDefinition[]) {}

  update(dt: number, host: NodeHost): CampaignSelectResult {
    this.t += dt;
    const tap = host.takeTap();
    const key = host.takeKey();
    if (this.t < LOCKOUT) return null;
    if (key === 'ArrowUp') this.sel = (this.sel + this.campaigns.length - 1) % this.campaigns.length;
    if (key === 'ArrowDown') this.sel = (this.sel + 1) % this.campaigns.length;
    if (key === 'Escape') return { kind: 'back' };
    if (key === 'Enter' || key === 'Space') return { kind: 'open', campaign: this.campaigns[this.sel] };
    if (tap) {
      if (hit(BACK, tap)) return { kind: 'back' };
      const i = this.campaigns.findIndex((_, k) => hit({ x: 30, y: this.rowY(k), w: W - 60, h: 100 }, tap));
      if (i >= 0) {
        this.sel = i;
        return { kind: 'open', campaign: this.campaigns[i] };
      }
    }
    return null;
  }

  draw(g: CanvasRenderingContext2D): void {
    backdrop(g, 0.7);
    text(g, 'CAMPAIGN', W / 2, 90, `bold 40px ${MONO}`, '#ffd21f', 'center');
    text(g, 'choose a campaign', W / 2, 122, `15px ${MONO}`, '#6ee7ff', 'center');
    if (!saveStore.persistent) text(g, 'in-memory save: nothing is stored', W / 2, 142, `12px ${MONO}`, '#ff8a5a', 'center');
    this.campaigns.forEach((c, i) => {
      const y = this.rowY(i);
      const done = c.levels.filter((l) => saveStore.current.medals[l.id]?.best).length;
      const golds = c.levels.filter((l) => saveStore.current.medals[l.id]?.best === 'gold').length;
      g.save();
      g.fillStyle = i === this.sel ? '#152a47' : '#0b1424';
      g.fillRect(30, y, W - 60, 100);
      g.lineWidth = 3;
      g.strokeStyle = i === this.sel ? '#ffd21f' : '#26324d';
      g.strokeRect(31.5, y + 1.5, W - 63, 97);
      g.restore();
      text(g, c.name, 52, y + 42, `bold 28px ${MONO}`, '#ffffff');
      text(g, `${done}/${c.levels.length} levels completed   ${golds} gold`, 52, y + 72, `14px ${MONO}`, '#8fa0c8');
    });
    button(g, BACK, 'BACK', '#ffffff');
  }
}

// --- level select -----------------------------------------------------------------------------------------

export type LevelSelectResult = { kind: 'start'; index: number } | { kind: 'story' } | { kind: 'back' } | null;

const ROW_Y0 = 150;
const ROW_H = 62;
const ROW_STEP = 68;
const STORY_BTN: Btn = { x: 195, y: 856, w: 150, h: 56 };
const START_BTN: Btn = { x: 360, y: 856, w: 150, h: 56 };

export class LevelSelectScreen {
  sel = 0;
  private t = 0;

  constructor(
    private readonly campaign: CampaignDefinition,
    private readonly unlockAll: () => boolean,
  ) {
    // Open on the first level without a medal that is playable, else the first one.
    const next = campaign.levels.findIndex((l, i) => levelUnlocked(campaign, i, false) && !saveStore.current.medals[l.id]?.best);
    this.sel = Math.max(0, next);
  }

  update(dt: number, host: NodeHost): LevelSelectResult {
    this.t += dt;
    const tap = host.takeTap();
    const key = host.takeKey();
    if (this.t < LOCKOUT) return null;
    const n = this.campaign.levels.length;
    const ok = (i: number): boolean => levelUnlocked(this.campaign, i, this.unlockAll());
    if (key === 'ArrowUp') this.sel = (this.sel + n - 1) % n;
    if (key === 'ArrowDown') this.sel = (this.sel + 1) % n;
    if (key === 'Escape') return { kind: 'back' };
    if (key === 'KeyS') return { kind: 'story' };
    if ((key === 'Enter' || key === 'Space') && ok(this.sel)) return { kind: 'start', index: this.sel };
    if (tap) {
      if (hit(BACK, tap)) return { kind: 'back' };
      if (hit(STORY_BTN, tap)) return { kind: 'story' };
      if (hit(START_BTN, tap) && ok(this.sel)) return { kind: 'start', index: this.sel };
      const i = this.campaign.levels.findIndex((_, k) => hit({ x: 30, y: ROW_Y0 + k * ROW_STEP, w: W - 60, h: ROW_H }, tap));
      if (i >= 0) {
        if (i === this.sel && ok(i)) return { kind: 'start', index: i };
        this.sel = i;
      }
    }
    return null;
  }

  draw(g: CanvasRenderingContext2D): void {
    backdrop(g, 0.78);
    text(g, this.campaign.name.toUpperCase(), W / 2, 76, `bold 34px ${MONO}`, '#ffd21f', 'center');
    text(g, 'select a level', W / 2, 106, `15px ${MONO}`, '#6ee7ff', 'center');
    if (!saveStore.persistent) text(g, 'in-memory save: nothing is stored', W / 2, 128, `12px ${MONO}`, '#ff8a5a', 'center');
    this.campaign.levels.forEach((l, i) => {
      const y = ROW_Y0 + i * ROW_STEP;
      const open = levelUnlocked(this.campaign, i, this.unlockAll());
      const rec = saveStore.current.medals[l.id];
      g.save();
      g.fillStyle = i === this.sel ? '#152a47' : open ? '#0b1424' : '#080d18';
      g.fillRect(30, y, W - 60, ROW_H);
      g.lineWidth = 3;
      g.strokeStyle = i === this.sel ? '#ffd21f' : '#26324d';
      g.strokeRect(31.5, y + 1.5, W - 63, ROW_H - 3);
      g.restore();
      medalIcon(g, 66, y + ROW_H / 2, 16, rec?.best);
      text(g, open ? l.name : '???', 100, y + 28, `bold 20px ${MONO}`, open ? '#ffffff' : '#6b7488');
      const sub = !open ? 'LOCKED: complete the previous level' : rec?.bestTimeMs !== undefined ? `best ${formatTime(rec.bestTimeMs / 1000)}${rec.bonus ? '   bonus done' : ''}` : 'not completed';
      text(g, sub, 100, y + 49, `13px ${MONO}`, open ? '#8fa0c8' : '#ff8a5a');
    });
    // Detail of the selected level.
    const l = this.campaign.levels[this.sel];
    const open = levelUnlocked(this.campaign, this.sel, this.unlockAll());
    const dy = ROW_Y0 + Math.max(this.campaign.levels.length, 3) * ROW_STEP + 14;
    g.save();
    g.fillStyle = 'rgba(11, 20, 36, 0.9)';
    g.fillRect(30, dy, W - 60, 828 - dy);
    g.restore();
    if (open) {
      text(g, 'BONUS OBJECTIVE', 46, dy + 26, `bold 13px ${MONO}`, '#ffd21f');
      g.save();
      g.font = `14px ${MONO}`;
      wrap(g, l.medals.bonus.text, W - 92).slice(0, 2).forEach((ln, k) => text(g, ln, 46, dy + 48 + k * 18, `14px ${MONO}`, '#ffffff'));
      g.restore();
      const m = l.medals;
      (['bronze', 'silver', 'gold'] as const).forEach((medal, k) => {
        const x = 46 + k * 160;
        medalIcon(g, x + 8, dy + 100, 8, medal);
        text(g, `${formatTime(m[medal])}`, x + 24, dy + 105, `13px ${MONO}`, '#e6ecff');
      });
      text(g, 'gold: no deaths and (gold time or bonus)', 46, dy + 132, `12px ${MONO}`, '#8fa0c8');
    } else text(g, 'Complete the previous level to unlock.', 46, dy + 40, `14px ${MONO}`, '#ff8a5a');
    button(g, BACK, 'BACK', '#ffffff');
    button(g, STORY_BTN, 'STORY', '#6ee7ff');
    button(g, START_BTN, 'PLAY', '#ffd21f', open);
    void H;
  }
}

// --- briefing -----------------------------------------------------------------------------------------------

export type BriefingResult = 'launch' | 'back' | null;
const LAUNCH_BTN: Btn = { x: 195, y: 856, w: 315, h: 56 };

export class BriefingScreen {
  private t = 0;

  constructor(private readonly level: CampaignLevel) {}

  update(dt: number, host: NodeHost): BriefingResult {
    this.t += dt;
    const tap = host.takeTap();
    const key = host.takeKey();
    if (this.t < LOCKOUT) return null;
    if (key === 'Escape') return 'back';
    if (key === 'Enter' || key === 'Space') return 'launch';
    if (tap) {
      if (hit(BACK, tap)) return 'back';
      if (hit(LAUNCH_BTN, tap)) return 'launch';
    }
    return null;
  }

  draw(g: CanvasRenderingContext2D): void {
    const l = this.level;
    backdrop(g, 0.85);
    text(g, 'BRIEFING', W / 2, 70, `bold 16px ${MONO}`, '#6ee7ff', 'center');
    text(g, l.name, W / 2, 112, `bold 34px ${MONO}`, '#ffd21f', 'center');
    g.save();
    let y = 170;
    g.font = `16px ${MONO}`;
    for (const p of l.briefing) {
      for (const line of wrap(g, p, W - 90)) {
        text(g, line, 45, y, `16px ${MONO}`, '#e6ecff');
        y += 24;
      }
      y += 12;
    }
    g.restore();
    y = Math.max(y + 10, 560);
    g.save();
    g.fillStyle = 'rgba(11, 20, 36, 0.95)';
    g.fillRect(30, y, W - 60, 190);
    g.lineWidth = 2;
    g.strokeStyle = '#ffd21f';
    g.strokeRect(31, y + 1, W - 62, 188);
    g.restore();
    text(g, 'BONUS OBJECTIVE', 46, y + 28, `bold 14px ${MONO}`, '#ffd21f');
    g.save();
    g.font = `15px ${MONO}`;
    wrap(g, l.medals.bonus.text, W - 92).slice(0, 2).forEach((ln, k) => text(g, ln, 46, y + 52 + k * 20, `15px ${MONO}`, '#ffffff'));
    g.restore();
    (['bronze', 'silver', 'gold'] as const).forEach((medal, k) => {
      const x = 46 + k * 160;
      medalIcon(g, x + 10, y + 112, 10, medal);
      text(g, `${medal} ${formatTime(l.medals[medal])}`, x + 28, y + 117, `14px ${MONO}`, '#e6ecff');
    });
    text(g, 'Gold needs zero deaths and the gold time or the bonus.', 46, y + 154, `12px ${MONO}`, '#8fa0c8');
    text(g, 'Death: objective restarts at full hull, timer runs on.', 46, y + 172, `12px ${MONO}`, '#8fa0c8');
    button(g, BACK, 'BACK', '#ffffff');
    button(g, LAUNCH_BTN, 'LAUNCH', '#ffd21f');
  }
}

// --- result -------------------------------------------------------------------------------------------------

export type ResultAction = 'retry' | 'continue' | null;
const RETRY_BTN: Btn = { x: 30, y: 856, w: 230, h: 56 };
const CONTINUE_BTN: Btn = { x: W - 260, y: 856, w: 230, h: 56 };

export class ResultScreen {
  private t = 0;

  constructor(
    private readonly result: LevelResult,
    private readonly level: CampaignLevel,
  ) {}

  update(dt: number, host: NodeHost): ResultAction {
    this.t += dt;
    const tap = host.takeTap();
    const key = host.takeKey();
    if (this.t < 0.6) return null;
    if (key === 'KeyR') return 'retry';
    if (key === 'Enter' || key === 'Space' || key === 'Escape') return 'continue';
    if (tap) {
      if (hit(RETRY_BTN, tap)) return 'retry';
      if (hit(CONTINUE_BTN, tap)) return 'continue';
    }
    return null;
  }

  draw(g: CanvasRenderingContext2D): void {
    const r = this.result;
    const m = this.level.medals;
    backdrop(g, 0.82);
    text(g, 'LEVEL COMPLETE', W / 2, 110, `bold 40px ${MONO}`, '#ffd21f', 'center');
    text(g, this.level.name, W / 2, 144, `16px ${MONO}`, '#6ee7ff', 'center');
    medalIcon(g, W / 2, 230, 56, r.medal);
    text(g, `${r.medal.toUpperCase()} MEDAL`, W / 2, 330, `bold 26px ${MONO}`, MEDAL_COLOR[r.medal], 'center');
    if (r.goldRoute) text(g, r.goldRoute === 'time' ? 'gold by time' : 'gold by the bonus objective', W / 2, 354, `13px ${MONO}`, '#8fa0c8', 'center');
    const rows: [string, string, string][] = [
      ['TIME', formatTime(r.timeMs / 1000), r.newBestTime ? 'NEW BEST' : ''],
      ['DEATHS', String(r.deaths), r.deaths === 0 ? 'clean' : 'no gold'],
      ['BONUS', r.bonusDone ? 'ACHIEVED' : 'missed', ''],
    ];
    rows.forEach(([k, v, note], i) => {
      const y = 420 + i * 44;
      text(g, k, 70, y, `bold 16px ${MONO}`, '#8fa0c8');
      text(g, v, 250, y, `bold 22px ${MONO}`, k === 'BONUS' ? (r.bonusDone ? '#4ade80' : '#ff8a5a') : '#ffffff');
      if (note) text(g, note, W - 50, y, `bold 13px ${MONO}`, note === 'NEW BEST' ? '#4ade80' : '#8fa0c8', 'right');
    });
    g.save();
    g.font = `13px ${MONO}`;
    wrap(g, m.bonus.text, W - 100).slice(0, 2).forEach((ln, k) => text(g, ln, 70, 556 + k * 18, `13px ${MONO}`, '#8fa0c8'));
    g.restore();
    (['bronze', 'silver', 'gold'] as const).forEach((medal, k) => {
      const x = 70 + k * 150;
      medalIcon(g, x, 622, 9, medal);
      text(g, formatTime(m[medal]), x + 18, 627, `13px ${MONO}`, '#e6ecff');
    });
    r.unlocked.forEach((u, i) => text(g, `UNLOCKED: ${u}`, W / 2, 700 + i * 26, `bold 16px ${MONO}`, '#4ade80', 'center'));
    button(g, RETRY_BTN, 'RETRY [R]', '#6ee7ff');
    button(g, CONTINUE_BTN, 'CONTINUE', '#ffd21f');
  }
}
