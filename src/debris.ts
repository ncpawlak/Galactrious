import { DEBRIS } from './config';

/**
 * Space debris motion: blown-off parts never fall. They get one slow push away from where they
 * broke off, drift on with a little drag (no acceleration, no gravity), spin slowly and fade.
 * Reusable for any destroyed boss component.
 */

/** Initial drift velocity for a chunk at `from`, pushed away from the point `away`. */
export function driftVelocity(
  from: { x: number; y: number },
  away: { x: number; y: number },
  speedScale = 1,
): { vx: number; vy: number } {
  let dx = from.x - away.x;
  let dy = from.y - away.y;
  let len = Math.hypot(dx, dy);
  if (len < 1e-3) {
    const a = Math.random() * Math.PI * 2;
    dx = Math.cos(a);
    dy = Math.sin(a);
    len = 1;
  }
  const spread = (Math.random() * 2 - 1) * DEBRIS.angleJitter;
  const base = Math.atan2(dy, dx) + spread;
  const speed = (DEBRIS.speedMin + Math.random() * (DEBRIS.speedMax - DEBRIS.speedMin)) * speedScale;
  return { vx: Math.cos(base) * speed, vy: Math.sin(base) * speed };
}

/** Slow spin (rad/s), turning the way the chunk drifts sideways. */
export function driftSpin(vx: number): number {
  const dir = vx < 0 ? -1 : 1;
  return dir * (DEBRIS.spinMin + Math.random() * (DEBRIS.spinMax - DEBRIS.spinMin));
}

/** Advance a drifting body one step: drag only, never gravity. */
export function stepDrift(b: { x: number; y: number; vx: number; vy: number; rot: number; spin: number }, dt: number): void {
  const k = Math.exp(-DEBRIS.drag * dt);
  b.vx *= k;
  b.vy *= k;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.rot += b.spin * dt;
}
