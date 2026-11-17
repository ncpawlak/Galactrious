import type { CarveShapeName } from './carveShapes';
import { WEAPONS } from './config';
import type { Combatant } from './weapons';

/**
 * Tag hooks: the modifier layer for elemental effects (DESIGN.md "Rewards and upgrades").
 *
 * A projectile (a chain gun bullet or a weapon projectile) carries a `TagSet`: tag id -> stacks. Tags come from the
 * held upgrades: a card whose modifier targets the stat `<weapon>.tag.<tag>` (e.g. `chain.tag.burn` +1) gives that
 * weapon's shots that tag with that many stacks (`Loadout.tags(weapon)`). Whenever a tagged shot lands (carve, component
 * hit or blast) the hit path calls ONE hook: `TagSystem.onHit(tags, x, y, energy, target)`, which hands the hit to each
 * tag's handler. Carving, blasts and damage code are untouched by tags.
 *
 * To add a tag (chain lightning, freeze...): add its id to `TAG_IDS`, write a `TagHandler` (onHit, and optionally
 * update / draw / reset for ongoing effects), register it in `TagSystem`'s `handlers`, add the stat key
 * `<weapon>.tag.<id>` to `STATS` and a card in cards.ts. Handlers may only touch targets (the boss and units) through
 * `TagHost`, so an elemental effect can never hurt the player.
 */
export const TAG_IDS = ['burn'] as const;
export type TagId = (typeof TAG_IDS)[number];
/** Tag id -> stacks (absent or 0 = not tagged). */
export type TagSet = Partial<Record<TagId, number>>;

/** One landed shot, as handlers see it. `x`, `y` are screen coordinates of the impact. */
export interface TagHit {
  x: number;
  y: number;
  /** The energy of the shot at the impact (before the carve). */
  energy: number;
  target: Combatant;
  /** Stacks of this handler's tag on the shot. */
  stacks: number;
}

/** What handlers may ask of the game. Target-only by construction. */
export interface TagHost {
  /** Live ship damage / default damage (debug damage scales elemental energy too). */
  power(): number;
  /** A quiet carve on a target (core armor applies; no shake, hit stop, numbers or sound). */
  carveQuiet(target: Combatant, x: number, y: number, energy: number, shape: CarveShapeName): boolean;
}

export interface TagHandler {
  onHit(hit: TagHit): void;
  update?(dt: number, host: TagHost): void;
  draw?(ctx: CanvasRenderingContext2D): void;
  reset?(): void;
}

export function hasTags(t: TagSet | undefined): t is TagSet {
  return !!t && TAG_IDS.some((id) => (t[id] ?? 0) > 0);
}

// --- burn ---------------------------------------------------------------------------------------

interface Patch {
  target: Combatant;
  /** Target-local position, so the fire rides along with a moving boss or unit. */
  lx: number;
  ly: number;
  stacks: number;
  life: number;
  tick: number;
  seed: number;
  /** Tick counter, rotates the probe ring. */
  spin: number;
}

/**
 * Burn: a hit leaves a burning patch on the target that carves a little every tick for a short time. Hits near an
 * existing patch refresh it instead of making a new one, so cost stays bounded (`WEAPONS.burn.maxPatches`).
 * Components are not damaged by the fire itself (only carved pixels), to keep component juice quiet.
 */
class BurnHandler implements TagHandler {
  private patches: Patch[] = [];
  private t = 0;
  private seed = 1;

  onHit(h: TagHit): void {
    const b = WEAPONS.burn;
    const boss = h.target.boss;
    const lx = h.x - boss.x;
    const ly = h.y - boss.y;
    const life = b.life + b.lifePerStack * (h.stacks - 1);
    for (const p of this.patches) {
      if (p.target === h.target && Math.hypot(p.lx - lx, p.ly - ly) <= b.merge) {
        p.life = Math.max(p.life, life);
        p.stacks = Math.max(p.stacks, h.stacks);
        return;
      }
    }
    if (this.patches.length >= b.maxPatches) this.patches.shift();
    this.patches.push({ target: h.target, lx, ly, stacks: h.stacks, life, tick: b.tick * Math.random(), seed: this.seed++, spin: 0 });
  }

  update(dt: number, host: TagHost): void {
    this.t += dt;
    const b = WEAPONS.burn;
    for (const p of this.patches) {
      p.life -= dt;
      p.tick -= dt;
      if (p.target.boss.defeated) {
        p.life = 0;
        continue;
      }
      while (p.tick <= 0 && p.life > -b.tick) {
        p.tick += b.tick;
        const boss = p.target.boss;
        // The hit point itself was just carved away by the shot, so the fire bites the nearest solid pixel around it:
        // the centre first, then a few probes on a ring (rotating every tick so it eats all round).
        const energy = b.energy * p.stacks * host.power();
        const shape = `ember${Math.min(3, p.stacks)}` as CarveShapeName;
        const r = 4 + 3 * Math.min(3, p.stacks);
        const spin = p.seed + p.spin++;
        for (let k = -1; k < 6; k++) {
          const a = spin * 2.4 + (k * Math.PI * 2) / 6;
          const ox = k < 0 ? 0 : Math.cos(a) * r;
          const oy = k < 0 ? 0 : Math.sin(a) * r;
          if (host.carveQuiet(p.target, boss.x + p.lx + ox, boss.y + p.ly + oy, energy, shape)) break;
        }
      }
    }
    this.patches = this.patches.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.patches.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const frame = Math.floor(this.t * 10);
    for (const p of this.patches) {
      const boss = p.target.boss;
      const cx = boss.x + p.lx;
      const cy = boss.y + p.ly;
      const fade = Math.min(1, p.life / 0.4);
      const r = 5 + 3 * Math.min(3, p.stacks);
      ctx.globalAlpha = 0.18 * fade;
      ctx.fillStyle = '#ff7a1f';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade;
      const flames = 3 + p.stacks;
      for (let k = 0; k < flames; k++) {
        // Cheap deterministic flicker: each flame re-seeds ~10 times a second and licks upward.
        const h = Math.sin((p.seed * 12.9898 + k * 78.233 + frame * 3.1) * 43758.5453);
        const f = h - Math.floor(h);
        const ox = (f - 0.5) * 2 * r;
        const ph = (this.t * 4 + k * 0.37 + p.seed) % 1;
        const oy = -ph * r * 1.4 + r * 0.4;
        const size = 2 + (1 - ph) * 3;
        ctx.fillStyle = ph < 0.5 ? '#ffd24a' : '#ff6a2e';
        ctx.fillRect(Math.round(cx + ox), Math.round(cy + oy), size, size + 1);
      }
    }
    ctx.restore();
  }

  reset(): void {
    this.patches = [];
  }

  get count(): number {
    return this.patches.length;
  }
}

/** Dispatches the single hit hook to every tag handler and runs the handlers' ongoing effects. */
export class TagSystem {
  readonly burn = new BurnHandler();
  private readonly handlers: Record<TagId, TagHandler> = { burn: this.burn };

  constructor(private readonly host: TagHost) {}

  /** The hook: a shot carrying `tags` landed at (x, y) with `energy` on `target`. */
  onHit(tags: TagSet | undefined, x: number, y: number, energy: number, target: Combatant): void {
    if (!tags) return;
    for (const id of TAG_IDS) {
      const stacks = tags[id] ?? 0;
      if (stacks > 0) this.handlers[id].onHit({ x, y, energy, target, stacks });
    }
  }

  update(dt: number): void {
    for (const id of TAG_IDS) this.handlers[id].update?.(dt, this.host);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const id of TAG_IDS) this.handlers[id].draw?.(ctx);
  }

  reset(): void {
    for (const id of TAG_IDS) this.handlers[id].reset?.();
  }
}
