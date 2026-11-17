import { H } from '../config';
import type { ScrollHost } from '../scroll/types';
import type { Unit } from '../units';
import { buildStructure, countTurrets, planEntry, type Follow, type PlannedStructure } from './structures';
import { GROUND, resetGround } from './shadows';
import { GROUND_TAG, isTerrainEntry, type TerrainEntry } from './types';

/** Contact damage of a wall to the ship (the ship has 5 hull by default; a bullet is 1). Never an instant kill. */
export const WALL_DAMAGE = 1;

interface TurretRef {
  id: string;
  tag: string;
  counted: boolean;
}

/** One live structure: its unit, how far it has scrolled, and the turrets that count. */
export interface Structure {
  unit: Unit;
  follow: Follow;
  plan: PlannedStructure;
  turrets: TurretRef[];
}

export interface TurretTally {
  /** Turrets that have been spawned so far / destroyed so far (a turret shot off its mount counts as destroyed). */
  spawned: number;
  destroyed: number;
  /** Alive on the ground right now. */
  alive: number;
  /** Every turret the level's timeline will ever spawn (from `countTurrets`), by the tag the tally shows. */
  planned: number;
  tag: string;
}

/**
 * The ground-defence system of a scrolling level (`ScrollRunnerImpl.terrain`). It owns no combat state of its own: every wall piece
 * and pad is a `ground` unit in the game's unit system (carved, drawn and fired by the unit pipeline). This class
 *  - spawns the units from the terrain timeline entries (`fire`),
 *  - moves them with the ground (each frame `follow.y += scroll px`) and removes them below the screen,
 *  - tallies the turrets (and reports each kill to the host: `destroyAll { tag }` counts it),
 *  - gives the game the wall contact test (`touch`) and the surface background its shadow casters.
 */
export class TerrainSystem {
  readonly structures: Structure[] = [];
  /** Lifetime counters by tag. */
  private readonly spawned: Record<string, number> = {};
  private readonly destroyed: Record<string, number> = {};
  private planned: Record<string, number> = {};
  /** HUD tally state: shown when a `turretTally` entry turned it on. */
  tallyOn = false;
  tallyTag = GROUND_TAG;

  constructor(private readonly host: ScrollHost) {}

  clear(): void {
    this.structures.length = 0;
    for (const k of Object.keys(this.spawned)) delete this.spawned[k];
    for (const k of Object.keys(this.destroyed)) delete this.destroyed[k];
    this.planned = {};
    this.tallyOn = false;
    resetGround();
  }

  /** Called by the runner at level start with the compiled timeline, so `planned` knows the whole level's turrets. */
  setTimeline(entries: readonly { kind: string }[]): void {
    this.planned = countTurrets(entries);
  }

  /** Fire one terrain timeline entry (`lag` = scroll px the entry is late by: the structure starts already scrolled in). */
  fire(e: { kind: string }, lag: number): void {
    if (!isTerrainEntry(e)) return;
    if (e.kind === 'turretTally') {
      this.tallyOn = e.on;
      this.tallyTag = e.tag ?? GROUND_TAG;
      return;
    }
    const spawn = this.host.spawnTerrain;
    if (!spawn) {
      console.warn('terrain: the scroll host cannot spawn terrain (ScrollHost.spawnTerrain missing)');
      return;
    }
    const tag = (e as Exclude<TerrainEntry, { kind: 'turretTally' }>).tag ?? GROUND_TAG;
    for (const plan of planEntry(e)) {
      const follow: Follow = { y: lag - plan.dy };
      const def = buildStructure(plan, follow);
      const unit = spawn.call(this.host, def, { slot: { x: plan.cx, y: -plan.height / 2 - 8 } });
      unit.boss.anchoring = false; // attached to the ground: a carved piece stays where it is
      unit.boss.coreColor = [38, 40, 52]; // the 1 px core marker is not meant to be seen
      const turrets = plan.turrets.map((_, i) => ({ id: `t${i}`, tag, counted: false }));
      this.structures.push({ unit, follow, plan, turrets });
      this.spawned[tag] = (this.spawned[tag] ?? 0) + turrets.length;
    }
  }

  update(dt: number, speed: number): void {
    const casters = this.host.shadowCasters?.();
    GROUND.casters = casters ?? [];
    GROUND.pieces.length = 0;
    for (let i = this.structures.length - 1; i >= 0; i--) {
      const s = this.structures[i];
      s.follow.y += speed * dt;
      const b = s.unit.boss;
      if (s.unit.gone || b.y > H + 20) {
        s.unit.gone = true;
        this.structures.splice(i, 1);
        continue;
      }
      for (const t of s.turrets) {
        if (t.counted) continue;
        const c = s.unit.fight.components.items.find((it) => it.spec.id === t.id);
        if (c && c.state !== 'active') {
          t.counted = true;
          this.destroyed[t.tag] = (this.destroyed[t.tag] ?? 0) + 1;
          this.host.noteGroundKill?.(t.tag);
        }
      }
      if (s.plan.kind === 'wall') GROUND.pieces.push({ canvas: b.layers[0].shadow, x: b.x, y: b.y });
    }
  }

  /** Tally for a tag: spawned, destroyed, alive and the level's planned total. */
  tally(tag = GROUND_TAG): TurretTally {
    const spawned = this.spawned[tag] ?? 0;
    const destroyed = this.destroyed[tag] ?? 0;
    return { spawned, destroyed, alive: spawned - destroyed, planned: Math.max(this.planned[tag] ?? 0, spawned), tag };
  }

  /**
   * Wall contact: the damage if the ship circle (centre plus 8 ring points of radius `r`) touches a solid pixel of a wall's plating or
   * rubble, else 0. Pads (the bunkers) are low and do not hurt.
   */
  touch(x: number, y: number, r: number, damage = WALL_DAMAGE): number {
    for (const s of this.structures) {
      if (s.plan.kind !== 'wall') continue;
      const b = s.unit.boss;
      if (x < b.x - r || x > b.x + b.width + r || y < b.y - r || y > b.y + b.height + r) continue;
      for (let k = -1; k < 8; k++) {
        const px = k < 0 ? x : x + Math.cos((k / 8) * Math.PI * 2) * r;
        const py = k < 0 ? y : y + Math.sin((k / 8) * Math.PI * 2) * r;
        const lx = Math.floor(px - b.x);
        const ly = Math.floor(py - b.y);
        if (lx < 0 || ly < 0 || lx >= b.width || ly >= b.height) continue;
        if (b.isSolid(0, lx, ly) || b.isSolid(1, lx, ly)) return s.plan.opts.damage ?? damage;
      }
    }
    return 0;
  }

  /** The turret tally on the HUD (only when a `turretTally` entry switched it on). */
  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.tallyOn) return;
    const t = this.tally(this.tallyTag);
    const done = t.planned > 0 && t.destroyed >= t.planned;
    ctx.save();
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const text = `TURRETS ${t.destroyed}/${t.planned}`;
    const x = 528;
    const y = 62;
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = 'rgba(8,10,20,0.62)';
    ctx.fillRect(x - w + 6, y - 4, w, 22);
    ctx.fillStyle = done ? '#7dffb0' : '#ffb27a';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}
