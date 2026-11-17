import { FALLEN_PEACE_SCROLL_LEVELS } from './fallenPeace';
import { SCROLL_TEST, SCROLL_TEST_STORM } from './testLevel';
import { SURFACE_THEME } from './themes/surface';
import { SURFACE_TEST } from '../terrain/surfaceTest';
import type { ScrollLevelDef } from './types';

export { AllySystem } from './allies';
import { SCROLL_THEMES } from './background';

// The ground theme lives in its own file (themes/surface.ts); register it by id.
SCROLL_THEMES.surface = SURFACE_THEME;

export { SCROLL_THEMES, ScrollBackground, themeById } from './background';
export { OBSTACLE_DAMAGE, Obstacle, ObstacleSystem } from './obstacles';
export { compileTimeline, ScrollRunnerImpl } from './runner';
export type * from './types';

/** Registered scroll levels, by id (`ScrollNodeDefinition.level`, `game.debug.scroll.start(id)`). The content session adds the real chapters here. */
export const SCROLL_LEVELS: Record<string, ScrollLevelDef> = Object.fromEntries([SCROLL_TEST, SCROLL_TEST_STORM, SURFACE_TEST, ...FALLEN_PEACE_SCROLL_LEVELS].map((l) => [l.id, l]));

export function scrollLevelById(id: string): ScrollLevelDef {
  const l = SCROLL_LEVELS[id];
  if (!l) throw new Error(`unknown scroll level "${id}" (known: ${Object.keys(SCROLL_LEVELS).join(', ')})`);
  return l;
}
