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

/** Finishing a campaign unlocks the regions tied to it (called where the campaign's last level is completed). Returns the names of regions that were new. */
export function unlockRegionsFor(campaignId: string): string[] {
  const out: string[] = [];
  for (const r of REGIONS) if (r.campaign === campaignId && saveStore.unlockRegion(r.id)) out.push(r.name);
  return out;
}
