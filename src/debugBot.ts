/**
 * A small dodging bot for MEASURING levels (DESIGN.md "Cinematic and mission design standard", medal-time procedure). It is a debug
 * tool: the game uses it when `auto` is 'dodge' (`game.debug.setAuto('dodge')`, optionally `game.debug.bot.goal`). It steers like a
 * decent player, not an aimbot: every frame it scores a grid of reachable positions by the danger of enemy bullets and hazards (a few
 * predicted moments ahead), nearby units and obstacles (tested with their real pixel masks at their predicted positions), adds a pull
 * toward where it wants to be, and moves toward the best one at the ship's real speed.
 */
import { H, W } from './config';
import { hazardPhase, shapeHits, type Hazard } from './hazards';
import type { Obstacle } from './scroll/obstacles';

export interface BotWorld {
  ship: { x: number; y: number };
  /** Ship speed, px/s, and hitbox radius. */
  speed: number;
  hitbox: number;
  minY: number;
  bullets: { x: number; y: number; vx: number; vy: number }[];
  hazards: Hazard[];
  units: { x: number; y: number }[];
  obstacles: Obstacle[];
  /** Current scroll speed, px/s (obstacles without `rise` move down at this speed). */
  scrollSpeed: number;
  /** Where the bot would like to be when nothing threatens it (x), and the height it prefers. */
  wantX: number;
  wantY: number;
  /** Stay inside this zone when it is set (the bot heads for the goal). */
  goal: { x: number; y: number; r: number } | null;
}

const LOOK = [0.08, 0.2, 0.36, 0.55];

/** Choose where the ship should be heading now. */
export function dodgeTarget(w: BotWorld): { x: number; y: number } {
  let best = { x: w.ship.x, y: w.ship.y };
  let bestScore = Infinity;
  const hb = w.hitbox + 4;
  const yLo = w.goal ? w.minY : Math.max(w.minY, H - 420);
  for (let x = 30; x <= W - 30; x += 30) {
    for (let y = yLo; y <= H - 40; y += 45) {
      let risk = 0;
      for (const b of w.bullets) {
        for (const t of LOOK) {
          const d = Math.hypot(x - (b.x + b.vx * t), y - (b.y + b.vy * t));
          if (d < 20 + hb) risk += 60 / (t + 0.12);
          else if (d < 62) risk += ((62 - d) / 62) * (3 / (t + 0.1));
        }
      }
      for (const h of w.hazards) {
        const ph = hazardPhase(h);
        if (!ph) continue;
        const shape = h.shapeAt(ph.phase, ph.p);
        if (!shapeHits(shape, x, y, hb + 14)) continue;
        // Live: certain damage. Telegraph: it goes live soon, so leave early.
        risk += ph.phase === 'live' ? 150 : 40 * (1 - ph.p * 0.5);
      }
      for (const u of w.units) {
        const d = Math.hypot(x - u.x, y - u.y);
        if (d < 110) risk += (110 - d) * 0.12;
      }
      for (const o of w.obstacles) {
        if (o.warn > 0) {
          // A marker on the bottom or side edge: keep clear of that edge strip.
          if (o.edge === 'bottom' && y > H - 190 && Math.abs(x - o.spawn.x) < o.w * 0.6 + 40) risk += 25;
          if ((o.edge === 'left' || o.edge === 'right') && Math.abs(y - o.y) < o.h * 0.6 + 40 && (o.edge === 'left' ? x < 220 : x > W - 220)) risk += 12;
          continue;
        }
        const reach = Math.hypot(o.w, o.h) / 2 + 60;
        if (Math.abs(x - o.x) > reach + 240 || Math.abs(y - o.y) > reach + 260) continue;
        const oy = o.y;
        for (const t of [0, 0.15, 0.3, 0.5, 0.7]) {
          o.y = oy + (o.rise > 0 ? -o.rise : w.scrollSpeed + o.vy) * t;
          if (o.touches(x, y, hb + 14)) risk += 80 / (t + 0.25);
          else if (o.touches(x, y, hb + 40)) risk += 5;
        }
        o.y = oy;
      }
      const wantX = w.goal ? w.goal.x : w.wantX;
      const wantY = w.goal ? w.goal.y : w.wantY;
      const pull = Math.hypot(x - wantX, (y - wantY) * 0.5) * 0.03;
      const move = Math.hypot(x - w.ship.x, y - w.ship.y) * 0.02;
      const score = risk + pull + move;
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}
