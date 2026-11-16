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
7. Second boss.

## Stack
TypeScript + Vite + Canvas 2D, 540x960 logical portrait resolution.
