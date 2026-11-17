import { H, W } from './config';
import { inDodgeButton } from './player';

/** Keyboard + pointer (mouse/touch) input in logical (540x960) coordinates. */
export class Input {
  readonly keys = new Set<string>();
  pointerDown = false;
  px = W / 2;
  py = H / 2;
  /** Last pointer position seen, down or not (hover); null until the pointer has moved over the canvas. */
  hover: { x: number; y: number } | null = null;
  onPress: ((code: string) => void) | null = null;
  onPointerDown: (() => void) | null = null;
  onDodge: (() => void) | null = null;
  /** The on-screen dodge button only takes presses while this returns true (menus and reward screens put their own buttons where it is). */
  dodgeActive: (() => boolean) | null = null;
  /** Debug UI hook: return true to consume a press (no steering). Logical coordinates. */
  capture: ((x: number, y: number, e: PointerEvent) => boolean) | null = null;
  private steerPointer = -1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      this.onPress?.(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointerDown = false;
    });

    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const lx = ((e.clientX - rect.left) * W) / rect.width;
      const ly = ((e.clientY - rect.top) * H) / rect.height;
      if (this.capture?.(lx, ly, e)) return;
      if ((this.dodgeActive?.() ?? true) && inDodgeButton(lx, ly)) {
        this.onDodge?.();
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      this.steerPointer = e.pointerId;
      this.pointerDown = true;
      this.track(e);
      this.onPointerDown?.();
    });
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.hover = { x: ((e.clientX - rect.left) * W) / rect.width, y: ((e.clientY - rect.top) * H) / rect.height };
      if (this.pointerDown && e.pointerId === this.steerPointer) this.track(e);
    });
    const release = (e: PointerEvent): void => {
      if (e.pointerId !== this.steerPointer) return;
      this.pointerDown = false;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  private track(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.px = ((e.clientX - rect.left) * W) / rect.width;
    this.py = ((e.clientY - rect.top) * H) / rect.height;
  }

  /** -1..1 per axis from arrow keys / WASD. */
  axis(): { x: number; y: number } {
    const k = this.keys;
    const x = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const y = (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0);
    return { x, y };
  }
}
