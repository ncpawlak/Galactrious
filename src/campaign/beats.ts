import type { Beat, BeatAction } from './types';

/** What a beat may do. The session implements it; a test can implement it to check the timeline. */
export interface BeatEnv {
  perform(action: BeatAction): void;
}

/**
 * Fires a beat list once each: `at` beats when `time` (seconds) passes them, `atDistance` beats when the scroll
 * distance does. Create a new runner to replay (a checkpoint restart does).
 */
export class BeatRunner {
  private readonly fired: boolean[];

  constructor(
    private readonly beats: Beat[],
    private readonly env: BeatEnv,
  ) {
    this.fired = beats.map(() => false);
  }

  update(time: number, distance: number): void {
    this.beats.forEach((b, i) => {
      if (this.fired[i]) return;
      const due = 'at' in b ? time >= b.at : distance >= b.atDistance;
      if (!due) return;
      this.fired[i] = true;
      this.env.perform(b);
    });
  }
}
