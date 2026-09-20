// Colours per character: a deterministic pick from the prototype's tones, by
// character id, so the same cast looks the same on every replay. Robots get a visor.
export type Palette = { coat: string; coat2: string; skin: string; hair?: string; visor?: string };

export const COURT_PALETTE: Palette = { coat: '#22212B', coat2: '#15141C', skin: '#C79A74', hair: '#BDB5A6' };

const ROBOT: Palette[] = [
  { coat: '#C6C9C2', coat2: '#9DA199', skin: '#B6BAB2', visor: '#6FD3C4' },
  { coat: '#8C5A38', coat2: '#67402A', skin: '#7E5334', visor: '#E0A02A' },
  { coat: '#5E6B7A', coat2: '#3F4955', skin: '#6C7885', visor: '#B4553F' },
  { coat: '#7A6E8E', coat2: '#554A66', skin: '#8C82A0', visor: '#7FA86B' },
  { coat: '#3C5A4E', coat2: '#27403A', skin: '#4E6A5E', visor: '#E8DFCE' },
];
const HUMAN: Palette[] = [
  { coat: '#36405A', coat2: '#262E44', skin: '#D6A882', hair: '#8A4526' },
  { coat: '#26354F', coat2: '#1A2439', skin: '#6E4A30', hair: '#17120F' },
  { coat: '#4E5C3C', coat2: '#39452C', skin: '#E0B48E', hair: '#C7A65C' },
  { coat: '#5C4831', coat2: '#413222', skin: '#C08E62', hair: '#241B14' },
  { coat: '#D2D2C8', coat2: '#A6A69C', skin: '#B57F52', hair: '#3E2F45' },
  { coat: '#6A3A3A', coat2: '#4A2828', skin: '#C9A07C', hair: '#5A3A22' },
];

/** FNV-1a; stable across runs and platforms. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * Picks by hash, then walks past palettes already taken by earlier cast members
 * so a small cast never shares a coat.
 */
export function paletteFor(id: string, kind: 'human' | 'robot', taken: Set<string> = new Set()): Palette {
  const set = kind === 'robot' ? ROBOT : HUMAN;
  const start = hash(id) % set.length;
  for (let i = 0; i < set.length; i++) {
    const p = set[(start + i) % set.length]!;
    if (!taken.has(p.coat)) {
      taken.add(p.coat);
      return p;
    }
  }
  return set[start]!;
}
