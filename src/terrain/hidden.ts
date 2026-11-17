import type { BossSpec } from '../boss';
import type { ComponentSpec } from '../components';
import { crisp, makeCanvas, shade } from '../bosses/paint';
import { EMPIRE } from '../factions';
import type { UnitDefinition } from '../units';
import { chamfer, paintWall, rubbleFor } from './paint';
import type { Follow, PlannedStructure } from './structures';
import { HIDDEN_PREFIX, type HiddenEntry } from './types';

/**
 * Conquest hidden items as ground structures (DESIGN.md "Conquest": Hidden items). Both variants are ordinary `ground` units, so every weapon
 * carves them and the terrain system keeps them on the ground; the only special thing is the one component, whose tag is `hidden:<id>`:
 * when it is destroyed the system reports `noteHidden` instead of a ground kill.
 *  - `crate`: a small cargo crate in the empire slate with bronze straps. The hit area is concealed (nothing is drawn over the paint), it never
 *    shoots, and one amber lamp on the lid flickers now and then (the tell, drawn by `TerrainSystem.draw`). It bursts open on the first hit.
 *  - `cache`: a wall piece with a secret room: the plating has a faint seam rectangle and two amber rivets over it (the tell); under the plating
 *    (the rubble layer) is a lit bay with an embedded console. Carve the plating away and shoot the console.
 */
const K = EMPIRE;
const CRATE = 44;
const CACHE_H = 46;

export interface HiddenLook {
  plan: PlannedStructure;
  /** Lamp position inside the structure (px from its top-left). */
  lamp: { x: number; y: number };
  width: number;
  height: number;
}

const cache = new Map<string, { plating: HTMLCanvasElement; rubble: HTMLCanvasElement }>();

function copy(src: HTMLCanvasElement): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = makeCanvas(src.width, src.height);
  c.ctx.drawImage(src, 0, 0);
  return c;
}

function paintCrate(variant: number): { plating: HTMLCanvasElement; rubble: HTMLCanvasElement } {
  const key = `crate|${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { canvas, ctx } = makeCanvas(CRATE, CRATE);
  const rr = (x: number, y: number, w: number, h: number, c: string): void => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  rr(1, 1, CRATE - 2, CRATE - 2, K.armourDark);
  rr(3, 3, CRATE - 6, CRATE - 6, K.armour);
  rr(3, 3, CRATE - 6, 2, K.armourLight);
  rr(3, 3, 2, CRATE - 6, K.armourLight);
  // Lid inset and bronze straps.
  rr(8, 8, CRATE - 16, CRATE - 16, K.armourDark);
  rr(10, 10, CRATE - 20, CRATE - 20, K.armour);
  rr(CRATE / 2 - 3, 3, 6, CRATE - 6, K.hull);
  rr(3, CRATE / 2 - 3, CRATE - 6, 6, K.hull);
  rr(CRATE / 2 - 1, 3, 1, CRATE - 6, '#a07a5e');
  for (const [x, y] of [[5, 5], [CRATE - 8, 5], [5, CRATE - 8], [CRATE - 8, CRATE - 8]]) rr(x, y, 3, 3, '#c29a78');
  // The lid seam is a hair off (a crate that has been opened and shut): one dark line, shifted by `variant`.
  rr(10, 14 + (variant % 3) * 3, CRATE / 2 - 5, 1, K.armourDark);
  chamfer(ctx, CRATE, CRATE, true, true, 6);
  crisp(ctx);
  shade(ctx, { noise: 0.12, edge: 0.7 });
  const out = { plating: canvas, rubble: rubbleFor(canvas, variant + 70) };
  cache.set(key, out);
  return out;
}

function paintCache(w: number, variant: number): { plating: HTMLCanvasElement; rubble: HTMLCanvasElement } {
  const key = `cache|${w}|${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = paintWall(w, CACHE_H, true, true, [], variant);
  const pl = copy(base.plating);
  const ru = copy(base.rubble);
  const cx = Math.round(w / 2);
  const cy = Math.round(CACHE_H / 2);
  // The secret room under the plating: a lit bay (rubble layer).
  ru.ctx.fillStyle = '#1d2a33';
  ru.ctx.fillRect(cx - 22, cy - 14, 44, 28);
  ru.ctx.fillStyle = '#2f6f8f';
  ru.ctx.fillRect(cx - 18, cy - 10, 36, 20);
  ru.ctx.fillStyle = '#6fc4e8';
  ru.ctx.fillRect(cx - 14, cy - 8, 28, 3);
  ru.ctx.fillRect(cx - 14, cy + 5, 28, 3);
  // The tell on the plating: a faint seam rectangle over the room, and two amber rivets.
  pl.ctx.fillStyle = 'rgba(20, 22, 30, 0.55)';
  pl.ctx.fillRect(cx - 22, cy - 14, 44, 1);
  pl.ctx.fillRect(cx - 22, cy + 13, 44, 1);
  pl.ctx.fillRect(cx - 22, cy - 14, 1, 28);
  pl.ctx.fillRect(cx + 21, cy - 14, 1, 28);
  pl.ctx.fillStyle = K.glow;
  pl.ctx.fillRect(cx - 19, cy - 11, 2, 2);
  pl.ctx.fillRect(cx + 17, cy + 9, 2, 2);
  const out = { plating: pl.canvas, rubble: ru.canvas };
  cache.set(key, out);
  return out;
}

/** The structure plan and the lamp position of a hidden entry (the terrain system needs both before it spawns). */
export function planHidden(e: HiddenEntry): HiddenLook {
  const crate = e.variant === 'crate';
  const width = crate ? CRATE : Math.max(80, Math.round(e.width ?? 120));
  const height = crate ? CRATE : CACHE_H;
  const plan: PlannedStructure = {
    kind: crate ? 'pad' : 'wall',
    cx: e.x,
    width,
    height,
    capL: !crate,
    capR: !crate,
    turrets: [],
    dy: e.dy ?? 0,
    variant: (e.seed ?? 1) % 4,
    opts: {},
  };
  return { plan, lamp: crate ? { x: CRATE - 12, y: 7 } : { x: width / 2 - 18, y: height / 2 - 10 }, width, height };
}

export function hiddenTag(e: HiddenEntry): string {
  return `${HIDDEN_PREFIX}${e.id}`;
}

export function buildHidden(e: HiddenEntry, look: HiddenLook, follow: Follow): UnitDefinition {
  const crate = e.variant === 'crate';
  const { width: w, height: h } = look;
  const painted = crate ? paintCrate((e.seed ?? 1) % 4) : paintCache(w, (e.seed ?? 1) % 4);
  const comp: ComponentSpec = crate
    ? {
        id: 't0',
        type: 'turret',
        anchor: 't0',
        radius: 15,
        hp: 50,
        mount: 'surface',
        group: 'hidden',
        enabled: false,
        concealed: true,
        turret: { aim: 'fixed', angle: 90 },
        blast: { radius: 26, energy: 260, damage: 0, coreDamage: 0 },
        crater: { radius: 12, energy: 200 },
      }
    : {
        id: 't0',
        type: 'console',
        anchor: 't0',
        radius: 9,
        hp: 70,
        mount: 'embedded',
        layer: 1,
        group: 'hidden',
        blast: { radius: 22, energy: 200, damage: 0, coreDamage: 0 },
        crater: { radius: 10, energy: 160 },
      };
  return {
    id: 'terrain-hidden',
    name: crate ? 'Supply crate' : 'Sealed wall',
    size: 'small',
    ground: true,
    faction: 'empire',
    layout: (): BossSpec => ({
      width: w,
      height: h,
      layers: [
        { name: 'Plating', density: 0.6, canvas: painted.plating },
        { name: 'Rubble', density: 0.5, canvas: painted.rubble },
      ],
      core: { x: Math.floor(w / 2), y: h - 3, radius: 1, hp: 1e9 },
      anchors: { t0: { x: w / 2, y: h / 2 } },
    }),
    components: [comp],
    deathFraction: 2,
    hold: { name: 'ground', at: () => ({ x: 0, y: follow.y }) },
    attacks: [],
  };
}
