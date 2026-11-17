import { H, W } from '../config';
import type { NodeHost } from '../flow/node';
import { saveStore, type UnlockKind } from '../save';
import { drawShipLook, SHIP_BY_ID, SHIPS, type ShipDefinition } from '../ships';
import { CARDS } from '../upgrades/cards';
import { WEAPON_DEFS } from '../weapons';

/**
 * Unlock reveal (DESIGN.md "As built: finale systems and the empire ship"): what a campaign unlocks at its end, as data
 * (`CampaignDefinition.unlocks`), written into the save by `applyUnlocks`, and a reusable screen (`UnlockRevealScreen`) that shows the newly
 * unlocked items one by one. The campaign flow shows it after the final result and before returning to level select.
 *
 * `id` is the unlock flag (`save.unlocks[kind]`), which is the `unlock` field of the ship, weapon or card. Ids that nothing
 * defines (yet) still unlock and still show: the spec's own `name` / `desc` are used, with a generic icon. Never crashes.
 */
export interface UnlockSpec {
  kind: UnlockKind;
  /** The unlock flag. */
  id: string;
  /** Fallbacks for an id nothing defines (yet); the real name and description win when the item exists. */
  name?: string;
  desc?: string;
}

/** The "Fallen Peace" reward for finishing the campaign with any medals: the enemy ship (with its own Pulse Orbs and Energy Bomb on it). */
export const FALLEN_PEACE_UNLOCKS: UnlockSpec[] = [
  { kind: 'ships', id: 'empire-fighter', name: 'Empire Fighter', desc: 'The captured empire ship: tougher, faster, and its guns hurt empire armour.' },
];

/** The extra reward when EVERY chapter holds a gold medal: the two weapons of the empire ship, usable on any ship. (The Laser and Energy Wave are stashed for later.) */
export const FALLEN_PEACE_GOLD_UNLOCKS: UnlockSpec[] = [
  { kind: 'weapons', id: 'pulse-orb', name: 'Pulse Orbs', desc: 'A new main weapon: the enemy pulse orbs, turned around.' },
  { kind: 'weapons', id: 'flak', name: 'Energy Bomb', desc: 'A new aux weapon: one slow shell that bursts in a wide blast.' },
];

/** True when every level of the campaign has a gold medal in the save. */
export function allGold(levelIds: readonly string[]): boolean {
  return levelIds.length > 0 && levelIds.every((id) => saveStore.current.medals[id]?.best === 'gold');
}

/** What finishing a campaign unlocks: its `unlocks`, plus its `goldUnlocks` when every level is gold (read from the save: call after the last medal is stored). */
export function campaignUnlockSpecs(c: { levels: readonly { id: string }[]; unlocks?: UnlockSpec[]; goldUnlocks?: UnlockSpec[] }, forceGold = false): UnlockSpec[] {
  const gold = forceGold || allGold(c.levels.map((l) => l.id));
  return [...(c.unlocks ?? []), ...(gold ? (c.goldUnlocks ?? []) : [])];
}

export interface UnlockItem {
  spec: UnlockSpec;
  /** False when it was already unlocked before this call (a replay, or the debug trigger). */
  isNew: boolean;
}

/** Write the unlocks into the save (once each) and report which were new. */
export function applyUnlocks(specs: readonly UnlockSpec[]): UnlockItem[] {
  return specs.map((spec) => ({ spec, isNew: saveStore.unlock(spec.kind, spec.id) }));
}

/** What the reveal shows for one unlock. */
export interface UnlockInfo {
  name: string;
  /** "SHIP", "MAIN WEAPON", "AUX WEAPON", "CARD" or "UNLOCK". */
  label: string;
  desc: string;
  color: string;
  /** Draws the icon centred at (x, y), fitting a box of about `s` px. */
  icon(g: CanvasRenderingContext2D, x: number, y: number, s: number): void;
}

const MONO = 'ui-monospace, Consolas, monospace';

function shipFor(id: string): ShipDefinition | undefined {
  return SHIPS.find((s) => s.unlock === id) ?? SHIP_BY_ID.get(id);
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, glyph: string): void {
  const r = s * 0.42;
  g.save();
  g.fillStyle = 'rgba(5, 6, 13, 0.85)';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = '#e8ecf8';
  g.font = `bold ${Math.round(r * 1.1)}px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, x, y + 2);
  g.restore();
}

/** Look an unlock up in the ship, weapon and card registries; unknown ids get a generic entry built from the spec. */
export function describeUnlock(spec: UnlockSpec): UnlockInfo {
  if (spec.kind === 'ships') {
    const s = shipFor(spec.id);
    if (s) return { name: s.name, label: 'SHIP', desc: s.desc, color: s.look.hull.color, icon: (g, x, y, size) => drawShipLook(g, s.look, x, y, size / 48) };
  } else if (spec.kind === 'weapons') {
    const w = WEAPON_DEFS.find((d) => d.unlock === spec.id || d.id === spec.id);
    if (w) return { name: w.name, label: w.slot === 'main' ? 'MAIN WEAPON' : 'AUX WEAPON', desc: w.desc, color: w.color, icon: (g, x, y, size) => ring(g, x, y, size, w.color, w.name[0]) };
  } else {
    const c = CARDS.find((d) => d.unlock === spec.id || d.id === spec.id);
    if (c) return { name: c.name, label: 'CARD', desc: c.desc, color: '#ffd21f', icon: (g, x, y, size) => ring(g, x, y, size, '#ffd21f', c.name[0]) };
  }
  const label = spec.kind === 'ships' ? 'SHIP' : spec.kind === 'weapons' ? 'WEAPON' : 'CARD';
  const name = spec.name ?? spec.id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  return { name, label, desc: spec.desc ?? 'A new unlock.', color: '#6ee7ff', icon: (g, x, y, size) => ring(g, x, y, size, '#6ee7ff', name[0] ?? '?') };
}

function wrapText(g: CanvasRenderingContext2D, s: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > width && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

const REVEAL_STEP = 1.0;
const FIRST_AT = 0.9;
const LOCKOUT = 0.4;

/**
 * The reveal: a title, then each item pops in (flash, scale-up, confetti) one second after the last, with its icon, a NEW tag, its name
 * and a short description. Tap, Enter or Space continues once everything is shown (and skips ahead before that).
 */
export class UnlockRevealScreen {
  private t = 0;
  private readonly infos: UnlockInfo[];

  constructor(
    readonly items: readonly UnlockItem[],
    private readonly title = 'NEW UNLOCKS',
  ) {
    this.infos = items.map((i) => describeUnlock(i.spec));
  }

  /** Seconds at which item `i` is revealed. */
  private at(i: number): number {
    return FIRST_AT + i * REVEAL_STEP;
  }

  get allShown(): boolean {
    return this.t >= this.at(this.items.length - 1) + 0.6;
  }

  /** Returns true when the player continues. */
  update(dt: number, host: NodeHost): boolean {
    this.t += dt;
    const tap = host.takeTap();
    const key = host.takeKey();
    const pressed = !!tap || key === 'Enter' || key === 'Space' || key === 'Escape';
    if (this.t < LOCKOUT || !pressed) return false;
    if (!this.allShown) {
      this.t = this.at(this.items.length - 1) + 0.6; // first press skips the animation
      return false;
    }
    return true;
  }

  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.fillStyle = 'rgba(5, 6, 13, 0.9)';
    g.fillRect(0, 0, W, H);
    // Confetti: a cheap deterministic shower, started with the title.
    const colors = ['#ffd21f', '#6ee7ff', '#7effc0', '#ff8a5a', '#c77dff'];
    for (let i = 0; i < 54; i++) {
      const seed = i * 97.13;
      const x = (Math.sin(seed) * 0.5 + 0.5) * W;
      const speed = 60 + ((i * 37) % 70);
      const y = ((this.t * speed + (seed % H)) % (H + 40)) - 20;
      g.globalAlpha = Math.min(1, this.t / 0.8) * 0.8;
      g.fillStyle = colors[i % colors.length];
      g.fillRect(Math.round(x + Math.sin(this.t * 2 + i) * 10), Math.round(y), 5, 5);
    }
    g.globalAlpha = 1;
    const pop = Math.min(1, this.t / 0.5);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `bold ${Math.round(30 + 10 * (1 - pop))}px ${MONO}`;
    g.fillStyle = '#ffd21f';
    g.fillText(this.title, W / 2, 96);
    g.font = `14px ${MONO}`;
    g.fillStyle = '#8fa0c8';
    g.fillText(this.items.some((i) => i.isNew) ? 'added to your hangar' : 'already unlocked', W / 2, 124);

    const n = this.items.length;
    const top = 150;
    const rowH = Math.min(190, (H - top - 110) / Math.max(1, n));
    this.items.forEach((item, i) => {
      const k = (this.t - this.at(i)) / 0.45;
      if (k <= 0) return;
      const e = Math.min(1, k);
      const scale = 1 + (1 - e) * 0.25;
      const info = this.infos[i];
      const cy = top + i * rowH + rowH / 2;
      g.save();
      g.translate(W / 2, cy);
      g.scale(scale, scale);
      g.globalAlpha = e;
      g.fillStyle = '#0b1424';
      g.fillRect(-W / 2 + 30, -rowH / 2 + 6, W - 60, rowH - 12);
      g.lineWidth = 3;
      g.strokeStyle = info.color;
      g.strokeRect(-W / 2 + 31.5, -rowH / 2 + 7.5, W - 63, rowH - 15);
      // Icon on a glow.
      const ix = -W / 2 + 110;
      const glow = g.createRadialGradient(ix, 0, 4, ix, 0, 70);
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = glow;
      g.fillRect(ix - 70, -70, 140, 140);
      info.icon(g, ix, 0, Math.min(96, rowH - 40));
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.font = `bold 11px ${MONO}`;
      g.fillStyle = info.color;
      g.fillText(info.label + (item.isNew ? '   NEW' : ''), ix + 90, -rowH / 2 + 38);
      g.font = `bold 24px ${MONO}`;
      g.fillStyle = '#ffffff';
      g.fillText(info.name, ix + 90, -rowH / 2 + 68);
      g.font = `13px ${MONO}`;
      g.fillStyle = '#c8d0e8';
      wrapText(g, info.desc, 270).slice(0, 4).forEach((l, li) => g.fillText(l, ix + 90, -rowH / 2 + 92 + li * 18));
      g.restore();
      // A ring flash at the reveal moment.
      if (k < 1) {
        g.save();
        g.strokeStyle = info.color;
        g.globalAlpha = 1 - k;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(W / 2 - W / 2 + 110 + 0, cy, 30 + k * 160, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    });
    if (this.allShown && Math.floor(this.t * 2) % 2 === 0) {
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.font = `18px ${MONO}`;
      g.fillText('tap to continue', W / 2, 900);
    }
    g.restore();
  }
}
