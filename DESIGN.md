# Galactrious design notes (spec v0.1)

Vertical mobile shooter, tested in the browser. The player's ship fights a multi-layer monster ship
whose layers are carved away by projectiles.

## Boss data
- Three layer masks (hull, frame, rooms), each with a density value.
- Layers are 2D bitmaps stacked in depth; a pixel is hit on the topmost layer that is solid there.
- Rooms (later): rectangles with consoles, a name, and the function they power.
- Core: one marker with its own HP. Destroying it wins.

## Damage model
- A bullet carries energy equal to its damage.
- Carving an exposed pixel costs the layer's density. The bullet carves until its energy is spent.
  Hole area is roughly `damage / density`.
- A layer's pixel is only carvable if every layer above it is empty at that pixel ("exposed").
- Pierce keeps a fraction of the energy and the bullet continues after impact.
- Hole edges are noisy and scorched.

## Milestones
1. Carve test: ship, bullets, 3-layer boss from masks, density-based carving, core win. (current)
2. Boss motion (sway) and heat-armor shield.
3. Rooms and consoles, room-disable, core win flow.
4. Attack patterns tied to rooms, player damage, death reset.
5. Action report and mission flow.
6. Upgrades and currency.
7. Second boss (Bulwark, done).

## Stack
TypeScript + Vite + Canvas 2D, 540x960 logical portrait resolution.

## Boss definition framework
Bosses and mini-bosses are data with the same shape (`BossDefinition`, `src/bosses/types.ts`).
One file per boss in `src/bosses/`, registered in `src/bosses/index.ts` (the first entry is the
default; `[B]` in debug cycles them). `src/bossFight.ts` (`BossFight`) runs a definition.

- **Definition**: `id`, `name`, `layout()` (builds the layered masks + core), `spawn` (anchor: centre x, top y) and `phases[]`.
- **Phase**: `name`, `movement`, `attacks` (ordered `AttackStep`s, looped), optional `attackDelay`, and a `trigger` (required for every phase after the first).
- **Triggers** (checked during the previous phase, so phases advance in order):
  - `damage` with `percent` and `metric`: `'pixels'` (default) = share of all hull+frame+rooms pixels carved or broken off; `'core'` = share of core HP lost (the core is armoured until layers are dug, so pixels is the usual choice).
  - `fightTime`: seconds since the fight began. `phaseTime`: seconds spent in the previous phase.
- **Movement** (`src/movement.ts`): `{ name, at(t) }` returns an offset from the anchor at fight time `t`. Stateless. A phase's `movement` is one `Movement`, which can itself be built from others. Position is applied every frame, with a 0.6 s ease between phases so a switch never snaps.
  - Library: `still`, `sway(amplitude, period)`, `bob(amplitude, period)` (vertical), `figureEight(ax, ay, period)`, and `zip({ amplitude, travel, pause, windup, windupDistance })`: fast eased dash between two ends with a rest and a small pull-back wind-up telegraph at each end. `travel` is the speed knob (peak speed is about `3.75 * amplitude / travel` px/s). Presets `ZIP_NORMAL` and `ZIP_FAST` (about 0.28 s across, roughly 1200 px/s, 20 px per frame).
  - Composing: `combine(a, b)` adds offsets (e.g. sway plus bob). `sequence([{ movement, duration }, ...], blend)` chains movements, each on its own local clock, looping, easing from the previous step's end offset for the first `blend` seconds. Both nest.
  - Debug: `[M]` cycles `MOVEMENT_PRESETS` live as an override (shown as OVERRIDE in the overlay), then back to the phase's own. `[T]` freezes whatever is active, override included.
  - Screen limit: the demo boss is 360 wide on a 540 screen, so horizontal `amplitude` 90 is edge to edge.
- **Mirror**: `BossDefinition.mirror: true` flips the layout horizontally once at load (`mirrorSpec` in `src/boss.ts`): every layer canvas, the core, and the optional `BossSpec.anchors` map (named turret/muzzle/pivot points, layout pixels). Not live. Baked shading flips with it. Attack origins read the core position, so they follow automatically. The `Demo boss (mirror + motion)` entry (`[B]`) uses it, with phases sway, fast zip (10% damage), figure-eight (25%), and a sequence (10 s).
- **Fast movement and bullets**: player bullets sub-step 1 px at a time, but the boss used to jump a whole frame first, so bullets near its leading/trailing edge could miss. `Game.updateBullets` now sweeps: each sub-step tests against the boss position interpolated across the frame (`Boss.prevX/prevY` to `x/y`), with extra sub-steps if the boss moves more than the bullet. Identical when the boss is still. `debug.setSwept(false)` restores the old behaviour for comparison.
- **Rotation (deferred, not implemented)**: the interface leaves room for it. Options: (a) 90-degree step remap: rotate masks, core and anchors at a phase boundary with the same one-time transform as mirror (cheap, keeps pixel-exact carving, but is a visible snap); (b) smooth transform: keep masks in boss space and transform bullet positions into boss space for `hit`, with rendering via `ctx.rotate`. That needs a pivot, a `rotation(t)` next to `at(t)` on `Movement` (return `{ x, y, angle }`), and rotated anchor points; shadows and fragment spawn also need the angle. Neither is built.
- **Attack scheduling** (`src/attackSchedulers.ts`): a scheduler returns which pattern to fire now. `ScriptedScheduler` runs a phase's attack set; `DebugScheduler` cycles or randomises all patterns. `[N]` switches phase script -> cycle -> random. Patterns read the boss origin through a getter every frame, never a cached position.
- **Default boss**: one phase, the original sway and attack set. `Demo boss (3 phases)` is the example: phase 2 at 15% pixel damage, phase 3 after 12 s in phase 2.
- The debug overlay shows the phase, its movement, progress toward the next trigger and both damage metrics.

## Bulwark (second boss) and the enrage cue
- **Bulwark** (`src/bosses/bulwark.ts`, `[B]` in game): a 420 x 330 manta gunship painted from shapes with the shared helpers in `src/bosses/paint.ts` (`makeCanvas`, `shade`, `crisp`, `fillRects`; the demo boss uses them too). Hull = bronze manta silhouette (swept wings, notch at the nose). Frame = graphite-blue outer armour ring (14 px band inside the hull edge), inner bulkhead ring (r 55..69) round the reactor, four diagonal spokes; the gaps between spokes leave hull directly over the rooms (open lanes). Rooms = left/right gun bay in the wings, reactor (holds the core), lower hangar, in rust/deep red. No violet, magenta, lime or cyan, so bullets stay readable. The frame is one connected region (wings detach when cut off); each room is its own region (one breaking away never takes the others).
- **Own densities**: `BULWARK_TUNING` (hull 2.4, frame 4.2, rooms 0.8, core HP 1500). The global `TUNING` is untouched. Steady `debug.simulate(..., 'sweep')` with default ship stats measured roughly: hull and frame cleared at 80-90 s, rooms 80-110 s, core 250-490 s (core time is dominated by how often the sweep crosses the 32 px core target, so it varies a lot). A hull clear of 60 s was not reachable by sweep alone. Feel needs a human playtest.
- **Phases**: Patrol (sway, volley/aimed, occasional bomb); Pressure at 30% pixel damage (zip, adds lineSweep, intervals x0.75); Enrage at 65% (ZIP_FAST, all four attacks, intervals x0.5). Pixel damage is dominated by the cheap hull (63% of pixels), so the 30%/65% transitions arrive early (about 20 s and 45 s under the sweep). Zip amplitude is cut to 60 (`ZIP_*` presets use 90, which is edge to edge for 360 px) so a 420 px boss stays on screen.
- **Enrage cue** (any boss): set `enrage: {}` (optional `breather` seconds, `tint` 'r, g, b') on a `PhaseDefinition`. At the transition `BossFight` sets `enraged` and a 0.45 s `enrageFlash`; `Game` adds a full screen-shake (`Effects.onEnrage`) and plays `Sfx.enrage`; `EnrageTint` (`src/enrage.ts`) renders the boss offscreen and tints it with `source-atop` (white blink, then a slow red pulse that stays, carve visuals remain readable); `Hud.drawEnraged` shows an "ENRAGED" badge top centre, clear of the top-right health bar. The phase's attack scheduler starts after the breather (default 1.5 s), replacing `attackDelay`. Enraged state persists into later phases and is cleared when debug-jumping back before the enrage phase.
- **Hull tuning metric**: the hull is tuned by time to carve 25% of it (`hull25` in `debug.clearTimes()` and the debug overlay; a player needs about 25% to reach the layers below), not by clearing it to <=5%. Target about 60 s, default ship stats, test mode off, steady sweep. Bulwark hull density 2.4 and demo `TUNING.densities.hull` 1.12 measure 57-63 s and 59-60 s. The <=5% numbers are still reported.
