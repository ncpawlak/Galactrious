/**
 * Faction kits (DESIGN.md "The enemy empire"). Placeholder: just the palette a faction's ships are painted with, so the
 * capital ship and later enemies can share one look. Add a kit here and set `BossDefinition.faction`.
 */
export interface FactionKit {
  id: string;
  /** Plating colours: armour, hull, interior deck. */
  armour: string;
  armourDark: string;
  hull: string;
  deck: string;
  /** Insignia stripe and glow. */
  accent: string;
  glow: string;
  /** Weapon colour family (informational until bullets read it). */
  bullet: string;
}

export const EMPIRE: FactionKit = {
  id: 'empire',
  armour: '#4b5063',
  armourDark: '#2f3342',
  hull: '#7c5a48',
  deck: '#3a2f3a',
  accent: '#c8372d',
  glow: '#ff7a3d',
  bullet: '#ff5a5a',
};

export const FACTIONS: Record<string, FactionKit> = { empire: EMPIRE };
