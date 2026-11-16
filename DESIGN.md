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

## Boss anatomy: components
Status: **framework, turrets and explosive pieces built** (issue #34); consoles, generators, regrowth nodes and the rest are still design. It extends the boss definition framework above. The build notes are in "As built" at the end of this section.

**Concept.** A *component* is an object attached to a boss at a point in boss-local coordinates. It follows the boss (movement, mirror), has hidden HP, a hit area, a reaction to damage and an effect when destroyed. Turrets, explosive pieces and room consoles are all component *types*, so rooms/consoles (milestone 3, issue #10) reuse this system instead of adding another one. Later types (generators, regrowth nodes, conduits, spawners, shutters, weak points) slot in the same way.

**Definition.** `BossDefinition` gets `components: ComponentSpec[]`:
- `id`, `type` (`'turret' | 'explosive' | ...`), `anchor` (a named point from `BossSpec.anchors`, which mirror already flips, so components mirror for free), `radius` (circular hit area; rectangles can come later), `hp`.
- `mount`: `'surface'` or `'embedded'` (see Placement). Embedded components also name a `layer`.
- `onDestroy`: a list of effects (blast, disable group, spawn). `group`: optional string so one destruction can disable others (a room's consoles, a generator set).
- Phases can enable/disable components and apply modifiers (e.g. turret fire interval x0.5 in enrage).

**Placement.**
- *Embedded* (explosive tanks, consoles, generators): sits in a layer. It is targetable only once that layer is exposed over the component's centre (same rule as carving: every layer above is empty there). Drawn at its layer depth, so it shows through the hole as you dig.
- *Surface-mounted* (turrets): always targetable and drawn on top of the hull. It is attached to the hull region under it: if the anchoring rule cuts that region off, the component goes with the fragment (cut a wing, lose its turret).

**HP and feedback.** HP is real but never shown: no bar, no number. Player bullets that reach a targetable component deal their damage to its HP and are consumed. Feedback is visual and audible only: a hit flash and sound, then visible damage states at about 75 / 50 / 25% HP (cracks, sparks, smoke, flicker) and a distinct destroy effect. No damage numbers on components.

**Destruction and blasts.**
- Every destroyed component carves a crater (a radial carve using the existing density rules, so tougher layers resist), small for most types.
- Explosive pieces carry a `blast`: radius, energy and a falloff with distance. The blast carves boss layers in that radius, damages other components in range, and damages the core scaled by the core's current armor. **Boss-only for now:** blasts never hurt the player. Self-harm from blasts is a later risk/reward lever (issue #8).
- **Chain reactions are on.** Processed with a queue and each component destroyed once, so chains cannot loop. Neighbouring explosives within a blast radius take blast damage and may chain.

**Turrets.** Attack patterns fire from a turret's position, not the boss centre: an `AttackStep` can name a `source` (a component id or group). The scheduler skips steps whose source is destroyed or detached, so destroying a turret removes its attacks (the longer-term direction in issue #16). Aim modes: fixed, tracking, rotating. A turret telegraphs before firing (glow). Enrage can buff turrets through a phase modifier.

**Core armor.** The core's armor is currently derived from how much layer is dug (`coreVulnerability` in `Game`). It moves into the boss definition: `coreArmor` with a base `min` plus optional `requires` (component ids or groups, e.g. generators). Each destroyed required component raises vulnerability by a set amount, so destroying parts can progress the fight without digging everything.

**Debris.** Parts blown off the boss are in space: they do not fall toward the player. Detached chunks and components drift away from the break point with a slow outward push and spin, fade out and leave the screen. The existing fragment code (`FRAGMENT_GRAVITY` in `src/boss.ts`) currently pulls fragments down and must change to this.

**Rendering and debug.** Mounted components draw above the hull, embedded ones at their layer depth. A debug toggle draws component hit areas and ids. Scripted measurement (`game.debug.simulate`) and the autopilot must keep working with components present.

**Build order.**
1. Component framework, plus two types: turret and explosive piece. Includes craters, chain reactions, damage states, source-bound turret attacks, `coreArmor` in the definition, floating debris, and a demo boss using them.
2. Rooms and consoles (milestone 3, #10): consoles as a component type, room-disable via `group`.
3. Generators and core-armor progression, regrowth nodes (#15), conduits, spawners, shutters, weak points.

**Deferred decisions.** Damage multiplier for weak points; whether blasts can ever hurt the player; spawner enemy types; rectangular hit areas; how components are authored (a layout-time painter versus coordinates in the definition).

### As built (issue #34)
Code: `src/components.ts` (specs, `ComponentSystem`, drawing), hooks in `src/boss.ts`, `src/bossFight.ts`, `src/attackSchedulers.ts`, `src/attacks.ts`; demo `src/bosses/bulwarkComponents.ts` (`[B]`, "Bulwark (turrets + explosives)": 4 turrets, 3 explosive tanks). `[H]` toggles hit areas and ids (green = bullets can reach it now, grey = buried, red = destroyed, blue = detached); `game.debug.components`, `setComponentDebug`.
- **Definition**: `BossDefinition.components: ComponentSpec[]` (`id`, `type` turret|explosive, `anchor`, `radius`, `hp`, `mount`, `layer`, `group`, `enabled`, `turret`, `blast`, `crater`, `disables`), `PhaseDefinition.components` (`enable`, `disable`, `modifiers: [{ target, intervalScale }]`) and `BossDefinition.coreArmor`. Anchors come from `BossSpec.anchors`, so `mirror: true` flips components, and the turret aim angles with them.
- **Placement**: embedded = targetable when `Boss.isExposed(layer, centre)` (all layers above empty), drawn through `Boss.layerHook` right after its layer so layers above and their shadows cover it. Surface = always targetable, drawn through `Boss.topHook` over all layers. Both are anchored to `layer` (surface default 0, the hull): the anchoring pass calls `Boss.onDetach` with an orphan test, and a component whose sample points (centre + ring) are mostly in cut-off pixels goes with the fragment. A surface part also lets go when the hull under it is gone (support under 15%, relative to its start), so a blast that eats its mount frees it.
- **Damage**: `ComponentSystem.hit` runs before `Boss.hit` in `Game.resolveImpact`; a bullet that touches a targetable component deals its full energy to the hidden hp and is consumed (pierce does not carry through). A hit shows a flash, a tiny shake and a tick sound; levels at 75/50/25% hp add cracks (2/4/6), sparks, smoke, an orange tint and, at 25%, flicker, each crossing with a sound. No bar, no numbers (the carve numbers on the hull are the old ones and do not show for component hits).
- **Destruction**: `explode()` carves a crater with `Boss.carveRadial` (topmost solid layer per pixel, nearest first, cost = density / (1 - d/R)^falloff, so the rim is expensive and tough layers resist; the core marker is never carved), draws ring, flash, sparks, smoke and shards, and plays a pop or boom (the hit stop is short). Default crater: radius = hit radius, energy = radius^2 * 6.
- **Blasts and chains**: `blast: { radius, energy, damage, coreDamage, falloff }`. The blast carves the boss, damages every other component in range by `damage * (1 - d/R)^falloff` (through layers: a shock wave, not line of sight), and damages the core by `coreDamage` scaled the same way and by `coreVulnerability()`. Nothing in this system touches the player. Chains: damage that kills a component queues it with a short delay (0.07 s + distance/900) so the reaction ripples; each component is marked `dying` at once and `destroyed` once, so a cycle cannot repeat.
- **Turrets**: `AttackStep.source` (id or group). `ScriptedScheduler` skips steps whose source is not usable (destroyed, detached, disabled) and keeps looking; if none is usable it retries every 0.25 s. A group fires from every live member at once. The turret's barrel angle is the aim: `fixed` (angle), `tracking` (turns toward the ship at `trackRate`), `rotating` (`spin` deg/s); the shot leaves the muzzle along the barrel, so aimed shots follow the barrel and the volley pattern still goes straight down. The scheduler calls `SourceGate.warn` while the step is within `telegraph` seconds (default 0.5) and the turret glows more and more, then a muzzle flash. A phase's `intervalScale` modifiers multiply the pause of steps whose source matches the target (ids or groups), multiplicatively when several match. Disabled = inert (no fire, drawn dim) but still shootable.
- **Core armor**: `BossFight.coreVulnerability()` replaces `Game.coreVulnerability`. `min` (default `TUNING.coreArmor.min`) + (1 - min) * dug * `digWeight`, plus `perComponent` (default (1 - min) / number required) for each destroyed `requires` component, clamped to 1. Without `coreArmor` it is the old formula exactly.
- **Debris**: a detached component and the shards of a destroyed one drift outward at a constant velocity with spin and fade (`DRIFT_*` in `components.ts`), no gravity. Chunks of the boss layers still use the old fragment motion; issue #35 changes that in `src/boss.ts`.
- **Deviations / not done**: no `onDestroy` effect list, only `blast`, `crater` and `disables` (spawn effects wait for spawners). Hit areas are circles only. A pierce bullet does not pass through a component. Components are not enabled/disabled by debug phase jumps going backwards. Blast and turret numbers in the demo boss are a first guess and need a playtest. Because the nose guns sit directly above the frame tank, the demo's first dig often reaches the tank by accident; positions can move.
