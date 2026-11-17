import type { BonusCriteria, LevelCounters, MedalRules, Medal } from './types';

export function emptyCounters(): LevelCounters {
  return { kills: 0, hits: 0, damage: 0, roomsDestroyed: 0, collected: 0, detections: 0, killsByTag: {} };
}

export function addCounters(a: LevelCounters, b: LevelCounters): LevelCounters {
  const tags: Record<string, number> = { ...a.killsByTag };
  for (const [k, v] of Object.entries(b.killsByTag)) tags[k] = (tags[k] ?? 0) + v;
  return {
    kills: a.kills + b.kills,
    hits: a.hits + b.hits,
    damage: a.damage + b.damage,
    roomsDestroyed: a.roomsDestroyed + b.roomsDestroyed,
    collected: a.collected + b.collected,
    detections: a.detections + b.detections,
    killsByTag: tags,
  };
}

/** `b - a` of two cumulative counter snapshots (the attempt's share). */
export function diffCounters(now: LevelCounters, since: LevelCounters): LevelCounters {
  const tags: Record<string, number> = {};
  for (const [k, v] of Object.entries(now.killsByTag)) tags[k] = v - (since.killsByTag[k] ?? 0);
  return {
    kills: now.kills - since.kills,
    hits: now.hits - since.hits,
    damage: now.damage - since.damage,
    roomsDestroyed: now.roomsDestroyed - since.roomsDestroyed,
    collected: now.collected - since.collected,
    detections: now.detections - since.detections,
    killsByTag: tags,
  };
}

export function cloneCounters(c: LevelCounters): LevelCounters {
  return { ...c, killsByTag: { ...c.killsByTag } };
}

/** Is the bonus objective met by these (whole-level) counters? One case per criteria kind: add a kind here and in `BonusCriteria`. */
export function evaluateBonus(b: BonusCriteria, c: LevelCounters): boolean {
  switch (b.kind) {
    case 'killCount':
      return c.kills >= b.count;
    case 'hitless':
    case 'noDamage':
      return c.hits === 0 && c.damage === 0;
    case 'collectAll':
      return c.collected >= b.count;
    case 'destroyAll':
      return (c.killsByTag[b.tag] ?? 0) >= b.count;
    case 'roomsDestroyed':
      return c.roomsDestroyed >= b.count;
    case 'noDetection':
      return c.detections === 0;
    case 'dismantle':
      return c.roomsDestroyed >= b.rooms && (c.killsByTag['boss-turret'] ?? 0) >= b.turrets;
  }
}

/** Short progress text for the HUD / result ("kills 12/30"), or null for pass/fail criteria. */
export function bonusProgress(b: BonusCriteria, c: LevelCounters): string | null {
  switch (b.kind) {
    case 'killCount':
      return `${Math.min(c.kills, b.count)}/${b.count}`;
    case 'collectAll':
      return `${Math.min(c.collected, b.count)}/${b.count}`;
    case 'destroyAll':
      return `${Math.min(c.killsByTag[b.tag] ?? 0, b.count)}/${b.count}`;
    case 'roomsDestroyed':
      return `${Math.min(c.roomsDestroyed, b.count)}/${b.count}`;
    case 'dismantle':
      return `${Math.min(c.roomsDestroyed, b.rooms) + Math.min(c.killsByTag['boss-turret'] ?? 0, b.turrets)}/${b.rooms + b.turrets}`;
    default:
      return null;
  }
}

/** True while a pass/fail bonus can still be earned (it is already broken otherwise). */
export function bonusAlive(b: BonusCriteria, c: LevelCounters): boolean {
  switch (b.kind) {
    case 'hitless':
    case 'noDamage':
      return c.hits === 0 && c.damage === 0;
    case 'noDetection':
      return c.detections === 0;
    default:
      return true;
  }
}

/** Bronze = completed. Silver = time <= silver. Gold = zero deaths AND (time <= gold OR bonus). */
export function computeMedal(r: MedalRules, seconds: number, deaths: number, bonusDone: boolean): { medal: Medal; goldRoute?: 'time' | 'bonus' } {
  if (deaths === 0) {
    if (seconds <= r.gold) return { medal: 'gold', goldRoute: 'time' };
    if (bonusDone) return { medal: 'gold', goldRoute: 'bonus' };
  }
  if (seconds <= r.silver) return { medal: 'silver' };
  return { medal: 'bronze' };
}

/** The medal the current time is on pace for if the level ended now (ignores deaths and bonus). */
export function paceMedal(r: MedalRules, seconds: number): Medal {
  return seconds <= r.gold ? 'gold' : seconds <= r.silver ? 'silver' : 'bronze';
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, '0')}`;
}
