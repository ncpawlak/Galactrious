/**
 * Faction kits (DESIGN.md "The enemy empire"). A kit is the shared look of one faction: palette, core colour and
 * projectile colour family. The silhouette rules and the insignia live in `src/enemies/empirePaint.ts`, which every empire
 * unit and the capital ship paint through, so a new enemy inherits the look. Set `UnitDefinition.faction` /
 * `BossDefinition.faction` to the kit id.
 *
 * Empire shape language: ANGULAR and FORWARD-SWEPT (wing tips reach toward the nose), straight cut edges, never curves
 * except the engine nozzles; every hull carries the INSIGNIA (a pair of nested red chevrons) and one or two accent stripes.
 * Palette: slate-steel plating, a brown-bronze hull plate, signal red accent, orange engine/core glow. Delta squad (player,
 * wingmen) is mint, white and teal: no red, no slate.
 */
import type { StyleName } from './attackStyles';

export interface FactionKit {
  id: string;
  /** Plating colours: armour, hull, interior deck. */
  armour: string;
  armourDark: string;
  /** Light panel colour (wing tops, highlights). */
  armourLight: string;
  hull: string;
  deck: string;
  /** Insignia stripe. */
  accent: string;
  /** Darker accent for insignia shadow and trim. */
  accentDark: string;
  /** Engine, cockpit and console glow. */
  glow: string;
  /** Cockpit canopy. */
  canopy: string;
  /** Weapon colour family (bullet fill) and the bullet style the faction's patterns use. */
  bullet: string;
  shot: StyleName;
  /** Reactor glow colour of the faction's cores, [r, g, b]. */
  core: [number, number, number];
  /** Component styles: turret housing and its barrel/light colour. */
  turret: { housing: string; barrel: string; light: string };
}

export const EMPIRE: FactionKit = {
  id: 'empire',
  armour: '#4b5063',
  armourDark: '#2f3342',
  armourLight: '#6d748c',
  hull: '#7c5a48',
  deck: '#3a2f3a',
  accent: '#c8372d',
  accentDark: '#7e1f1a',
  glow: '#ff7a3d',
  canopy: '#ffb25c',
  bullet: '#ff6a2a',
  shot: 'imperial',
  core: [255, 110, 50],
  turret: { housing: '#2f3342', barrel: '#9aa0b8', light: '#ff7a3d' },
};

/** Delta squad (the player and the wingmen): mint, white and teal, nothing red. Used by the campaign ship look. */
export const DELTA = {
  hull: '#5ef2b0',
  trim: '#f2fff8',
  dark: '#1c6e55',
  mid: '#2f9e78',
  flame: '#9ff6ff',
};

export const FACTIONS: Record<string, FactionKit> = { empire: EMPIRE };
