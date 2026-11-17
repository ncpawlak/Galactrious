import type { ScrollTheme } from '../types';

/**
 * The enemy base at night (stealth levels, chapter 4): a near-black blue-grey sky over frozen ground, a ridge far off, a few dim
 * flakes of snow. Deliberately dark and quiet so searchlights, cover zones and the pod read at once. Registered in `SCROLL_THEMES`
 * as `baseNight`; the stealth system paints the apron grid itself (`StealthDef.floor`).
 */
export const BASE_NIGHT: ScrollTheme = {
  id: 'baseNight',
  sky: ['#03060d', '#060b15', '#0a1220'],
  layers: [
    { type: 'mountains', speed: 0.06, color: '#0d1626', snow: '#1c2a42', alpha: 0.9, count: 4, height: [160, 300] },
    { type: 'snow', speed: 0.5, count: 40, drift: 10, color: '#6f86a8' },
    { type: 'snow', speed: 1.1, count: 26, drift: 18, color: '#8aa0c0' },
  ],
};
