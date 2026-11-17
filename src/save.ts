/**
 * Versioned local save: unlocks, medals and (optional) lifetime stats. Nothing about a run is saved (permadeath).
 *
 * Storage is `localStorage` under one key, always wrapped in try/catch: storage can be blocked, full or throw, and the
 * game must still work, so the data then lives in memory only. A corrupt or unreadable blob falls back to defaults.
 * `?nosave` in the URL (and the one-boss debug mode) uses a pure in-memory save, so tests and debug sims never touch the real one.
 *
 * Version 2 added `lastLoadout`.
 *
 * To add a new field: add it to `SaveData`, give it a default in `defaults()`, bump `SAVE_VERSION` and add a step to `MIGRATIONS`.
 */

export const SAVE_KEY = 'galactrious.save';
export const SAVE_VERSION = 2;

export type UnlockKind = 'cards' | 'ships' | 'weapons';
export type Medal = 'bronze' | 'silver' | 'gold';

export interface MedalRecord {
  best?: Medal;
  bestTimeMs?: number;
}

/** The ship and weapons chosen last in the loadout builder (Endless), remembered between sessions. */
export interface LastLoadout {
  ship: string;
  main: string;
  aux: string[];
}

export interface SaveData {
  version: number;
  unlocks: Record<UnlockKind, string[]>;
  medals: Record<string, MedalRecord>;
  lastLoadout?: LastLoadout;
  stats?: { runs?: number; bossesKilled?: number };
}

const KINDS: UnlockKind[] = ['cards', 'ships', 'weapons'];
const MEDAL_RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 };

export function defaults(): SaveData {
  return { version: SAVE_VERSION, unlocks: { cards: [], ships: [], weapons: [] }, medals: {} };
}

/** MIGRATIONS[n] upgrades a version-n blob to version n+1. Empty until the format first changes. */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  1: (d) => d, // v2 only added the optional `lastLoadout`
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
      out.medals[id] = clean;
    }
  }
  const ll = d.lastLoadout as Record<string, unknown> | undefined;
  if (ll && typeof ll === 'object' && typeof ll.ship === 'string' && typeof ll.main === 'string' && Array.isArray(ll.aux)) {
    out.lastLoadout = { ship: ll.ship, main: ll.main, aux: ll.aux.filter((x): x is string => typeof x === 'string').slice(0, 3) };
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

  /** Remember the last ship and loadout the player started a run with. */
  setLastLoadout(l: LastLoadout): void {
    this.data.lastLoadout = { ship: l.ship, main: l.main, aux: [...l.aux] };
    this.save();
  }

  /** Record a result for a level: keeps the better medal and the faster time. */
  setMedal(levelId: string, medal?: Medal, timeMs?: number): void {
    const r = (this.data.medals[levelId] ??= {});
    if (medal && (!r.best || MEDAL_RANK[medal] > MEDAL_RANK[r.best])) r.best = medal;
    if (timeMs !== undefined && (r.bestTimeMs === undefined || timeMs < r.bestTimeMs)) r.bestTimeMs = timeMs;
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
