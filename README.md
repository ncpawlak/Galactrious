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
- Fast damage debugging (all listed in the overlay help):
  - `1/2` step damage by a size that grows with the value (90 -> 100 -> 200 ... 1,000 ...); hold `Shift` for x10 steps,
    `Alt`/`Ctrl` for x100 (browsers may grab `Ctrl+digit` for tab switching, so prefer `Alt`). Clicking the panel's
    `-`/`+` honours the same modifiers.
  - `[` / `]` halve / double the current damage, `9` cycles presets (default 90, 450, 2,000, 100,000 "one-shot").
  - `G` toggles **god mode** (the player takes no damage), `C` collapses the panel, `0` resets stats.
  - The clickable **debug panel** (bottom-left, shown with the overlay) has damage `-`/`+`, a numeric damage display,
    presets, x0.5 / x2 / x10, fire rate `-`/`+`, GOD MODE and RESET ALL (like `0`, plus god mode off).
    Clicks on it never steer the ship.
  - Damage is clamped to 1 .. 1,000,000 and fire rate to 1 .. 200. Very high damage is safe: each bullet carves at most one
    fixed-size hole, so cost stays bounded; the core is never carved away, so a 100,000 bullet that reaches it kills it.
- Blast size: `-` / `=` lower / raise **`BLAST.scale`** by 0.25 (`Shift` = x4 steps; 0.25 .. 4, default 1) and the debug panel's BLAST row does the same; RESET ALL sets it back to 1. It scales every component and room blast at once (per-type defaults are in `BLAST.defaults`, `src/config.ts`), shown in the overlay. `game.debug.setBlastScale(2)` for scripted runs.
- Debug: `Y` toggles **test mode** (fast dig preset, `TUNING.testMode`; off by default), `P` cycles a scripted
  autopilot (off / steady sweep / aim at core). The overlay shows per-layer clear times (<=5% left);
  `game.debug.simulate(seconds, 'sweep' | 'focus')` runs the sim headless and returns them.

## Tuning

Numbers live in `src/config.ts` (densities, core HP, core armor, sway, carve shape). The demo boss is built
from rectangles in `src/demoBoss.ts`; it produces the same per-layer masks a PNG loader would.
