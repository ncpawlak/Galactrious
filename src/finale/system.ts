import type { Boss } from '../boss';
import type { BossFight } from '../bossFight';
import { H, W } from '../config';
import type { Point } from '../hazards';
import { shipById } from '../ships';
import type { Unit } from '../units';
import { AceHud } from './aceHud';
import { AssistSystem, type AssistHost, type AssistSpec } from './assists';
import { OverloadSequence, type OverloadHost } from './overload';

/**
 * The finale systems, bundled (DESIGN.md "As built: finale systems and the empire ship"): squad assists, named-ace HUD, the armour
 * resonance cue and the core overload sequence. The game owns one `FinaleSystem` and calls `update`, `drawWorld` and `drawOverlay`;
 * nothing here reaches into the game except through `FinaleHost`.
 */
export interface FinaleHost extends AssistHost, OverloadHost {
  /** Alive units (aces and everything else). */
  units(): readonly Unit[];
}

/** Hooks a content session ties to: all optional, cleared by `reset`. */
export interface FinaleHooks {
  /** The overload sequence has finished (the hull is debris): start the victory cinematic here. The game declares the win right after. */
  onOverloadComplete?: () => void;
}

/** True when a ship's weapons can hurt the capital ship's armour (`ShipDefinition.empireTech`). The gate for the armour switch. */
export function shipHasEmpireTech(shipId: string): boolean {
  return shipById(shipId).empireTech === true;
}

const CUE_SECONDS = 2.6;

export class FinaleSystem {
  readonly assists: AssistSystem;
  readonly aces = new AceHud();
  hooks: FinaleHooks = {};
  /** The next boss defeat plays the overload sequence instead of an instant win (set by a `bossFight` objective with `overload: true`). */
  overloadEnabled = false;
  overload: OverloadSequence | null = null;
  private cue = 0;

  constructor(private readonly host: FinaleHost) {
    this.assists = new AssistSystem(host);
  }

  /** Back to nothing: a new fight, a restart, the end of combat. */
  reset(): void {
    this.assists.reset();
    this.aces.reset();
    this.overload = null;
    this.overloadEnabled = false;
    this.cue = 0;
  }

  /** Where the enemies aim (the decoy during a `distract`, else the ship itself). */
  aimPoint(ship: Point): Point {
    return this.assists.aimPoint(ship);
  }

  /** The armour just became hittable: start the shimmer. */
  armourResonance(): void {
    this.cue = CUE_SECONDS;
  }

  get cueActive(): boolean {
    return this.cue > 0;
  }

  /** The hull is gone (the final flash passed): the game skips drawing the boss. */
  get bossHidden(): boolean {
    return !!this.overload?.broken;
  }

  /** Start the overload sequence for this boss; `done` fires when it ends. */
  startOverload(boss: Boss, done: () => void): void {
    if (this.overload) return;
    this.assists.pending = []; // the squad stands down: no countdowns over the overload and the victory
    this.assists.halted = true;
    this.overload = new OverloadSequence(this.host, boss, () => {
      this.hooks.onOverloadComplete?.();
      done();
    });
  }

  update(dt: number): void {
    this.assists.update(dt);
    this.aces.update(dt, this.host.units());
    this.overload?.update(dt);
    if (this.cue > 0) this.cue = Math.max(0, this.cue - dt);
  }

  /** The armour-resonance shimmer: a bright band sweeping across the armour layer, plus a soft pulse over it. Drawn right after the boss. */
  drawArmourCue(g: CanvasRenderingContext2D, fight: BossFight): void {
    if (this.cue <= 0) return;
    const b = fight.boss;
    const layer = b.layers.find((l) => l.armour);
    if (!layer) return;
    const k = 1 - this.cue / CUE_SECONDS; // 0 -> 1
    const buf = cueBuffer(b.width, b.height);
    const c = buf.getContext('2d')!;
    c.clearRect(0, 0, b.width, b.height);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(layer.canvas, 0, 0);
    c.globalCompositeOperation = 'source-in';
    // A diagonal band moving across the hull (twice), over a base glow that rises and falls.
    const sweep = ((k * 2) % 1) * (b.width + b.height * 0.6) - b.height * 0.3;
    const grad = c.createLinearGradient(sweep - 150, 0, sweep + 150, b.height * 0.5);
    grad.addColorStop(0, 'rgba(255, 140, 70, 0)');
    grad.addColorStop(0.5, 'rgba(255, 250, 225, 1)');
    grad.addColorStop(1, 'rgba(255, 140, 70, 0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, b.width, b.height);
    const base = Math.sin(Math.min(1, k) * Math.PI);
    c.fillStyle = `rgba(255, 110, 40, ${0.55 * base})`;
    c.fillRect(0, 0, b.width, b.height);
    g.drawImage(buf, Math.round(b.x), Math.round(b.y));
  }

  /** With the world, above the units: assist wingmen and lanes, callsign tags, the overload glow and debris. */
  drawWorld(g: CanvasRenderingContext2D): void {
    this.assists.drawWorld(g);
    this.aces.drawTags(g, this.host.units());
    this.overload?.draw(g);
  }

  /** Screen space, above the shake: the assist countdown, the ace banner, and the final flash. */
  drawOverlay(g: CanvasRenderingContext2D): void {
    this.assists.drawHud(g);
    this.aces.drawBanner(g);
    this.overload?.drawFlash(g);
    if (this.cue > 0) {
      const k = this.cue / CUE_SECONDS;
      g.save();
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.globalAlpha = Math.min(1, k * 2.2) * Math.min(1, (1 - k) * 6);
      g.font = 'bold 18px ui-monospace, Consolas, monospace';
      g.fillStyle = '#ffb25c';
      g.fillText('ARMOUR RESONANCE', W / 2, 440);
      g.font = '13px ui-monospace, Consolas, monospace';
      g.fillStyle = '#ffe6c0';
      g.fillText('your guns now cut empire plating', W / 2, 462);
      g.restore();
    }
    void H;
  }
}

let cueCanvas: HTMLCanvasElement | null = null;

function cueBuffer(w: number, h: number): HTMLCanvasElement {
  if (!cueCanvas || cueCanvas.width !== w || cueCanvas.height !== h) {
    cueCanvas = document.createElement('canvas');
    cueCanvas.width = w;
    cueCanvas.height = h;
  }
  return cueCanvas;
}

export type { AssistSpec };
