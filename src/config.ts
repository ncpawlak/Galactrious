/** Logical (portrait) resolution. The canvas is scaled to fit the window by CSS. */
export const W = 540;
export const H = 960;

/** Tunables for milestone 1. Densities: energy spent per pixel carved. */
export const TUNING = {
  densities: { hull: 2.0, frame: 4.0, rooms: 3.0 },
  coreHp: 4000,
  /** Carve shape: higher lateralPenalty = narrower, deeper tunnels. reach = max depth in px. */
  carve: { lateralPenalty: 1.7, backPenalty: 2.5, reach: 40 },
  bulletSpeed: 1500,
  sway: { amplitude: 55, period: 8 },
  boss: { x: W / 2, y: 40 },
  /** Dodge: dash `distance` px over `invulnTime` s (invulnerable meanwhile), then `cooldown` s. */
  dodge: { distance: 170, invulnTime: 0.25, cooldown: 2.5 },
};
