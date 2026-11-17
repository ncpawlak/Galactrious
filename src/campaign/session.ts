/**
 * One play of a campaign level: walks the level's objectives, keeps the level timer and the per-attempt counters,
 * restarts the current objective on death (the checkpoint), runs scripted beats, and ends with a `LevelResult`.
 * It reaches the game only through the `NodeHost`.
 *
 * Rules (DESIGN.md "Campaign 1: Fallen Peace", "Decisions"):
 * - A checkpoint is the start of each objective. Dying (or failing an objective) restarts it with a full heal; the units,
 *   the objective state and the objective's beats reset; the level timer keeps running; the death is counted.
 * - A death costs the counters of that objective attempt too (kills, hits... of the failed attempt are dropped); the
 *   counters of completed objectives stay.
 * - `forceDestroyPlayer` (the scripted shoot-down) is not a death.
 */
import { H, W } from '../config';
import type { CombatCounters, NodeHost } from '../flow/node';
import { applyUnlocks } from '../finale/unlocks';
import { fallbackSnapshot } from '../finale/fallback';
import { shipHasEmpireTech } from '../finale/system';
import { saveStore } from '../save';
import { BeatRunner } from './beats';
import { scrollHooks } from './hooks';
import { addCounters, bonusAlive, bonusProgress, computeMedal, diffCounters, emptyCounters, evaluateBonus, formatTime, paceMedal } from './medals';
import { createObjective, type ObjectiveEnv, type ObjectiveHandler } from './objectives';
import { loadSnapshot } from './snapshot';
import { MEDAL_COLOR, MONO } from './ui';
import type { Beat, BeatAction, CampaignDefinition, CampaignLevel, LevelCounters, LevelResult, Medal, SpawnSpec } from './types';

const SUBTITLE_SECONDS = 4;
const BANNER_SECONDS = 2.6;
const RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 };

interface Subtitle {
  text: string;
  speaker?: string;
  left: number;
  max: number;
}

/** Greedy word wrap to `max` characters per line. */
function wrapLine(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if (cur && (cur + ' ' + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out;
}

export class CampaignSession {
  /** Level time in seconds: runs from the first update, through deaths, until the level ends. */
  time = 0;
  deaths = 0;
  /** Index of the current objective. */
  index = 0;
  result: LevelResult | null = null;
  /** Last reason an attempt failed outside a ship death (shown briefly). */
  private note: { text: string; left: number } | null = null;
  private handler!: ObjectiveHandler;
  private objTime = 0;
  private objBeats: BeatRunner | null = null;
  private readonly levelBeats: BeatRunner | null;
  /** Counters of the completed objectives, plus the live ones of this attempt (`attemptBase` is the host's total at the checkpoint). */
  private completed: LevelCounters = emptyCounters();
  private attemptBase: CombatCounters = { kills: 0, hits: 0, damage: 0, roomsDestroyed: 0, killsByTag: {} };
  private attemptExtra: LevelCounters = emptyCounters();
  private ship: { id: string; loadout?: { main: string; aux: string[] } };
  private forced = false;
  private pendingJump: string | null = null;
  private pendingComplete = false;
  private pendingFail: string | null = null;
  private subtitles: Subtitle[] = [];
  private banner = 0;
  private started = false;

  constructor(
    readonly campaign: CampaignDefinition,
    readonly level: CampaignLevel,
    private readonly host: NodeHost,
    private readonly startIndex = 0,
  ) {
    this.ship = { ...level.ship };
    this.levelBeats = level.beats ? new BeatRunner(level.beats, { perform: (a) => this.perform(a) }) : null;
  }

  get objective() {
    return this.level.objectives[this.index];
  }

  private env(): ObjectiveEnv {
    return {
      host: this.host,
      time: this.objTime,
      fail: (reason) => (this.pendingFail ??= reason),
      bump: (c, n = 1) => {
        this.attemptExtra[c] += n;
      },
    };
  }

  /** Counters of the current attempt: the host's deltas since the checkpoint plus what objectives bumped. */
  private attemptCounters(): LevelCounters {
    const lv = (c: CombatCounters): LevelCounters => ({ ...emptyCounters(), ...c, killsByTag: { ...c.killsByTag } });
    const d = diffCounters(lv(this.host.counters()), lv(this.attemptBase));
    d.collected = this.attemptExtra.collected;
    d.detections = this.attemptExtra.detections;
    return d;
  }

  /** Whole-level counters so far: completed objectives plus the current attempt. */
  counters(): LevelCounters {
    return addCounters(this.completed, this.attemptCounters());
  }

  // --- flow -----------------------------------------------------------------------------------------

  begin(): void {
    this.started = true;
    this.applyShip();
    this.startObjective(this.startIndex, 'first');
  }

  private applyShip(): void {
    this.host.setShip(this.ship.id, this.ship.loadout);
  }

  private startObjective(i: number, how: 'first' | 'advance' | 'restart'): void {
    this.index = i;
    const def = this.level.objectives[i];
    this.handler = createObjective(def);
    this.forced = false;
    this.pendingJump = this.pendingFail = null;
    this.pendingComplete = false;
    if (how === 'restart') {
      // A mid-objective ship swap is undone: the checkpoint has the ship the objective started with.
      this.ship = { ...this.checkpointShip };
      this.applyShip();
    }
    const keepHealth = how === 'advance' && this.host.shipAlive();
    let restore;
    if (def.type === 'bossFight' && def.restoreSlot) {
      let snap = loadSnapshot(def.restoreSlot);
      if (!snap || snap.bossId !== def.bossId) snap = fallbackSnapshot(def.bossId); // no chapter 1 on record: a generated disabled ship
      if (snap) restore = def.coreHp !== undefined ? { ...snap, coreHp: def.coreHp } : snap;
    }
    this.host.startCombat({ bossId: def.type === 'bossFight' ? def.bossId : undefined, keepHealth, restore, scroll: def.scroll });
    // startCombat unlocks the weapons; a scroll level may lock them itself, so only ever lock here.
    if (def.weaponsLocked) this.host.setWeaponsLocked(true);
    this.objTime = 0;
    const live = this.host.counters();
    this.attemptBase = { ...live, killsByTag: { ...live.killsByTag } };
    this.attemptExtra = emptyCounters();
    this.checkpointShip = { ...this.ship };
    for (const s of def.spawns ?? []) this.spawn(s);
    const beats = def.type === 'bossFight' && def.armourResonance !== undefined ? [...(def.beats ?? []), { at: def.armourResonance, do: 'armourResonance' } as Beat] : def.beats;
    this.objBeats = beats ? new BeatRunner(beats, { perform: (a) => this.perform(a) }) : null;
    if (def.type === 'bossFight' && def.overload) this.host.setOverload(true);
    this.banner = BANNER_SECONDS;
    this.handler.start(this.env());
  }

  private checkpointShip!: { id: string; loadout?: { main: string; aux: string[] } };

  private spawn(s: SpawnSpec): void {
    if ('wave' in s) {
      this.host.spawnWaveById(s.wave, s.tag);
      return;
    }
    const n = s.count ?? 1;
    for (let k = 0; k < n; k++) this.host.spawnUnit({ unit: s.unit, x: s.x + (k - (n - 1) / 2) * (s.spacing ?? 70), y: s.y, tag: s.tag, delay: (s.delay ?? 0) + k * 0.25 });
  }

  /** Execute one beat action. */
  private perform(a: BeatAction): void {
    switch (a.do) {
      case 'text':
        this.subtitles.push({ text: a.text, speaker: a.speaker, left: a.seconds ?? SUBTITLE_SECONDS, max: a.seconds ?? SUBTITLE_SECONDS });
        break;
      case 'forceDestroyPlayer':
        this.forced = true;
        this.host.forceDestroyPlayer();
        break;
      case 'lockWeapons':
        this.host.setWeaponsLocked(a.locked ?? true);
        break;
      case 'setShip':
        this.ship = { id: a.ship, loadout: a.loadout };
        this.host.setShip(a.ship, a.loadout);
        break;
      case 'spawn':
        this.spawn(a.spawn);
        break;
      case 'setScrollSpeed':
        scrollHooks().setSpeed(a.speed, a.ease);
        break;
      case 'startObjective':
        this.pendingJump = a.objective;
        break;
      case 'completeObjective':
        this.pendingComplete = true;
        break;
      case 'assist':
        this.host.assist(a.assist);
        break;
      case 'armourResonance':
        this.host.armourResonance(shipHasEmpireTech(this.ship.id));
        break;
    }
  }

  /** Run a beat list entry by hand (debug / tests). */
  fireBeat(b: Beat): void {
    this.perform(b);
  }

  update(dt: number): void {
    if (this.result || !this.started) return;
    this.time += dt;
    this.objTime += dt;
    this.banner = Math.max(0, this.banner - dt);
    if (this.note) this.note.left -= dt;
    for (const s of this.subtitles) s.left -= dt;
    this.subtitles = this.subtitles.filter((s) => s.left > 0);

    if (this.host.combatResult() === 'lost' && !this.forced) {
      this.deaths++;
      this.startObjective(this.index, 'restart');
      return;
    }
    const dist = scrollHooks().distance();
    this.levelBeats?.update(this.time, dist);
    this.objBeats?.update(this.objTime, dist);
    const env = this.env();
    this.handler.update(dt, env);

    if (this.pendingFail !== null && !this.forced) {
      this.note = { text: this.pendingFail.toUpperCase(), left: 2.5 };
      this.deaths++;
      this.startObjective(this.index, 'restart');
      return;
    }
    if (this.pendingJump !== null) {
      const j = this.level.objectives.findIndex((o) => o.id === this.pendingJump);
      if (j < 0) throw new Error(`startObjective beat: no objective "${this.pendingJump}" in level "${this.level.id}"`);
      this.pendingJump = null;
      this.complete(j);
      return;
    }
    // A boss kill leaves the game in its 'won' state (shipAlive() is false then), which must still complete a boss objective.
    if (this.pendingComplete || (this.handler.isDone() && (this.host.shipAlive() || this.host.combatResult() === 'won'))) this.complete();
  }

  /** The current objective is done: capture its snapshot, then go on (to `jump`, or the next one, or the end of the level). */
  complete(jump?: number): void {
    const def = this.objective;
    this.completed = addCounters(this.completed, this.attemptCounters());
    if (def.type === 'bossFight' && def.snapshotSlot) {
      const snap = this.host.captureBoss();
      if (snap) saveStore.setSnapshot(def.snapshotSlot, { levelId: this.level.id, bossId: def.bossId, data: snap });
    }
    const next = jump ?? this.index + 1;
    if (next >= this.level.objectives.length) this.finish();
    else this.startObjective(next, 'advance');
  }

  /** Debug: complete the current objective now. */
  skipObjective(): void {
    this.pendingComplete = true;
  }

  private finish(): void {
    const timeMs = Math.round(this.time * 1000);
    const counters = this.completed;
    const bonusDone = evaluateBonus(this.level.medals.bonus, counters);
    const { medal, goldRoute } = computeMedal(this.level.medals, this.time, this.deaths, bonusDone);
    const prev = saveStore.current.medals[this.level.id];
    const newBestMedal = !prev?.best || RANK[medal] > RANK[prev.best];
    const newBestTime = prev?.bestTimeMs === undefined || timeMs < prev.bestTimeMs;
    saveStore.setMedal(this.level.id, medal, timeMs, bonusDone);
    const unlocked: string[] = [];
    const last = this.campaign.levels[this.campaign.levels.length - 1];
    const award = this.campaign.completionUnlock;
    if (award && last.id === this.level.id && saveStore.unlock(award.kind, award.id)) unlocked.push(award.label);
    // The campaign's real reward list (src/finale/unlocks.ts): written to the save here, shown by the reveal screen afterwards.
    const newUnlocks =
      this.campaign.unlocks && last.id === this.level.id
        ? applyUnlocks(this.campaign.unlocks)
            .filter((i) => i.isNew)
            .map((i) => i.spec)
        : undefined;
    for (const u of newUnlocks ?? []) unlocked.push(u.name ?? u.id);
    this.host.endCombat();
    scrollHooks().setSpeed(0);
    this.result = { campaignId: this.campaign.id, levelId: this.level.id, timeMs, deaths: this.deaths, medal, goldRoute, bonusDone, newBestTime, newBestMedal, unlocked, newUnlocks, counters };
  }

  /** Leave without a result (abandoned from the pause key). */
  abort(): void {
    this.host.endCombat();
    scrollHooks().setSpeed(0);
  }

  // --- HUD ------------------------------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D): void {
    if (this.result || !this.started) return;
    const env = this.env();
    this.handler.draw(g, env);
    const m = this.level.medals;
    const pace = paceMedal(m, this.time);
    g.save();
    g.textBaseline = 'alphabetic';
    // Timer box, top centre.
    const bx = W / 2 - 78;
    g.fillStyle = 'rgba(5, 6, 13, 0.72)';
    g.fillRect(bx, 8, 156, 62);
    g.textAlign = 'center';
    g.font = `bold 26px ${MONO}`;
    g.fillStyle = '#ffffff';
    g.fillText(formatTime(this.time), W / 2, 36);
    g.font = `bold 11px ${MONO}`;
    g.fillStyle = MEDAL_COLOR[pace];
    const target = pace === 'gold' ? m.gold : pace === 'silver' ? m.silver : m.bronze;
    g.fillText(`${pace.toUpperCase()} PACE  ${formatTime(target)}`, W / 2, 54);
    g.fillStyle = this.deaths > 0 ? '#ff8a5a' : '#8fa0c8';
    g.fillText(`DEATHS ${this.deaths}`, W / 2, 66);
    // Objective line.
    const def = this.objective;
    const total = this.level.objectives.length;
    const label = `${this.index + 1}/${total} ${(def.title ?? '').toUpperCase()}`.trim();
    g.fillStyle = 'rgba(5, 6, 13, 0.72)';
    g.fillRect(W / 2 - 160, 74, 320, 36);
    g.fillStyle = '#6ee7ff';
    g.font = `bold 12px ${MONO}`;
    g.fillText(label, W / 2, 89);
    g.fillStyle = '#ffffff';
    g.fillText(this.handler.hint(env), W / 2, 104);
    // Bonus progress.
    const bonus = m.bonus;
    const prog = bonusProgress(bonus, this.counters());
    const alive = bonusAlive(bonus, this.counters());
    g.font = `11px ${MONO}`;
    g.fillStyle = alive ? '#ffd21f' : '#6b7488';
    g.fillText(`BONUS ${bonus.text}${prog ? '  ' + prog : alive ? '' : '  (lost)'}`, W / 2, 124);
    // Objective banner and notes.
    if (this.banner > 0) {
      g.globalAlpha = Math.min(1, this.banner / 0.6);
      g.fillStyle = '#6ee7ff';
      g.font = `bold 30px ${MONO}`;
      g.fillText(`OBJECTIVE ${this.index + 1}`, W / 2, 330);
      g.fillStyle = '#ffffff';
      g.font = `16px ${MONO}`;
      g.fillText(def.title ?? this.handler.hint(env), W / 2, 358);
      g.globalAlpha = 1;
    }
    if (this.note && this.note.left > 0) {
      g.fillStyle = '#ff5a5a';
      g.font = `bold 20px ${MONO}`;
      g.fillText(this.note.text, W / 2, 420);
    }
    // Subtitles: wrapped to two lines.
    let sy = 170;
    for (const s of this.subtitles) {
      const line = s.speaker ? `${s.speaker}: ${s.text}` : s.text;
      const lines = wrapLine(line, 54).slice(0, 3);
      const h = 14 + lines.length * 18;
      g.globalAlpha = Math.min(1, s.left / 0.5);
      g.fillStyle = 'rgba(5, 6, 13, 0.8)';
      g.fillRect(30, sy - 14, W - 60, h);
      g.textAlign = 'left';
      g.font = `14px ${MONO}`;
      g.fillStyle = '#ffffff';
      lines.forEach((l, i) => g.fillText(l, 40, sy + 4 + i * 18));
      g.globalAlpha = 1;
      sy += h + 6;
    }
    g.restore();
    void H;
  }
}
