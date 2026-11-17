# Galactrious design notes (spec v0.1)

Vertical mobile shooter, tested in the browser. The player's ship fights a multi-layer monster ship
whose layers are carved away by projectiles.

## Boss data
- Three layer masks (hull, frame, rooms), each with a density value.
- Layers are 2D bitmaps stacked in depth; a pixel is hit on the topmost layer that is solid there.
- Rooms: named groups of consoles with a function they power (built, see "Rooms and consoles").
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
3. Rooms and consoles, room-disable, core win flow. (rooms, consoles, exposure reactions, room-disable built in issue #10; the core win flow is the existing core)
4. Attack patterns tied to rooms, player damage, death reset.
5. Action report and mission flow.
6. Upgrades and currency.
7. Second boss (Bulwark, done).

## Stack
TypeScript + Vite + Canvas 2D, 540x960 logical portrait resolution.

## Boss definition framework
Bosses and mini-bosses are data with the same shape (`BossDefinition`, `src/bosses/types.ts`).
One file per boss in `src/bosses/`, registered in `src/bosses/index.ts` (`DEFAULT_BOSS_ID` picks the
boss the game starts on, currently `bulwark-rooms`; `[B]` in debug cycles them in list order). `src/bossFight.ts` (`BossFight`) runs a definition.

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
- **Hull tuning metric**: the hull is tuned by time to carve 25% of it (`hull25` in `debug.clearTimes()` and the debug overlay; a player needs about 25% to reach the layers below), not by clearing it to <=5%. Target about 60 s, default ship stats, test mode off, steady sweep. Before the weapons (issue #12) Bulwark hull density 2.4 and demo `TUNING.densities.hull` 1.12 measured 57-63 s and 59-60 s; with the full weapon loadout they are retuned, see "Player weapons". The <=5% numbers are still reported.

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

**Turrets and weapon sources (issue #43).** Every attack comes from a weapon source: `AttackStep.source` (a turret id or group) is REQUIRED, and the attack fires at the turret's muzzle, never the boss centre or a fixed point. `BossFight` rejects a definition with a step that has no source or names no turret (an error when the fight is built). A boss without turrets must get turret components (the demo bosses carry a `gun`, the Bulwarks a keel gun and nose guns). The scheduler skips steps whose source is destroyed, detached, disabled or unpowered, so destroying a turret removes its attacks (issue #16). Sweep pivots, bomb lobs, volley and aimed origins read the source position every frame; the turret's barrel is the aim except for bombs (`aimAtPlayer`), which land on the player. Hazards a source already started (a telegraphing or live sweep, a bomb's telegraph and zone) end the moment it is destroyed, detached, disabled or unpowered (`Hazard.alive`); bullets in flight finish. Room reactions (`attack`, `pulse`) are sourced from the room's still-working consoles, and stop when none is left. Debug firing ([F], `[N]` cycle/random) uses live turrets in turn. Aim modes: fixed, tracking, rotating. A turret telegraphs before firing (glow). Enrage can buff turrets through a phase modifier.

**Core armor.** The core's armor is currently derived from how much layer is dug (`coreVulnerability` in `Game`). It moves into the boss definition: `coreArmor` with a base `min` plus optional `requires` (component ids or groups, e.g. generators). Each destroyed required component raises vulnerability by a set amount, so destroying parts can progress the fight without digging everything.

**Anchoring across layers (issue #68).** Cause: each layer was anchored only against itself (each original region by its own largest piece), so a room, or any chunk of a layer, cut free of the hull and frame around it still counted as anchored: it floated beside the boss, stayed targetable, and its consoles stayed live. Fix (`Boss.unionAnchor`): the union of all layers' solid pixels is labelled once per check; the main mass is the component holding the core (or the largest); a piece of any layer that is not in it breaks away as debris (consoles and parts in it go with it via `onDetach`). The old per-region rule still runs on top. A check in any layer re-checks the whole stack, and a chunk removed by the region rule re-flags every layer. Indestructible armour is in the union but never detached. `game.debug.anchoring()` returns live pixels per layer not connected to the main mass; it must settle to 0 after any carving, and `setUnionAnchoring(false)` restores the old rule for A/B.

**Debris.** Parts blown off the boss are in space: they do not fall toward the player. Detached chunks and components drift away from the break point with a slow outward push and spin, fade out and leave the screen. The existing fragment code (`FRAGMENT_GRAVITY` in `src/boss.ts`) currently pulls fragments down and must change to this.

**Rendering and debug.** Mounted components draw above the hull, embedded ones at their layer depth. A debug toggle draws component hit areas and ids. Scripted measurement (`game.debug.simulate`) and the autopilot must keep working with components present.

**Build order.**
1. Component framework, plus two types: turret and explosive piece. Includes craters, chain reactions, damage states, source-bound turret attacks, `coreArmor` in the definition, floating debris, and a demo boss using them.
2. Rooms and consoles (milestone 3, #10): consoles as a component type, room-disable via `group`. **Built**, see "Rooms and consoles".
3. Generators and core-armor progression, regrowth nodes (the hull regrowth they would boost is built, issue #15, see "Hull regrowth"), conduits, spawners, shutters, weak points.

**Deferred decisions.** Damage multiplier for weak points; whether blasts can ever hurt the player; spawner enemy types; rectangular hit areas; how components are authored (a layout-time painter versus coordinates in the definition).

### As built (issue #34)
Code: `src/components.ts` (specs, `ComponentSystem`, drawing), hooks in `src/boss.ts`, `src/bossFight.ts`, `src/attackSchedulers.ts`, `src/attacks.ts`; demo `src/bosses/bulwarkComponents.ts` (`[B]`, "Bulwark (turrets + explosives)": 4 turrets, 3 explosive tanks). `[H]` toggles hit areas and ids (green = bullets can reach it now, grey = buried, red = destroyed, blue = detached); `game.debug.components`, `setComponentDebug`.
- **Definition**: `BossDefinition.components: ComponentSpec[]` (`id`, `type` turret|explosive|console, `anchor`, `radius`, `hp`, `mount`, `layer`, `group`, `enabled`, `turret`, `blast`, `crater`, `disables`), `PhaseDefinition.components` (`enable`, `disable`, `modifiers: [{ target, intervalScale }]`) and `BossDefinition.coreArmor`. Anchors come from `BossSpec.anchors`, so `mirror: true` flips components, and the turret aim angles with them.
- **Placement**: embedded = targetable when `Boss.isExposed(layer, centre)` (all layers above empty), drawn through `Boss.layerHook` right after its layer so layers above and their shadows cover it. Surface = always targetable, drawn through `Boss.topHook` over all layers. Both are anchored to `layer` (surface default 0, the hull): the anchoring pass calls `Boss.onDetach` with an orphan test, and a component whose sample points (centre + ring) are mostly in cut-off pixels goes with the fragment. **Detach rule (issue #42), surface and embedded alike:** a component needs solid pixels in its attach layer under it. (1) If the anchoring pass cuts its region off as a chunk, it goes with the fragment and drifts away (`debris.ts`). (2) Otherwise, whenever pixels change, a part whose support (sample points over its footprint) falls under 30%, or under half of what it started with, or to zero, has lost its mount: it is destroyed with its normal effect (crater, blast for explosives, boss-only damage). So no part stays floating, firing or blocking shots, whether the mount was cut away or carved away, on the hull, frame or rooms layer.
- **Damage**: `ComponentSystem.hit` runs before `Boss.hit` in `Game.resolveImpact`; a bullet that touches a targetable component deals its full energy to the hidden hp and is consumed (pierce does not carry through). A hit shows a flash, a tiny shake and a tick sound; levels at 75/50/25% hp add cracks (2/4/6), sparks, smoke, an orange tint and, at 25%, flicker, each crossing with a sound. No bar, no numbers (the carve numbers on the hull are the old ones and do not show for component hits).
- **Destruction**: `explode()` carves a crater with `Boss.carveRadial` (topmost solid layer per pixel, nearest first, cost = density / (1 - d/R)^falloff, so the rim is expensive and tough layers resist; the core marker is never carved), draws ring, flash, sparks, smoke and shards, and plays a pop or boom (the hit stop is short). Default crater: radius = hit radius, energy = radius^2 * 6.
- **Blasts and chains**: `blast: { radius, energy, damage, coreDamage, falloff }`. The blast carves the boss, damages every other component in range by `damage * (1 - d/R)^falloff` (through layers: a shock wave, not line of sight), and damages the core by `coreDamage` scaled the same way and by `coreVulnerability()`. Nothing in this system touches the player. Chains: damage that kills a component queues it with a short delay (0.07 s + distance/900) so the reaction ripples; each component is marked `dying` at once and `destroyed` once, so a cycle cannot repeat.
- **Blast sizes (issue #44).** Every destroyed turret, explosive and console makes a blast, and a room with `explodeOnDisable` makes a room blast. Per-type defaults live in one table, `BLAST.defaults` in `src/config.ts`; `ComponentSpec.blast` and `RoomSpec.explodeOnDisable` are now partial overrides (overriding only `radius` rescales the default `energy` with the area). Defaults at scale 1: turret r45 / energy 3000 / damage 60 / core 40; explosive r115 / 10000 / 150 / 250; console r28 / 1200 / 15 / 10; room r115 / 10000 / 160 / 260 (the demo tanks override `radius` to 100 and 90 and some `coreDamage`). The global knob is `BLAST.scale` (keys `-` / `=`, Shift = x4 steps, debug panel row, overlay line, `game.debug.setBlastScale`): carve radius x scale^0.85, energy x scale^1.6, component/core damage unchanged, and the shock reach to other components and the core x scale^0.5, so a high scale makes bigger craters without chaining the whole boss. Feedback grows with the effective radius: shake `0.12 + 0.004 r` (cap 0.55, trauma cap 0.85), hit stop `0.02 + 0.0006 r` s (cap 0.1), ring/flash size, spark, smoke and shard counts and speeds (shards drift away, never fall), and the destroy sound gets longer, louder and deeper. Measured on a fresh boss (share of all boss pixels removed by one piece, with its chain): turret 1.1%, explosive 3.3-3.5%, fuel store consoles 1.5%; at scale 2: turret 2.9%, explosives 10-35% (the frame tank chains most of the ship). Baseline before: turret 0.5%, explosive 2.5-9.8%. The extra carving makes the scripted `hull25` autopilot time about 8% shorter (about 47 s against 51 s) on bosses with components.
- **Turrets**: `AttackStep.source` (id or group). `ScriptedScheduler` skips steps whose source is not usable (destroyed, detached, disabled) and keeps looking; if none is usable it retries every 0.25 s. A group fires from every live member at once. The turret's barrel angle is the aim: `fixed` (angle), `tracking` (turns toward the ship at `trackRate`), `rotating` (`spin` deg/s); the shot leaves the muzzle along the barrel, so aimed shots follow the barrel and the volley pattern still goes straight down. The scheduler calls `SourceGate.warn` while the step is within `telegraph` seconds (default 0.5) and the turret glows more and more, then a muzzle flash. A phase's `intervalScale` modifiers multiply the pause of steps whose source matches the target (ids or groups), multiplicatively when several match. Disabled = inert (no fire, drawn dim) but still shootable.
- **Core armor**: `BossFight.coreVulnerability()` replaces `Game.coreVulnerability`. `min` (default `TUNING.coreArmor.min`) + (1 - min) * dug * `digWeight`, plus `perComponent` (default (1 - min) / number required) for each destroyed `requires` component, clamped to 1. Without `coreArmor` it is the old formula exactly.
- **Debris**: a detached component and the shards of a destroyed one drift away using the shared helper in `src/debris.ts` (issue #35): a slow push from the break point, drag, spin, fade, no gravity.
- **Deviations / not done**: no `onDestroy` effect list, only `blast`, `crater` and `disables` (spawn effects wait for spawners). Hit areas are circles only. A pierce bullet does not pass through a component. Components are not enabled/disabled by debug phase jumps going backwards. Blast and turret numbers in the demo boss are a first guess and need a playtest. Because the nose guns sit directly above the frame tank, the demo's first dig often reaches the tank by accident; positions can move.

## Rooms and consoles
Status: **built** (issue #10, milestone 3). Code: `src/rooms.ts`, console type and `powered` in `src/components.ts`, `BossDefinition.rooms`, HUD in `src/hud.ts`, demo `src/bosses/bulwarkRooms.ts` (`[B]`: "Bulwark (rooms + consoles)" and a mirrored variant).

- **Authoring.** `BossDefinition.rooms: RoomSpec[]`: `id`, `name`, `function` (HUD label, e.g. "Wing guns"), `powers` (component ids or groups that go offline), `consoles: [{ anchor, radius?, hp? }]`, `onExposed` (effects) and `explodeOnDisable` (`true` or a `BlastSpec`). Console `anchor`s come from `BossSpec.anchors`, so `mirror: true` flips rooms for free. Each console is expanded into a normal component (`type: 'console'`, embedded in the last (rooms) layer, group `room:<id>`, default radius 9, hp 90), so it has hidden hp, damage states (cracks, sparks, smoke, flicker), hit flash and sound like the rest. No bars, no numbers.
- **Exposed** = you can see the console: the embedded-component rule (every layer above is empty over its centre). The first time any console of a room is exposed (or destroyed, or torn off) the room's reaction starts, once per room per fight.
- **Reaction.** Telegraph first: the consoles pulse red with a glow, a ring pings, two warning beeps, a jolt of shake and a HUD banner "WARNING: <FUNCTION> DEFENCES" (2 s). The effects follow after their `delay` (default 0.6 s). Effects (`RoomEffect`, a union, add a kind and a case in `RoomSystem.run`):
  - `attack`: fire any existing `AttackPattern` from the room position (centre of its consoles, live), `count` times `gap` s apart.
  - `pulse`: a shield-burst. A ring hazard (new `ring` HazardShape in `src/attackStyles.ts`/`src/hazards.ts`) that outlines its final radius, then expands from the room and hurts the player on contact.
  - **Drones** are no longer a reaction effect: they are the `spawner` room function (see "Room function catalog: as built").
- **Disabled.** When every console is destroyed or torn off, the room goes offline: components in `powers` get `powered = false` (turrets stop firing and tracking, are drawn dark; phases cannot switch them back on; they stay shootable), the HUD marks the room OFFLINE, and a power-down sound plays. Rooms can also feed core armor: `coreArmor.requires: ['room:<id>']` counts rooms taken offline (the demo's shield projector).
- **`explodeOnDisable`.** On going offline the room blows up with the shared blast (`ComponentSystem.roomBlast`): crater, damage to neighbouring components with the usual chain reaction, damage to the core scaled by its armor. Boss-only like every blast, it never hurts the player. In the demo the fuel store's blast reaches the reactor tank, which chains into the reactor consoles.
- **HUD.** A list above the layer panel: each room's function and ONLINE / EXPOSED / OFFLINE. The old flood-filled room pips stay.
- **Debug.** `[H]` also draws rooms (dashed circle, state, live consoles, what it powers) and rings the consoles you can see right now in cyan. `[E]` force-exposes the next room (its reaction fires, once); `game.debug.rooms.forceExpose(id)`.
- **Deviations / not done.** Room geometry is the console centroid, not a rectangle painted in the rooms layer, and the layer's flood-filled "rooms" in the HUD are not tied to the named rooms. A phase cannot yet re-enable a room. `onExposed` does not repeat. Effect numbers in the demo are a first guess and need a playtest. 

### Room function catalog: as built
Status: **built.** Code: `src/roomFunctions.ts` (the catalog), `src/rooms.ts` (`RoomSystem` runs it), demo boss `src/bosses/roomLab.ts` (`[B]`: "Room lab", one room per function), unit `tender` in `src/enemies/big.ts`.

- **Shape.** A room's behaviour is a list of **functions**: `RoomSpec.functions: RoomFunctionSpec[]` (a union on `kind`, parameters are data). The old `powers` and `explodeOnDisable` fields still work: they are folded in as a `power` and a `reactor` function (`resolveFunctions`). Bulwark rooms and Mantis now spell their rooms with `functions`; behaviour and numbers are the same.
- **Handler.** One `RoomFunctionHandler` per kind in `HANDLERS`: `init` (runtime state), `onOnline` / `onOffline(natural)` (also run by the debug force), `update(dt)` every frame (so effects run all fight, not only on exposure; the handler checks `room.offline`), `cue` (the in-world cue) and `describe` (parameters for the `[H]` overlay). Plus a `label`, `color` and badge `glyph`.
- **The seven functions** (online / offline):
  - `power { targets }`: components powered / dark and silent. Cue: dashed power lines with a travelling spark to what it feeds.
  - `shield { zone? }`: no zone = core armor: the room counts as a `requires` source in `coreVulnerability` (listing `room:<id>` in `coreArmor.requires` still works, no double count), so offline raises core vulnerability. `zone { radius, factor }` = components within `radius` of the room take `factor` (0.35) of the damage while online. Cue: dashed bubble ring on the core or the zone.
  - `repair { layer?, rate?, mode?, idleDelay?, heal? }`: a `Regrowth` (src/regrowth.ts, all its rules) of `layer` at `rate` (default 0.004 of the layer per s, mode `slow`) and/or `heal { targets, perSecond }` hp on components; offline both stop. The regrowth is owned by the boss (`Boss.extraRegrowth`, `BossFight.makeRegrowth`), so several rooms can repair. Cue: green pulse rings while it works.
  - `spawner { unit, interval, max, total, first }`: launches `unit` through `RoomHost.spawnUnit` (the game puts it through the unit system: it flies from the room to a slot below and dives like a wave drone). **Capped**: at most `max` (3) alive at once and `total` (6) in the whole fight, then it stops; offline it stops. Cue: a flash at the room per launch, a charge arc.
  - `sensor { targets }`: turrets track the player while online (even fixed ones); offline they ease back to their rest angle and lobbed patterns do not aim at the player either (`FireSource.dumb`). Cue: radar sweep.
  - `reactor { blast? }`: nothing online; when the last console dies it explodes with the shared room blast and chains. Cue: slow red pulse. (The debug force-offline does not explode.)
  - `engine { online?, offline? }`: the boss's movement clock (`BossFight.moveTime`, equal to `fightTime` with no engine room) runs at x1.5 online, easing to x0.4 offline (`RoomSystem.engineSpeed`). Without an engine room nothing changes. Cue: thrust chevrons.
- **Readable.** Every function has a coloured badge (`P S + D T ! E`, a red slash when offline) above its room once exposed, and the HUD room list shows `TAG  function  ONLINE/EXPOSED/OFFLINE` (tag = the function's name, in its colour). `[H]` also prints each function's parameters and live values under the room.
- **Units.** `UnitDefinition.rooms` takes one small room (consoles embedded in the unit's last layer). It runs on the unit's own `BossFight`, stops when the unit dies, and its cues draw with the unit. New unit **Tender** (a Frigate with a repair room in the core chamber: repairs 2 %/s of the hull and mends its guns, so dig to its two consoles first), used as `tender+` in wave `l3w2` (the last level) at one slot; the other waves are unchanged.
- **Debug.** `game.debug.rooms.forceOffline(id)`, `forceOnline(id)`, `setState(id, 'auto')` hold a room regardless of its consoles (the HUD and `[H]` show "forced"). `[B]` Room lab has one room per function.
- **Adding a function.** (1) Add a spec to `RoomFunctionSpec`. (2) Write a `RoomFunctionHandler` and put it in `HANDLERS`. (3) Use it in a room's `functions`. Nothing else changes (HUD, cues, debug and force-offline go through the handler).
- **Existing bosses.** Unchanged: `hull25` (sweep, 90 s) bulwark-rooms 37.2 to 42.9 on both main and this branch (the run-to-run noise of the sweep), mantis 60.8 / 61.1, the rest within a point or two of before. The only engine-visible changes are the extra fields (`guard`, `sensor`, `moveTime`) and `RoomSystem`'s constructor taking a regrowth factory.
- **Not done.** No sound for repair or spawn. A phase cannot yet switch a function on or off, `onExposed` still does not repeat, drones from a boss room are free kills (no reward). Numbers (repair rates, drone cap) are a first guess.

## Player weapons (issue #12)
Code: `src/weapons.ts` (`WEAPON_DEFS`, `WeaponSystem`), tunables in `WEAPONS` (`src/config.ts`), carve shapes in `src/carveShapes.ts`. The machine gun stays the base shot (in `Game`); three more weapons fire on their own timers, all equipped at once, no input. Each weapon is data: id, name, cooldown and a `fire` function that spawns projectiles from plain fields (energy, `pierce`, carve `shape`, `blast`, `steer`, `componentPierce`), so upgrades (angled spread, double guns, more missiles) are modifiers on a definition (copy it and change cooldown, counts, angles or numbers). The base gun is not yet in this format. Energies are for default ship damage and scale with the live damage (`power = damage / TUNING.ship.damage`), so the `1/2`, `[` `]`, `9` keys and panel scale the weapons. Weapons only ever hurt the boss.
- **Gauss** (5 s): one fast shot straight up (2600 px/s) with a bright trail. High pierce (0.9, `narrow` carve shape: lateral penalty 5, so a thin shaft), and it passes through components (each touched once, soaking only their hp).
- **Rocket** (6 s): straight up, accelerates. Low penetration: detonates on the first solid pixel or targetable component as a player blast (`ComponentSystem.playerBlast`, the same crater, shock to nearby components with chain reactions and core damage as component blasts, with `BLAST.scale` applied). Exhaust trail, flame, impact flash.
- **Arc missiles** (7 s): a pair launched sideways (one each side, up-tilted), then each flies a wandering curved path to a random solid pixel of the boss chosen at launch in boss-local coordinates (so it follows the boss's motion). Steering is turn-rate limited with a sine wander that fades near the target; if the target pixel is carved away it picks another random solid pixel; it fizzles only when the boss is defeated; it detonates its remaining energy at the target. Medium cratering (`round` shape) and medium pierce (0.5); passes through components.
- **Shapes**: `Boss.hit(x, y, energy, shape)` takes a `CarveShapeName`; default is the original forward-biased ellipse.
- **Debug**: `I`/`O`/`L` toggle, `Q` fire all, `,` `.` cooldown scale, panel buttons, overlay line, cooldown rings in the HUD (bottom right above the dodge button).
- **Retune (hull25, sweep autopilot, test mode off, `BLAST.scale` 1.75, god mode and boss attacks off, mean of 3-6 runs).** Before (main, no weapons, scale 1.75): default boss (Bulwark rooms) about 43 s, demo boss 56 s. With the full loadout and the OLD densities: default boss 25 s (weapons at the final strength), demo boss about 28 s (measured with slightly stronger weapons). Hull densities now: Bulwark 6 (was 2.4) and demo `TUNING.densities.hull` 3.1 (was 1.12). After, full loadout: **demo boss 60.5 s** (gun only 128 s), **default boss 39.6 s** (gun only 72 s). The default boss cannot reach 60 s by density: its hull25 is dominated by a component chain (explosive tank blasts then break-offs, 2 to 14 components, hull 88% to 74% at once) at about 43 s that raising hull density does not delay (hull 13 still gave 44 s). Getting it to 60 would need the blast or component rules, which this change leaves alone. Weapon strengths were lowered from the first guess (gauss 3600 to 1400, rocket blast energy 6000 to 1500, arc 1100 to 1200) because the first values made the weapons several times the gun. Feel needs a human playtest.
- **Weapon tuning after playtest.** Gauss: carve shape `narrow` lateralPenalty 5 to 3.4 (about 47% wider shaft), reach 120 to 100, pierce 0.9 to 0.85 (shorter and thicker, still the deepest weapon). Rocket: blast radius 70 to 88 (+26%, energy unchanged; crater 1026 to 1625 px on the demo boss). Base gun `TUNING.ship.fireRate` 12 to 8 per second (test mode keeps its own 30/s preset). hull25, sweep, mean of 3-5 runs: default boss (Bulwark rooms) 43.0 s before, 42.7 s after; demo boss 59.7 s before, 71.1 s after. Hull densities deliberately not retuned here.

## Hull regrowth
Status: **built** (issue #15). Code: `src/regrowth.ts`, hooks in `src/boss.ts` (`Layer.orig/origRgba/gone`, `Boss.sinceHit`, glow draw), `src/bossFight.ts`, `src/components.ts` (hit clock). Demo: `src/bosses/bulwarkRegrowth.ts` (`[B]`: "Bulwark (regrowth)"). It is an anti-spam lever for specific bosses; a definition without `regrowth` never creates the system and behaves exactly as before (scripted `hull25` on Bulwark rooms measured 47.0 s before and after).

- **Opt-in.** `BossDefinition.regrowth: { layer?, mode: 'slow' | 'idle' | 'both', rate, idleRate?, idleDelay?, maxFraction? }`. `layer` defaults to 0 (hull). `rate` is a fraction of the layer's ORIGINAL pixel count per second (0.001 = 0.1 %/s). `slow` regrows at `rate` always; `idle` only once the boss has gone `idleDelay` s (default 3) without taking player damage, at `idleRate` (default `rate`); `both` regrows at `rate` always and at `idleRate` (default 4 x rate) when idle. `maxFraction` caps the cumulative regrown pixels (default 1 = no cap).
- **Idle clock.** `Boss.sinceHit` resets on any bullet that lands on boss pixels, on a component hit (`ComponentSystem.hit`), and on core damage. It is driven from `Boss`/`ComponentSystem`, so `Game` needed no change.
- **Rules.** A pixel regrows only if: (1) it is in the original mask, empty now and not lost for good. Lost for good = broken off by the anchoring pass (fragments and specks) or removed by a radial carve (component craters, blasts, room blasts); only bullet carving heals, so **a destroyed component's crater never refills** and neither does a chunk that drifted away. (2) It touches (4-neighbour) a solid pixel of the same layer, so growth runs from the edge of standing material inward, one or two pixels per 0.05 s tick, picked at random for a ragged healing edge. A seed is always a standing pixel of the same original region, so a detached fragment can never seed regrowth and a region never grows into another; a layer with a pending anchoring check waits for it. (3) Stacking: only holes of the regrowing layer are filled, layers above are never touched, and for layer > 0 the result is the state before it was carved. It never re-buries something reached: no regrowth within hit radius + 3 px of a live embedded component in a deeper layer, nor within core radius + 4 px of the live core, so an exposed console or the core stays exposed (exposure rule intact). (4) The cumulative cap.
- **Metrics.** Regrown pixels count back into `Layer.remaining`, so layer percentages, `pixelDamagePercent`, `coreVulnerability` (digging) and the overlay all see them. Phases only ever advance (triggers are checked for the next phase only), so a phase never reverts when damage drops. `hull25`, the <=5% clear times and the autopilot take the first time the threshold is reached and never un-set. Under the sweep autopilot the demo's `hull25` is about 52 s against 47 s without regrowth. `game.debug.simulate` works unchanged (regrowth runs inside `Boss.update`).
- **Feedback.** Regrown pixels get their original colour back (so the new edge is unscorched) and a warm glow overlay that fades over 0.9 s (`Regrowth.drawGlow`, drawn at the layer's depth so layers above still cover it). The scorched edge of the remaining hole stays. No sound.
- **Debug.** `[U]` toggles regrowth live (`game.debug.fight.regrowth.enabled`). The overlay line shows mode, layer, current rate, idle timer / delay (IDLE when active), regrown share and "growing". `game.debug.regrowth` exposes the object.
- **Hook for regrowth nodes (not built).** `Regrowth.scale` multiplies the rate (0 stops it). A node component would set it (or a per-region variant) while alive; the rest of the rules stay as is.
- **Demo numbers.** Bulwark (regrowth): hull only, `both`, 0.08 %/s always (about 50 px/s), 0.8 %/s once idle for 2.5 s, capped at 60 % of the hull. First guesses, need a playtest.
- **Not verified / known limits.** No humans playtest; mirror was not run with regrowth (the original mask is taken after `mirrorSpec`, so it should follow). A few pixels next to a live embedded part's margin may stay open (66 in one test). Only one layer per boss.

## Mantis (third boss)
Code: `src/bosses/mantis.ts` (`[B]`, "Mantis"; not the default boss). A tall 336 x 420 insectoid (horns up and out, tapering to a stinger) against Bulwark's wide manta. Built only from the existing framework: three layers (hull olive, frame teal-grey, rooms rust), turrets, explosive generators, three rooms, `coreArmor`, three phases with an enrage cue.

Two distinctive mechanics:
1. **Shield generators (core gating).** Three generators (`gen`, explosive, embedded in the FRAME layer on round pads) hold the shield. `coreArmor: { min: 0.1, digWeight: 0.3, requires: ['gen'], perComponent: 0.2 }`: digging alone gets the core to about a third vulnerability; each destroyed generator adds 0.2. Dig the cheap hull, find the pads, blow them up, then the core opens. Generators are about 130 px apart so they do not chain into each other.
2. **Rooms that power weapons.** Targeting (left lane) powers the chin gun `maw` (the tracking aimed shots); Capacitor (right lane) powers both `horns` (rotating guns, line sweeps). Taking a room offline silences that weapon for the rest of the fight. Exposing a room fires its reaction (aimed burst / shield ring), so digging in is a risk that pays off. The Engine bay has `explodeOnDisable` and reaches the lower generator.

Phases and motion: **Prowl** (figure-eight, maw aimed + tail volley and bomb) -> **Frenzy** at 20% pixel damage (`sequence` of 6 s zip dashes and 5 s sway+bob, horn guns come online, adds line sweeps) -> **Overdrive** at 45% (enrage cue, orange tint; fast zips alternating with a tight figure-eight; intervals x0.55, maw and horns x0.7). Every step has a `source`: `maw`, `horns`, `tail`.

Pacing (hull density 8, default ship, test mode off, god mode so deaths do not restart, `game.debug.simulate(100, 'sweep')`, 6 runs): `hull25` 57.7-60.8 s, mean 59.9. In a full 240 s sweep run the phases began near 50-60 s and 106-110 s and the core fell at 187-199 s. Like Bulwark rooms, `hull25` is partly set by explosive chains (a 4-8% hull drop at once around 55 s), so hull density moves it less than expected.

Not verified: no human playtest (dodge fairness, feel of the speeds); no mirrored variant; hit positions of the pads and consoles were checked on a screenshot of the fresh boss only, not each after digging.

## Run flow, enemy units and waves (v1)
Status: design agreed with the owner; the flow engine, units, waves and level script are built (see the "as built" notes at the end of this section). Upgrade cards and the burn tag are built too (step 5 notes at the end). Goal for v1: a Galaga-like fixed run that stresses how levels work. Bigger ambitions (branching maps, persistence, level set pieces) come later and must not need engine rewrites.

### The run
A **run** is a fixed list of 3 **levels**; each level is a fixed list of **nodes**: `wave, wave, wave, boss`, then a **reward**. Beat the last boss and the run is won. One run is plain data (a `RunDefinition`).

```
title -> L1[wave wave wave boss] -> reward -> L2[...] -> reward -> L3[...] -> WIN
          any death (permadeath for now) -> run over -> title
```

- **Flow engine.** A small state machine owning the run state: current level and node, the player's loadout and upgrades, health, a seed. Nodes know nothing about each other.
- **Node types.** v1: `wave`, `boss`, `reward`. Reserved, not built: `level` (a hand-built set piece) and `interlude` (story card, shop). A node is anything implementing one interface (`start`, `update`, `isDone`, `draw`), so new types need no engine change.
- **Health.** The player heals fully between levels (simplest; revisit later).
- **Death.** Permadeath for now: the run ends and returns to the title.
- **Persistence.** Nothing carries across runs in v1 (unlocks and currency are out of scope, but expected later).
- **Boss order.** The three levels end on the three bosses we have (Bulwark with rooms, Mantis, and one more); the order is set during the level script and tuned for pacing.

### Enemy units are small bosses
A **unit** is a `UnitDefinition`, a slimmed-down `BossDefinition`, so it reuses the whole boss pipeline: carving, anchoring, components, attack scripts, blasts and debris. Every enemy therefore has the same chip-damage feel.

| | Small unit | Big unit | Boss |
|---|---|---|---|
| Layers | 1 | 1 or 2 | 3 |
| Dies after | a few hits | many hits | a full dig |
| Components | optional (a gun) | turrets, explosives | full set, rooms |
| Core | yes | yes | yes, with armor |

- Non-bosses do not need three layers; they can have components. Big units may have two layers.
- A unit dies when its core is gone or it is mostly carved away, so small units go fast.
- **Performance.** If dozens of units are too heavy with full anchoring state, small units get a lighter path (a cheaper carve grid, skipping fragment labelling). That is an optimisation to add only if measured; it must not change the data format.
- Units never hurt the player by touching them (contact damage is issue #27, out of v1). Only their projectiles and hazards do.

### Waves
A **wave** is data: which units appear, in what formation, on what entrance path, at what time.

- **Formations:** rows, columns, V shapes, arcs, each unit with a spawn time.
- **Entrances:** a unit flies in on a curve (the Galaga loop) and then holds a formation slot or dives, reusing the boss movement interface (`sway`, `figureEight`, `zip`, `sequence`).
- **Attacks:** the same scripted schedulers; every shot comes from a weapon source.
- **Wave end:** units never fly away; **the player must kill every unit** to end the wave. No timeout in v1.
- **Level shape:** wave 1 mostly small units; wave 2 adds big ones; wave 3 mixes both with more components; then the boss.

### Rewards and upgrades
- After each level the player picks one of three cards (rewards come from levels; pickups from big units are a later idea).
- **v1 cards:** weapon stats (Gauss reach and width, Rocket radius, Arc count, cooldowns, chain gun rate) and ship stats (health, dodge cooldown). Bosses are tuned against an expected loadout, not scaled globally.
- **Elemental effects (after the stat cards).** A shot carries tags, and an upgrade adds a rule on top of the tag, e.g. chain gun burn: "on hit, +1 burn: extra burn damage in a small radius around each shot". The carve and blast code stays unchanged. The tag hooks go in with the flow work; the effects are a later PR, burn first.

### Build order
1. This design doc.
2. Flow engine: run state machine, node interface, `wave`/`boss`/`reward` nodes, stub reward screen, existing bosses as boss nodes. Playable end to end with placeholders.
3. Units and waves: `UnitDefinition`, formations and entrance paths, first set of 3 small and 2 big units. **Built.**
4. Level script: the 3 levels, wave pacing. **Built** (first pass, unplaytested).
5. Upgrade cards: stat cards and the tag hooks. **Built**, with Burn as the first tag (so step 6 has started).
6. Elemental effects: the rest, after burn.

### Flow engine: as built (step 2)
Status: **built**. Playable end to end with placeholders: title -> 3 x (3 stub waves, boss, reward) -> run complete; death anywhere -> run over -> title.

Files (`src/flow/`):
- `node.ts`: the contract. `RunDefinition { name, levels }`, `LevelDefinition { nodes, reward? }`, `NodeDefinition` (union: `boss`, `wave`, `reward`, reserved `level`, `interlude`), `RunState`, `FlowNode`, `NodeHost`.
- `run.ts`: the `Run` state machine (`title | node | over | won`). Walks the level's nodes, then its reward (not after the last level), heals fully on entering a new level, starts a new seeded `RunState` on `start()`.
- `defaultRun.ts`: `DEFAULT_RUN`: levels end on `bulwark-components`, `bulwark-rooms`, `mantis` (pacing guess, retune with the waves), reward after levels 1 and 2.
- `nodes/`: `boss.ts` (wraps `BossFight` via the host, no behaviour change), `wave.ts` (**stub**), `reward.ts` (**stub**), `index.ts` (`createNode`, the only place node types are wired).
- `screens.ts`: title, run over, run complete.

The node interface:
```ts
interface FlowNode {
  start(ctx: NodeContext): void;      // ctx = { host, run: RunState, position }
  update(dt: number): void;
  outcome(): 'done' | 'lost' | null;  // the engine advances on 'done', ends the run on 'lost'
  draw(g: CanvasRenderingContext2D): void; // 540x960; combat nodes draw nothing, the game draws the scene
  end?(): void;                       // cleanup
}
```
A node reaches the game only through `NodeHost` (`startBossFight`, `combatResult`, `endCombat`, `healFull`, `takeTap`, `takeKey`, `ship`), implemented by `Game.makeNodeHost`. Nodes never see each other. To add a type: a definition in the `NodeDefinition` union, a class, one `case` in `createNode`.

**For the units-and-waves work:** replace the body of `nodes/wave.ts` and extend `WaveNodeDefinition` in `node.ts`. A wave node needs combat without a boss, so extend `NodeHost` (e.g. `startCombat()` that turns the ship, weapons and bullets on with no boss; a way to read "ship destroyed") and the `Game` side in `makeNodeHost`/`update`/`render`; `combat` in `Game` is the flag that switches the combat sim on. The engine (`run.ts`) should not need changes.

Game integration (`src/game.ts`, small): `mode: 'run' | 'boss'`. **Run mode is the default.** The old one-boss mode, which all the debug tooling and `game.debug.simulate` use, is `?mode=boss` in the URL, and `[Z]` toggles between the two at runtime (to run: title; to boss: a fresh fight). In boss mode the sim path is unchanged (restart on death, `[R]`, `[B]`, ...). In run mode `[B]` and `[R]` are ignored during combat and every key is ignored outside combat except `[\`]`. `?seed=N` fixes the run seed (the reward draw uses it). Health carries across nodes inside a level and is restored on entering a new level.

Stubbed / not built: real waves (placeholder screen, 1.2 s then done); reward cards (five placeholder cards, three drawn by the seed, the pick is pushed to `RunState.upgrades`, no effect, `Upgrade.modifiers` and `RunState.loadout` are the empty places for them); `level` and `interlude` node types (reserved, `createNode` throws); run persistence.

Not verified: no human playtest; the scripted `hull25` measurement was not compared against `main` in the same session (single boss-mode run on Bulwark rooms gave 37.2 s with the merged weapons, the 47.0 s in the regrowth note predates them); touch input on the title and reward screens was only checked through keyboard events and scripted calls.

### Units, waves and the level script: as built (steps 3 and 4)
Status: **built**. Title -> L1 `wave, reward, wave, reward, wave, reward, boss` -> reward -> L2 -> reward -> L3 -> win; death anywhere -> run over.

Files:
- `src/units.ts`: `UnitDefinition`, `UnitPlacement`, `Unit`, `UnitSystem`. A unit is a `BossFight` over a one-phase `BossDefinition` built by `toBossDefinition`, so carving, anchoring, components, attack scripts, blasts and debris are the boss code unchanged.
- `src/waves.ts`: `WaveDefinition`, formations, entrance curves, dives, `spawnWave`.
- `src/enemies/`: `small.ts` (drone, gunner, spinner), `big.ts` (frigate, mortar), `waveContent.ts` (the 9 waves), `index.ts` (`UNIT_LIST`, `unitById`, `harder` = the "+" variants).
- `src/flow/nodes/wave.ts` (the real wave node), `src/flow/defaultRun.ts` (the level script).
- Changed: `weapons.ts` (`Combatant`, `Sweep`, `nearBox`; shots and weapons hit any target), `game.ts`, `boss.ts` (`carveRadial` skips pixels outside the layout), `components.ts` (`silenceAll`), `attacks.ts` (`setScript(null)`), `flow/node.ts`.

**Unit data** (`UnitDefinition`): `id`, `name`, `size: 'small' | 'big'`, `layout()` (a `BossSpec`: 1 layer small, 1-2 big), `mirror?`, `components?` (turrets and explosives, the same `ComponentSpec` as bosses), `coreArmor?` (default `{ min: 1 }`: no armor), `deathFraction?` (share of layer pixels gone at which it dies even with the core alive: 0.6 small, 0.75 big), `hold?` (a `Movement` for idle sway in the slot), `attacks` (the same `AttackStep[]`; every step needs a `source`; `[]` means it never shoots, like the drone), `attackDelay?` (seconds after arriving, plus a per-unit jitter). A unit dies when its core is 0 or `deathFraction` is reached; it flashes out (0.22 s small, 0.5 s big) and its components go quiet at once (`silenceAll`), so its hazards end. No contact damage anywhere: only bullets and hazards hurt.
- Small: Drone (red dart, no gun, dives), Gunner (steel hexagon, chin gun, aimed shot every 3.2 s), Spinner (amber cross; its rotating gun sits on the core and sprays aimed bursts, shoot the gun off first). Big: Frigate (olive gunship, 2 layers, two tracking side guns and a keel volley gun, core hp 450), Mortar (crimson wedge, 2 layers, bomb tube, two flank guns, a fuel tank buried by the core that cracks its armor).
- Time to kill with the chain gun only, centred under the unit (autopilot `focus`): small 0.6-0.8 s (including a 1 s entrance), Frigate ~5 s, Mortar ~2.5 s (centring on its tank is easy; a human will be less exact). With all weapons on, Frigate 3-6 s.

**Wave data** (`WaveDefinition { id, name?, groups }`, `WaveGroup`): `unit` (unit id), `formation` (`row | rows | column | vee | arc | slots`, each resolves to slot centres), `entrance?` (`drop | swoop | loop`, `side: left | right | alternate`, `time`), `start` (s), `stagger` (s between units), `dive?` (`first`, `every`, `time`, `depth`: the unit leaves its slot on a teardrop loop and returns; successive units are offset). Entrance and dive paths are Catmull-Rom curves flown at constant speed (`curve`), wrapped by `placementMovement` into one ordinary `Movement` (offsets from the slot), so the unit's `BossFight` positions it like a boss; nothing flies away. A wave ends when every unit is dead (`NodeHost.waveRemaining() === 0`) plus a 0.9 s beat; no timeout.

**Level script** (`defaultRun.ts`, waves in `waveContent.ts`): wave 1 mostly small units, wave 2 adds big ones, wave 3 mixes both with more guns (spinners, more gunners). Level 2: bigger formations, the Mortar appears, up to three big units per wave. Level 3 uses the "+" units (attack pauses x0.75), tighter dive timers and three big units in the last wave. Boss order unchanged: bulwark-components, bulwark-rooms, mantis. A `reward` node follows every wave and every boss except the last. **Health:** full heal at each level start only (`Run` does that on entering a level); reward nodes do not heal. The placement forced no other decision.

**Node contract change** (minimal, `flow/node.ts`): `WaveNodeDefinition { type: 'wave'; wave: WaveDefinition }`, and `NodeHost` gained `startWave(wave)` (combat on, no boss) and `waveRemaining()`. `FlowNode` and `Run` are unchanged.

**Multi-target refactor.** `Game` keeps `fight` (the boss; dormant with `bossActive = false` in wave nodes) and a `UnitSystem`. `targetList` (live boss + live units) is refreshed once per update; player bullets (`resolveImpact`) and `WeaponSystem` (`WeaponHost.targets()`) loop over it with a bounding-box pre-check (`nearBox`) and a shared swept test (`Sweep`). Gauss and Arc pierce across units; Arc retargets across all of them; the Rocket detonates on the first unit under it and its shock (`playerBlast`) also reaches every unit within the blast radius. Enemy fire is one shared `Attacks` (bullets, hazards); each unit owns its own scheduler (`UnitSystem.update`). `Game.makeFight` and the boss debug tooling are untouched, and `?mode=boss` works as before: the scripted `hull25` of Bulwark rooms is the same bimodal 37 / 43 s on `main` and on this branch (37.0, 37.2, 42.9 vs 42.9, 43.0, 37.3). Small units skip hit stop, shake and damage numbers (sound and debris only).

**Core armor fix.** `carveAt` now zeroes a core below 1 hp: with `coreArmor.min < 1` the last hit points decayed geometrically and never reached 0 (bosses never showed it; armored big units did).

**Debug tooling.** `[;]` spawns the next unit type at the top centre, `[']` the next wave from `WAVE_LIST`, `[\]` blows up every unit, `[H]` also shows unit boxes, hp and pixel damage. In `window.game.debug`: `units`, `spawnUnit(id, x?, y?)`, `spawnWave(idOrDef)`, `killUnits()`, `unitIds`, `waveIds`. They work in run mode during combat and in `?mode=boss` alongside the boss. Autopilot `[P]` knows waves (`focus` = under the lowest unit, `sweep` = across the live units' span). The overlay shows a compact block when there is no boss.

**Performance** (in-app browser, `game.update(1/60)` timed): 20 small units firing with all weapons: 0.05 ms per update on average, worst 10 ms; render 0.2-0.5 ms. Level 3 wave 3 (21 units, 27 enemy bullets): update 0.06 ms, render 0.46 ms. Spawning costs 0.2 ms per small unit and about 1 ms per big one. The first measurements showed a 400-700 ms spike every few seconds: a Rocket blast carving a 140 px radius disc (60k pixels) on every unit in reach; clipping `carveRadial` to the layout fixed it. The lighter path for small units (cheaper grid, no fragment labelling) was therefore **not needed** and is not built.

**Stubbed / not built:** reward cards (the stub node, now between every wave); upgrade effects; elemental effects; contact damage; unit death debris (a dead unit's loose chunks vanish with it); score. The sweep autopilot with god mode clears all 3 levels and the run is won; its wave lengths are 17-120 s (Level 1: 20, 24, 32 s), a human who focuses should be quicker.

**Not verified:** no human playtest (wave pacing, difficulty and the feel of dives are unjudged; the wave data is the tuning surface); touch controls and the on-screen dodge button were not exercised in waves; the ENEMIES counter (bottom centre) was only checked in one screenshot.

### Upgrade cards and tag hooks: as built (step 5)
Status: **built** (first pass, unplaytested). After every wave and every boss except the last, the `reward` node offers 3 distinct cards; the pick is applied for the rest of the run. Permadeath: a new run starts with no upgrades.

Files:
- `src/upgrades/cards.ts`: the card pool, **data only** (16 cards). `src/upgrades/model.ts`: `CardDef`. `src/upgrades/stats.ts`: `STATS` (the stat keys), `Loadout` (effective stats), `drawCards`, `previewCard`. `src/upgrades/draw.ts`: the "your upgrades" strip (reward screen and compact HUD strip, right edge under the hull bar).
- `src/tags.ts`: the tag hooks and the Burn handler. `src/flow/nodes/reward.ts`: the real reward screen.
- Changed: `weapons.ts` (weapons read `StatFn`/tags through the `WeaponHost`; `CHAIN_GUN`, `effectiveChain`), `game.ts` (loadout, tag system, chain gun, ship stats, debug), `player.ts` (`Health.maxHp`/`setMax`, `Dodge.cooldownTime`), `input.ts` (`hover`), `carveShapes.ts` (gauss width tiers, ember shapes), `config.ts` (`TUNING.ship.speed`, `WEAPONS.burn`), `flow/node.ts` (`NodeHost.pointer()`), `hud.ts`.

**Card format.** `CardDef { id, name, group, desc, maxStacks?, weight?, rarity?, modifiers: { stat, op: 'add' | 'mul', value }[] }`. A held upgrade is the card itself, once per stack, in `RunState.upgrades` (so `maxStacks` is "can be picked N times"; cards at their limit are not offered). Stacks apply the modifiers N times. **Effective stats** are derived, never stored: `Loadout.get(key, base?)` = (base + sum of adds) x product of muls. `TUNING`/`WEAPONS` are never mutated, so a new run (a fresh `RunState`) is clean. Chain gun: `effectiveChain(game stats, loadout)` over the live `ShipStats`, so the debug damage/rate keys still work and the cards multiply on top; with no upgrades it equals the base numbers. Weapons use `c.stat('rocket.radius', base)` in `fire` and `cooldown(stat)`. Ship: max hull and dodge cooldown are synced into `Health`/`Dodge` each frame (`+1 max hull` also heals 1), hitbox and speed are read where used. The draw is weighted (`weight`, default 1) without replacement and uses the run's seeded `rng` (`?seed=N` replays the offers given the same picks).

**Card list** (stacks max; all numbers are first guesses in `cards.ts`):
- Chain gun: Rapid Fire (rate x1.2, 4), Heavy Rounds (damage x1.25, 4), Extra Barrel (+1 bullet per shot, 2), Burn (+1 burn, 3, rare).
- Gauss: Deep Bore (energy x1.3, 3), Wide Shaft (shaft width tiers 1.0x/1.2x/1.5x/1.8x, 3), Gauss Capacitor (cooldown x0.85, 4).
- Rocket: Wide Warhead (radius +18 px, 3), Shaped Charge (energy x1.3, 3), Rocket Autoloader (cooldown x0.85, 4).
- Arc: Arc Swarm (+1 missile, 3), Arc Relay (cooldown x0.85, 4).
- Ship: Hull Plating (+1 max hull, 3), Quick Thrusters (dodge cooldown x0.8, 3), Engines (speed x1.12, 3), Compact Hull (hitbox x0.8, 2, rare).

**Add a card:** add an entry to `CARDS`. If it modifies a stat that does not exist, add the key to `STATS` (label, base, direction, formatter) and read it with `loadout.get(key, base)` where the thing is built. The reward screen shows what it does by itself ("Rocket radius 106 -> 124", from `previewCard`).

**Reward screen.** 3 cards, tap/click or keys 1-3, hover highlights, rarity, owned n/max, the "now -> becomes" rows, and the held-upgrades strip underneath (cards 480 x 176 at 540 x 960; large touch targets). Locked for 0.4 s so the last press cannot pick. If every card is at its limit the screen skips itself.

**Tag hook** (`src/tags.ts`). A card modifies the stat key `<weapon>.tag.<tag>` (Burn: `chain.tag.burn` +1 per stack); `Loadout.tags(weapon)` turns those stacks into the `TagSet` the weapon's projectiles carry (`{ burn: 2 }`). When a tagged shot lands (chain gun bullet: component hit or carve; weapon projectile: component pierce, carve, blast detonation, arc arrival) the hit path calls one hook, `TagSystem.onHit(tags, x, y, energy, target)`, which calls each tag's `TagHandler.onHit({ x, y, energy, target, stacks })`. Handlers can also `update`, `draw` and `reset` for ongoing effects, and touch only targets through `TagHost` (`carveQuiet`, `power`), so an effect can never hurt the player. **New tag** (chain lightning, freeze...): id in `TAG_IDS`, a `TagHandler`, registered in `TagSystem.handlers`, a stat key in `STATS`, a card. Carve, blast and damage code stay untouched.

**Burn** (`WEAPONS.burn`, `BurnHandler`): a landed hit leaves a burning patch on the target (target-local, so it moves with the boss or unit); every 0.3 s a patch bites the nearest solid pixel around it (the hit point itself was just carved) with energy 12 x stacks x power in a small round shape that grows with stacks (radius 8/11/14 px); it lasts 1.2 s (+0.35 s per extra stack) and nearby hits refresh it instead of adding patches (merge radius 14 px, at most 36 patches), so the cost is bounded at the chain gun's rate. Visual: flickering ember squares and a faint glow over the patch. Measured with the sweep autopilot (chain gun only, 8 s on Bulwark's hull): +35% / +95% / +170% carved at 1 / 2 / 3 stacks. Burn carves pixels only (it does not damage components), skips hit stop, shake, numbers, sound and debris, and works on units and bosses. Never hurts the player.

**Debug.** `[/]` opens a reward screen over the current scene (sim paused until a card is picked; works in `?mode=boss` too). In `window.game.debug`: `reward()`, `grant(id, n?)`, `clearUpgrades()`, `upgrades()` ({ id: stacks }), `stat(key)`, `loadout()`, `cardIds`, `tags` (`tags.burn.count` = live patches), `run`. In `?mode=boss` held upgrades apply (grant them with `grant`). The debug overlay shows hull as `hp/max` and the hitbox radius.

**Stubbed / not built:** other tags (only Burn), weapon-gating cards (all three weapons are always equipped), pickups, rarity weighting beyond the per-card weight, a shop, any balance pass (bosses were not retuned for the pool; stacks of Burn make fights much shorter), card art. Components are not hurt by burn itself.

**Not verified:** no human playtest of the pool or of touch input on a real device (tap and hover were checked with the in-app browser's mouse); mobile layout was checked at 375 x 812 only; the compact HUD strip was seen in a screenshot only partly (the debug overlay covers it, toggle with the backquote key).

## Core look

The core is drawn as a reactor ("nuclear heart") by `src/coreFx.ts`, still only where it is exposed (it is drawn between the innermost layer and the layers above it, as before). Visual only: hitboxes, hp, armor and damage are untouched.

- Look: white-hot centre in a coloured glow halo (one cached gradient sprite per colour/radius), a dark backing disc so it reads on any room colour, two counter-rotating arc rings (big cores only; small units get glow plus pulse), heartbeat pulse. Colour defaults to hot cyan-white; a definition can set `coreColor: [r,g,b]`.
- State: pulse speed and brightness rise with core hp lost and with `coreVulnerability` (fed to `Boss.coreVuln` each frame by `BossFight`; small units skip it). Below ~0.75 vulnerability the core is dimmer and wears a dashed shield ring. A hit flickers it. On death it swells into a white overload flash and shrinks away over `CORE_DEATH_TIME` (0.3 s) while the existing explosion plays.
- Cost: about 0.1 ms per frame for 20 units on screen (16 small + big mix, measured in the dev build).

## Campaign 1 plan: chapters 4 to 7 (design, not built)
Status: **design only**, agreed with the owner after the chapter 1 to 3 playtest. It applies the lessons of chapters 1 to 3 (see "Cinematic and mission design standard", written with the chapter 1 to 3 revision) to the rest of "Fallen Peace". Slice 2 = chapters 4 and 5, slice 3 = chapters 6 and 7 plus the unlock reveal. The Laser and Energy Wave weapons are built separately and independently.

### Lessons applied to every chapter
- Every chapter has three beats: an **approach** beat (commentary, a build-up), the **engagement**, and an **exit cinematic**. No abrupt endings.
- **Constant engagement** (overlapping spawns, no empty screens). Progress is **gated by time**; bonus objectives are "do X before the time runs out".
- **Scripted story failures are not deaths** and count for nothing.
- **Chapters hand off**: each exit cinematic ends where the next chapter's opening begins. Each chapter keeps its **result screen** between chapters, and the next chapter opens with a short cinematic that continues the story.
- Difficulty rails: about 2 to 3 minutes per chapter, gentler enemy fire than a first guess, medal times measured with a scripted bot. Orientation is stated per level, and danger is always visible (no hidden hazards).
- Each chapter introduces **one new mechanic**. Cinematics are cosmetic and never change boss state, health or counters unless stated. Radio commentary is text-only (no audio yet). The player's callsign is **Rookie**.

### Lore (continuity requirements)
- **Chapter 2** must establish that **Rookie reaches the jump gate first**; the rest of Delta is still behind, fighting. When Rookie is shot down at the gate, the squad does **not** go through: it **breaks off and scatters through the Orini system, evading pursuit and hoping to find Rookie** (the gate itself is not used again).
- **The capital ship's armour** is the empire's adaptive plating: it resists every weapon except one that fires on the empire's own weapon frequency. In chapter 1 the only way in was a maintenance bay on its flank that the plating does not cover, so the engine room could be destroyed but the ship could not. This is why nobody in Delta could simply destroy it, and why it can be hurt in chapter 7: Rookie is flying one of **their** ships.
- **Chapter 6 reunion:** Delta, scattered and searching, picks up the stolen ship's signal and finds Rookie in orbit. They almost fire on it (it is an empire fighter on their scopes); Rookie's callsign beacon stops them ("Rookie? ... hold fire!"), and they are in disbelief. A short exchange establishes the armour: it is their frequency, the only thing that will hurt it.
- **Chapter 7 opening:** the capital ship is stranded with dead engines, but empire engineers are rebuilding power; once the drive is back it jumps away with its fleet. The window is short, which is the in-fiction reason for the **uncontrollable assist timer**. The squad's weapons cannot scratch the armour, so they cover (turrets, aces, distractions) while Rookie carves.

### Chapter 4: Crash and commandeer (new mechanic: stealth)
- **Opening:** a cinematic continuing the chapter 3 crash: the wreck in the snow, Rookie ejects in a tiny **escape pod**, the lights of the enemy base ahead.
- **Play:** a scrolling stealth level. The pod has a tiny hitbox, minimal health and **no weapon**. **Searchlights** sweep the base; if a light catches the pod, **fighters come after it and shoot**; the answer is to run, hide in shadow/cover and break line of sight (cover zones, shadows). A **patrol wave sweeps the area as a countdown**, so the player cannot linger. If the pod is killed it is a **normal death** (checkpoint restart, full heal, death counted).
- **Goal:** reach the **hangar circle** and hold 10 seconds.
- **Exit:** a cinematic of Rookie boarding the enemy fighter (canopy closes, cockpit lights come up, a line like "their tech, it's all I have"), ending on the ship lifting out of the hangar. The ship swap makes the empire fighter the player's ship for chapters 5 to 7.
- **Bonus:** Silent: cross no searchlight.
- **New systems:** a detection/searchlight system, cover and shadow zones, a patrol-wave countdown objective, a pod ship and the ship-swap cinematic.

### Chapter 5: Surface run (new mechanic: carvable terrain)
- **Opening:** the takeoff, with the base defences opening fire.
- **Play:** a long scroll across the planet's surface in the enemy fighter (preset weapons; the empire-ship preset is designed in slice 2). **Wall defences and ground turrets**: walls are **both carvable barriers you can cut lanes through and defence lines with turrets built into them**; plus empire air squadrons flying past from behind (the flyby behaviours). Constant engagement, about 3 minutes, time-gated.
- **Exit:** a final defence line, then a cinematic of the ship pulling up toward the atmosphere.
- **Bonus:** destroy all turrets.
- **New systems:** carvable terrain obstacles (the `carvable` flag on the obstacle entity), ground turrets and wall defence lines, a ground-attack scroll theme.

### Chapter 6: Escape and reunion (new mechanic: squad contact)
- **Play:** a short **interceptor gauntlet before the reunion**: the climb up through the atmosphere (the reverse of chapter 3: normal orientation, the storm calming as the ship rises and the planet falls away) with empire interceptors chasing. Constant engagement, about 2 minutes.
- **Exit:** the reunion cinematic (see Lore): Delta wingmen appear and form up beside Rookie.
- **Bonus:** fly clean (no dodge used, or full health).
- **New systems:** a rising atmosphere-to-space background transition (the weather ramps down), the reunion cinematic.

### Chapter 7: Finale (new mechanic: squad assists)
- **Opening:** the capital ship, **restored exactly as the player left it** (the saved snapshot), drifting with dead engines; a cinematic reveals that the shots now go through the armour (the `armourCarvable` switch on the restored ship), with commentary about the armour frequency and the engineers' rebuild window.
- **Play:** phase 1: enemy **aces** (named, tougher empire fighters) dogfight Rookie while the squad covers; phase 2: carve the armour to the rooms and turrets, with **timed squad assists on a timer the player cannot control** (a strafing run, a distraction); phase 3: the core overloads. About 3 to 4 minutes.
- **Exit:** the core overload explosion, a victory cinematic with the squad forming up and flying off, the **unlock reveal** (the enemy ship, the Laser and the Energy Wave), then the result screen.
- **Bonus:** Full dismantle (every room and turret on the capital ship before the core goes).
- **New systems:** snapshot restore plus the armour switch, scripted squad assists, named aces, the unlock reveal screen.

### Open
Names for the squad leader, the wingmates, the empire and the command ship (only the callsign **Rookie** is decided; propose a set before slice 3); the empire fighter's name, stats and preset loadout (slice 2); the number of searchlights and cover zones; the wall and turret layout of chapter 5.

## Roadmap: game modes, ships, persistence and room functions (design, not built)
Status: **design only**, agreed with the owner. The v1 run (fixed 3 levels of waves, rewards between waves, bosses, permadeath) is the prototype for **Endless**. Everything below builds on the flow engine (`src/flow/`): a mode is a run definition plus rules, not a new engine.

### Three modes
1. **Campaign.** A list of campaigns. Each is a sequence of hand-authored levels made of **objectives** ("do this", "get out of the firing zone", "regroup with your squad"), steering a small story. No waves and no upgrade cards. Levels are **timed**. The player flies a ship with **preset weapons**. A level ends with a **medal** (bronze/silver/gold) by time, and gold also needs **no deaths**. A **gold medal unlocks content for the other modes**, e.g. a level where you pick up an electric ship; gold unlocks the electricity card for the random card pool. Objectives may be combat or non-combat (pickups, escape zones, hazards, escorts). Death: you blow up and **return to the last checkpoint** (a checkpoint is the start of an objective node); every death counts against the gold medal.
2. **Conquest.** A **long linear list** of nodes built from what the player has unlocked (campaign levels and wave levels, bosses, objectives, many variations). Not endless, but long. Before starting, the player **builds a ship** from unlocked ships/weapons; cards apply during the run. Death rule is permadeath unless decided otherwise (open).
3. **Endless.** What we have now: waves, rewards, bosses until you die (permadeath). The player picks a ship from those unlocked and builds the loadout; cards apply.

### Ships and weapon slots
- A **ship** is data: look, base stats and a **starting weapon set**. Campaign ships use their preset weapons only.
- In Conquest and Endless the player builds a loadout: **1 main weapon + 3 aux weapons**, chosen from the weapons of unlocked ships (a weapon is a part that belongs to a ship until unlocked). More weapon variations will be added; they are what make the slots a real choice.
- The current game is already this shape: the chain gun is the main weapon, and Gauss, Rocket and Arc missiles are three aux weapons, all equipped. The base chain gun is in the weapon format since the upgrade work, so slots formalise what exists. Cards modify the weapon in a slot (as now).
- Open: whether ships also change handling (speed, dodge), or only weapons and stats; first pass: stats and weapons only.

### Persistence (new; was out of v1 scope)
- A versioned local save (local storage first): unlocked ships, weapons, cards, medals per campaign level, best times. Cards gain an `unlock` flag; the reward pool only draws unlocked cards. A reset and a debug "unlock all" are needed. Runs themselves are not saved (permadeath).

#### As built: save system and unlock flags (step 1)
- **`src/save.ts`**: `SaveStore` (singleton `saveStore`). Format: `{ version: 2 (v1 plus `lastLoadout`), unlocks: { cards, ships, weapons: string[] }, medals: { [levelId]: { best?: 'bronze'|'silver'|'gold', bestTimeMs? } }, stats? }`, stored as JSON in `localStorage['galactrious.save']`. Every storage access is try/catch: blocked or throwing storage keeps the state in memory (`degraded = true`); corrupt, unknown or future-version data falls back to defaults. `MIGRATIONS[n]` upgrades version n to n+1 (empty now; to change the format add a field to `SaveData` and `defaults()`, bump `SAVE_VERSION`, add a migration step). Runs are never saved.
- **API**: `load()`, `save()`, `unlock(kind, id)` (true when new), `isUnlocked(kind, id)`, `setMedal(levelId, medal?, timeMs?)` (keeps the better), `reset()`, `unlockAll(ids)`, `current`, `persistent`.
- **Cards**: `CardDef.unlock?: string` (+ `unlockHint`). No field = always available (the 16 original cards). With it, `canOffer` (src/upgrades/stats.ts) only offers the card when `isUnlocked('cards', unlock)`. To add an unlock: give the card an `unlock` flag, then call `saveStore.unlock('cards', flag)` from whatever awards it (a campaign medal later). Demo locked cards live in `src/upgrades/demoCards.ts`; delete that file and its line in `cards.ts` to remove them.
- **Unlocks screen**: title button / [U] (`src/flow/unlocksScreen.ts`, a `Run` phase `unlocks`): paged card list (unlocked, or `???` plus the hint), RESET SAVE with a YES/CANCEL confirm.
- **Debug**: `game.debug.unlock(kind, id)`, `isUnlocked`, `unlockAll()` (all card flags), `resetSave()`, `save` (the store). The save is **in-memory** under `?nosave` and in `?mode=boss`, so debug sims never read or write the real save. Not done: a debug hotkey.

#### As built: ships and weapon slots (step 2, plus the Endless screens)
- **Ships as data** (`src/ships.ts`): `ShipDefinition { id, name, desc, look, baseStats { maxHealth, speed, dodgeCooldown, hitbox }, startingWeapons { main, aux: [a, b, c] }, unlock?, unlockHint? }` in `SHIPS`. `look` is plain data drawn by `drawShipLook` (a hull polygon, extra polygons, a cockpit rect and an exhaust flame); the default ship's look is the old hard-coded polygon, drawn the same way. Ships: **Vanguard** (default, always unlocked: the old ship, chain gun + Gauss/Rocket/Arc), **Warden** (hull 7, speed 390, hitbox 6, dodge 3 s; Scatter + Blades/Rocket/Lance; unlocked by beating the first boss in a run), **Wisp** (hull 3, speed 560, hitbox 4, dodge 2 s; Needler + Swarm/Gauss/Arc; unlocked by winning a run). The unlock flag is `save.unlocks.ships[unlock]`; `Run.advance` awards both (the result screens print "NEW SHIP UNLOCKED"). Base stats reach the game through `Loadout` (`new Loadout(upgrades, shipId)`: `shipBase()` supplies the base of `ship.maxHealth`, `ship.speed`, `ship.hitbox`, `dodge.cooldown`; cards then stack on top), so a card preview, the reward pool and the sim all see the ship. `RunState` gained `shipId` and `loadout: { main, aux }`.
- **Weapon registry** (`src/weapons.ts`): `WEAPON_DEFS` = `MAIN_DEFS` + `AUX_DEFS`, each with `slot: 'main' | 'aux'`, `name`, `desc`, `color`, optional `unlock`/`unlockHint`. A **main** (`MainDef`) is multipliers on the ship's live damage and fire rate plus shape fields (`rateMul`, `damageMul`, `projectiles`, `spreadDeg`, `jitterDeg`, `pierce`, `speedMul`, `shape`, optional distance `fall`, bullet look); numbers live in `MAINS` (config.ts), and `Game.shoot` fires whatever main the run holds (`effectiveMain`). The chain gun is `MAINS.chain` (all 1x): measured identical to `main` (below). An **aux** (`AuxDef`) has a `cooldown` and a `fire` function as before, plus `FireContext.effect()` for timed effects that follow the ship. `WeaponSystem` equips up to three aux (`equip`, `defs` = the slots in order; debug keys I/O/L toggle slot 1/2/3); `Game.applyEquipment` runs on every `reset`. Cards carry `CardDef.weapon` (a weapon id): `canOffer`/`drawCards` skip a card whose weapon is not equipped (ship cards have no `weapon`).
- **New weapons** (all numbers first guesses, in `MAINS` / `WEAPONS` in config.ts): mains **Scatter** (8 pellets, 2.4 shots/s, energy 1.7x point blank easing to 0.25x at 440 px where the pellet dies: about 1.6x the chain gun's carving at 80 px from the boss, 0.2x at long range) and **Needler** (2.4x fire rate, 0.42x damage, thin deep `needle` carve, pierce 0.35); aux **Lance** (a held beam: for 1.6 s it carves straight up every 0.05 s, 70% pierce through layers and components), **Blades** (3 blades orbit the ship at 80 px for 4.5 s and carve what they touch), **Swarm** (6 small homing missiles, the Arc steering with other numbers). Beams and blades run each hit through the same `impact` code as projectiles (`probe`), so they hit the boss and every unit and use components/tags like any shot. Beam ticks start marching just below the lowest target box over the beam, so an idle beam costs nothing. Each weapon has one or two upgrade cards (stats `scatter.*`, `needle.*`, `lance.*`, `blades.*`, `swarm.*` in `STATS`).
- **Availability** (`src/loadouts.ts`): a weapon is available when it has no `unlock`, its flag is in `save.unlocks.weapons`, or it is a starting weapon of an unlocked ship (so owning a ship never strands you without its guns). `initialSelection()` restores the saved last loadout when still valid. `SaveData` is now version 2 (`lastLoadout { ship, main, aux }`; v1 saves migrate untouched).
- **Screens** (`src/flow/shipScreens.ts`, `Run` phases `ships` and `loadout`): the title is now ENDLESS / CAMPAIGN (coming soon) / CONQUEST (coming soon) / UNLOCKS. Endless goes to the ship select (look, stats, weapons; locked ships dimmed with the hint), then the loadout builder (four slots, tap a slot then a weapon; an aux already in another slot swaps; locked weapons are refused with the hint; DEFAULT resets to the ship's own), then START (`Run.select` + `saveStore.setLastLoadout`). Keys: ship select up/down, enter, esc; builder left/right = slot, up/down = cycle the slot's weapon, enter = start, esc = back. On title [Enter]/[Space]/[E] = Endless, [U] = Unlocks.
- **Debug**: `game.debug.setShip(id)` (also equips its starting weapons, heals), `setLoadout({ main, aux })`, `shipIds`, `weaponIds`, `unlockAll()` now also unlocks every ship and weapon flag, `run.select(shipId, loadout)`. `?mode=boss` uses the default ship and loadout unless a hook says otherwise.
- **Fixes in this step**: the debug panel (bottom-left) was drawn over and swallowed taps on the Unlocks screen's PREV button; it is now hidden and non-clickable on menu screens. The on-screen dodge button also swallowed taps at the bottom right (Unlocks BACK, ship CONTINUE); it is now active only in combat.
- **How to add a ship**: add a `ShipDefinition` to `SHIPS` (look polygons, stats, starting weapons by id, optional `unlock` flag and hint) and award the flag with `saveStore.unlock('ships', flag)` from wherever it is earned. **How to add a weapon**: add a `MainDef` (with a `MAINS` entry) or `AuxDef` (with a `WEAPONS` entry and a `fire` that spawns projectiles or an effect) to `weapons.ts`; add its stat keys to `STATS` and cards with `weapon: '<id>'`; add a projectile/effect look in `drawProjectile`/`drawEffect` if it is new; give it an `unlock` flag or list it in a ship's `startingWeapons`.
- **Stubbed / not done**: no sound design for the new weapons beyond simple tones; ship unlock triggers are the two simple run milestones above (no campaign medals); the ship list shows three rows and scrolls with up/down only (no touch scroll); weapon unlock flags are only reachable through ships or `unlockAll`; the Unlocks screen still lists cards only; Burn and other tag cards stay chain-gun only; no charge-shot main.

### Campaign design notes
- **Objective node** (a new flow node type next to `wave`, `boss`, `reward`): a goal with a success condition, an optional timer/zone/hazard, a checkpoint at its start, and a result. Candidate objectives: destroy a target, destroy all, survive N seconds, reach a zone, leave a hazard zone before it closes, pick up an item (e.g. a ship), escort or protect something, defeat a boss.
- **Timer and medals** are data on the level: time thresholds and a death count. The HUD shows the timer and the medal pace.
- **Checkpoint:** on death, restore the start state of the current objective (player health, enemies, timers reset for that objective; the total timer keeps running, deaths are counted).
- **Squad / allies:** undecided. First pass: no allied combat units; "regroup" objectives are a reach-a-zone or escort. Revisit once the objective layer exists.
- Build **one** campaign of 3-5 levels first to prove the format before authoring more.

### Room function catalog (framework work, independent of the modes) - built, see "Room function catalog: as built" above
Rooms exist (named console groups, `powers`, `onExposed`, `explodeOnDisable`). The aim is a **catalog of reusable room functions** in the framework so a boss is assembled from parts. Each function has an online effect and an offline effect, one readable cue, and a HUD state:
- **Power:** powers weapons/turrets; offline silences them (Mantis).
- **Shield:** online, armors the core or a zone; offline the armor drops (Bulwark).
- **Repair:** online, regrows a layer or heals components; offline it stops.
- **Spawner:** online, launches drones or units; offline it stops.
- **Sensor / targeting:** online, shots track the player; offline they fire dumb.
- **Reactor / fuel:** explodes on disable and chains into neighbours (Bulwark).
- **Engine:** online, movement speed; offline the boss slows.
Decisions: rooms **react in the middle of the fight** (a Repair room heals while the player digs elsewhere), not only on exposure. Rooms are also for **later-wave bigger non-boss units**: a big unit can carry one small room, making it a bite-sized boss. Rooms link by power and geometry, so a boss is a puzzle of which room to dig to first.

### Build order
1. Save system and unlock flags; the card pool gated by unlocks.
2. Weapon slots and ships as data (main + 3 aux): ship select and loadout builder for Endless; the existing weapons as the first set; then new weapon variants. **Built** (see "As built: ships and weapon slots"; the title mode entry of step 3 exists as ENDLESS plus two disabled entries).
3. Mode select on the title; the current run becomes Endless.
4. Campaign vertical slice: one campaign, `objective` node, timers, checkpoints, medals, the first unlock.
5. Allies and squad objectives (when decided).
6. Conquest.
Alongside, independent: the room function catalog (can run next to steps 1-2).

### Open questions
- Squad/ally behaviour; Conquest death rule; whether ships change handling; number of campaigns/levels; how many weapon variants per ship.

## Combat range

Close weapons (Scatter ~80 px, Blades, Lance, Needler) need the ship near the enemies, so the field is tuned both ways:

- **Ship reach**: the ship may fly up to `minY` px from the top (bottom clamp unchanged, `H - 36`). Default `TUNING.shipMinY = 320` (`src/config.ts`); a ship overrides it with `baseStats.minY` in `src/ships.ts` (Warden 290, others default). Read via `shipMinY(id)`; the clamp in `Game.moveShip` runs after dodge and drag, so neither can leave the range. Touch keeps its 90 px finger offset, so the finger stays below the ship.
- **Waves**: `WaveDefinition.lower` (px, optional) shifts every formation slot down in `spawnWave`. Currently level 1 +60, level 2 +80, level 3 +100 (`src/enemies/waveContent.ts`). Entrance paths and dives are derived from the shifted slot.
- **Bosses**: `lowered(dy, movement)` (`src/movement.ts`) holds a phase `dy` px below the spawn point while the movement plays; the phase blend eases the drop. Used in later phases: Mantis Frenzy +40 / Overdrive +70, Bulwark (both variants) Pressure +40 / Enrage +70, demo-phased phase 2 +40. The default demo boss is unchanged.
- Not changed: HP, damage, attack timings and projectile speeds. If a closer wave is unfair, reduce its `lower` first.

## Campaign 1: "Fallen Peace" (design, not built)
Status: **design only**, agreed with the owner. The first campaign, built in three slices on top of the roadmap (see "Roadmap: game modes..."). Slice 1 is chapters 1 to 3.

### Story
Delta squadron is in a large dogfight above the planet Orini. The player is a rookie pilot of Delta squad. Mission: fight through the dogfight, reach the enemy command ship, and disable its engines by blowing up the engine room. Then retreat through another dogfight, but get shot down and fall through Orini's arctic atmosphere (dodging debris and mountain peaks). Crash behind enemy lines, find an enemy base, commandeer an enemy ship and fly away. Cross the planet's surface shooting turrets, wall defences and air squadrons. Escape into the atmosphere and reunite with the squad, who are in disbelief that the player is in an enemy ship. Finish off the now-disabled command ship with the squad in a boss fight that includes dogfighting, then fly off in victory.
**Unlock on completing the campaign (gold):** the enemy ship, a new main weapon **Laser**, and a new aux weapon **Energy Wave** (replaces the earlier idea of an electricity card; Chain Lightning can arrive later as a normal card).

### Chapters
| # | Chapter | What the player does | Needs |
|---|---|---|---|
| 1 | Dogfight | Fight through fighter waves, reach the command ship, blow up its engine room | objective nodes; armoured capital ship with an exposed engine room |
| 2 | Retreat | Escape through another dogfight; the player is shot down at the end | timed objective; **scripted event** (the shoot-down is not a death) |
| 3 | Freefall | Dodge debris and mountain peaks falling past. **You cannot shoot.** Touching an obstacle damages the ship (normal health) | scrolling level; obstacles; weapons locked |
| 4 | Crash and commandeer | Eject into a tiny **escape pod** (minimal health, no weapon) and sneak through the enemy base past **searchlights** to the hangar; crossing a light brings fighters that shoot you. Sit in the hangar circle for 10 s to take the ship | scrolling stealth level; pod ship; searchlight detection; pursuing fighters; hold-zone objective; ship swap |
| 5 | Surface run | Long scroll across the surface: turrets, wall defences, air squadrons. Goal: do not die | long scrolling level; terrain; turrets |
| 6 | Escape and reunion | Reach the atmosphere; meet the squad | short narrative level; cosmetic allies |
| 7 | Finale | Boss fight with the squad (the disabled command ship), including dogfighting | boss; scripted squad assists |

Delivery in three slices: **slice 1 = chapters 1 to 3**, slice 2 = chapters 4 and 5, slice 3 = chapters 6 and 7 plus the unlock bundle (enemy ship, Laser, Energy Wave). Until the campaign finishes, slice 1 uses a **test unlock** (a flag on completing it) so the unlock flow can be seen working.

### Decisions
- **Scrolling.** Levels may scroll, but the ship stays on screen and the world moves past it. A scrolling level is a **timeline keyed to scroll distance** (px): spawns, obstacles, terrain and scripted events at distances, with a scroll speed that can change. Closed (non-scrolling) levels with waves are also fine (the first dogfight chapters).
- **Allies.** Allies are **cosmetic wingmen** flying "underneath" the player layer in the dogfights, fighting on their own with no effect on combat. In the finale boss fight they have **timed scripted assists** (they come through and do something: a strafing run, a distraction), no ally AI.
- **Medals.** Every chapter is **timed**, with authored thresholds. Gold also needs zero deaths. Chapter 5 gets an **alternate gold objective: destroy all turrets** (medal criteria can include a level-specific objective as well as time and deaths).
- **Checkpoint.** On death the ship blows up and returns to the start of the current objective with a **full heal**; the enemies, timers and objective reset, the total time keeps running and the death is counted against gold.
- **Capital ship (chapter 1, reused in chapter 7).** A big unit/boss with an outer **armour** layer that cannot be shot through except in one specific area where the **engine room** sits. Blowing up the engine room (a room with the `engine` function from the room catalog, `explodeOnDisable`) completes the objective. In chapter 7 the same ship is the disabled boss.
- **Chapter 3.** Weapons are locked; touching an obstacle damages the ship (normal health and i-frames; the ship is destroyed only when health runs out). Debris and peaks are pixel shapes scrolling past (they could be carvable props in later chapters, not in chapter 3 since you cannot shoot).

### Engine work for slice 1
1. **Objective node** (new flow node type) with `destroy`, `reach`, `survive`, `escape` and `bossFight` objectives for chapters 1 and 2, a per-objective checkpoint, and a result.
2. **Campaign framework:** campaign data format, campaign select and level select screens with medals and best times (save system), result screen, the timer and medal pace on the HUD.
3. **Scripted events and beats:** a small timeline format: show a text beat, force the ship's destruction (no death), lock weapons, set a scroll speed, spawn.
4. **Scrolling levels:** a distance timeline, scrolling background and an obstacle entity (pixel shapes with contact damage).
5. **Armoured capital ship:** an armour layer that cannot be carved, with a gap exposing the engine room.
6. **Cosmetic allies:** wingmen that fly and shoot with no effect.
7. **Preset ship** for the campaign (no loadout builder, no cards).

### New weapons (slice 3, first guesses to tune after playing)
- **Laser** (main): slow and heavy. Cooldown about 0.6 s (about 1.7 shots/s), energy per shot about 5.5 times a chain gun shot, pierce about 0.7, a narrow carve. Roughly 15% more total damage per second than the chain gun but concentrated, so it carves deep.
- **Energy Wave** (aux): a half-moon energy field fired in a direction (straight up first), cooldown about 4 s, an arc of about 100 degrees out to about 160 px, damage falling off with distance (100% at the ship to about 25% at the edge), a new `wave` carve shape.

### Open
Final boss design (chapter 7); the enemy ship's name, stats and preset loadout; story text; per-chapter medal thresholds (authored once the levels exist); how many dogfight waves chapters 1 and 2 have; names for the pilot and the squad.

### The enemy empire (cohesive faction design)
The campaign fights one enemy empire, so **every enemy unit, turret, wall, the capital ship and the final boss must read as one faction**, and the commandeered enemy ship (chapter 4) and the unlocked enemy ship must clearly belong to it. This is a faction kit, not a per-enemy decision:
- **Faction data.** Units and bosses get a `faction` (e.g. `'empire'`) with a shared kit: a palette (hull, frame, glow), silhouette rules (a shared shape language, e.g. angular and forward-swept with a repeating insignia or stripe motif), a core colour, a weapon/projectile colour family and component styles (turret housings, console lights). Paint helpers (`src/bosses/paint.ts`) take the kit, so new enemies inherit the look.
- **Roster.** The campaign defines an empire roster of small, big and capital units (fighters, gunships, walls, ground turrets, the capital ship, the final boss), designed together as one family: same materials, same colour language, consistent scale steps from fighter to capital ship. The player's squad (Delta) uses a clearly different palette so friend and foe read instantly.
- **The commandeered ship** is a member of the roster (a hero version of the fighter), so the player visibly flies a ship that matches the enemy fighters (which is why the squad is in disbelief).
- **Endless** may keep the generic units, or later use factions as themes; faction kits are data, so a second faction is a new kit and roster.

### Bonus gold objectives and the gold rule
Every chapter has one **bonus objective**, shown at the start of the level. It rewards mastery of that chapter's own mechanic, not another timer. **Gold = zero deaths AND (beat the gold time OR complete the bonus)**: two routes to gold, speed or mastery. (A "both" tier is left for a later platinum medal.)

| Chapter | Bonus |
|---|---|
| 1. Dogfight | **Ace:** shoot down 30 fighters before reaching the command ship |
| 2. Retreat | **Untouched:** take no hits during the retreat |
| 3. Freefall | **Undamaged:** take no damage from debris or peaks (you cannot shoot, so this is the mastery) |
| 4. Commandeer | **Silent:** reach the hangar without ever being detected by a searchlight |
| 5. Surface run | **Destroy all turrets** |
| 6. Reunion | **Fly clean:** reach the atmosphere without using the dodge, or at full health |
| 7. Finale | **Full dismantle:** destroy every room and turret on the capital ship before the core goes |

Tracking needs only a few counters (kills, hits taken, rooms destroyed, pickups, alarms), kept per level attempt and reset on a checkpoint restart where the objective restarts (the death still counts).

### Chapter 4 gameplay (agreed)
The player ejects from the crashed ship into a tiny **escape pod**: a small ship with a tiny hitbox, **minimal health and no weapon**. The level is a **scrolling stealth level** through the enemy base with **searchlights** sweeping it. If the pod crosses a light, **fighters come after it and shoot**; the pod cannot shoot back, so the answer to being detected is to run, break line of sight or dodge. The goal is the **hangar**: reach the hangar circle and **sit in it for 10 seconds** to take the enemy ship (the objective ends with a ship swap to the empire fighter, the commandeered hero ship). Bonus gold: **Silent**, never detected. This replaces the earlier fuel-depot idea. Engine needs: a preset pod ship (no weapons, tiny hitbox, low health), a searchlight hazard that sets a detection state, pursuing fighters (existing units with a chase movement, spawned on detection), and a `hold` objective (stay inside a zone for N seconds).

### Chapters 1 and 2 gameplay (agreed)
- **Chapter 1 (capital ship).** Most of the capital ship **cannot be touched** (its armour is indestructible). One **attackable area** can be shot and **chunked out** until the player carves through to the **engine room**; blowing up the engine room completes the objective. Fighters keep attacking meanwhile. This is a carve-to-reach challenge on one zone, not a precision shot into a gap.
- **Chapter 2 (retreat) scrolls** toward the exit; the scripted shoot-down at the end is not a death.

### The capital ship keeps its state (chapter 1 to chapter 7)
The game **saves the state of the capital ship at the end of chapter 1 and restores it in chapter 7**, so the final boss is the same ship in the same condition: the carved-out area, the destroyed engine room, the debris and blasts (the engines are dead, which is why it is a disabled boss). Lore: the armour could not be hit in chapter 1 because it is **their** tech; in chapter 7 the player flies **their** ship, so the armour **can** now be hit.
- **Snapshot.** A boss/unit snapshot (per-layer pixel masks, component and room states, core hp) is captured when chapter 1's engine-room objective completes (or at the end of the chapter) and stored in the campaign progress (`SaveData`, run-length encoded masks to keep it small; format versioned). Chapter 7 restores it and then switches the armour to carvable (the "their tech" rule is a flag on the ship that the commandeered ship's tech sets).
- **Replays.** Decided: if chapter 1 is replayed, the snapshot from the **latest completion** replaces the stored one, so the finale always matches the last time the player finished chapter 1.
- **Slice 1 builds the snapshot capture and the save format**; slice 3 builds the restore and the "armour now carvable" switch. The capital ship must therefore be designed once, in one definition, used by chapters 1 and 7.

## As built: scrolling, obstacles, capital ship, allies (campaign slice 1, part B)
Status: **built** (first pass, no human playtest). Code: `src/scroll/` (types, runner, obstacles, background, allies, testLevel, index), `src/bosses/capitalShip.ts`, `src/factions.ts`, `src/flow/nodes/scroll.ts`. Touched: `boss.ts` (armour layers), `bossFight.ts`, `rooms.ts`, `game.ts`, `hud.ts`, `flow/node.ts`. The campaign framework (objectives, timer, medals, checkpoints, screens, beats, snapshot) and the chapter content are other sessions' work and use the interfaces below.

### Scrolling levels
- **Format** (`ScrollLevelDef`, `src/scroll/types.ts`): `id`, `length` (px), `speed` (px/s at the start), `theme` (id or inline `ScrollTheme`), optional `weaponsLocked`, `allies: { count, pattern }`, and `timeline: ScrollEntry[]`. Every entry has `at`, the **scroll distance** (px) at which it fires. Entries: `obstacle` (shape, x, edge top|left|right, motion preset or `{vx,vy,spin,wobble}`, scale, damage, carvable, seed), `field` (a seeded band of random obstacles between `at` and `to`, `density` per 1000 px, weighted shapes, motion presets, an optional free `lane`; expanded at load by `compileTimeline`), `unit` (id from the unit catalogue, x, y), `wave` (id or definition), `boss` (a `BossDefinition` id, starts a boss fight on top of the scroll), `speed` (to `speed` over `ease` s), `weapons` (locked), `allies` (on/off, count, pattern), `theme` (cross-fade), `pickup` (**stub**: only emits an event), `event` (a named event for the framework). To author a level: pick distances in px; at 170 px/s, 1000 px is about 6 s. Register it in `SCROLL_LEVELS` (`src/scroll/index.ts`).
- **Interface for the framework** (`ScrollRunner`): `start(def)`, `update(dt)`, `distance`, `done` (distance reached `length`), `speed`, `draw(ctx)`, `setSpeed(v, ease = 0.6)` (the hook scripted beats call), `onEvent` (called for `event`/`pickup` entries and `level-start`, `level-end`, `boss-spawned`). `ScrollRunnerImpl` adds `obstacles`, `allies`, `skipTo(d)`, `paused`, `log`, `drawBackground` / `drawObstacles`. It needs a `ScrollHost` (spawn unit/wave/boss, `setWeaponsLocked`), which `Game` provides.
- **Using it from a flow node**: `NodeHost` gained `startScroll(level)`, `scroll()` (the running `ScrollRunner`, or null) and `setWeaponsLocked(on)`; `startWave(wave, scroll?)` and `startBossFight(id, scroll?)` take an optional scroll level (id or inline def), and `WaveNodeDefinition.scroll` / `BossNodeDefinition.scroll` pass it. New node type `scroll` (`ScrollNodeDefinition { level }`, `nodes/scroll.ts`): done when the distance reaches `length`, lost when the ship dies. An objective can also start combat with any of these and read `host.scroll()` for distance and events. `endCombat` stops the scroll and unlocks the weapons. The scroll stops on `reset()` too (a checkpoint restart: start it again).
- **World model**: the world moves down the screen at the scroll speed; an obstacle enters just above the top edge when the distance reaches its `at`, and moves with the scroll plus its own motion. The ship never leaves the screen. Late firing (skipTo, big frames) pre-scrolls the obstacle by the missed distance.
- **Background** (`ScrollTheme`): a sky gradient plus parallax layers (`stars`, `clouds`, `mountains`, `snow`, `streaks`, each with a `speed` share of the scroll). Themes `space`, `atmosphere`, `arctic` in `SCROLL_THEMES`. Heavy layers are painted once into a wrapping tile; a theme switch cross-fades. The starfield is replaced while a scroll runs.

### Backgrounds: as built (scroll visuals pass)
Code: `src/scroll/background.ts` (themes are still data: `ScrollTheme` = sky + optional `stormSky` + layers, ids `space`, `atmosphere`, `arctic`). Everything heavy is a precomputed canvas (planet texture and shading, cloud and mountain tiles, edge glows, debris and ship sprites); particles are capped (about 25 to 90 per layer, drawn as one batched line path per layer).
- **`weather` (0 calm to 1 violent)**: a global value on `ScrollBackground`, eased. Set it with the timeline entry `{ at, kind: 'setWeather', intensity, ease? }` (ease default 3 s), a level's `weather` (start value), `runner.setWeather(v, ease)`, or `game.debug.scroll.weather(v, ease)`. Each layer has an optional `weather: [lo, hi]` range: its alpha (painted layers) or particle count (particles) is `lo + (hi - lo) * weather`. `stormSky` fades in with the weather.
- **`space`**: a planet (Orini) whose curved limb fills the bottom of the screen (ocean, ice sheets, cloud bands that slide past, terminator shading, night-side city lights, atmosphere rim glow; the limb drifts slowly with the distance), four star depths where `stars.streak` stretches stars and dust into lines with the scroll speed (none at a standstill, full length at about 500 px/s), and a `fleet` layer: far-off explosions (with secondaries), blinking fleet lights and slow capital-ship silhouettes (max 7 alive).
- **`atmosphere`**: three layers of dark roiling storm clouds (strips that wobble sideways) rushing past, slanting wind-blown ice/rain with gusts, up to 9 fast dark debris shards, orange-red re-entry edge glow that pulses, darkening and whiteout swings, lightning, and camera turbulence (the background shakes up to 6 px at full weather, drawn with a 4 % zoom so no edges show). **Lightning**: a soft flash (rise 80 ms, decay about 200 ms, peak alpha under 0.5), a second flicker, a bolt, an afterglow of about a second, and thunder 0.25 to 0.75 s later (`runner.onThunder`, the game answers with a small `Effects.rumble`). Strikes start above weather 0.2, are at least 0.7 s apart (so at most about 1.4 flashes per second, under the 3 per second limit), at weather 1 about every 1.5 to 4 s. `prefers-reduced-motion` cuts flash brightness, turbulence and the bolt.
- **`arctic`**: tall jagged peaks in the fog (two far layers, thinning with the weather), fog banks, gusting snow streaks in two depths, whiteouts, a cold blue edge glow, light turbulence; everything responds to `weather` (calm at 0, blizzard at 1).
- **Draw API**: `ScrollBackground.update(dt, speed)`, `draw(ctx, dist, speed)`, `setWeather`, `setTheme`, `strike()` (debug), `onThunder`.
- **Test levels**: `scroll-test-storm` (12000 px): space from a drift to 520 px/s, a wave, then the atmosphere at weather 0.1, 0.45 and 1, then the arctic blizzard 0.3 to 1 and an ease back down. `game.debug.scroll.weather(v, ease)`, `.theme(id, fade)`, `.strike()`.
- **Measured** (in-app browser, `render()` timed over 180 calls with 20 obstacles, 4 allies and wave `l1w1`): space 0.33 ms, arctic (weather 1) 0.42 ms, atmosphere (weather 1, the heaviest) 0.84 ms. The preview pane caps the live fps readout (30 to 80 fps seen).
- **Not verified**: a human playtest (is the storm scary, is the planet right), a real phone GPU, reduced-motion damping (code path only), what a strobe looks like on real hardware.

### Obstacles (`src/scroll/obstacles.ts`)
- Shapes: `debris-s/m/l/xl` (gunmetal scrap plates, 26 to 120 px) and `peak-s/m/l` (tall jagged rock spires with a snow cap, 90x240 to 230x560), painted once per template (4 variants) with the paint helpers, drawn with one `drawImage`. Motion presets: `straight`, `drift-l/r`, `tumble`, `fast`, `weave`; peaks never spin. Edge entries (`left`/`right`) slide in sideways.
- **Damage**: pixel-mask collision (the ship's centre and 8 ring points against the rotated mask). The game applies it through `Health.hit` after the bullet damage, so i-frames (1 s) and the dodge work exactly as for enemy bullets; debris 1, peaks 2 (the ship has 5), `ObstacleSpawn.damage` overrides. Never an instant kill, never hurts enemies. Hit feedback: shake, sound, sparks, the obstacle flashes. Measured: a peak parked on the ship took 2 hp, then 2 more exactly 1 s later (i-frames), then the last 1.
- `carvable: true`: the base gun erodes the obstacle (own copy of the pixels, disc erased per shot). **Not wired for the aux weapons** (gauss, rocket, arc ignore obstacles). Off in the freefall.
- Cost: 20 obstacles on screen, a wave of 23 units, 29 enemy bullets and 4 allies: update 0.12 ms and render 0.7 ms average (in-app browser, `update`/`render` timed over 180 frames; the live fps readout is capped at about 30 by the preview pane, the same with no scroll running).

### Weapons lock
`Game.weaponsLocked` (set by a level's `weaponsLocked`, a `weapons` timeline entry, `NodeHost.setWeaponsLocked`, `debug.setWeaponsLocked`, `[Insert]`): the base gun, the aux weapons and the debug fire-all do not fire (aux timers stand still), bullets already in flight finish. The dodge still works. HUD: the weapon rings are greyed and crossed, with a red `WEAPONS LOCKED` badge over them.

### Armoured capital ship (`src/bosses/capitalShip.ts`)
- **One definition** for chapters 1 and 7: `capitalShip` (`[B]` list, id `capital-ship`) and `capitalShipCarvable` (`capital-ship-carvable`, `armourCarvable: true`), `faction: 'empire'` (`src/factions.ts`: placeholder palette kit). Layout 700 x 620 on a 540 screen, centred at x 270 with the top 150 px above the screen: the player sees the stern (two engine nacelles, insignia chevrons, 4 gun housings) and, between the nacelles, a **notch** in the stern plating: the one attackable area.
- **Layers**: Armour (`indestructible`, density 8 for when it becomes carvable), Hull (a plate filling the notch, density 6, regrowth off, chunks break off), Interior (dark deck behind the notch with the **engine room** painted in it, plus a sealed reactor chamber with the core far above). The core is armoured (`coreArmor.min 0.05`) and has 3000 hp, so chapter 1 cannot kill the ship (the blasts' core damage is scaled by that armour).
- **Armour rule** (engine): `LayerSpec.indestructible` (`Layer.armour` is the spec flag, `Layer.indestructible` the live state). `Boss.hit` returns `{ carved: 0, blocked: true }` (the bullet is consumed, the game shows a spark and a rate-limited tick), `carveRadial` (blasts, craters) skips those pixels and does not scorch them, the layer never gets a connectivity pass. Components on it are separate targets (the guns can be shot). `BossFight.armourCarvable` (getter/setter, `BossDefinition.armourCarvable`, `game.debug.capital.armourCarvable(on?)`, `[Delete]`) makes it an ordinary layer live (labelling a 350k-pixel armour layer costs about 1.4 ms per update while it is being carved).
- **The engine room** (`ENGINE_ROOM_ID = 'engine'`): two consoles, `functions: [{ kind: 'engine', online: 1, offline: 0 }]` and `explodeOnDisable: { radius: 120 }`. Dig up through the hull plate, expose and destroy both consoles: the room blows up, the engine function goes offline and **the ship stops dead** (the movement clock eases to 0). **Objective event**: `fight.rooms.onDestroyed.push((room, exploded) => ...)` (called once per room when its last console goes, not for debug forces), `fight.rooms.destroyed('engine')`, `fight.rooms.destroyedIds`; the `roomOffline` component event now carries the room `id`. State is the standard `Boss`/`BossFight`/component/room state, so the framework's snapshot works; the painted layer canvases are shared, never mutated.
- **Fight**: one phase, gun housings fire aimed shots (outer, tracking), volleys and bombs (inner, fixed), the ship sways and bobs slowly. Measured (god mode, perfect aim, all weapons): about 24 s to dig to the consoles and blow the room; 150 s of sweeping the whole ship left the armour mask unchanged; destroying all four guns left the armour and the core untouched; with `armourCarvable` on, shots at the armour carve it. A human will be slower; densities are first guesses.
- Debug: `[B]` in boss mode cycles to it, `game.debug.setBoss(def)`; `[Delete]` toggles the armour; `game.debug.capital.engineDestroyed()`.

### Cosmetic allies (`src/scroll/allies.ts`)
`AllySystem`: 3 to 4 Delta wingmen (mint delta wings, white trim), patterns `weave`, `loop`, `strafe`, `patrol`; they enter from below, fire pale tracers (capped at 48) that hit nothing, and leave off the top. Drawn right after the background, under everything. No collisions, nothing in the combat lists, near-zero cost. From a level's `allies` or `allies` timeline entries (`on: false` sends them away), `debug.scroll.allies(count, pattern)`.

### Debug and the test level
`SCROLL_TEST` (`scroll-test`, 9000 px): speeds 170 to 300 to 140 to 220, three obstacle fields (debris, then debris with peaks, then a locked stretch), handmade peaks from the top and both sides, waves `l1w1` and `l1w2` plus two gunners, a weapons-locked stretch (4200 to 6100), theme atmosphere to arctic at 4000, 4 allies, a pickup and events. Events fired at 201, 2403, 4204, 6100, 7601, 8902 and 9000 px in a full run. `game.debug.scroll.start(id | def)`, `stop()`, `setSpeed(v, ease)`, `skipTo(distance)`, `pause(on)`, `distance()`, `speed()`, `runner()`, `obstacle(spawn)`, `allies(n, pattern)`, `showBoxes(on)`, `levels`. Keys: `[Home]` start/stop the test level (in boss mode the boss is set aside and comes back), `[PgUp]/[PgDn]` speed, `[End]` skip 1000 px, `[Insert]` weapons lock, `[Delete]` armour carvable. The overlay shows distance, speed, obstacle and ally counts, the lock and the armour state.

### Not done / not verified
No pickup entity (`pickup` entries only emit an event); aux weapons do not erode carvable obstacles; no ground or terrain collision for the surface run (obstacles only); obstacle hits reuse the component-destroy sound; the capital ship's chapter-7 tuning (armour density, core hp, coreArmor) is a placeholder, only the flag works; no human playtest (obstacle density and lane width, dig time, turret fairness); touch controls were not exercised; the scroll node and the `scroll` option on wave and boss nodes were tested through `NodeHost` calls, not in a full run (the default run has no scroll nodes); the armour-spark look was seen only in motion-free screenshots.
### As built: campaign framework (slice 1, part A)
Status: **built**. Title -> CAMPAIGN -> campaign select -> (story intro on first open) -> level select -> briefing -> play -> result. Code in `src/campaign/`; `Run` has a `campaign` phase that delegates to `CampaignFlow` (`flow.ts`). The campaign borrows the run's ship selection and gives it back (`Run` bridge `prepare`/`restore`); no cards, no upgrades.

**Files.** `types.ts` (all data formats), `content.ts` (`CAMPAIGNS`: "Fallen Peace" chapters 1 to 3 as **placeholders** with test objectives and made-up medal times, plus "Framework Test" with the two-objective level `test-1`), `objectives.ts` (handlers), `session.ts` (one play of a level), `beats.ts`, `medals.ts`, `snapshot.ts`, `hooks.ts` (scroll), `screens.ts`, `flow.ts`, `ui.ts`.

**Data.** `CampaignDefinition { id, name, intro[], levels, completionUnlock? }`; `CampaignLevel { id, name, briefing[], ship { id, loadout? }, objectives[], medals { bronze, silver, gold, bonus }, beats? }`. Bronze is awarded for completing (its time only colours the HUD pace); silver = time <= silver; **gold = zero deaths and (time <= gold or the bonus)**. Bonus criteria (`BonusCriteria`, each with a `text`): `killCount`, `hitless`, `noDamage`, `collectAll`, `destroyAll { tag, count }`, `roomsDestroyed`, `noDetection`, evaluated in `medals.ts` from per-level counters (kills, hits, damage, roomsDestroyed, collected, detections, killsByTag). Counters of the failed attempt are dropped on a checkpoint restart; completed objectives' counters stay.

**Objectives** (`ObjectiveDefinition`, common fields `id, title, spawns, beats, weaponsLocked`): `destroy { targets: tag | unit | component | room }`, `reach { zone, hold? }` (hold = stay N s, the hangar circle), `survive { seconds }`, `escape { exit, timer?, closing? }` (timer or a rising fire wall; failing restarts the objective **and counts as a death**), `bossFight { bossId, until?: component | room, snapshotSlot?, restoreSlot? }`. A handler is `start / update / isDone / draw / hint` (`ObjectiveHandler`); `OBJECTIVE_FACTORIES` is typed over every type, so **adding a type = a definition in the union + one handler + one table entry**. Handlers get an `ObjectiveEnv` (`host`, `time`, `fail(reason)`, `bump('collected' | 'detections')` for counters the game cannot see, e.g. the searchlights).

**Session rules.** A checkpoint is the start of each objective: the game restarts combat from a clean field (`NodeHost.startCombat`), full heal, units/timers/beats reset; the level timer runs through deaths; deaths are counted; the ship swapped by a beat is undone. Objective completion is ignored while the ship is exploding (`shipAlive`). Level result is saved with `saveStore.setMedal(levelId, medal, timeMs, bonus)` (best medal, best time, bonus ever done). Unlock: `completionUnlock` is awarded when the campaign's last level is completed (slice 1 test flags: `cards` ids `campaign-test-*`, shown on the result screen).

**Beats** (`Beat = { at | atDistance } & action`): `text` (subtitle, no pause), `forceDestroyPlayer` (**not a death**, and the objective keeps running; end it with `completeObjective` or an `at` beat), `lockWeapons`, `setShip`, `spawn`, `setScrollSpeed`, `startObjective { objective }` (jump; the current one completes), `completeObjective`. Objective beats restart with the objective; level beats (`CampaignLevel.beats`, level seconds) fire once. **Scroll hook** (`hooks.ts`): `ScrollHooks { setSpeed(px/s, ease?), distance() }` with a no-op default; the scrolling session calls `setScrollHooks(impl)` and `atDistance` beats then work.

**Game side** (`NodeHost` additions, all in `Game.makeNodeHost`): `startCombat({ bossId?, keepHealth?, restore? })` (bossless combat or a boss fight, optionally restoring a snapshot), `spawnUnit({ unit, x, y, tag?, delay? })`, `spawnWaveById(id, tag?)` (units carry a `tag`, `UnitSystem.countMatching`), `unitsLeft`, `counters()` (kills, hits, damage, roomsDestroyed, killsByTag), `forceDestroyPlayer`, `setWeaponsLocked`, `setShip`, `shipAlive`, `bossTarget(kind, id)`, `captureBoss()`. The ship now throws an explosion burst on dying (visual only).

**Snapshot** (`snapshot.ts`, `SNAPSHOT_VERSION` 1). `captureSnapshot(fight)` / `restoreSnapshot(fight, snap)` on a `BossFight`: per layer the solid mask and the "gone" mask run-length encoded (alternating run lengths starting with an empty run) plus scorch colour changes (`tint`, flat `[index, r, g, b]`), core hp, per component `{ hp, state active|destroyed, enabled, powered, level }` (dying and detached are stored as destroyed), per room `{ exposed, offline }` (restored through `RoomSystem.restoreState`, which runs the offline handlers with no blast so engine speed and shields match). Not captured: flying fragments, particles, regrowth progress, turret aim, attack timers, the fight clock. Stored in `SaveData.campaign.snapshots[slot] = { levelId, bossId, data }` (`saveStore.setSnapshot/getSnapshot`, latest completion replaces); `SAVE_VERSION` is **3** (v2 migrates untouched; `MedalRecord.bonus` added). A `bossFight` objective with `snapshotSlot` captures on completion; `restoreSlot` restores when the fight starts (ignored if the slot is empty or holds another boss). A heavily carved Bulwark is about 45 KB of JSON.

**Debug.** `game.debug.campaign`: `start(levelId, objectiveIndex?)` (run mode only), `skipObjective()`, `setTime(s)`, `unlockAll(on?)` (levels only, not saved), `session()`, `counters()`, `flow`, `snapshotRoundTrip()` (capture the current boss, push it through JSON, restore onto a fresh fight, compare every layer pixel, component and the core: `{ ok, diffs, pixelMismatch, ... }`). The campaign uses the real save, so `?nosave` (in-memory) and `?mode=boss` (no campaign) never touch it. `[Esc]` while playing abandons the level (no result).

**How to add a level:** append a `CampaignLevel` to a campaign in `content.ts` (ship, objectives, medals with a bonus). **A campaign:** add a `CampaignDefinition` to `CAMPAIGNS`.

**Stubbed / not done:** (chapters 1 to 3 are now built, see "As built: Fallen Peace chapters 1-3"); `setScrollSpeed`/`atDistance` do nothing until the scroll session installs hooks; no searchlights or pickups (`bump` is the hook); no touch control to abandon a level (keyboard `[Esc]` only; a tap there would also steer); level select shows up to 7 levels without paging; `?mode=boss` has no campaign.

## As built: Fallen Peace chapters 1-3 (campaign slice 1, part C)
Status: **built**, verified with scripted runs and a dodging bot (no human playtest). Code: `src/factions.ts`, `src/enemies/{empire,empirePaint,empireWaves,flyby}.ts`, `src/scroll/fallenPeace.ts`, `src/campaign/fallenPeace.ts`, `src/ships.ts` (`CAMPAIGN_SHIPS`). Engine additions: `UnitPlacement.flyby`, scroll entry `flyby`, `ObjectiveBase.scroll`, objective type `scroll`, `escape.exitAtDistance`, `ObstacleField.laneDrift`, faction-painted turrets and cores.

### The empire kit and roster (`src/factions.ts`, `src/enemies/empire.ts`)
- **Look rules** (`EMPIRE` kit + `empirePaint.ts` helpers `symPoly`, `insignia`, `stripe`, `glowSlit`, `flipVertical`): angular, **forward-swept** wings (tips reach toward the nose), slate-steel plating (`armour`, `armourLight`, `armourDark`), a bronze hull plate, the red **nested-chevron insignia** and an accent stripe on every hull, orange glow (canopies, engines, turret lights, core `[255,110,50]`) and the new `imperial` bullet style (orange diamond, warm white rim). A unit or boss with `faction: 'empire'` gets the kit's turret housings (dark steel, red rim, light barrel) and core colour automatically (`ComponentSystem.style`, set in `BossFight`). Delta squad (`DELTA` palette: mint, white, teal; no red) is the player ship `delta-rookie` and the allies.
- **Roster** (scale steps 44, 64, 112, 700 px): `empire-fighter` (small, tracking nose gun, bursts of three), `empire-strafer` (the same ship with quicker bursts and a 0.15 s first-shot delay, for flybys), `empire-fighter-rear` (the fighter flipped nose-up, for passes from behind), `empire-flak` (flak battery: 64 px platform, one heavy gun that lays three telegraphed 42 px bursts around the player, 0.85 s warning), `empire-gunship` (big, two layers: two tracking wing guns and a fixed nose cannon volley), and the capital ship (`capital-ship`, the same single definition, repainted with swept panels, large insignia and empire gun housings; the indestructible armour and the one carvable notch to the engine room are unchanged). All go through `UnitDefinition` and get "+" variants from `harder`. The commandeered hero fighter (chapter 4) is not built.

### The flyby behaviour (`src/enemies/flyby.ts`)
`UnitPlacement.flyby = { path(u), time }` replaces entrance, hold and dives: the unit follows the path (screen-space centre), shoots with its normal attack script **only while on screen**, and is **removed** when the path ends (`Unit.lifetime`; it is not a kill). Presets (`FlybyPreset`): `strafe` (top to below, diagonal, about 450 px/s, 2.6 s), `cross` (side to side with a small dive, about 600 px/s, 2.2 s), `rear` (from below, overtaking the player, 2.8 s, flipped fighter), `drift` (slow vertical pass at about scroll speed for flak batteries and gunships, 8 s). Scroll timeline entry: `{ at, kind: 'flyby', unit, preset, x?, y?, side?, count?, spacing?, alternate?, xStep?, time? }` (`ScrollHost.spawnFlyby`). Flyby units get a reduced spawn jitter so they fire within about 0.2 s of appearing.

### Chapter 1: Dogfight (`fp-1`, closed screen)
- Over `fp1-space` (a 60 px/s starfield with four wingmen) objective 1 is `destroy`: wave `fp1-dogfight`, all queued at the start with timed groups: 6 fighters (swoop), 8 in a V (loop, at 16 s), 10 in two rows (drop, at 34 s), then two gunships and 4 more fighters (at 54 s): 28 fighters and 2 gunships. Objective 2 is `bossFight` `capital-ship` until room `engine`, over `fp1-siege` (three wingmen on patrol), with a fighter group every 16 s from beats (waves `fp1-harass-a/b/c`, a gunship every fourth) and story beats. **The snapshot** is captured when the engine room goes: `saveStore.setSnapshot('capital-ship', ...)` (`CAPITAL_SNAPSHOT_SLOT`, latest completion replaces). Checked: it round-trips (restore onto a fresh fight, capture again, JSON identical), 67 KB, room `engine` exposed and offline, core hp 3000.
- Bonus **Ace**: 30 kills (`killCount`) over the level (the engine room ends the level, so it is "before the engine room goes").

### Chapter 2: Retreat (`fp-2`, scrolling)
- `fp2-retreat` (space, then atmosphere with a cross-fade at 85 s): 200 px/s for 100 s then 260 px/s, 118 s long. Handmade passes plus a generated escalation (one group every 4.5 s from 12 s: cross, strafe, rear in turn, 1 + t/35 fighters each), flak batteries from 21 s, a gunship drift at 76 s, four wingmen on patrol until 52 s. A dodging bot saw about 24 enemy shots in the first 20 s and about 120 in the last 20 s.
- Objective 1 `escape`: the exit (circle, radius 120 at y=340, just inside the ship's highest reachable line y=320) **opens at 110 s** (`exitAtDistance`), timer 145 s (a fail restarts the objective and counts as a death). Objective 2 `survive` over `fp2-shot` (atmosphere, no enemies): text, `lockWeapons`, `forceDestroyPlayer` at 4.2 s, `completeObjective` at 7.5 s. **Not a death** (verified: deaths stay 0, the hit counter does not move, the result screen shows).
- Bonus **Untouched** (`hitless`): the bot finished with 0 or 1 hit.

### Chapter 3: Freefall (`fp-3`, scrolling, weapons locked)
- `fp3-freefall` (atmosphere, arctic from 21,000 px), 44,000 px at 240, 280, 320, 360, 400 and 440 px/s (141 s). Five stretches of fields with a **winding free lane** (`ObstacleField.laneDrift`: the lane centre meanders; the generator keeps the lane free of obstacle *bodies* over the whole height of each shape, so a corridor always exists): lane width 220 down to 95 px, density 3 up to 11 per 1000 px, motions limited to `straight`, `tumble`, `fast` in the tight stretches, plus a few handmade side peaks. Objective 1 `scroll` (done when the level ends), objective 2 `survive` over `fp3-crash` (empty arctic sky): text, `forceDestroyPlayer` at 3 s, `completeObjective` at 6 s (the crash; not a death). Weapons are locked in both. Obstacle damage checked: a debris chunk on the ship took 1 hp and counted one hit.
- **Weather**: `setWeather` entries in the timeline (0.05 at the start, 0.25 at 6,000 px, 0.45 at 13,000, 0.6 at 21,000, 0.9 at 30,000 px, easing to 0.35 for the final stretch); chapter 2 sets 0.2 as it enters the atmosphere. Watched only through the bot run; not looked at for how it reads against the obstacles.
- Bonus **Undamaged** (`noDamage`).

### Preset ship, story, unlock, debug
- **Ship**: `delta-rookie` (`CAMPAIGN_SHIPS`, not in `SHIPS`, so Endless never lists it): the Vanguard's numbers and silhouette in mint, white and teal, loadout chain + Gauss, Rocket, Arc, no cards. `Run.select` and `Game.setShip` accept campaign ships through `SHIP_BY_ID`.
- **Story**: the campaign intro (four paragraphs), a three-paragraph briefing per chapter, speaker beats (DELTA LEAD, ORINI COMMAND, SYSTEM). The subtitle bar now word-wraps to up to three lines.
- **Unlock**: finishing chapter 3 (the last level for now) awards the **TEST UNLOCK** (`cards` id `campaign-test-fallen-peace`, shown on the result screen). Slice 3 replaces it with the enemy ship, Laser and Energy Wave when chapter 7 is the last level.
- **Debug**: levels from the campaign menu or `game.debug.campaign.start('fp-1' | 'fp-2' | 'fp-3', objectiveIndex?)`; scroll levels by id in `game.debug.scroll.start('fp2-retreat')`; `empire-*` units in `debug.spawnUnit`; waves `fp1-*`. Endless, `?mode=boss` and the framework test level (`test-1`) are unchanged.

### Medals (measured with scripted runs)
| Chapter | Runs measured | Bronze | Silver | Gold | Bonus |
|---|---|---|---|---|---|
| 1 | sweep autopilot in god mode: 167 to 174 s (77 s fighters + 97 s siege); a dodging bot that tracks the lowest enemy: 270 s, 0 hits, 56 kills | 5:30 | 4:00 | 2:50 | Ace, 30 kills |
| 2 | dodging bot: 121.5 s (exit reached at 114.0 s), 0 or 1 hit | 3:10 | 2:25 | 2:05 | Untouched |
| 3 | dodging bot: 140.7 s, 0 hits | 3:40 | 2:40 | 2:10 (cannot be beaten, so gold here is the bonus route) | Undamaged |

Chapters 2 and 3 have a fixed duration (the world scrolls at a set pace), so time only grows through deaths. Chapter 3 gold is therefore the Undamaged route; chapter 2 gold by time needs the exit within about 5 s of it opening. Chapter 1 is longer than the 2 to 3 minute target for a human (probably 3:30 to 4:30): trim `fp1-dogfight` or the harassment cadence if a playtest agrees.

### Not done / not verified
No human playtest: densities, lane widths, flyby bullet counts, the dig time with the harassment waves and the medal numbers are bot-based. Weather tuning (above). `flyby` exists as a scroll-timeline entry only (not a campaign `SpawnSpec`). Fighters fly nose-down along every path (rear passes use the flipped sprite) with no banking. The wingmen leave ch 2 as a plain dismissal at 52 s. The snapshot is captured the instant the engine-room objective completes, so the room's blast debris is not in it. Touch controls untested. Chapter 7's restore of the snapshot is not built.

**Stubbed / not done:** chapters 1 to 3 are placeholders (no capital ship, scrolling, obstacles, allies); `setScrollSpeed`/`atDistance` do nothing until the scroll session installs hooks; no searchlights or pickups (`bump` is the hook); no touch control to abandon a level (keyboard `[Esc]` only; a tap there would also steer); level select shows up to 7 levels without paging; `?mode=boss` has no campaign.

## Damage feedback

Feedback when the player takes damage (`src/damageFx.ts`, hooks in `Game.afterPlayerHit`, `Effects.onPlayerHit`, `Sfx.playerHit/lowAlarm`, `Health.draw`). All tunables are in `JUICE.damage` (`src/config.ts`) and everything is switched off with the other juice by [J] (`damage.enabled` for just this). No damage numbers, hitboxes, i-frame durations or invulnerability rules were touched.

- **On every hit:** a strong screen shake (`shake.hit` + `perDamage` per extra point; `shake.scrape` for obstacle contact), a `hitStop` of 0.04 s, the hull flashes white (`flash.white`) then red (`flash.red`), a spark burst (`sparks`), a red edge vignette that fades in `vignette.fade` s, and a low thud + metallic crack (rate-limited).
- **i-frames:** the ship blinks at `blink.hz` while `Health.invuln > 0`; the dodge keeps its cyan ring and is not blinked.
- **Low hull:** at or below `lowHealth.smoke` (40%) a grey smoke trail; at 1 hp or `lowHealth.fire` (20%) flames on the ship, embers, a slow red vignette pulse (`vignette.lowPeak/lowPulse`) and a quiet beep every `alarm.interval` s. It is derived from current hp, so any heal clears it. Offsets scale with the hull's extent, so it fits every ship.
- **Obstacle scrape:** `afterPlayerHit(dmg, true)`: more sparks across the hull, bigger shake and a longer grinding sound.
- **Health bar:** the lost segments flash white then red and shatter into shards; the bar border pulses red at 40% or less.
- **Debug:** `game.debug.hurt(n, scrape?)` takes n damage (respects i-frames and dodge); `game.debug.setHealth(n)` sets hp and clears i-frames.
