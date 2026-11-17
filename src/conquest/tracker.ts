import { BOSSES } from '../bosses';
import { applyUnlocks, describeUnlock, type UnlockSpec } from '../finale/unlocks';
import type { NodeDefinition, NodeHost, NodeOutcome, RunState } from '../flow/node';
import { saveStore } from '../save';
import { drawCards } from '../upgrades/stats';
import type { ChallengeDef, HiddenReward, RegionDefinition } from './types';

/** A short message over the HUD ("CHALLENGE COMPLETE", "HIDDEN CACHE FOUND"). */
export interface Toast {
  title: string;
  sub?: string;
  color: string;
  /** Seconds left. */
  left: number;
}

/** What the result screen shows. */
export interface ConquestResult {
  regionId: string;
  outcome: 'over' | 'won';
  kills: number;
  timeSec: number;
  hidden: number;
  hiddenTotal: number;
  /** Challenges first completed in this run (already saved). */
  earned: ChallengeDef[];
  /** Names of the unlocks those awarded that were new. */
  unlocks: string[];
}

const TOAST_TIME = 4;
/** Hull points restored after every cleared wave or scroll stage. */
export const REPAIR_HULL = 1;
const hiddenKey = (id: string): string => `hidden:${id}`;

interface BossWatch {
  id: string;
  /** Run time at the start of the fight, and the counters then. */
  t0: number;
  damage: number;
  rooms: number;
  turrets: number;
  turretTotal: number;
  roomHit: boolean;
}

/**
 * Measures one Conquest run and saves what it earns. It owns no combat state: kills, damage, rooms and found items are read from the host's
 * cumulative counters (`NodeHost.counters`, never reset, so everything is a delta from the baseline taken when the run starts), boss feats are
 * watched between a boss node's start and end, and a challenge is completed (saved, rewards written to the save) the moment its metric is met.
 */
export class ConquestTracker {
  readonly toasts: Toast[] = [];
  readonly earned: ChallengeDef[] = [];
  readonly newUnlocks: string[] = [];
  /** Challenge ids whose metric has been met in this run (whether or not they were done before). */
  readonly met = new Set<string>();
  readonly found = new Set<string>();
  kills = 0;
  private readonly base: { kills: number; hidden: Record<string, number>; turrets: number };
  private boss: BossWatch | null = null;
  private time = 0;
  private done = false;

  constructor(
    readonly region: RegionDefinition,
    private readonly host: NodeHost,
    private readonly state: () => RunState,
  ) {
    const c = host.counters();
    const hidden: Record<string, number> = {};
    for (const h of region.hidden) hidden[h.id] = c.killsByTag[hiddenKey(h.id)] ?? 0;
    this.base = { kills: c.kills, hidden, turrets: c.killsByTag['boss-turret'] ?? 0 };
  }

  get hiddenFound(): number {
    return this.found.size;
  }

  /** The run's node definition begins (call after the node started so the counters are the fight's baseline). */
  onNodeStart(def: NodeDefinition): void {
    if (def.type !== 'boss') return;
    const c = this.host.counters();
    const bd = BOSSES.find((b) => b.id === def.bossId);
    this.boss = {
      id: def.bossId,
      t0: this.time,
      damage: c.damage,
      rooms: c.roomsDestroyed,
      turrets: c.killsByTag['boss-turret'] ?? 0,
      turretTotal: (bd?.components ?? []).filter((s) => s.type === 'turret').length,
      roomHit: false,
    };
  }

  /** A node ended: `done` = cleared. Boss feats are judged here. */
  onNodeEnd(def: NodeDefinition, outcome: NodeOutcome | null): void {
    // Field repairs: a hull point back after every cleared stage (the run heals fully only at the start of a level).
    if (outcome === 'done' && (def.type === 'wave' || def.type === 'scroll')) this.host.healBy(REPAIR_HULL);
    const b = this.boss;
    if (def.type !== 'boss' || !b) return;
    this.boss = null;
    if (outcome !== 'done') return;
    const c = this.host.counters();
    for (const ch of this.region.challenges) {
      const m = ch.metric;
      if (m.kind === 'bossNoDamage' && (!m.boss || m.boss === b.id) && c.damage === b.damage) this.meet(ch);
      if (m.kind === 'bossTurrets' && m.boss === b.id && b.turretTotal > 0 && (c.killsByTag['boss-turret'] ?? 0) - b.turrets >= b.turretTotal) this.meet(ch);
    }
  }

  /** Every frame a node is active. */
  update(dt: number): void {
    if (this.done) return;
    this.time += dt;
    for (const t of this.toasts) t.left -= dt;
    while (this.toasts.length && this.toasts[0].left <= 0) this.toasts.shift();
    const c = this.host.counters();
    this.kills = Math.max(0, c.kills - this.base.kills);
    for (const h of this.region.hidden) {
      if (this.found.has(h.id)) continue;
      if ((c.killsByTag[hiddenKey(h.id)] ?? 0) > this.base.hidden[h.id]) this.findHidden(h.id);
    }
    const b = this.boss;
    if (b && !b.roomHit && c.roomsDestroyed > b.rooms) {
      b.roomHit = true;
      const took = this.time - b.t0;
      for (const ch of this.region.challenges) if (ch.metric.kind === 'bossRoom' && ch.metric.boss === b.id && took <= ch.metric.seconds) this.meet(ch);
    }
    const run = this.state();
    for (const ch of this.region.challenges) {
      const m = ch.metric;
      if (m.kind === 'kills' && this.kills >= m.n) this.meet(ch);
      else if (m.kind === 'time' && run.time >= m.seconds) this.meet(ch);
      else if (m.kind === 'hidden' && this.found.size >= m.n) this.meet(ch);
    }
  }

  private findHidden(id: string): void {
    this.found.add(id);
    const place = this.region.hidden.find((h) => h.id === id);
    if (!place) return;
    this.toasts.push({ title: place.label.toUpperCase(), sub: this.applyReward(place.reward), color: '#ffe08a', left: TOAST_TIME });
  }

  /** Give a hidden item's reward to the run; returns the text for the toast. */
  private applyReward(r: HiddenReward): string {
    if ('heal' in r) {
      this.host.healBy(r.heal);
      return `+${r.heal} hull`;
    }
    const st = this.state();
    const [card] = drawCards(st.rng, st.upgrades, 1, new Set([st.loadout.main, ...st.loadout.aux]), st.shipId);
    if (!card) {
      this.host.healBy(2);
      return '+2 hull';
    }
    st.upgrades.push(card);
    return `upgrade: ${card.name}`;
  }

  /** The metric of `ch` is met: save it (once) and award its rewards. */
  private meet(ch: ChallengeDef): void {
    this.met.add(ch.id);
    if (!saveStore.completeChallenge(this.region.id, ch.id)) return;
    this.earned.push(ch);
    const items = applyUnlocks(ch.rewards);
    const names = items.filter((i) => i.isNew).map((i) => unlockName(i.spec));
    this.newUnlocks.push(...names);
    this.toasts.push({ title: 'CHALLENGE COMPLETE', sub: names.length ? `${ch.name}  ·  unlocked ${names.join(', ')}` : ch.name, color: '#4ade80', left: TOAST_TIME + 1 });
  }

  /** The run ended (`won` at the end of the list, `over` on a death or abandon). Saves the bests and returns what the result screen shows. */
  finish(outcome: 'over' | 'won'): ConquestResult {
    if (!this.done) {
      this.done = true;
      this.boss = null;
      const c = this.host.counters();
      this.kills = Math.max(0, c.kills - this.base.kills);
      if (outcome === 'won') for (const ch of this.region.challenges) if (ch.metric.kind === 'clear') this.meet(ch);
      saveStore.recordConquestBest(this.region.id, { kills: this.kills, timeSec: Math.floor(this.state().time), hidden: this.found.size, cleared: outcome === 'won' });
    }
    return { regionId: this.region.id, outcome, kills: this.kills, timeSec: this.state().time, hidden: this.found.size, hiddenTotal: this.region.hidden.length, earned: [...this.earned], unlocks: [...this.newUnlocks] };
  }

  /** Small HUD line and the toasts. Called by the run each frame a node is active. */
  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.font = '12px ui-monospace, Consolas, monospace';
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = '#ffd21f';
    g.fillText(`KILLS ${this.kills}   FOUND ${this.found.size}/${this.region.hidden.length}`, 12, 24);
    g.textAlign = 'center';
    this.toasts.forEach((t, i) => {
      const a = Math.min(1, t.left / 0.6);
      const y = 150 + i * 56;
      g.globalAlpha = a * 0.9;
      g.fillStyle = 'rgba(5, 6, 13, 0.75)';
      g.fillRect(70, y - 22, 400, t.sub ? 46 : 30);
      g.globalAlpha = a;
      g.fillStyle = t.color;
      g.font = 'bold 16px ui-monospace, Consolas, monospace';
      g.fillText(t.title, 270, y - 2);
      if (t.sub) {
        g.fillStyle = '#e8eefc';
        g.font = '12px ui-monospace, Consolas, monospace';
        g.fillText(t.sub.length > 56 ? `${t.sub.slice(0, 55)}…` : t.sub, 270, y + 16);
      }
    });
    g.restore();
  }
}

/** Display name of an unlock spec. */
export function unlockName(s: UnlockSpec): string {
  return describeUnlock(s).name;
}
