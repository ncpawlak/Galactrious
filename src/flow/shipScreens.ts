import { H, W } from '../config';
import { auxById, AUX_DEFS, MAIN_DEFS, type MainDef, type WeaponDef } from '../weapons';
import { bodyHasNewSkin, cleanLoadout, defaultLoadoutFor, isNewShip, isNewSkin, isNewWeapon, weaponAvailable } from '../loadouts';
import { saveStore } from '../save';
import { drawShipLook, equippedSkin, SHIPS, shipUnlocked, skinKey, skinLook, skinsOf, skinUnlocked, type ShipDefinition, type ShipSkin, type WeaponLoadout } from '../ships';
import { drawCentered } from './screens';
import type { NodeHost } from './node';

/**
 * The ship builder: ONE screen for Endless and Conquest (DESIGN.md "Ship builder screen (Endless and Conquest)").
 * Header with the body and arrows, the hero model, a stats strip, one MAIN and three AUX slots, BACK / DEFAULT / START, and a
 * bottom sheet that lists every weapon for the tapped slot (locked ones as silhouettes with their requirement).
 */

const MONO = 'ui-monospace, Consolas, monospace';
const LOCKOUT = 0.25; // the press that opened a screen cannot act on it
const SWIPE = 50; // px of horizontal travel that counts as a swipe on the model
const DRAG = 10; // px of vertical travel that turns a press in the weapon sheet into a scroll

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

/** Word-wrap `s` into at most `max` lines of at most `n` characters (the last line is clipped with an ellipsis). */
function wrapLines(s: string, n: number, max: number): string[] {
  const out: string[] = [];
  let rest = s.trim();
  while (rest && out.length < max) {
    if (rest.length <= n) { out.push(rest); rest = ''; break; }
    const cut = rest.lastIndexOf(' ', n);
    const at = cut > 0 ? cut : n;
    out.push(rest.slice(0, at));
    rest = rest.slice(at).trim();
  }
  if (rest) out[out.length - 1] = clip(`${out[out.length - 1]} ${rest}`, n);
  return out;
}

/** Split `s` into two lines of at most `n` characters at a space. */
function wrap2(s: string, n: number): [string, string] {
  if (s.length <= n) return [s, ''];
  const cut = s.lastIndexOf(' ', n);
  const at = cut > 0 ? cut : n;
  return [s.slice(0, at), s.slice(at).trim()];
}

/** A padlock centred at (x, y), `s` px tall. */
function lockIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number, color = '#ff8a5a'): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = Math.max(2, s * 0.12);
  const bw = s * 0.7;
  const bh = s * 0.5;
  g.fillRect(-bw / 2, -bh / 2 + s * 0.12, bw, bh);
  g.beginPath();
  g.arc(0, -bh / 2 + s * 0.12, bw * 0.3, Math.PI, 0);
  g.stroke();
  g.fillStyle = '#05060d';
  g.fillRect(-s * 0.05, s * 0.05, s * 0.1, s * 0.18);
  g.restore();
}

/** The NEW marker: a green dot. */
function newDot(g: CanvasRenderingContext2D, x: number, y: number, r = 7): void {
  g.save();
  g.fillStyle = '#4ade80';
  g.strokeStyle = '#05060d';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();
}

/** A weapon's icon: a ring in its colour with its initial; `silhouette` = a locked weapon (black disc, grey ring, a padlock). */
function weaponIcon(g: CanvasRenderingContext2D, def: WeaponDef | undefined, x: number, y: number, r: number, silhouette = false): void {
  g.save();
  g.fillStyle = silhouette ? '#000' : 'rgba(5, 6, 13, 0.8)';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = silhouette ? '#3a4560' : (def?.color ?? '#3a4560');
  g.stroke();
  if (silhouette) lockIcon(g, x, y, r * 1.1);
  else {
    g.fillStyle = '#e8ecf8';
    g.font = `bold ${Math.round(r * 0.9)}px ${MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(def ? def.name[0] : '-', x, y + 1);
  }
  g.restore();
}

const weaponDef = (id: string): WeaponDef | undefined => (id === '' ? undefined : (MAIN_DEFS.find((d) => d.id === id) ?? auxById(id)));

// ------------------------------------------------------------------------------------------------------------
// Layout

const ARROW_L: Btn = { x: 14, y: 22, w: 84, h: 84 };
const ARROW_R: Btn = { x: W - 98, y: 22, w: 84, h: 84 };
const SKIN_L: Btn = { x: 10, y: 226, w: 58, h: 84 };
const SKIN_R: Btn = { x: W - 68, y: 226, w: 58, h: 84 };
const MODEL_AREA: Btn = { x: 0, y: 112, w: W, h: 330 };
const MODEL = { x: W / 2, y: 262, scale: 4.8 };
const STATS_Y = 468;
const MAIN_BOX: Btn = { x: 30, y: 542, w: W - 60, h: 92 };
const AUX_W = 150;
const auxBox = (i: number): Btn => ({ x: 30 + i * (AUX_W + 15), y: 650, w: AUX_W, h: 118 });
const BACK: Btn = { x: 30, y: 856, w: 150, h: 56 };
const RESET: Btn = { x: 195, y: 856, w: 150, h: 56 };
const START: Btn = { x: 360, y: 856, w: 150, h: 56 };
const SHEET_H = 640;
const SHEET_TOP = H - SHEET_H;
const SHEET_LIST_Y = 60; // list starts this far below the sheet top
const ROW_H = 112; // name + up to three lines of 14px description

const slotBox = (i: number): Btn => (i === 0 ? MAIN_BOX : auxBox(i - 1));
const SLOT_NAMES = ['MAIN', 'AUX 1', 'AUX 2', 'AUX 3'];

export type BuilderResult = 'back' | 'start' | null;

/** A row of the weapon sheet. */
interface SheetRow {
  def: WeaponDef;
  open: boolean;
  isNew: boolean;
}

/** Endless and Conquest: choose the body and its weapons on one screen. */
export class ShipBuilderScreen {
  private index: number;
  /** Per body: slot ids, index 0 = main, 1..3 = aux, '' = empty. Edits survive switching bodies while the screen is open. */
  private readonly slots = new Map<string, string[]>();
  /** Open weapon sheet: the slot it fills, slide-in progress, scroll, the rows (a snapshot, so NEW dots stay for this visit). */
  private sheet: { slot: number; t: number; scroll: number; rows: SheetRow[]; cursor: number } | null = null;
  private press: { x: number; y: number; scroll: number; moved: boolean; area: 'model' | 'sheet' } | null = null;
  private pressLast = { x: 0, y: 0 };
  /** Bodies that were NEW when first shown on this visit (they are marked seen at once, but keep their dot until you leave the screen). */
  private readonly newThisVisit = new Set<string>();
  /** Skins that were NEW when first shown on this visit (`skinKey`), same idea as `newThisVisit`. */
  private readonly newSkinsThisVisit = new Set<string>();
  /** The skin shown per body (index into its skins). Starts on the equipped one; a locked skin can be viewed but is never equipped. */
  private readonly skinAt = new Map<string, number>();
  private t = 0;
  private flash = '';
  private flashT = 0;

  constructor(
    shipId: string,
    private readonly subtitle = 'Endless',
    /** Last-used loadout of the body the screen opens on (the run's selection). */
    start?: WeaponLoadout,
  ) {
    this.index = Math.max(0, SHIPS.findIndex((s) => s.id === shipId));
    if (start) this.slots.set(SHIPS[this.index].id, this.fromLoadout(start));
    this.view();
  }

  get ship(): ShipDefinition {
    return SHIPS[this.index];
  }

  /** The loadout in the slots now (empty aux slots dropped). */
  get loadout(): WeaponLoadout {
    const s = this.current;
    return { main: s[0], aux: s.slice(1).filter((id) => id !== '') };
  }

  private get current(): string[] {
    let s = this.slots.get(this.ship.id);
    if (!s) {
      const last = saveStore.current.loadouts?.[this.ship.id];
      s = this.fromLoadout(last ?? defaultLoadoutFor(this.ship.id));
      this.slots.set(this.ship.id, s);
    }
    return s;
  }

  /** Four slot ids from a loadout: unknown or unavailable weapons fall back to the body's preset for that slot (or empty). */
  private fromLoadout(l: WeaponLoadout): string[] {
    const id = SHIPS[this.index].id;
    const clean = cleanLoadout(l, id);
    const d = defaultLoadoutFor(id);
    const ok = (w: string | undefined): w is string => !!w && !!weaponDef(w) && weaponAvailable(weaponDef(w)!);
    const main = ok(clean.main) ? clean.main : d.main;
    const aux: string[] = [];
    for (let i = 0; i < 3; i++) {
      const w = clean.aux[i];
      aux.push(ok(w) && !aux.includes(w) ? w : '');
    }
    return [main, ...aux];
  }

  /** The skin shown on the body on screen. */
  get skin(): ShipSkin {
    const skins = skinsOf(this.ship);
    let i = this.skinAt.get(this.ship.id);
    if (i === undefined) {
      i = Math.max(0, skins.findIndex((k) => k.id === equippedSkin(this.ship).id));
      this.skinAt.set(this.ship.id, i);
    }
    return skins[i];
  }

  /** The body on screen is being viewed: clear its NEW flag (kept as a dot until this visit ends). */
  private view(): void {
    const s = this.ship;
    if (isNewShip(s)) this.newThisVisit.add(s.id);
    if (shipUnlocked(s)) saveStore.markSeen('ships', s.id);
    this.viewSkin();
  }

  /** The skin on screen is being viewed: clear its NEW flag, and equip it when it is owned. */
  private viewSkin(): void {
    const s = this.ship;
    const k = this.skin;
    if (!skinUnlocked(k)) return;
    const key = skinKey(s.id, k.id);
    if (isNewSkin(s, k)) this.newSkinsThisVisit.add(key);
    if (k.unlock) saveStore.markSeen('skins', key);
    saveStore.setSkin(s.id, k.id);
  }

  /** Show the next or previous skin of this body. */
  private stepSkin(dir: number): void {
    const n = skinsOf(this.ship).length;
    if (n < 2 || !shipUnlocked(this.ship)) return;
    this.skinAt.set(this.ship.id, (skinsOf(this.ship).indexOf(this.skin) + dir + n) % n);
    this.viewSkin();
  }

  /** The pair can start: the body is owned and the skin shown is owned. */
  private get ready(): boolean {
    return shipUnlocked(this.ship) && skinUnlocked(this.skin);
  }

  private step(dir: number): void {
    this.index = (this.index + dir + SHIPS.length) % SHIPS.length;
    this.sheet = null;
    this.view();
  }

  private get hasSkinArrows(): boolean {
    return shipUnlocked(this.ship) && skinsOf(this.ship).length > 1;
  }

  private say(s: string): void {
    this.flash = s;
    this.flashT = 2.2;
  }

  private openSheet(slot: number): void {
    const defs = (slot === 0 ? MAIN_DEFS : AUX_DEFS).filter((d) => !d.stashed);
    const rows: SheetRow[] = defs.map((def) => ({ def, open: weaponAvailable(def), isNew: isNewWeapon(def) }));
    rows.sort((a, b) => Number(b.open) - Number(a.open) || a.def.name.localeCompare(b.def.name));
    const cur = this.current[slot];
    this.sheet = { slot, t: 0, scroll: 0, rows, cursor: Math.max(0, rows.findIndex((r) => r.def.id === cur)) };
    for (const r of rows) if (r.open) saveStore.markSeen('weapons', r.def.id);
  }

  /** Put the row's weapon in the sheet's slot (an aux already in another aux slot swaps places), close the sheet. */
  private choose(row: SheetRow): void {
    const sh = this.sheet!;
    if (!row.open) {
      this.say(row.def.requirement ?? row.def.unlockHint ?? 'locked');
      return;
    }
    const s = this.current;
    if (sh.slot > 0) {
      const other = s.findIndex((id, i) => i > 0 && i !== sh.slot && id === row.def.id);
      if (other >= 0) s[other] = s[sh.slot];
    }
    s[sh.slot] = row.def.id;
    this.sheet = null;
  }

  private sheetMax(): number {
    const sh = this.sheet!;
    return Math.max(0, sh.rows.length * ROW_H - (SHEET_H - SHEET_LIST_Y - 12));
  }

  private rowAt(y: number): SheetRow | null {
    const sh = this.sheet!;
    const i = Math.floor((y - SHEET_TOP - SHEET_LIST_Y + sh.scroll) / ROW_H);
    return y >= SHEET_TOP + SHEET_LIST_Y && i >= 0 && i < sh.rows.length ? sh.rows[i] : null;
  }

  update(dt: number, host: NodeHost): BuilderResult {
    this.t += dt;
    this.flashT -= dt;
    if (this.sheet) this.sheet.t = Math.min(1, this.sheet.t + dt * 6);
    const tap = host.takeTap();
    const key = host.takeKey();
    const held = host.pointerHeld();
    if (this.t < LOCKOUT) return null;
    // An open press (a swipe on the model or a scroll in the sheet) ends when the pointer is released.
    if (this.press && !tap) {
      if (held) this.drag(held);
      else this.release();
    }
    if (key) {
      const r = this.onKey(key);
      if (r) return r;
    }
    if (!tap) return null;
    if (this.sheet) {
      if (tap.y < SHEET_TOP) this.sheet = null;
      else {
        this.press = { x: tap.x, y: tap.y, scroll: this.sheet.scroll, moved: false, area: 'sheet' };
        this.pressLast = { x: tap.x, y: tap.y };
        if (!held) this.release(); // a quick tap: pressed and let go inside one frame
      }
      return null;
    }
    if (hit(BACK, tap)) return 'back';
    if (hit(START, tap)) {
      if (this.ready) return 'start';
      if (shipUnlocked(this.ship)) this.say(this.skin.requirement ?? 'This skin is locked');
    }
    if (hit(RESET, tap)) {
      this.slots.set(this.ship.id, this.fromLoadout(defaultLoadoutFor(this.ship.id)));
      return null;
    }
    if (hit(ARROW_L, tap)) this.step(-1);
    else if (hit(ARROW_R, tap)) this.step(1);
    else if (this.hasSkinArrows && hit(SKIN_L, tap)) this.stepSkin(-1);
    else if (this.hasSkinArrows && hit(SKIN_R, tap)) this.stepSkin(1);
    else if (hit(MODEL_AREA, tap)) {
      this.press = { x: tap.x, y: tap.y, scroll: 0, moved: false, area: 'model' };
      this.pressLast = { x: tap.x, y: tap.y };
      if (!held) this.press = null;
    } else {
      for (let i = 0; i < 4; i++) if (hit(slotBox(i), tap)) this.openSheet(i);
    }
    return null;
  }

  private drag(p: { x: number; y: number }): void {
    const pr = this.press!;
    this.pressLast = p;
    if (pr.area === 'sheet' && Math.abs(p.y - pr.y) > DRAG) pr.moved = true;
    if (pr.area === 'sheet' && pr.moved && this.sheet) this.sheet.scroll = Math.max(0, Math.min(this.sheetMax(), pr.scroll - (p.y - pr.y)));
  }

  private release(): void {
    const pr = this.press;
    this.press = null;
    if (!pr) return;
    if (pr.area === 'model') {
      const dx = this.pressLast.x - pr.x;
      if (Math.abs(dx) > SWIPE) this.step(dx < 0 ? 1 : -1); // swipe left = next body
    } else if (!pr.moved && this.sheet) {
      const row = this.rowAt(pr.y);
      if (row) this.choose(row);
    }
  }

  private onKey(key: string): BuilderResult {
    const sh = this.sheet;
    if (sh) {
      if (key === 'Escape') this.sheet = null;
      else if (key === 'ArrowUp') sh.cursor = Math.max(0, sh.cursor - 1);
      else if (key === 'ArrowDown') sh.cursor = Math.min(sh.rows.length - 1, sh.cursor + 1);
      else if (key === 'Enter' || key === 'Space') this.choose(sh.rows[sh.cursor]);
      else this.slotKey(key);
      if (this.sheet) {
        const top = sh.cursor * ROW_H;
        const view = SHEET_H - SHEET_LIST_Y - 12;
        sh.scroll = Math.max(0, Math.min(this.sheetMax(), Math.max(top + ROW_H - view, Math.min(sh.scroll, top))));
      }
      return null;
    }
    if (key === 'ArrowLeft') this.step(-1);
    else if (key === 'ArrowRight') this.step(1);
    else if (key === 'BracketLeft' || key === 'ArrowUp') this.stepSkin(-1);
    else if (key === 'BracketRight' || key === 'ArrowDown') this.stepSkin(1);
    else if (key === 'Escape') return 'back';
    else if (key === 'Enter' || key === 'Space') {
      if (this.ready) return 'start';
      if (shipUnlocked(this.ship)) this.say(this.skin.requirement ?? 'This skin is locked');
    }
    else this.slotKey(key);
    return null;
  }

  private slotKey(key: string): void {
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(key);
    if (m) this.openSheet(+m[1] - 1);
  }

  // ----------------------------------------------------------------------------------------------------------
  // Drawing

  draw(g: CanvasRenderingContext2D): void {
    g.save();
    g.fillStyle = 'rgba(5, 6, 13, 0.92)';
    g.fillRect(0, 0, W, H);
    g.restore();
    const ship = this.ship;
    const bodyOpen = shipUnlocked(ship);
    const skin = this.skin;
    const open = bodyOpen && skinUnlocked(skin);
    const slots = this.current;

    // Header: arrows and the body's name.
    const otherNew = SHIPS.some((s, i) => i !== this.index && (isNewShip(s) || bodyHasNewSkin(s)));
    this.arrow(g, ARROW_L, '<', otherNew);
    this.arrow(g, ARROW_R, '>', otherNew);
    text(g, ship.name.toUpperCase(), W / 2, 66, `bold 34px ${MONO}`, bodyOpen ? '#ffffff' : '#8a93a8', 'center');
    if (this.newThisVisit.has(ship.id)) newDot(g, W / 2 + (ship.name.length * 20.5) / 2 + 14, 48);
    drawCentered(g, `${this.subtitle}   ·   body ${this.index + 1}/${SHIPS.length}`, 94, `13px ${MONO}`, '#6ee7ff');

    // Hero model on a soft panel (room under it for skins later).
    g.save();
    const grad = g.createRadialGradient(MODEL.x, MODEL.y, 20, MODEL.x, MODEL.y, 230);
    grad.addColorStop(0, '#16223f');
    grad.addColorStop(1, 'rgba(11, 20, 36, 0)');
    g.fillStyle = grad;
    g.fillRect(0, MODEL_AREA.y, W, MODEL_AREA.h);
    if (open) drawShipLook(g, skinLook(ship, skin.id), MODEL.x, MODEL.y, MODEL.scale);
    else {
      g.shadowColor = '#5a6fa8';
      g.shadowBlur = 14;
      drawShipLook(g, skinLook(ship, skin.id), MODEL.x, MODEL.y, MODEL.scale, true);
    }
    g.restore();
    if (this.hasSkinArrows) this.drawSkinNav(g, ship, skin);
    if (open) {
      const [d1, d2] = wrap2(ship.desc, 56);
      drawCentered(g, d1, d2 ? 412 : 424, `12px ${MONO}`, '#8fa0c8');
      if (d2) drawCentered(g, clip(d2, 60), 430, `12px ${MONO}`, '#8fa0c8');
    } else {
      lockIcon(g, MODEL.x, MODEL.y, 74);
      drawCentered(g, 'LOCKED', 410, `bold 16px ${MONO}`, '#ff8a5a');
      const [r1, r2] = wrap2((bodyOpen ? skin.requirement : ship.requirement) ?? ship.unlockHint ?? 'unknown', 40);
      drawCentered(g, r1, 430, `bold 14px ${MONO}`, '#ffd2b8');
      if (r2) drawCentered(g, r2, 448, `bold 14px ${MONO}`, '#ffd2b8');
    }

    // Stats strip.
    const b = ship.baseStats;
    const main = weaponDef(slots[0]) as MainDef | undefined;
    const fire = main ? `x${(main.rateMul).toFixed(1)}` : '-';
    const stats: [string, string][] = [['HULL', String(b.maxHealth)], ['SPEED', String(b.speed)], ['FIRE', fire]];
    stats.forEach(([k, v], i) => {
      const x = 30 + i * 163;
      g.save();
      g.fillStyle = '#0b1424';
      g.fillRect(x, STATS_Y, 154, 50);
      g.strokeStyle = '#26324d';
      g.lineWidth = 2;
      g.strokeRect(x + 1, STATS_Y + 1, 152, 48);
      g.restore();
      text(g, k, x + 77, STATS_Y + 18, `bold 11px ${MONO}`, '#8fa0c8', 'center');
      text(g, v, x + 77, STATS_Y + 42, `bold 20px ${MONO}`, '#6ee7ff', 'center');
    });

    // Weapon slots.
    for (let i = 0; i < 4; i++) this.drawSlot(g, i, slots[i]);
    if (this.flashT > 0) drawCentered(g, clip(this.flash, 54), 818, `bold 13px ${MONO}`, '#ff8a5a');
    else drawCentered(g, this.hasSkinArrows ? 'top < >: body   side < >: skin ([ ])   tap a slot: weapon' : '< > or swipe: body   tap a slot: weapon   (keys: 1-4, enter, esc)', 818, `11px ${MONO}`, '#8fa0c8');
    button(g, BACK, 'BACK', '#ffffff');
    button(g, RESET, 'DEFAULT', '#ff8a5a');
    button(g, START, 'START', '#4ade80', open);

    if (this.sheet) this.drawSheet(g);
  }

  /** Skin arrows at the model's sides, the skin's name and one dot per skin (filled = shown). */
  private drawSkinNav(g: CanvasRenderingContext2D, ship: ShipDefinition, skin: ShipSkin): void {
    const skins = skinsOf(ship);
    const otherNew = skins.some((k) => k !== skin && isNewSkin(ship, k));
    for (const [b, label] of [[SKIN_L, '<'], [SKIN_R, '>']] as [Btn, string][]) {
      g.save();
      g.fillStyle = 'rgba(11, 20, 36, 0.85)';
      g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = '#26324d';
      g.lineWidth = 2;
      g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      g.restore();
      text(g, label, b.x + b.w / 2, b.y + b.h / 2 + 12, `bold 36px ${MONO}`, '#6ee7ff', 'center');
      if (otherNew) newDot(g, b.x + b.w - 9, b.y + 9, 6);
    }
    const locked = !skinUnlocked(skin);
    text(g, locked ? `${skin.name.toUpperCase()} (locked)` : skin.name.toUpperCase(), W / 2, 388, `bold 15px ${MONO}`, locked ? '#8a93a8' : '#ffffff', 'center');
    if (this.newSkinsThisVisit.has(skinKey(ship.id, skin.id))) newDot(g, W / 2 + (skin.name.length * 9.2) / 2 + 14, 383, 5);
    const gap = 16;
    skins.forEach((k, i) => {
      const x = W / 2 + (i - (skins.length - 1) / 2) * gap;
      g.save();
      g.fillStyle = k === skin ? '#6ee7ff' : skinUnlocked(k) ? '#3a4a70' : '#1c2438';
      g.beginPath();
      g.arc(x, 399, k === skin ? 4.5 : 3.5, 0, Math.PI * 2);
      g.fill();
      g.restore();
    });
  }

  private arrow(g: CanvasRenderingContext2D, b: Btn, label: string, dot: boolean): void {
    g.save();
    g.fillStyle = '#0b1424';
    g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = '#26324d';
    g.lineWidth = 2;
    g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    g.restore();
    text(g, label, b.x + b.w / 2, b.y + b.h / 2 + 14, `bold 44px ${MONO}`, '#6ee7ff', 'center');
    if (dot) newDot(g, b.x + b.w - 12, b.y + 12);
  }

  private drawSlot(g: CanvasRenderingContext2D, i: number, id: string): void {
    const b = slotBox(i);
    const def = weaponDef(id);
    const focus = this.sheet?.slot === i;
    g.save();
    g.fillStyle = '#0b1424';
    g.fillRect(b.x, b.y, b.w, b.h);
    g.lineWidth = focus ? 4 : 2;
    g.strokeStyle = focus ? '#6ee7ff' : '#26324d';
    g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    g.restore();
    const label = i === 0 ? '#ffd21f' : '#7dff9a';
    if (i === 0) {
      text(g, 'MAIN', b.x + 14, b.y + 22, `bold 12px ${MONO}`, label);
      weaponIcon(g, def, b.x + 52, b.y + 56, 24);
      text(g, def?.name ?? 'empty', b.x + 94, b.y + 46, `bold 22px ${MONO}`, def ? '#ffffff' : '#6b7488');
      if (def) wrapLines(def.desc, 38, 2).forEach((ln, k) => text(g, ln, b.x + 94, b.y + 66 + k * 17, `13px ${MONO}`, '#d4dcf2'));
    } else {
      text(g, SLOT_NAMES[i], b.x + b.w / 2, b.y + 22, `bold 12px ${MONO}`, label, 'center');
      weaponIcon(g, def, b.x + b.w / 2, b.y + 60, 24);
      text(g, def ? clip(def.name, 14) : 'empty', b.x + b.w / 2, b.y + 106, `bold 14px ${MONO}`, def ? '#ffffff' : '#6b7488', 'center');
    }
    text(g, '▾', b.x + b.w - 14, b.y + 22, `bold 14px ${MONO}`, '#6ee7ff', 'right');
  }

  private drawSheet(g: CanvasRenderingContext2D): void {
    const sh = this.sheet!;
    const ease = 1 - (1 - sh.t) ** 3;
    const top = SHEET_TOP + (1 - ease) * SHEET_H;
    g.save();
    g.fillStyle = `rgba(5, 6, 13, ${0.6 * ease})`;
    g.fillRect(0, 0, W, SHEET_TOP);
    g.fillStyle = '#0a1120';
    g.fillRect(0, top, W, SHEET_H);
    g.strokeStyle = '#6ee7ff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, top + 1.5);
    g.lineTo(W, top + 1.5);
    g.stroke();
    g.fillStyle = '#26324d';
    g.fillRect(W / 2 - 30, top + 10, 60, 5);
    g.restore();
    const title = sh.slot === 0 ? 'MAIN WEAPON' : `AUX ${sh.slot} WEAPON`;
    drawCentered(g, `${title}  ·  ${this.ship.name}`, top + 42, `bold 16px ${MONO}`, sh.slot === 0 ? '#ffd21f' : '#7dff9a');
    g.save();
    g.beginPath();
    g.rect(0, top + SHEET_LIST_Y, W, SHEET_H - SHEET_LIST_Y);
    g.clip();
    const cur = this.current;
    sh.rows.forEach((row, i) => {
      const y = top + SHEET_LIST_Y + i * ROW_H - sh.scroll;
      if (y + ROW_H < top || y > H) return;
      const here = cur[sh.slot] === row.def.id;
      const elsewhere = sh.slot > 0 ? cur.findIndex((id, k) => k > 0 && k !== sh.slot && id === row.def.id) : -1;
      g.fillStyle = row.open ? '#0b1424' : '#080d18';
      g.fillRect(24, y, W - 48, ROW_H - 6);
      g.lineWidth = here ? 3 : i === sh.cursor ? 2 : 1;
      g.strokeStyle = here ? '#4ade80' : i === sh.cursor ? '#6ee7ff' : '#26324d';
      g.strokeRect(24.5, y + 0.5, W - 49, ROW_H - 7);
      weaponIcon(g, row.def, 62, y + (ROW_H - 6) / 2, 22, !row.open);
      text(g, row.def.name, 96, y + 26, `bold 20px ${MONO}`, row.open ? '#ffffff' : '#8a93a8');
      const info = row.open ? row.def.desc : (row.def.requirement ?? row.def.unlockHint ?? 'locked');
      wrapLines(info, 44, 3).forEach((ln, k) => text(g, ln, 96, y + 50 + k * 19, `${row.open ? '' : 'bold '}14px ${MONO}`, row.open ? '#d4dcf2' : '#ff8a5a'));
      const tag = !row.open ? 'LOCKED' : here ? 'EQUIPPED' : elsewhere >= 0 ? `SWAP AUX ${elsewhere}` : '';
      if (tag) text(g, tag, W - 40, y + 28, `bold 12px ${MONO}`, !row.open ? '#ff8a5a' : here ? '#4ade80' : '#8fa0c8', 'right');
      if (row.isNew) newDot(g, 38, y + 14, 6);
    });
    g.restore();
    if (this.flashT > 0) drawCentered(g, clip(this.flash, 54), H - 14, `bold 13px ${MONO}`, '#ff8a5a');
  }
}
