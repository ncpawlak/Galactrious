import type { ShadowCaster } from './types';

/**
 * What the ground shows shadows of: filled every frame by the terrain system, read by the `surface` background layer.
 * `casters` = the player ship and flying units (a soft dark silhouette, offset like a high sun); `pieces` = the plating shadow canvases of
 * the walls on screen (so a carved lane also opens a hole in the wall's shadow). Module state is fine: one scroll level runs at a time.
 */
export const GROUND: {
  casters: ShadowCaster[];
  pieces: { canvas: HTMLCanvasElement; x: number; y: number }[];
} = { casters: [], pieces: [] };

export function resetGround(): void {
  GROUND.casters = [];
  GROUND.pieces.length = 0;
}
