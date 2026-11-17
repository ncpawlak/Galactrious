/**
 * Campaign boss-state snapshot (DESIGN.md "The capital ship keeps its state"). Captures what a carved boss looks like
 * (per-layer pixel masks, run-length encoded; scorch colours; component and room states; core hp) so a later level can
 * restore it onto a fresh fight of the same definition. Plain JSON, versioned, stored in `SaveData.campaign.snapshots`.
 *
 * Not captured (cosmetic or transient): flying fragments, particles, regrowth progress, turret aim, attack timers,
 * the fight clock and phase. A restored fight starts in its first phase with the damage already on it.
 */
import type { BossFight } from '../bossFight';
import { saveStore } from '../save';

export const SNAPSHOT_VERSION = 1;

export interface LayerSnapshot {
  name: string;
  /** Run lengths of the solid mask, alternating empty, solid, empty... (always starts with an empty run, which may be 0). */
  mask: number[];
  /** Run lengths of the "lost for good" mask (never regrows), same encoding. */
  gone: number[];
  /** Pixels whose colour differs from the original (scorched rims): flat [index, r, g, b, ...]. */
  tint: number[];
}

export interface ComponentSnapshot {
  id: string;
  hp: number;
  /** A component that was dying or torn off is stored as destroyed. */
  state: 'active' | 'destroyed';
  enabled: boolean;
  powered: boolean;
  level: number;
}

export interface RoomSnapshot {
  id: string;
  exposed: boolean;
  offline: boolean;
}

export interface BossSnapshot {
  version: number;
  bossId: string;
  width: number;
  height: number;
  layers: LayerSnapshot[];
  coreHp: number;
  components: ComponentSnapshot[];
  rooms: RoomSnapshot[];
}

/** Run-length encode a 0/1 array as alternating run lengths, starting with the 0 run. */
export function rleEncode(a: Uint8Array): number[] {
  const out: number[] = [];
  let cur = 0;
  let run = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i] ? 1 : 0;
    if (v === cur) run++;
    else {
      out.push(run);
      cur = v;
      run = 1;
    }
  }
  out.push(run);
  return out;
}

export function rleDecode(runs: number[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let i = 0;
  let v = 0;
  for (const r of runs) {
    if (v) out.fill(1, i, i + r);
    i += r;
    v ^= 1;
  }
  if (i !== length) throw new Error(`snapshot mask has ${i} px, expected ${length}`);
  return out;
}

export function captureSnapshot(fight: BossFight): BossSnapshot {
  const boss = fight.boss;
  const n = boss.width * boss.height;
  const layers: LayerSnapshot[] = boss.layers.map((l) => {
    const tint: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!l.mask[i]) continue;
      const o = i * 4;
      const d = l.img.data;
      if (d[o] !== l.origRgba[o] || d[o + 1] !== l.origRgba[o + 1] || d[o + 2] !== l.origRgba[o + 2]) tint.push(i, d[o], d[o + 1], d[o + 2]);
    }
    return { name: l.name, mask: rleEncode(l.mask), gone: rleEncode(l.gone), tint };
  });
  return {
    version: SNAPSHOT_VERSION,
    bossId: fight.def.id,
    width: boss.width,
    height: boss.height,
    layers,
    coreHp: boss.core.hp,
    components: fight.components.items.map((c) => ({
      id: c.spec.id,
      hp: c.hp,
      state: c.state === 'active' ? 'active' : 'destroyed',
      enabled: c.enabled,
      powered: c.powered,
      level: c.level,
    })),
    rooms: fight.rooms.rooms.map((r) => ({ id: r.spec.id, exposed: r.exposed, offline: r.offline })),
  };
}

/** Put a snapshot onto a fresh fight of the same boss. Throws when the shapes do not match (different definition or layout). */
export function restoreSnapshot(fight: BossFight, snap: BossSnapshot): void {
  if (snap.version !== SNAPSHOT_VERSION) throw new Error(`unsupported snapshot version ${snap.version}`);
  const boss = fight.boss;
  if (snap.width !== boss.width || snap.height !== boss.height || snap.layers.length !== boss.layers.length) {
    throw new Error(`snapshot of "${snap.bossId}" does not fit boss "${fight.def.id}" (size or layer count differs)`);
  }
  const n = boss.width * boss.height;
  boss.layers.forEach((l, li) => {
    const s = snap.layers[li];
    const mask = rleDecode(s.mask, n);
    const gone = rleDecode(s.gone, n);
    l.mask.set(mask);
    l.gone.set(gone);
    let remaining = 0;
    const d = l.img.data;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      d[o] = l.origRgba[o];
      d[o + 1] = l.origRgba[o + 1];
      d[o + 2] = l.origRgba[o + 2];
      if (mask[i]) {
        d[o + 3] = l.origRgba[o + 3];
        remaining++;
      } else d[o + 3] = 0;
    }
    for (let k = 0; k < s.tint.length; k += 4) {
      const o = s.tint[k] * 4;
      d[o] = s.tint[k + 1];
      d[o + 1] = s.tint[k + 2];
      d[o + 2] = s.tint[k + 3];
    }
    l.remaining = remaining;
    l.dirty = true;
    l.needsCheck = false;
    l.flush();
  });
  boss.core.hp = snap.coreHp;
  boss.version++;
  for (const cs of snap.components) {
    const c = fight.components.items.find((x) => x.spec.id === cs.id);
    if (!c) continue;
    c.hp = cs.hp;
    c.state = cs.state;
    c.enabled = cs.enabled;
    c.powered = cs.powered;
    c.level = cs.level;
  }
  for (const rs of snap.rooms) fight.rooms.restoreState(rs.id, rs.exposed, rs.offline);
  fight.def.afterRestore?.(fight, snap);
}

/** Compare a fight to a snapshot (round-trip test): returns the list of differences, empty = identical. */
export function diffSnapshot(fight: BossFight, snap: BossSnapshot): string[] {
  const other = captureSnapshot(fight);
  const out: string[] = [];
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
  if (other.width !== snap.width || other.height !== snap.height) out.push('size');
  snap.layers.forEach((l, i) => {
    if (!same(l.mask, other.layers[i]?.mask)) out.push(`layer ${l.name}: mask`);
    if (!same(l.gone, other.layers[i]?.gone)) out.push(`layer ${l.name}: gone`);
    if (!same(l.tint, other.layers[i]?.tint)) out.push(`layer ${l.name}: tint`);
  });
  if (snap.coreHp !== other.coreHp) out.push(`core hp ${snap.coreHp} vs ${other.coreHp}`);
  if (!same(snap.components, other.components)) out.push('components');
  if (!same(snap.rooms, other.rooms)) out.push('rooms');
  return out;
}

/** Store a snapshot in a campaign slot (latest completion replaces). */
export function saveSnapshot(slot: string, levelId: string, fight: BossFight): void {
  saveStore.setSnapshot(slot, { levelId, bossId: fight.def.id, data: captureSnapshot(fight) });
}

/** The stored snapshot of a slot, or null. */
export function loadSnapshot(slot: string): BossSnapshot | null {
  const rec = saveStore.getSnapshot(slot);
  return rec ? (rec.data as BossSnapshot) : null;
}
