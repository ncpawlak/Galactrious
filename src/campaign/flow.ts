/**
 * The campaign menu and play state machine, owned by `Run` as its `campaign` phase:
 * campaign select -> (story intro on first open) -> level select -> briefing -> play -> result -> level select.
 */
import type { NodeHost } from '../flow/node';
import { applyUnlocks, FALLEN_PEACE_UNLOCKS, UnlockRevealScreen, type UnlockItem } from '../finale/unlocks';
import { saveStore } from '../save';
import { CAMPAIGNS, findLevel } from './content';
import { BriefingScreen, CampaignSelectScreen, LevelSelectScreen, ResultScreen, StoryScreen } from './screens';
import { CampaignSession } from './session';
import type { CampaignDefinition, CampaignLevel } from './types';

type Sub = 'campaigns' | 'story' | 'levels' | 'briefing' | 'play' | 'result' | 'unlocks';

/** What the flow needs from `Run`: a clean run state with the campaign's ship, and the player's own selection back afterwards. */
export interface RunBridge {
  prepare(): void;
  restore(): void;
}

export class CampaignFlow {
  sub: Sub = 'campaigns';
  campaign: CampaignDefinition | null = null;
  session: CampaignSession | null = null;
  /** Debug: every level counts as unlocked (not saved). */
  unlockAll = false;
  private campaigns = new CampaignSelectScreen(CAMPAIGNS);
  private levels: LevelSelectScreen | null = null;
  private story: StoryScreen | null = null;
  private storyNext: Sub = 'levels';
  private briefing: BriefingScreen | null = null;
  private resultScreen: ResultScreen | null = null;
  private reveal: UnlockRevealScreen | null = null;
  private level: CampaignLevel | null = null;
  private levelIndex = 0;
  private prepared = false;

  constructor(
    private readonly host: NodeHost,
    private readonly bridge: RunBridge,
  ) {}

  /** Open the campaign menu (from the title). */
  open(): void {
    this.shutdown();
    this.campaigns = new CampaignSelectScreen(CAMPAIGNS);
    this.sub = 'campaigns';
  }

  /** Stop whatever is running and give the player's own ship selection back. Safe to call any time. */
  shutdown(): void {
    this.session?.abort();
    this.session = null;
    this.release();
  }

  private release(): void {
    if (this.prepared) this.bridge.restore();
    this.prepared = false;
  }

  private openCampaign(c: CampaignDefinition): void {
    this.campaign = c;
    this.levels = new LevelSelectScreen(c, () => this.unlockAll);
    const fresh = !c.levels.some((l) => saveStore.current.medals[l.id]?.best);
    if (fresh) this.showStory(c, 'levels');
    else this.sub = 'levels';
  }

  private showStory(c: CampaignDefinition, next: Sub): void {
    this.story = new StoryScreen(c.name.toUpperCase(), c.intro);
    this.storyNext = next;
    this.sub = 'story';
  }

  private startBriefing(index: number): void {
    this.levelIndex = index;
    this.level = this.campaign!.levels[index];
    this.briefing = new BriefingScreen(this.level);
    this.sub = 'briefing';
  }

  /** Start playing a level now (the briefing launch and the debug start). */
  startPlay(campaign: CampaignDefinition, index: number, objective = 0): void {
    this.shutdown();
    this.campaign = campaign;
    this.levelIndex = index;
    this.level = campaign.levels[index];
    this.bridge.prepare();
    this.prepared = true;
    this.session = new CampaignSession(campaign, this.level, this.host, objective);
    this.session.begin();
    this.sub = 'play';
  }

  /**
   * Show the unlock reveal screen for a campaign's `unlocks` (the debug trigger; the real flow shows it after the final result). Writes the
   * unlocks into the save; items that were already unlocked are listed without the NEW tag. "fallen-peace" falls back to `FALLEN_PEACE_UNLOCKS`
   * until chapter 7 sets `CampaignDefinition.unlocks`.
   */
  showUnlocks(campaignId: string): UnlockItem[] {
    const c = CAMPAIGNS.find((x) => x.id === campaignId);
    if (!c) throw new Error(`unknown campaign "${campaignId}" (${CAMPAIGNS.map((x) => x.id).join(', ')})`);
    const specs = c.unlocks ?? (campaignId === 'fallen-peace' ? FALLEN_PEACE_UNLOCKS : []);
    if (specs.length === 0) throw new Error(`campaign "${campaignId}" has no unlocks`);
    this.shutdown();
    this.campaign = c;
    const items = applyUnlocks(specs);
    this.reveal = new UnlockRevealScreen(items);
    this.levels = new LevelSelectScreen(c, () => this.unlockAll);
    this.sub = 'unlocks';
    return items;
  }

  /** Debug: start a level by id, skipping the menus. */
  startLevel(levelId: string, objective = 0): void {
    const f = findLevel(levelId);
    if (!f) throw new Error(`unknown campaign level "${levelId}" (${CAMPAIGNS.flatMap((c) => c.levels.map((l) => l.id)).join(', ')})`);
    this.levels = new LevelSelectScreen(f.campaign, () => this.unlockAll);
    this.startPlay(f.campaign, f.index, objective);
  }

  /** Returns 'exit' when the player leaves the campaign for the title. */
  update(dt: number): 'exit' | null {
    const host = this.host;
    switch (this.sub) {
      case 'campaigns': {
        const r = this.campaigns.update(dt, host);
        if (r?.kind === 'back') return 'exit';
        if (r?.kind === 'open') this.openCampaign(r.campaign);
        return null;
      }
      case 'story':
        if (this.story!.update(dt, host)) {
          this.levels = this.levels ?? new LevelSelectScreen(this.campaign!, () => this.unlockAll);
          this.sub = this.storyNext;
        }
        return null;
      case 'levels': {
        const r = this.levels!.update(dt, host);
        if (r?.kind === 'back') this.sub = 'campaigns';
        else if (r?.kind === 'story') this.showStory(this.campaign!, 'levels');
        else if (r?.kind === 'start') this.startBriefing(r.index);
        return null;
      }
      case 'briefing': {
        const r = this.briefing!.update(dt, host);
        if (r === 'back') this.sub = 'levels';
        else if (r === 'launch') this.startPlay(this.campaign!, this.levelIndex);
        return null;
      }
      case 'play': {
        const s = this.session!;
        let key: string | null;
        while ((key = host.takeKey())) {
          if (key === 'Escape') {
            this.shutdown();
            this.levels = new LevelSelectScreen(this.campaign!, () => this.unlockAll);
            this.sub = 'levels';
            return null;
          }
        }
        s.update(dt);
        if (s.result) {
          this.release();
          this.resultScreen = new ResultScreen(s.result, this.level!);
          this.sub = 'result';
        }
        return null;
      }
      case 'result': {
        const r = this.resultScreen!.update(dt, host);
        if (r === 'retry') this.startPlay(this.campaign!, this.levelIndex);
        else if (r === 'continue') {
          const fresh = this.session?.result?.newUnlocks;
          this.session = null;
          this.levels = new LevelSelectScreen(this.campaign!, () => this.unlockAll);
          if (fresh && fresh.length > 0) {
            // Already written to the save when the level finished; the reveal only shows them.
            this.reveal = new UnlockRevealScreen(fresh.map((spec) => ({ spec, isNew: true })));
            this.sub = 'unlocks';
          } else this.sub = 'levels';
        }
        return null;
      }
      case 'unlocks':
        if (this.reveal!.update(dt, host)) {
          this.reveal = null;
          this.sub = 'levels';
        }
        return null;
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    switch (this.sub) {
      case 'campaigns':
        this.campaigns.draw(g);
        break;
      case 'story':
        this.story!.draw(g);
        break;
      case 'levels':
        this.levels!.draw(g);
        break;
      case 'briefing':
        this.briefing!.draw(g);
        break;
      case 'play':
        this.session!.draw(g);
        break;
      case 'result':
        this.resultScreen!.draw(g);
        break;
      case 'unlocks':
        this.reveal!.draw(g);
        break;
    }
  }

  /** True while the combat sim should be showing (a level is being played). */
  get playing(): boolean {
    return this.sub === 'play';
  }
}
