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
2. Weapon slots and ships as data (main + 3 aux): ship select and loadout builder for Endless; the existing weapons as the first set; then new weapon variants.
3. Mode select on the title; the current run becomes Endless.
4. Campaign vertical slice: one campaign, `objective` node, timers, checkpoints, medals, the first unlock.
5. Allies and squad objectives (when decided).
6. Conquest.
Alongside, independent: the room function catalog (can run next to steps 1-2).

### Open questions
- Squad/ally behaviour; Conquest death rule; whether ships change handling; number of campaigns/levels; how many weapon variants per ship.
