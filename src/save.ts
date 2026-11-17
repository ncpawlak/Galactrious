/**
 * Versioned local save: unlocks, medals and (optional) lifetime stats. Nothing about a run is saved (permadeath).
 *
 * Storage is `localStorage` under one key, always wrapped in try/catch: storage can be blocked, full or throw, and the
 * game must still work, so the data then lives in memory only. A corrupt or unreadable blob falls back to defaults.
 * `?nosave` in the URL (and the one-boss debug mode) uses a pure in-memory save, so tests and debug sims never touch the real one.
 *
 * Version 2 added `lastLoadout`. Version 3 added `campaign` (boss snapshots) and `MedalRecord.bonus`. Version 4 changed the Fallen Peace rewards (empire ship for any medals; Pulse Orbs and Energy Bomb for all gold; Laser and Energy Wave stashed).
 *
 * Version 5 added `conquest` (unlocked regions, completed challenges and best results per region); a v4 save that already owns the Empire Fighter (Campaign 1 finished) gets the Empire Base region.
 *
 * Version 6 added `seen` (ship and weapon ids the player has looked at in the ship builder; unlocked but unseen items get a NEW dot). A v5 save counts everything it has unlocked as seen.
 *
 * Version 7 added skins: `unlocks.skins` (skin flags), `skins` (the equipped skin per body) and `seen.skins` (`shipId:skinId`). A v6 save keeps working: no skin unlocked, the default skin equipped.
 *
 * To add a new field: add it to `SaveData`, give it a default in `defaults()`, bump `SAVE_VERSION` and add a step to `MIGRATIONS`.
 */

export const SAVE_KEY = 'galactrious.save';
export const SAVE_VERSION = 7;

export type UnlockKind = 'cards' | 'ships' | 'weapons' | 'skins';
export type Medal = 'bronze' | 'silver' | 'gold';

export interface MedalRecord {
  best?: Medal;
  bestTimeMs?: number;
  /** The level's bonus objective has been completed at least once. */
  bonus?: boolean;
}

/** A stored boss snapshot (src/campaign/snapshot.ts). `data` is a `BossSnapshot`, kept opaque here. */
export interface SnapshotRecord {
  /** Level whose completion captured it (latest completion replaces). */
  levelId: string;
  bossId: string;
  data: unknown;
}

/** Campaign state that is not a medal: boss snapshots by slot (e.g. `capitalShip`). */
export interface CampaignProgress {
  snapshots: Record<string, SnapshotRecord>;
}

/** The ship and weapons chosen last in the loadout builder (Endless), remembered between sessions. */
export interface LastLoadout {
  ship: string;
  main: string;
  aux: string[];
}

/** Best results of one Conquest region (all-time bests, each kept independently). */
export interface ConquestBest {
  kills?: number;
  timeSec?: number;
  hidden?: number;
  cleared?: boolean;
}

/** Conquest progress (src/conquest): region ids unlocked, challenge ids completed per region, bests per region. */
export interface ConquestProgress {
  regions: string[];
  challenges: Record<string, string[]>;
  best: Record<string, ConquestBest>;
}

export interface SaveData {
  version: number;
  unlocks: Record<UnlockKind, string[]>;
  medals: Record<string, MedalRecord>;
  campaign: CampaignProgress;
  conquest: ConquestProgress;
  /** Ship ids and weapon ids already viewed in the ship builder. An unlocked item missing here shows a NEW dot. */
  seen: { ships: string[]; weapons: string[]; skins: string[] };
  /** The equipped skin per body (ship id -> skin id). Missing = the default skin. */
  skins: Record<string, string>;
  lastLoadout?: LastLoadout;
  /** The last loadout started with each body (ship id -> weapons), remembered by the ship builder. */
  loadouts?: Record<string, { main: string; aux: string[] }>;
  stats?: { runs?: number; bossesKilled?: number };
}

const KINDS: UnlockKind[] = ['cards', 'ships', 'weapons', 'skins'];
const MEDAL_RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 };

export function defaults(): SaveData {
  return { version: SAVE_VERSION, unlocks: { cards: [], ships: [], weapons: [], skins: [] }, medals: {}, campaign: { snapshots: {} }, conquest: { regions: [], challenges: {}, best: {} }, seen: { ships: [], weapons: [], skins: [] }, skins: {} };
}

/** MIGRATIONS[n] upgrades a version-n blob to version n+1. Empty until the format first changes. */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  1: (d) => d, // v2 only added the optional `lastLoadout`
  2: (d) => d, // v3 only added `campaign` and `MedalRecord.bonus` (both default when missing)
  3: (d) => {
    // v4: the old campaign reward was the ship + Laser + Energy Wave for any medals. Those flags stay in the list (harmless: the two weapons are stashed
    // and hidden). A player who earned all seven gold medals qualifies for the new gold reward, so grant it; everyone else keeps the ship only.
    const u = (d.unlocks ?? {}) as Record<string, unknown>;
    const weapons = Array.isArray(u.weapons) ? (u.weapons as unknown[]) : [];
    const medals = (d.medals ?? {}) as Record<string, { best?: unknown } | undefined>;
    const gold = ['fp-1', 'fp-2', 'fp-3', 'fp-4', 'fp-5', 'fp-6', 'fp-7'].every((id) => medals[id]?.best === 'gold');
    if (gold) d.unlocks = { ...u, weapons: [...new Set([...weapons, 'pulse-orb', 'flak'])] };
    return d;
  },
  4: (d) => {
    // v5: `conquest`. Campaign 1 finished (the empire ship was its reward) unlocks the Empire Base region.
    const u = (d.unlocks ?? {}) as Record<string, unknown>;
    const ships = Array.isArray(u.ships) ? (u.ships as unknown[]) : [];
    if (ships.includes('empire-fighter')) d.conquest = { regions: ['empire-base'], challenges: {}, best: {} };
    return d;
  },
  5: (d) => {
    // v6: `seen`. Everything already unlocked counts as seen. Weapons that come with an owned ship are listed here as they were at v5 (a frozen table).
    const u = (d.unlocks ?? {}) as Record<string, unknown>;
    const ships = Array.isArray(u.ships) ? (u.ships as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    const weapons = Array.isArray(u.weapons) ? (u.weapons as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    const withShip: Record<string, string[]> = { warden: ['lance', 'blades', 'scatter'], wisp: ['swarm', 'needle'], 'empire-fighter': ['pulse', 'flak'] };
    d.seen = { ships: [...ships], weapons: [...new Set([...weapons.map((w) => (w === 'pulse-orb' ? 'pulse' : w)), ...ships.flatMap((s) => withShip[s] ?? [])])] };
    return d;
  },
  6: (d) => d, // v7 added `unlocks.skins`, `skins` and `seen.skins` (all default when missing)
};

/** Validate and migrate an arbitrary parsed value; returns null when it is unusable. */
function normalize(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let d = raw as Record<string, unknown>;
  let v = d.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > SAVE_VERSION) return null; // unknown or future version
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    d = step(d);
    v++;
    d.version = v;
  }
  const out = defaults();
  const u = d.unlocks as Record<string, unknown> | undefined;
  for (const k of KINDS) {
    const list = u?.[k];
    if (Array.isArray(list)) out.unlocks[k] = [...new Set(list.filter((x): x is string => typeof x === 'string'))];
  }
  const m = d.medals;
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    for (const [id, rec] of Object.entries(m as Record<string, unknown>)) {
      if (!rec || typeof rec !== 'object') continue;
      const r = rec as Record<string, unknown>;
      const clean: MedalRecord = {};
      if (typeof r.best === 'string' && r.best in MEDAL_RANK) clean.best = r.best as Medal;
      if (typeof r.bestTimeMs === 'number' && Number.isFinite(r.bestTimeMs)) clean.bestTimeMs = r.bestTimeMs;
      if (r.bonus === true) clean.bonus = true;
      out.medals[id] = clean;
    }
  }
  const cp = d.campaign as Record<string, unknown> | undefined;
  const snaps = cp && typeof cp === 'object' ? (cp.snapshots as Record<string, unknown> | undefined) : undefined;
  if (snaps && typeof snaps === 'object' && !Array.isArray(snaps)) {
    for (const [slot, rec] of Object.entries(snaps)) {
      const r = rec as Record<string, unknown> | null;
      if (r && typeof r === 'object' && typeof r.levelId === 'string' && typeof r.bossId === 'string' && r.data && typeof r.data === 'object') {
        out.campaign.snapshots[slot] = { levelId: r.levelId, bossId: r.bossId, data: r.data };
      }
    }
  }
  const cq = d.conquest as Record<string, unknown> | undefined;
  if (cq && typeof cq === 'object') {
    if (Array.isArray(cq.regions)) out.conquest.regions = [...new Set(cq.regions.filter((x): x is string => typeof x === 'string'))];
    const ch = cq.challenges;
    if (ch && typeof ch === 'object' && !Array.isArray(ch)) {
      for (const [id, list] of Object.entries(ch as Record<string, unknown>)) if (Array.isArray(list)) out.conquest.challenges[id] = [...new Set(list.filter((x): x is string => typeof x === 'string'))];
    }
    const bs = cq.best;
    if (bs && typeof bs === 'object' && !Array.isArray(bs)) {
      for (const [id, rec] of Object.entries(bs as Record<string, unknown>)) {
        if (!rec || typeof rec !== 'object') continue;
        const r = rec as Record<string, unknown>;
        const b: ConquestBest = {};
        if (typeof r.kills === 'number' && Number.isFinite(r.kills)) b.kills = r.kills;
        if (typeof r.timeSec === 'number' && Number.isFinite(r.timeSec)) b.timeSec = r.timeSec;
        if (typeof r.hidden === 'number' && Number.isFinite(r.hidden)) b.hidden = r.hidden;
        if (r.cleared === true) b.cleared = true;
        out.conquest.best[id] = b;
      }
    }
  }
  const sn = d.seen as Record<string, unknown> | undefined;
  if (sn && typeof sn === 'object') {
    for (const k of ['ships', 'weapons', 'skins'] as const) {
      const list = sn[k];
      if (Array.isArray(list)) out.seen[k] = [...new Set(list.filter((x): x is string => typeof x === 'string'))];
    }
  }
  const sk = d.skins;
  if (sk && typeof sk === 'object' && !Array.isArray(sk)) {
    for (const [ship, id] of Object.entries(sk as Record<string, unknown>)) if (typeof id === 'string') out.skins[ship] = id;
  }
  const ll = d.lastLoadout as Record<string, unknown> | undefined;
  if (ll && typeof ll === 'object' && typeof ll.ship === 'string' && typeof ll.main === 'string' && Array.isArray(ll.aux)) {
    out.lastLoadout = { ship: ll.ship, main: ll.main, aux: ll.aux.filter((x): x is string => typeof x === 'string').slice(0, 3) };
  }
  const lo = d.loadouts;
  if (lo && typeof lo === 'object' && !Array.isArray(lo)) {
    out.loadouts = {};
    for (const [ship, rec] of Object.entries(lo as Record<string, unknown>)) {
      const r = rec as Record<string, unknown> | null;
      if (r && typeof r === 'object' && typeof r.main === 'string' && Array.isArray(r.aux)) out.loadouts[ship] = { main: r.main, aux: r.aux.filter((x): x is string => typeof x === 'string').slice(0, 3) };
    }
  }
  const s = d.stats;
  if (s && typeof s === 'object' && !Array.isArray(s)) {
    const st = s as Record<string, unknown>;
    out.stats = {};
    if (typeof st.runs === 'number') out.stats.runs = st.runs;
    if (typeof st.bossesKilled === 'number') out.stats.bossesKilled = st.bossesKilled;
  }
  return out;
}

export class SaveStore {
  private data: SaveData = defaults();
  /** True when the last read or write hit storage trouble (blocked, throwing, corrupt): state is then memory-only or reset. */
  degraded = false;

  /** `persist: false` = in-memory only (never touches localStorage). */
  constructor(private persist = true) {
    this.load();
  }

  /** Switch between persistent and in-memory, and reload from the new backing. */
  setPersistent(on: boolean): void {
    this.persist = on;
    this.load();
  }

  get persistent(): boolean {
    return this.persist;
  }

  /** Read from storage (or defaults). Never throws. */
  load(): SaveData {
    this.degraded = false;
    if (!this.persist) {
      this.data = defaults();
      return this.data;
    }
    try {
      const text = localStorage.getItem(SAVE_KEY);
      if (text === null) {
        this.data = defaults();
      } else {
        const parsed = normalize(JSON.parse(text));
        if (parsed) this.data = parsed;
        else {
          this.degraded = true;
          this.data = defaults();
        }
      }
    } catch {
      this.degraded = true;
      this.data = defaults(); // blocked storage or corrupt JSON
    }
    return this.data;
  }

  /** Write to storage. Failures are swallowed: the in-memory copy stays authoritative. */
  save(): void {
    if (!this.persist) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      this.degraded = true;
    }
  }

  get current(): Readonly<SaveData> {
    return this.data;
  }

  isUnlocked(kind: UnlockKind, id: string): boolean {
    return this.data.unlocks[kind].includes(id);
  }

  /** Unlock `id`; returns true when it was newly unlocked. */
  unlock(kind: UnlockKind, id: string): boolean {
    if (this.isUnlocked(kind, id)) return false;
    this.data.unlocks[kind].push(id);
    this.save();
    return true;
  }

  isSeen(kind: 'ships' | 'weapons' | 'skins', id: string): boolean {
    return this.data.seen[kind].includes(id);
  }

  /** Mark a ship or weapon as viewed (clears its NEW dot). */
  markSeen(kind: 'ships' | 'weapons' | 'skins', id: string): void {
    if (this.isSeen(kind, id)) return;
    this.data.seen[kind].push(id);
    this.save();
  }

  /** Equip a skin on a body (the builder checks it is unlocked). */
  setSkin(shipId: string, skinId: string): void {
    if (this.data.skins[shipId] === skinId) return;
    this.data.skins[shipId] = skinId;
    this.save();
  }

  /** Remember the last ship and loadout the player started a run with (and that body's own last loadout). */
  setLastLoadout(l: LastLoadout): void {
    this.data.lastLoadout = { ship: l.ship, main: l.main, aux: [...l.aux] };
    (this.data.loadouts ??= {})[l.ship] = { main: l.main, aux: [...l.aux] };
    this.save();
  }

  isRegionUnlocked(regionId: string): boolean {
    return this.data.conquest.regions.includes(regionId);
  }

  /** Unlock a Conquest region; returns true when it was new. */
  unlockRegion(regionId: string): boolean {
    if (this.isRegionUnlocked(regionId)) return false;
    this.data.conquest.regions.push(regionId);
    this.save();
    return true;
  }

  challengesDone(regionId: string): readonly string[] {
    return this.data.conquest.challenges[regionId] ?? [];
  }

  /** Mark a Conquest challenge completed (saved at once, so a death later in the run cannot lose it); true when it was new. */
  completeChallenge(regionId: string, challengeId: string): boolean {
    const list = (this.data.conquest.challenges[regionId] ??= []);
    if (list.includes(challengeId)) return false;
    list.push(challengeId);
    this.save();
    return true;
  }

  /** Keep the best of each figure of a Conquest run. */
  recordConquestBest(regionId: string, r: ConquestBest): void {
    const b = (this.data.conquest.best[regionId] ??= {});
    if (r.kills !== undefined && r.kills > (b.kills ?? 0)) b.kills = r.kills;
    if (r.timeSec !== undefined && r.timeSec > (b.timeSec ?? 0)) b.timeSec = r.timeSec;
    if (r.hidden !== undefined && r.hidden > (b.hidden ?? 0)) b.hidden = r.hidden;
    if (r.cleared) b.cleared = true;
    this.save();
  }

  /** Record a result for a level: keeps the better medal and the faster time. */
  setMedal(levelId: string, medal?: Medal, timeMs?: number, bonus?: boolean): void {
    const r = (this.data.medals[levelId] ??= {});
    if (bonus) r.bonus = true;
    if (medal && (!r.best || MEDAL_RANK[medal] > MEDAL_RANK[r.best])) r.best = medal;
    if (timeMs !== undefined && (r.bestTimeMs === undefined || timeMs < r.bestTimeMs)) r.bestTimeMs = timeMs;
    this.save();
  }

  /** The stored boss snapshot of a campaign slot, if any. */
  getSnapshot(slot: string): SnapshotRecord | undefined {
    return this.data.campaign.snapshots[slot];
  }

  /** Store a snapshot in a slot; the latest one replaces the old (DESIGN.md "The capital ship keeps its state"). */
  setSnapshot(slot: string, rec: SnapshotRecord): void {
    this.data.campaign.snapshots[slot] = rec;
    this.save();
  }

  clearSnapshot(slot: string): void {
    delete this.data.campaign.snapshots[slot];
    this.save();
  }

  /** Wipe everything back to defaults (and the stored copy). */
  reset(): void {
    this.data = defaults();
    this.degraded = false;
    if (this.persist) {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {
        this.degraded = true;
      }
    }
  }

  /** Unlock everything in the given id lists (debug). */
  unlockAll(ids: Partial<Record<UnlockKind, string[]>>): void {
    for (const k of KINDS) for (const id of ids[k] ?? []) if (!this.isUnlocked(k, id)) this.data.unlocks[k].push(id);
    this.save();
  }
}

const params = new URLSearchParams(location.search);
/** The game's save. In-memory under `?nosave` and in the one-boss debug mode (`?mode=boss`), so debug sims never touch the real save. */
export const saveStore = new SaveStore(!params.has('nosave') && params.get('mode') !== 'boss');

export const isUnlocked = (kind: UnlockKind, id: string): boolean => saveStore.isUnlocked(kind, id);
