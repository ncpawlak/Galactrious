import type { ScrollLevelDef } from './types';

/**
 * Debug-only scrolling test level (`game.debug.scroll.start('scroll-test')`, `?scroll=scroll-test`): uses every feature once.
 * 9000 px: speed changes, a debris field, a peak field, individual peaks from the top and the sides, a wave of fighters and
 * single units, allies (4 wingmen), a weapons-locked stretch, a theme change atmosphere -> arctic, events.
 */
export const SCROLL_TEST: ScrollLevelDef = {
  id: 'scroll-test',
  name: 'Scroll test',
  length: 9000,
  speed: 170,
  theme: 'atmosphere',
  allies: { count: 4, pattern: 'weave' },
  timeline: [
    { at: 200, kind: 'event', name: 'marker-200' },
    // Debris, small chunks first, with a free lane.
    { at: 300, kind: 'field', to: 2100, density: 5, shapes: [{ shape: 'debris-s', weight: 3 }, { shape: 'debris-m', weight: 2 }], motions: ['straight', 'tumble', 'drift-l', 'drift-r'], lane: { x: 270, width: 150 }, seed: 7 },
    { at: 800, kind: 'wave', wave: 'l1w1' },
    { at: 1800, kind: 'unit', unit: 'gunner', x: 140 },
    { at: 1800, kind: 'unit', unit: 'gunner', x: 400 },
    // Speed up and a heavier field.
    { at: 2400, kind: 'speed', speed: 300, ease: 2 },
    { at: 2400, kind: 'event', name: 'speed-up', data: 300 },
    { at: 2600, kind: 'field', to: 4600, density: 6, shapes: [{ shape: 'debris-m', weight: 3 }, { shape: 'debris-l', weight: 2 }, { shape: 'debris-xl', weight: 1 }, { shape: 'peak-s', weight: 1 }], motions: ['straight', 'tumble', 'weave', 'fast', 'drift-l', 'drift-r'], lane: { x: 270, width: 120 }, seed: 11 },
    // Handmade peaks: from the top and from the sides.
    { at: 3000, kind: 'obstacle', shape: 'peak-l', x: 110 },
    { at: 3300, kind: 'obstacle', shape: 'peak-m', x: 440 },
    { at: 3600, kind: 'obstacle', shape: 'peak-m', x: 60, edge: 'left', motion: 'straight' },
    { at: 3900, kind: 'obstacle', shape: 'peak-l', x: 480, edge: 'right' },
    // Weapons locked: a freefall stretch, arctic sky.
    { at: 4000, kind: 'theme', theme: 'arctic', fade: 3 },
    { at: 4200, kind: 'weapons', locked: true },
    { at: 4200, kind: 'event', name: 'weapons-locked' },
    { at: 4400, kind: 'field', to: 6000, density: 7, shapes: [{ shape: 'debris-m' }, { shape: 'peak-s' }, { shape: 'peak-m', weight: 0.6 }, { shape: 'debris-l' }], motions: ['straight', 'tumble', 'weave', 'drift-l', 'drift-r'], lane: { x: 270, width: 110 }, seed: 23 },
    { at: 5000, kind: 'speed', speed: 140, ease: 1.5 },
    { at: 6100, kind: 'weapons', locked: false },
    { at: 6100, kind: 'event', name: 'weapons-unlocked' },
    // Fighters again.
    { at: 6300, kind: 'wave', wave: 'l1w2' },
    { at: 6500, kind: 'speed', speed: 220, ease: 1.5 },
    { at: 7000, kind: 'field', to: 8200, density: 4, shapes: [{ shape: 'debris-s' }, { shape: 'debris-m' }, { shape: 'peak-s', weight: 0.5 }], motions: ['straight', 'tumble'], seed: 31 },
    { at: 7600, kind: 'pickup', name: 'repair', x: 270 },
    { at: 8800, kind: 'allies', on: false },
    { at: 8900, kind: 'event', name: 'near-end' },
  ],
};

/**
 * Debug-only weather test (`game.debug.scroll.start('scroll-test-storm')`): space at speed, then the atmosphere building from
 * calm to a violent storm (`setWeather`), then the arctic blizzard calm to heavy, easing back down at the end. 12000 px.
 */
export const SCROLL_TEST_STORM: ScrollLevelDef = {
  id: 'scroll-test-storm',
  name: 'Weather test',
  length: 12000,
  speed: 120,
  theme: 'space',
  allies: { count: 3, pattern: 'patrol' },
  timeline: [
    // Space: from a drift to a hard burn (the streaks stretch with the speed).
    { at: 0, kind: 'event', name: 'space-slow' },
    { at: 900, kind: 'speed', speed: 320, ease: 3 },
    { at: 1800, kind: 'speed', speed: 520, ease: 3 },
    { at: 2600, kind: 'wave', wave: 'l1w1' },
    { at: 3200, kind: 'speed', speed: 200, ease: 2 },
    // Atmosphere: calm, then building.
    { at: 3600, kind: 'theme', theme: 'atmosphere', fade: 3 },
    { at: 3600, kind: 'setWeather', intensity: 0.1, ease: 0.1 },
    { at: 3600, kind: 'event', name: 'atmosphere-calm' },
    { at: 4400, kind: 'setWeather', intensity: 0.45, ease: 6 },
    { at: 4400, kind: 'allies', on: false },
    { at: 4600, kind: 'field', to: 7200, density: 5, shapes: [{ shape: 'debris-m' }, { shape: 'debris-l' }, { shape: 'debris-s', weight: 2 }], motions: ['straight', 'tumble', 'fast'], lane: { x: 270, width: 140 }, seed: 5 },
    { at: 5600, kind: 'speed', speed: 340, ease: 3 },
    { at: 5600, kind: 'setWeather', intensity: 1, ease: 5 },
    { at: 5600, kind: 'event', name: 'storm-violent' },
    // Arctic: the blizzard.
    { at: 7600, kind: 'theme', theme: 'arctic', fade: 3 },
    { at: 7600, kind: 'setWeather', intensity: 0.3, ease: 3 },
    { at: 8600, kind: 'setWeather', intensity: 1, ease: 5 },
    { at: 8800, kind: 'field', to: 11000, density: 5, shapes: [{ shape: 'peak-s' }, { shape: 'peak-m', weight: 0.6 }, { shape: 'debris-m' }], motions: ['straight', 'weave'], lane: { x: 270, width: 130 }, seed: 8 },
    { at: 11000, kind: 'setWeather', intensity: 0.15, ease: 4 },
  ],
};
