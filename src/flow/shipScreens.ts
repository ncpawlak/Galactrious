import { H, W } from '../config';
import { auxById, AUX_DEFS, MAIN_DEFS, mainById, type WeaponDef } from '../weapons';
import { cleanLoadout, defaultLoadoutFor, weaponAvailable } from '../loadouts';
import { drawShipLook, SHIPS, shipById, shipUnlocked, type WeaponLoadout } from '../ships';
import { drawCentered } from './screens';
import type { NodeHost } from './node';

const MONO = 'ui-monospace, Consolas, monospace';
const LOCKOUT = 0.25; // the press that opened a screen cannot act on it

interface Btn {
  x: number;
  y: number;
  w: number;
  h: number;
}

const hit = (b: Btn, p: { x: number; y: number }): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

function button(g: CanvasRenderingContext2D, b: Btn, label: string, color: string, enabled = true): void {
  g.save();
  g.globalAlpha = enabled ? 1 : 0.35;
  g.fillStyle = '#0b1424';
  g.fillRect(b.x, b.y, b.w, b.h);
  g.lineWidth = 3;
  g.strokeStyle = color;
  g.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
  g.fillStyle = color;
  g.font = `bold 18px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  g.restore();
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left'): void {
  g.save();
  g.font = font;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillText(s, x, y);
  g.restore();
}

/** Cut `s` to at most `n` characters with an ellipsis. */
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Split `s` into two lines of at most `n` characters at a space. */
function wrap2(s: string, n: number): [string, string] {
  if (s.length <= n) return [s, ''];
  const cut = s.lastIndexOf(' ', n);
  const at = cut > 0 ? cut : n;
  return [s.slice(0, at), s.slice(at).trim()];
}

/** A weapon's icon: a ring in its colour with its initial. */
function weaponIcon(g: CanvasRenderingContext2D, def: WeaponDef | undefined, x: number, y: number, r: number, dim = false): void {
  g.save();
  g.globalAlpha = dim ? 0.4 : 1;
  g.fillStyle = 'rgba(5, 6, 13, 0.8)';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = def?.color ?? '#3a4560';
  g.stroke();
  g.fillStyle = '#e8ecf8';
  g.font = `bold ${Math.round(r * 0.9)}px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(def ? def.name[0] : '-', x, y + 1);
  g.restore();
}

const weaponName = (id: string): string => (mainById(id).id === id ? mainById(id).name : (auxById(id)?.name ?? id));

// ------------------------------------------------------------------------------------------------------------
// Ship select

const SHIP_ROW = { x: 30, y0: 140, w: W - 60, h: 190, gap: 12, visible: 3 };
const SHIP_BACK: Btn = { x: 30, y: 856, w: 220, h: 56 };
const SHIP_NEXT: Btn = { x: W - 250, y: 856, w: 220, h: 56 };

export type ScreenResult = 'back' | 'next' | null;

/** Endless step 1: pick a ship (look, stats, weapons; locked ships show how to unlock them). */
export class ShipSelectScreen {
  index: number;
  private t = 0;

  constructor(shipId: string) {
    this.index = Math.max(0, SHIPS.findIndex((s) => s.id === shipId));
  }

  get ship() {
    return SHIPS[this.index];
  }

  private get first(): number {
    return Math.max(0, Math.min(SHIPS.length - SHIP_ROW.visible, this.index - (SHIP_ROW.visible - 1)));
  }

  private rowY(slot: number): number {
    return SHIP_ROW.y0 + slot * (SHIP_ROW.h + SHIP_ROW.gap);
  }

  update(dt: number, host: NodeHost): ScreenResult {
    this.t += dt;
    const tap = host.takeTap();
    const key = host.takeKey();
    if (this.t < LOCKOUT) return null;
    if (key === 'ArrowUp' && this.index > 0) this.index--;
    if (key === 'ArrowDown' && this.index < SHIPS.length - 1) this.index++;
    if (key === 'Escape') return 'back';
    if ((key === 'Enter' || key === 'Space') && shipUnlocked(this.ship)) return 'next';
    if (!tap) return null;
    if (hit(SHIP_BACK, tap)) return 'back';
    if (hit(SHIP_NEXT, tap) && shipUnlocked(this.ship)) return 'next';
    for (let k = 0; k < SHIP_ROW.visible && this.first + k < SHIPS.length; k++) {
      const y = this.rowY(k);
      if (hit({ x: SHIP_ROW.x, y, w: SHIP_ROW.w, h: SHIP_ROW.h }, tap)) this.index = this.first + k;
    }
    return null;
  }

  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.fillStyle = 'rgba(5, 6, 13, 0.88)';
    g.fillRect(0, 0, W, H);
    g.restore();
    drawCentered(g, 'SELECT SHIP', 70, `bold 36px ${MONO}`, '#ffd21f');
    drawCentered(g, 'Endless', 104, `15px ${MONO}`, '#6ee7ff');
    for (let k = 0; k < SHIP_ROW.visible && this.first + k < SHIPS.length; k++) {
      const i = this.first + k;
      const s = SHIPS[i];
      const open = shipUnlocked(s);
      const x = SHIP_ROW.x;
      const y = this.rowY(k);
      const sel = i === this.index;
      g.save();
      g.fillStyle = open ? '#0b1424' : '#080d18';
      g.fillRect(x, y, SHIP_ROW.w, SHIP_ROW.h);
      g.lineWidth = sel ? 4 : 2;
      g.strokeStyle = sel ? '#6ee7ff' : '#26324d';
      g.strokeRect(x + 1, y + 1, SHIP_ROW.w - 2, SHIP_ROW.h - 2);
      g.globalAlpha = open ? 1 : 0.3;
      drawShipLook(g, s.look, x + 76, y + SHIP_ROW.h / 2 + 4, 2.6);
      g.restore();
      const tx = x + 150;
      text(g, open ? s.name : `${s.name}  (locked)`, tx, y + 36, `bold 22px ${MONO}`, open ? '#ffffff' : '#8a93a8');
      const [d1, d2] = wrap2(s.desc, 38);
      text(g, d1, tx, y + 58, `12px ${MONO}`, '#b6c2e0');
      if (d2) text(g, clip(d2, 38), tx, y + 74, `12px ${MONO}`, '#b6c2e0');
      const b = s.baseStats;
      text(g, `HULL ${b.maxHealth}  SPEED ${b.speed}`, tx, y + 104, `bold 13px ${MONO}`, '#6ee7ff');
      text(g, `DODGE ${b.dodgeCooldown}s  HITBOX ${b.hitbox}px`, tx, y + 122, `bold 13px ${MONO}`, '#6ee7ff');
      text(g, `MAIN ${weaponName(s.startingWeapons.main)}`, tx, y + 148, `12px ${MONO}`, '#ffd21f');
      text(g, clip(`AUX  ${s.startingWeapons.aux.map(weaponName).join(', ')}`, 37), tx, y + 166, `12px ${MONO}`, '#7dff9a');
      if (!open) text(g, clip(`LOCKED: ${s.unlockHint ?? 'unknown'}`, 44), tx, y + 184, `bold 12px ${MONO}`, '#ff8a5a');
    }
    if (SHIPS.length > SHIP_ROW.visible) drawCentered(g, `ship ${this.index + 1}/${SHIPS.length}  (up/down)`, 800, `12px ${MONO}`, '#8fa0c8');
    drawCentered(g, 'tap a ship, then CONTINUE   (keys: up/down, enter, esc)', 836, `12px ${MONO}`, '#8fa0c8');
    button(g, SHIP_BACK, 'BACK', '#ffffff');
    button(g, SHIP_NEXT, 'CONTINUE', '#4ade80', shipUnlocked(this.ship));
  }
}

// ------------------------------------------------------------------------------------------------------------
// Loadout builder

const SLOT_Y = 126;
const SLOT_H = 84;
const SLOT_W = 112;
const SLOT_GAP = 10;
const POOL_Y0 = 262;
const POOL_H = 62;
const POOL_GAP = 6;
const LB_BACK: Btn = { x: 30, y: 856, w: 150, h: 56 };
const LB_RESET: Btn = { x: 195, y: 856, w: 150, h: 56 };
const LB_START: Btn = { x: 360, y: 856, w: 150, h: 56 };

const slotX = (i: number): number => 30 + i * (SLOT_W + SLOT_GAP);
const SLOT_LABELS = ['MAIN', 'AUX 1', 'AUX 2', 'AUX 3'];

/** Endless step 2: choose the main weapon and three aux weapons from the unlocked ones, starting from the ship's own. */
export class LoadoutScreen {
  /** Slot ids: index 0 = main, 1..3 = aux. */
  private slots: string[];
  private focus = 0;
  private t = 0;
  private flash = '';
  private flashT = 0;

  constructor(
    private readonly shipId: string,
    start: WeaponLoadout,
  ) {
    const l = cleanLoadout(start, shipId);
    const d = defaultLoadoutFor(shipId);
    this.slots = [l.main, ...[0, 1, 2].map((i) => l.aux[i] ?? d.aux[i])];
  }

  get loadout(): WeaponLoadout {
    return { main: this.slots[0], aux: this.slots.slice(1) };
  }

  private pool(): WeaponDef[] {
    return this.focus === 0 ? MAIN_DEFS : AUX_DEFS;
  }

  private poolY(i: number): number {
    return POOL_Y0 + i * (POOL_H + POOL_GAP);
  }

  /** Put `id` in the focused slot (an aux already in another aux slot swaps places). Locked weapons are refused with a message. */
  private assign(def: WeaponDef): void {
    if (!weaponAvailable(def)) {
      this.say(def.unlockHint ?? 'locked');
      return;
    }
    const f = this.focus;
    if (f > 0) {
      const other = this.slots.findIndex((id, i) => i > 0 && i !== f && id === def.id);
      if (other >= 0) this.slots[other] = this.slots[f];
    }
    this.slots[f] = def.id;
  }

  private say(s: string): void {
    this.flash = s;
    this.flashT = 2.2;
  }

  /** Up/down: step the focused slot to the previous/next available weapon. */
  private cycle(dir: number): void {
    const pool = this.pool();
    let i = pool.findIndex((d) => d.id === this.slots[this.focus]);
    for (let n = 0; n < pool.length; n++) {
      i = (i + dir + pool.length) % pool.length;
      if (weaponAvailable(pool[i])) {
        this.assign(pool[i]);
        return;
      }
    }
  }

  update(dt: number, host: NodeHost): 'back' | 'start' | null {
    this.t += dt;
    this.flashT -= dt;
    const tap = host.takeTap();
    const key = host.takeKey();
    if (this.t < LOCKOUT) return null;
    if (key === 'ArrowLeft') this.focus = (this.focus + 3) % 4;
    if (key === 'ArrowRight') this.focus = (this.focus + 1) % 4;
    if (key === 'ArrowUp') this.cycle(-1);
    if (key === 'ArrowDown') this.cycle(1);
    if (key === 'Escape') return 'back';
    if (key === 'Enter') return 'start';
    if (!tap) return null;
    if (hit(LB_BACK, tap)) return 'back';
    if (hit(LB_START, tap)) return 'start';
    if (hit(LB_RESET, tap)) {
      const d = defaultLoadoutFor(this.shipId);
      this.slots = [d.main, ...d.aux];
      return null;
    }
    for (let i = 0; i < 4; i++) if (hit({ x: slotX(i), y: SLOT_Y, w: SLOT_W, h: SLOT_H }, tap)) this.focus = i;
    this.pool().forEach((def, i) => {
      if (hit({ x: 30, y: this.poolY(i), w: W - 60, h: POOL_H }, tap)) this.assign(def);
    });
    return null;
  }

  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.fillStyle = 'rgba(5, 6, 13, 0.9)';
    g.fillRect(0, 0, W, H);
    g.restore();
    const ship = shipById(this.shipId);
    drawCentered(g, 'LOADOUT', 62, `bold 36px ${MONO}`, '#ffd21f');
    drawCentered(g, `${ship.name}: 1 main + 3 aux`, 94, `15px ${MONO}`, '#6ee7ff');
    drawShipLook(g, ship.look, W - 60, 66, 1.3);
    // Slots.
    for (let i = 0; i < 4; i++) {
      const id = this.slots[i];
      const def = i === 0 ? mainById(id) : auxById(id);
      const x = slotX(i);
      g.save();
      g.fillStyle = '#0b1424';
      g.fillRect(x, SLOT_Y, SLOT_W, SLOT_H);
      g.lineWidth = i === this.focus ? 4 : 2;
      g.strokeStyle = i === this.focus ? '#6ee7ff' : '#26324d';
      g.strokeRect(x + 1, SLOT_Y + 1, SLOT_W - 2, SLOT_H - 2);
      g.restore();
      text(g, SLOT_LABELS[i], x + SLOT_W / 2, SLOT_Y + 16, `bold 11px ${MONO}`, i === 0 ? '#ffd21f' : '#7dff9a', 'center');
      weaponIcon(g, def, x + SLOT_W / 2, SLOT_Y + 44, 16);
      text(g, clip(def?.name ?? '-', 12), x + SLOT_W / 2, SLOT_Y + 76, `bold 12px ${MONO}`, '#ffffff', 'center');
    }
    // Pool for the focused slot.
    drawCentered(g, this.focus === 0 ? 'MAIN WEAPON' : `AUX ${this.focus} WEAPON`, 236, `bold 14px ${MONO}`, '#8fa0c8');
    this.pool().forEach((def, i) => {
      const y = this.poolY(i);
      const open = weaponAvailable(def);
      const here = this.slots[this.focus] === def.id;
      const elsewhere = this.focus > 0 ? this.slots.findIndex((id, k) => k > 0 && k !== this.focus && id === def.id) : -1;
      g.save();
      g.fillStyle = open ? '#0b1424' : '#080d18';
      g.fillRect(30, y, W - 60, POOL_H);
      g.lineWidth = here ? 3 : 1;
      g.strokeStyle = here ? '#4ade80' : '#26324d';
      g.strokeRect(30.5, y + 0.5, W - 61, POOL_H - 1);
      g.restore();
      weaponIcon(g, def, 62, y + POOL_H / 2, 16, !open);
      text(g, open ? def.name : '???', 92, y + 26, `bold 17px ${MONO}`, open ? '#ffffff' : '#6b7488');
      text(g, clip(open ? def.desc : (def.unlockHint ?? 'locked'), 52), 92, y + 46, `12px ${MONO}`, open ? '#b6c2e0' : '#8fa0c8');
      const tag = !open ? 'LOCKED' : here ? 'EQUIPPED' : elsewhere >= 0 ? `IN AUX ${elsewhere}` : '';
      if (tag) text(g, tag, W - 42, y + 26, `bold 12px ${MONO}`, !open ? '#ff8a5a' : here ? '#4ade80' : '#8fa0c8', 'right');
    });
    if (this.flashT > 0) drawCentered(g, clip(this.flash, 54), 830, `bold 13px ${MONO}`, '#ff8a5a');
    else drawCentered(g, 'tap a slot, then a weapon   (keys: left/right slot, up/down weapon, enter start)', 830, `11px ${MONO}`, '#8fa0c8');
    button(g, LB_BACK, 'BACK', '#ffffff');
    button(g, LB_RESET, 'DEFAULT', '#ff8a5a');
    button(g, LB_START, 'START', '#4ade80');
  }
}
