# Galactrious

Vertical mobile shooter: carve through a monster ship's hull, frame, and rooms to destroy its core.
See [DESIGN.md](DESIGN.md) for the spec and [BACKLOG.md](BACKLOG.md) for bookmarked ideas.

## Run

```bash
npm install
npm run dev
```

Open the printed URL (use the `--host` address on a phone on the same network).

## Controls (milestone 1)

- Drag (mouse or touch) to move; the ship sits above your finger. Arrow keys / WASD also work.
- The ship auto-fires.
- Tuning keys: `1/2` damage, `3/4` fire rate, `5/6` projectiles, `7/8` pierce, `0` reset stats,
  `T` toggle boss sway, `R` restart, `` ` `` toggle debug overlay.

## Tuning

Numbers live in `src/config.ts` (densities, core HP, sway, carve shape). The demo boss is built
from rectangles in `src/demoBoss.ts`; it produces the same per-layer masks a PNG loader would.
