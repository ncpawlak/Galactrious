import { applyUnlocks } from '../finale/unlocks';
import { saveStore } from '../save';
import { EMPIRE_BASE } from './empireBase';
import type { RegionDefinition } from './types';

/** The Conquest regions, in the order the region select shows them. A new region is a `RegionDefinition` added here (DESIGN.md "Conquest"). */
export const REGIONS: RegionDefinition[] = [EMPIRE_BASE];

export function regionById(id: string): RegionDefinition | undefined {
  return REGIONS.find((r) => r.id === id);
}

export function regionUnlocked(r: RegionDefinition): boolean {
  return saveStore.isRegionUnlocked(r.id);
}

/**
 * Award the rewards of every challenge already completed. A reward added to a challenge later (the Mine Layer, Drone and Shield Pulse on three Empire Base
 * challenges) is then also given to a save that completed it before; rewards already held change nothing. Call once at start-up.
 */
export function syncChallengeRewards(): void {
  for (const r of REGIONS) {
    const done = new Set(saveStore.challengesDone(r.id));
    for (const ch of r.challenges) if (done.has(ch.id)) applyUnlocks(ch.rewards);
  }
}

/** Finishing a campaign unlocks the regions tied to it (called where the campaign's last level is completed). Returns the names of regions that were new. */
export function unlockRegionsFor(campaignId: string): string[] {
  const out: string[] = [];
  for (const r of REGIONS) if (r.campaign === campaignId && saveStore.unlockRegion(r.id)) out.push(r.name);
  return out;
}
