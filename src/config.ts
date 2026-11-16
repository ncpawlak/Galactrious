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
};

/** Game-feel ("juice") tunables. Everything is subtle by default; toggle live with [J]. */
export const JUICE = {
  /** Hit stop: freeze gameplay briefly on heavy carves. Seconds. */
  hitStop: { carveThreshold: 40, perPixel: 0.0004, max: 0.03, core: 0.025, cooldown: 0.12 },
  /** Screen shake: trauma-based. Amount is px at trauma 1. */
  shake: { maxOffset: 7, decay: 2.8, perPixel: 0.004, core: 0.12, explosion: 0.9, maxTrauma: 0.6 },
  /** Floating damage numbers; hits are merged within `mergeWindow` seconds. */
  numbers: { mergeWindow: 0.15, life: 0.7, rise: 40, minValue: 1 },
  /** WebAudio carve/hit sounds. */
  audio: { volume: 0.18, minInterval: 0.045 },
};
