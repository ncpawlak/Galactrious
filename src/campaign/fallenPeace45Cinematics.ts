/**
 * The cinematics of "Fallen Peace" chapters 4 and 5, authored in the data format of `cinematic.ts` (DESIGN.md "Cinematic and mission
 * design standard"). Custom scenery is painted by `draw` props (`Prop` kind `draw`): the wreck and the base glow, the hangar bay.
 *  Chapter 4: `FP4_CRASH_SITE` (intro: the wreck in the snow, the pod ejects, the base lights ahead), `FP4_OUTER_OUT` + `FP4_YARD_IN`
 *    (the seam between the two stealth levels), `FP4_BOARD` (exit: Rookie boards the empire fighter, the canopy closes, the cockpit
 *    lights come up, the ship swaps to `empire-fighter` and lifts out of the hangar).
 *  Chapter 5: `FP5_TAKEOFF` (intro: the base defences open fire), `FP5_SECTOR_OUT` + `FP5_SECTOR_IN` (the seams between the three
 *    sections: a fade, a line), `FP5_PULL_UP` (exit: the ship pulls up toward the atmosphere and goes white in the cloud deck).
 * Times are seconds from the start of the cinematic; coordinates are the 540x960 screen. No audio: the radio is subtitles.
 */
import { H, W } from '../config';
import { EMPIRE } from '../factions';
import { drawShipLook, shipById } from '../ships';
import type { Cinematic, Prop, WorldEvent } from './cinematic';
import { SPEAKER_PLAYER } from './names';

const ME = SPEAKER_PLAYER;
const SYS = 'SYSTEM';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (u: number): number => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
/** 0 before `a`, 1 after `b`, smooth between. */
const ramp = (t: number, a: number, b: number): number => smooth(clamp01((t - a) / Math.max(1e-6, b - a)));

/** A deterministic 0..1 hash (flicker, flecks). */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// --- chapter 4 -----------------------------------------------------------------------------------------------------

/** Where the pod ends up and the scroll speed of the stealth levels (src/scroll/fallenPeace45.ts). */
const POD_START = { x: 270, y: 780 };
const STEALTH_SPEED = 90;

/** The Delta ship in the snow: a broken, scorched hull with one wing, the nose in a drift, burning, with smoke. Painted at (cx, cy). */
function drawWreck(g: CanvasRenderingContext2D, cx: number, cy: number, time: number, shift: number): void {
  g.save();
  g.translate(cx, cy + shift);
  // Snow drift and scorch mark around it.
  const drift = g.createRadialGradient(0, 8, 8, 0, 8, 120);
  drift.addColorStop(0, 'rgba(40,40,50,0.75)');
  drift.addColorStop(0.45, 'rgba(210,225,240,0.55)');
  drift.addColorStop(1, 'rgba(210,225,240,0)');
  g.fillStyle = drift;
  g.beginPath();
  g.ellipse(0, 8, 130, 70, -0.2, 0, Math.PI * 2);
  g.fill();
  g.rotate(-0.35);
  // Fuselage: the Vanguard silhouette, torn: hull, a missing wing, scorching.
  g.fillStyle = '#2f6f5a';
  g.beginPath();
  g.moveTo(0, -42);
  g.lineTo(9, -10);
  g.lineTo(22, 22);
  g.lineTo(8, 16);
  g.lineTo(0, 30);
  g.lineTo(-8, 18);
  g.lineTo(-30, 28);
  g.lineTo(-14, -6);
  g.closePath();
  g.fill();
  g.fillStyle = '#5ef2b0';
  g.beginPath();
  g.moveTo(0, -42);
  g.lineTo(9, -10);
  g.lineTo(3, 6);
  g.lineTo(-2, -12);
  g.closePath();
  g.fill();
  g.fillStyle = '#16231f';
  g.beginPath();
  g.moveTo(-14, -6);
  g.lineTo(-30, 28);
  g.lineTo(-18, 10);
  g.closePath();
  g.fill();
  // The cockpit: blown open and dark.
  g.fillStyle = '#0a0f12';
  g.fillRect(-3, -26, 6, 11);
  // Fire on the engines.
  const f = 0.6 + 0.4 * Math.sin(time * 17) * Math.sin(time * 9.3);
  g.globalCompositeOperation = 'lighter';
  const flame = g.createRadialGradient(0, 24, 2, 0, 24, 30 + 8 * f);
  flame.addColorStop(0, 'rgba(255,230,140,0.95)');
  flame.addColorStop(0.5, 'rgba(255,120,30,0.55)');
  flame.addColorStop(1, 'rgba(255,60,10,0)');
  g.fillStyle = flame;
  g.fillRect(-40, -10, 80, 80);
  g.globalCompositeOperation = 'source-over';
  g.restore();
  // Smoke column drifting up and away.
  for (let i = 0; i < 16; i++) {
    const age = (time * 0.35 + i / 16) % 1;
    const sx = cx + 8 + Math.sin(age * 5 + i) * 10 + age * 40;
    const sy = cy + shift - 10 - age * 260;
    g.fillStyle = `rgba(${52 + (i % 3) * 8},${56 + (i % 3) * 8},${66 + (i % 3) * 8},${(0.5 * (1 - age)).toFixed(3)})`;
    g.beginPath();
    g.arc(sx, sy, 8 + age * 26, 0, Math.PI * 2);
    g.fill();
  }
  // Embers.
  g.fillStyle = '#ffb040';
  for (let i = 0; i < 9; i++) {
    const age = (time * 0.9 + hash(i) * 3) % 1;
    g.globalAlpha = 1 - age;
    g.fillRect(cx + (hash(i + 4) - 0.5) * 50 + age * 20, cy + shift - age * 90, 2, 2);
  }
  g.globalAlpha = 1;
}

/** The enemy base glowing on the horizon at the top of the screen: a row of lights and two slow searchlight beams. */
function drawBaseGlow(g: CanvasRenderingContext2D, time: number, alpha: number): void {
  if (alpha <= 0.01) return;
  g.save();
  g.globalAlpha = alpha;
  const glow = g.createLinearGradient(0, 0, 0, 260);
  glow.addColorStop(0, 'rgba(255,150,70,0.4)');
  glow.addColorStop(1, 'rgba(255,150,70,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, 260);
  g.globalCompositeOperation = 'lighter';
  for (const [x, ph] of [[120, 0], [420, 2.2]] as const) {
    const a = Math.PI / 2 + Math.sin(time * 0.7 + ph) * 0.4;
    const beam = g.createLinearGradient(x, 0, x + Math.cos(a) * 520, Math.sin(a) * 520);
    beam.addColorStop(0, 'rgba(255,240,200,0.5)');
    beam.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + Math.cos(a - 0.1) * 520, Math.sin(a - 0.1) * 520);
    g.lineTo(x + Math.cos(a + 0.1) * 520, Math.sin(a + 0.1) * 520);
    g.closePath();
    g.fill();
  }
  for (let i = 0; i < 26; i++) {
    const x = 16 + i * 20;
    const y = 10 + hash(i) * 38;
    g.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(time * 2 + i));
    g.fillStyle = i % 5 === 0 ? '#ff7a3d' : '#ffe9b8';
    g.fillRect(x, y, 4, 3);
  }
  g.restore();
}

const wreckProp = (shiftFrom: number): Prop => ({
  t: 0,
  do: 'draw',
  draw: (g, time) => {
    // The wreck sits at the bottom-left; when the world starts to move (shiftFrom) it slides off the bottom of the screen.
    const shift = 520 * ramp(time, shiftFrom, shiftFrom + 2.6) ** 2;
    drawBaseGlow(g, time, ramp(time, 4.2, 7));
    if (shift < 700) drawWreck(g, 150, 800, time, shift);
  },
});

/** Intro of chapter 4: continues the chapter 3 crash. The ship lies burning in the snow, the pod ejects, the base glows ahead. */
export const FP4_CRASH_SITE: Cinematic = {
  id: 'fp4-crash-site',
  duration: 12.2,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  releasePose: true,
  world: [
    { t: 0, do: 'scrollSpeed', speed: 0, ease: 0 },
    { t: 3.2, do: 'shake', amount: 0.3 },
    { t: 3.4, do: 'trail', kind: 'sparks', duration: 1.2, rate: 40 },
    { t: 9.8, do: 'scrollSpeed', speed: STEALTH_SPEED, ease: 2.2 },
  ],
  props: [wreckProp(9.6)],
  // The pod pops out of the cockpit, climbs, hovers while the base comes into view, then settles at its start.
  ship: [
    { t: 0, x: 190, y: 790, scale: 0.01 },
    { t: 3.0, x: 190, y: 790, scale: 0.01 },
    { t: 3.6, x: 200, y: 740, scale: 1.7, ease: 'out' },
    { t: 7.2, x: 255, y: 640, scale: 1.5 },
    { t: 11.0, x: POD_START.x, y: POD_START.y, scale: 1, ease: 'inOut' },
  ],
  overlays: [
    { t: 0, color: '#000000', to: 1, duration: 0.01 },
    { t: 0.3, color: '#000000', to: 0, duration: 2.4 },
  ],
  radio: [
    { t: 0.8, speaker: ME, text: 'Still breathing. The ship is not so lucky.', static: 0.1 },
    { t: 3.4, speaker: SYS, text: 'ESCAPE POD LAUNCHED. WEAPONS: NONE. HULL: 2.' },
    { t: 6.4, speaker: ME, text: 'That glow is an empire base. And those are searchlights.', static: 0.1 },
    { t: 9.2, speaker: ME, text: 'No guns. Stay in the dark, and do not get seen.', static: 0.1 },
  ],
  skippableAfter: 2,
};

/** Seam between the two stealth levels: the outer fence is behind, the pod fades out. */
export const FP4_OUTER_OUT: Cinematic = {
  id: 'fp4-outer-out',
  duration: 2.8,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  overlays: [{ t: 0.5, color: '#000000', to: 1, duration: 1.7 }],
  radio: [{ t: 0.2, speaker: SYS, text: 'FENCE CROSSED. HANGAR YARD AHEAD. PATROLS ON A TIMER.' }],
  skippableAfter: 1,
};

export const FP4_YARD_IN: Cinematic = {
  id: 'fp4-yard-in',
  duration: 4.4,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  world: [
    { t: 0, do: 'scrollSpeed', speed: 0, ease: 0 },
    { t: 3.2, do: 'scrollSpeed', speed: STEALTH_SPEED, ease: 1 },
  ],
  overlays: [
    { t: 0, color: '#000000', to: 1, duration: 0.01 },
    { t: 0.3, color: '#000000', to: 0, duration: 1.6 },
  ],
  radio: [{ t: 0.9, speaker: ME, text: 'Past the fence. The hangars must be at the far end.', static: 0.1 }],
  skippableAfter: 1,
};

// -- boarding ---------------------------------------------------------------------------------------------------------

/** Camera zoom of the hangar scene over time: 2.2 inside the bay, easing out to 1 as the ship lifts out (from LIFT0 to LIFT1). */
const BAY = { cx: 270, cy: 480, zoom0: 2.2, lift0: 9.4, lift1: 13.2, swap: 8.69, fighterY: 430, fighterScale: 3.0 / 2.2 };
const zoomAt = (t: number): number => lerp(BAY.zoom0, 1, ramp(t, BAY.lift0, BAY.lift1));
/** Bay-space height of the fighter (it rolls forward toward the mouth of the bay while lifting). */
const fighterBayY = (t: number): number => lerp(BAY.fighterY, 250, ramp(t, BAY.lift0 + 0.3, BAY.lift1));

/** The hangar bay in bay coordinates (the caller applies the zoom): outside ground, bay walls, floor markings, lights. */
function drawBay(g: CanvasRenderingContext2D, time: number): void {
  const light = 0.35 + 0.65 * ramp(time, 6.8, 8.2);
  // Outside: night snow with the base around the bay.
  g.fillStyle = '#0a1020';
  g.fillRect(-600, -600, W + 1200, H + 1200);
  g.fillStyle = 'rgba(205,222,240,0.07)';
  for (let i = 0; i < 40; i++) g.fillRect(-300 + hash(i) * (W + 600), -300 + hash(i + 50) * (H + 600), 30 + hash(i + 9) * 60, 3);
  // The slab around the bay and the bay floor.
  g.fillStyle = '#1b2233';
  g.fillRect(40, 90, 460, 760);
  g.fillStyle = '#272f43';
  g.fillRect(90, 150, 360, 670);
  // Floor plating seams and the centre line.
  g.strokeStyle = 'rgba(10,14,24,0.6)';
  g.lineWidth = 2;
  for (let y = 190; y < 820; y += 60) {
    g.beginPath();
    g.moveTo(90, y);
    g.lineTo(450, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,196,60,0.35)';
  g.setLineDash([22, 16]);
  g.beginPath();
  g.moveTo(270, 170);
  g.lineTo(270, 800);
  g.stroke();
  g.setLineDash([]);
  // Hazard stripes at the mouth of the bay (top).
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#1a1a1a' : '#e0a82a';
    g.fillRect(90 + i * 30, 150, 30, 14);
  }
  // Parked-fighter pad.
  g.strokeStyle = 'rgba(255,122,61,0.5)';
  g.lineWidth = 3;
  g.strokeRect(190, 340, 160, 190);
  // Walls with light strips.
  g.fillStyle = '#10151f';
  g.fillRect(40, 90, 50, 760);
  g.fillRect(450, 90, 50, 760);
  g.fillRect(40, 820, 460, 30);
  for (let i = 0; i < 9; i++) {
    const on = light * (0.7 + 0.3 * Math.sin(time * 3 + i));
    g.fillStyle = `rgba(255,170,90,${on.toFixed(3)})`;
    g.fillRect(60, 130 + i * 80, 8, 30);
    g.fillRect(472, 130 + i * 80, 8, 30);
  }
  // A pool of light from the ceiling over the pad.
  g.save();
  g.globalCompositeOperation = 'lighter';
  const pool = g.createRadialGradient(270, 430, 10, 270, 430, 300);
  pool.addColorStop(0, `rgba(255,214,150,${(0.32 * light).toFixed(3)})`);
  pool.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = pool;
  g.fillRect(0, 100, W, 700);
  g.restore();
  // Empire insignia on the floor at the bay's foot.
  g.fillStyle = EMPIRE.accent;
  g.globalAlpha = 0.55;
  g.beginPath();
  g.moveTo(270, 720);
  g.lineTo(320, 770);
  g.lineTo(320, 786);
  g.lineTo(270, 736);
  g.lineTo(220, 786);
  g.lineTo(220, 770);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
}

/** The whole boarding scene: the bay under the camera zoom, the parked fighter with its canopy and cockpit, and the pilot running to it. */
const boardProp: Prop = {
  t: 1.2,
  do: 'draw',
  draw: (g, time) => {
    const z = zoomAt(time);
    g.save();
    g.translate(BAY.cx, BAY.cy);
    g.scale(z, z);
    g.translate(-BAY.cx, -BAY.cy);
    drawBay(g, time);
    if (time < BAY.swap) {
      // The parked empire fighter (the real ship takes over at the swap, in the same place at the same size).
      const look = shipById('empire-fighter').look;
      drawShipLook(g, look, 270, BAY.fighterY, BAY.fighterScale);
      g.save();
      g.translate(270, BAY.fighterY);
      g.scale(BAY.fighterScale, BAY.fighterScale);
      // Canopy: a glass lid slides forward over the cockpit between 7.4 and 8.3.
      const lid = ramp(time, 7.3, 8.3);
      const lit = ramp(time, 6.9, 7.9);
      g.fillStyle = `rgba(255,178,92,${(0.35 + 0.65 * lit).toFixed(3)})`;
      g.fillRect(-2, -14, 4, 7);
      g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(0, -10, 1, 0, -10, 22);
      halo.addColorStop(0, `rgba(255,178,92,${(0.8 * lit).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255,178,92,0)');
      g.fillStyle = halo;
      g.fillRect(-30, -40, 60, 60);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = `rgba(150,215,235,${(0.55 * lid).toFixed(3)})`;
      g.strokeStyle = `rgba(230,250,255,${lid.toFixed(3)})`;
      g.lineWidth = 0.6;
      g.beginPath();
      g.ellipse(0, -10.5 - (1 - lid) * 8, 3.4, 5.4, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
      // The pilot: a small figure running from where the pod stood up to the cockpit (5.6 to 7.3).
      const run = ramp(time, 5.6, 7.3);
      if (run > 0 && run < 1) {
        const px = 270 + Math.sin(run * 14) * 1.4;
        const py = lerp(590, BAY.fighterY - 42, run);
        g.fillStyle = '#f2fff8';
        g.fillRect(px - 3, py - 7, 6, 8);
        g.fillStyle = '#5ef2b0';
        g.fillRect(px - 3, py - 11, 6, 5);
      }
    }
    g.restore();
  },
};

/**
 * Exit of chapter 4 (15.4 s): the pod reaches the hangar circle, the screen cuts to the bay, Rookie leaves the pod and runs to the
 * parked empire fighter, the canopy closes and the cockpit lights up. The ship swaps to `empire-fighter` and lifts out as the camera
 * pulls back. Cosmetic: the swap is the one state change (listed as a world event).
 */
export const FP4_BOARD: Cinematic = {
  id: 'fp4-board',
  duration: 15.4,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  world: [
    { t: 0, do: 'dismissUnits' },
    { t: 0, do: 'scrollSpeed', speed: 0, ease: 0.3 },
    { t: BAY.swap, do: 'setShip', ship: 'empire-fighter' },
    { t: 9.4, do: 'shake', amount: 0.35 },
    { t: 10.6, do: 'trail', kind: 'sparks', duration: 1.6, rate: 24 },
  ],
  props: [boardProp],
  ship: [
    // The pod: in the circle, then (under black) to the foot of the bay, up under the fighter, out of the way once the pilot has left.
    { t: 1.1 },
    { t: 1.2, x: 270, y: 800, scale: 2.6, ease: 'linear' },
    { t: 2.6, x: 270, y: 800, scale: 2.6 },
    { t: 5.4, x: 270, y: 585, scale: 2.6, ease: 'inOut' },
    { t: 5.9, x: 270, y: 585, scale: 2.6 },
    { t: 7.4, x: -90, y: 585, scale: 2.6, ease: 'in' },
    { t: 8.68, x: -90, y: 585, scale: 2.6 },
    // The fighter takes over in the same instant at the parked position (bay centre 270, 480; zoom 2.2: y = 480 - 50 z), then rolls out.
    { t: BAY.swap, x: 270, y: BAY.cy + (BAY.fighterY - BAY.cy) * BAY.zoom0, scale: 3.0 },
    ...liftKeys(),
  ],
  overlays: [
    { t: 0.2, color: '#000000', to: 1, duration: 1.0 },
    { t: 1.4, color: '#000000', to: 0, duration: 1.3 },
    { t: 13.4, color: '#000000', to: 1, duration: 1.8 },
  ],
  radio: [
    { t: 1.8, speaker: ME, text: 'The hangar. One fighter, warm and fuelled.', static: 0.1 },
    { t: 4.6, speaker: ME, text: 'An empire ship. And my only way out of here.', static: 0.1 },
    { t: 7.5, speaker: ME, text: 'Their tech. It is all I have.', static: 0.1 },
    { t: 10.1, speaker: SYS, text: 'EMPIRE FIGHTER ONLINE. WEAPONS ARMED.' },
    { t: 12.0, speaker: ME, text: 'Delta, wherever you are, I am coming.', static: 0.1 },
  ],
  skippableAfter: 2,
};

/** Keyframes of the lift: sampled from the zoom and the bay-space height so the ship stays locked to the bay as the camera pulls back. */
function liftKeys(): { t: number; x: number; y: number; scale: number; ease: 'linear' }[] {
  const keys: { t: number; x: number; y: number; scale: number; ease: 'linear' }[] = [];
  for (let t = BAY.lift0; t <= BAY.lift1 + 0.001; t += 0.2) {
    const z = zoomAt(t);
    keys.push({ t, x: 270, y: BAY.cy + (fighterBayY(t) - BAY.cy) * z, scale: BAY.fighterScale * z, ease: 'linear' });
  }
  return keys;
}

// --- chapter 5 -----------------------------------------------------------------------------------------------------

/** A cosmetic anti-air streak from below the screen up past the ship. */
const aa = (t: number, x: number, toX: number): WorldEvent => ({ t, do: 'projectile', from: [x, H + 40], to: [toX, -60], duration: 0.55, color: '#ff8a3a', hit: false });
const flak = (t: number, x: number, y: number, r: number): WorldEvent => ({ t, do: 'explosion', x, y, radius: r, shake: 0.5, ring: false });

/** Intro of chapter 5: the ship lifts off the base with every gun on it opening fire. Streaks and flak are cosmetic. */
export const FP5_TAKEOFF: Cinematic = {
  id: 'fp5-takeoff',
  duration: 9,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  releasePose: true,
  world: [
    { t: 0, do: 'scrollSpeed', speed: 0, ease: 0 },
    { t: 1.0, do: 'scrollSpeed', speed: 180, ease: 4.5 },
    aa(1.2, 60, 140),
    aa(1.6, 480, 400),
    aa(2.0, 130, 200),
    flak(2.2, 120, 560, 46),
    aa(2.5, 420, 330),
    flak(2.9, 420, 430, 52),
    aa(3.1, 250, 270),
    aa(3.5, 30, 90),
    flak(3.8, 180, 700, 44),
    aa(4.2, 510, 450),
    aa(4.5, 330, 300),
    flak(4.9, 330, 520, 50),
    aa(5.3, 90, 220),
    flak(5.8, 430, 640, 44),
    aa(6.2, 460, 340),
    aa(6.6, 170, 260),
    flak(7.2, 250, 400, 40),
  ],
  // The fighter rises off the base large, shrinks to the in-game scale as the camera settles, and is handed back to the player.
  ship: [
    { t: 0, x: 270, y: 640, scale: 2.2 },
    { t: 1.0, x: 270, y: 640, scale: 2.2 },
    { t: 5.2, x: 270, y: POD_START.y, scale: 1, ease: 'out' },
  ],
  overlays: [
    { t: 0, color: '#000000', to: 1, duration: 0.01 },
    { t: 0.1, color: '#000000', to: 0, duration: 1.0 },
  ],
  radio: [
    { t: 0.5, speaker: SYS, text: 'LAUNCH. BASE DEFENCES ACTIVE.' },
    { t: 2.6, speaker: ME, text: 'They have woken the whole base. Keep moving.', static: 0.1 },
    { t: 5.6, speaker: SYS, text: 'ENEMY CHATTER INTERCEPTED: ALL BATTERIES, WEAPONS FREE.' },
  ],
  skippableAfter: 2,
};

/** Seam between the three sections of the surface run. */
export const FP5_SECTOR_OUT: Cinematic = {
  id: 'fp5-sector-out',
  duration: 2.6,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  overlays: [{ t: 0.4, color: '#dfe9f5', to: 1, duration: 1.7 }],
  skippableAfter: 1,
};

export const FP5_SECTOR_IN: Cinematic = {
  id: 'fp5-sector-in',
  duration: 3.2,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  world: [
    { t: 0, do: 'scrollSpeed', speed: 0, ease: 0 },
    { t: 1.0, do: 'scrollSpeed', speed: 180, ease: 1.6 },
  ],
  overlays: [
    { t: 0, color: '#dfe9f5', to: 1, duration: 0.01 },
    { t: 0.2, color: '#dfe9f5', to: 0, duration: 1.4 },
  ],
  skippableAfter: 1,
};

/** Exit of chapter 5: past the last line the ship pulls up, the ground streaks away, the haze and snow thicken, the screen goes white in the cloud deck. */
export const FP5_PULL_UP: Cinematic = {
  id: 'fp5-pull-up',
  duration: 10,
  lock: { input: true, weapons: true, enemies: 'hold', invulnerable: true },
  world: [
    { t: 0, do: 'dismissUnits' },
    { t: 0.2, do: 'scrollSpeed', speed: 760, ease: 5 },
    { t: 0.4, do: 'weather', intensity: 1, ease: 6 },
    { t: 1.8, do: 'trail', kind: 'sparks', duration: 2.4, rate: 18 },
    { t: 3.4, do: 'shake', amount: 0.4 },
  ],
  ship: [
    { t: 0.3 },
    { t: 3.0, x: 270, y: 640, scale: 1.25, ease: 'inOut' },
    { t: 7.2, x: 270, y: 520, scale: 1.7, ease: 'inOut' },
  ],
  overlays: [{ t: 6.0, color: '#f4f8ff', to: 1, duration: 3.4 }],
  radio: [
    { t: 0.5, speaker: ME, text: 'Last line behind me. Pulling up!', static: 0.1 },
    { t: 3.4, speaker: SYS, text: 'ALTITUDE 3000 AND CLIMBING.' },
    { t: 5.2, speaker: ME, text: 'Orini is falling away. Into the clouds, then the stars.', static: 0.1 },
  ],
  skippableAfter: 2,
};
