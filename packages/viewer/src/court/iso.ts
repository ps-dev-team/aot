// The isometric room and its people, ported from docs/raw/courtroom-iso.html.
// The room is the same for every world; seats come from category (seatCast).
import { COURT_PALETTE, paletteFor, type Palette } from './palette.ts';
import type { CastEntry } from './types.ts';

export const W = 640;
export const H = 360;
const TW = 46;
const TH = 23;
const OX = 300;
const OY = 74;

export type Pt = [number, number];
export const iso = (gx: number, gy: number): Pt => [OX + ((gx - gy) * TW) / 2, OY + ((gx + gy) * TH) / 2];
/** Grid → overlay percentages, for placing the balloon over a head. */
export function screenOf(gx: number, gy: number): Pt {
  const p = iso(gx, gy);
  return [(p[0] / W) * 100, ((p[1] - 30) / H) * 100];
}

type Ctx = CanvasRenderingContext2D;

function poly(ctx: Ctx, pts: Pt[], col: string): void {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
  ctx.fill();
}
function tile(ctx: Ctx, gx: number, gy: number, col: string): void {
  poly(ctx, [iso(gx, gy), iso(gx + 1, gy), iso(gx + 1, gy + 1), iso(gx, gy + 1)], col);
}
function box(ctx: Ctx, gx: number, gy: number, w: number, d: number, h: number, top: string, left: string, right: string): void {
  const p = (x: number, y: number, z: number): Pt => {
    const s = iso(x, y);
    return [s[0], s[1] - z];
  };
  poly(ctx, [p(gx, gy, h), p(gx + w, gy, h), p(gx + w, gy + d, h), p(gx, gy + d, h)], top);
  poly(ctx, [p(gx, gy + d, h), p(gx + w, gy + d, h), p(gx + w, gy + d, 0), p(gx, gy + d, 0)], right);
  poly(ctx, [p(gx, gy, h), p(gx, gy + d, h), p(gx, gy + d, 0), p(gx, gy, 0)], left);
}

export function drawRoom(ctx: Ctx): void {
  ctx.fillStyle = '#0F0C0A';
  ctx.fillRect(0, 0, W, H);
  const wall = (from: Pt, to: Pt, h: number, fa: string, fb: string) => {
    const a = iso(from[0], from[1]);
    const b = iso(to[0], to[1]);
    poly(ctx, [[a[0], a[1] - h], [b[0], b[1] - h], [b[0], b[1]], [a[0], a[1]]], fa);
    poly(ctx, [[a[0], a[1] - h], [b[0], b[1] - h], [b[0], b[1] - h + 7], [a[0], a[1] - h + 7]], fb);
  };
  wall([0, 0], [9, 0], 118, '#4B392C', '#5C4636');
  wall([0, 0], [0, 8], 118, '#3A2C22', '#48382B');
  const wain = (from: Pt, to: Pt, fa: string) => {
    const a = iso(from[0], from[1]);
    const b = iso(to[0], to[1]);
    poly(ctx, [[a[0], a[1] - 46], [b[0], b[1] - 46], [b[0], b[1]], [a[0], a[1]]], fa);
  };
  wain([0, 0], [9, 0], '#6B4126');
  wain([0, 0], [0, 8], '#54331E');
  // seal behind the bench
  const s = iso(4.8, 0);
  ctx.fillStyle = '#7A5E1E';
  ctx.beginPath();
  ctx.arc(s[0], s[1] - 78, 17, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#C9A227';
  ctx.beginPath();
  ctx.arc(s[0], s[1] - 78, 13, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#7A5E1E';
  ctx.fillRect(s[0] - 1, s[1] - 88, 2, 20);
  ctx.fillRect(s[0] - 7, s[1] - 80, 14, 2);
  for (let x = 0; x < 9; x++) for (let y = 0; y < 8; y++) tile(ctx, x, y, (x + y) % 2 ? '#2B3A33' : '#324339');
  for (let y = 1; y < 7; y++) tile(ctx, 4, y, '#5A2B2B');
  // bench, witness stand, tables, gallery rail
  box(ctx, 3.5, -0.15, 2.6, 1.1, 34, '#7A4A2A', '#4A2C18', '#5E381F');
  box(ctx, 3.5, 0.85, 2.6, 0.18, 46, '#8A5733', '#4A2C18', '#6B4126');
  box(ctx, 7.1, 1.0, 1.4, 1.0, 26, '#7A4A2A', '#4A2C18', '#5E381F');
  box(ctx, 1.2, 4.2, 1.9, 0.9, 20, '#6B4126', '#41281A', '#54331E');
  box(ctx, 5.9, 4.2, 1.9, 0.9, 20, '#6B4126', '#41281A', '#54331E');
  for (let x = 0; x < 9; x += 1) box(ctx, x + 0.05, 7.5, 0.9, 0.12, 22, '#6B4126', '#3E2618', '#54331E');
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = '#FFE8A8';
  for (const [x, y] of [[4.8, 1.6], [2.2, 4.2], [6.6, 4.2]] as Pt[]) {
    const p = iso(x, y);
    ctx.beginPath();
    ctx.ellipse(p[0], p[1], 64, 30, 0, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export type Look = { kind: 'court' | 'human' | 'robot'; palette: Palette };

export function drawPerson(ctx: Ctx, gx: number, gy: number, look: Look, t: number, walking: boolean, seated: boolean): void {
  const p = iso(gx, gy);
  const x = Math.round(p[0]);
  const y = Math.round(p[1]);
  const c = look.palette;
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, 7, 3.2, 0, 0, 7);
  ctx.fill();
  ctx.globalAlpha = 1;
  const bob = walking ? (Math.floor(t / 110) % 2 ? 1 : 0) : Math.floor(t / 620) % 2 ? 0 : -1;
  const base = y - bob;
  const sit = seated ? 5 : 0;
  const R2 = (dx: number, dy: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x + dx, base + dy, w, h);
  };
  if (!seated) {
    const sw = walking ? (Math.floor(t / 110) % 2 ? 1 : -1) : 0;
    R2(-4 + sw, -7, 3, 7, c.coat2);
    R2(1 - sw, -7, 3, 7, c.coat2);
  }
  R2(-5, -17 + sit, 10, 11 - sit, c.coat);
  R2(-5, -17 + sit, 2, 11 - sit, c.coat2);
  R2(3, -17 + sit, 2, 11 - sit, c.coat2);
  R2(-3, -24, 6, 7, c.skin);
  if (look.kind === 'robot') {
    R2(-3, -24, 6, 3, c.coat2);
    R2(-2, -23, 4, 2, c.visor ?? '#6FD3C4');
    R2(0, -27, 1, 3, c.coat2);
    R2(-1, -28, 3, 2, c.visor ?? '#6FD3C4');
  } else {
    const hair = c.hair ?? '#241B14';
    R2(-3, -25, 6, 3, hair);
    R2(-3, -24, 1, 3, hair);
    R2(2, -24, 1, 3, hair);
    R2(-2, -21, 1, 1, '#2A2118');
    R2(1, -21, 1, 1, '#2A2118');
  }
}

// ---- seating -------------------------------------------------------------------

export const COURT_ID = 'COURT';
export type Seat = { home: Pt; mark: Pt };
export type Member = CastEntry & { look: Look; seat: Seat };

// home = idle spot, mark = where they walk to speak. Every CHARACTER_CATEGORIES value maps here.
const TABLES: Record<string, { home: Pt; mark: Pt; dx: number }> = {
  prosecution: { home: [1.9, 4.5], mark: [3.1, 2.9], dx: -0.7 },
  defense: { home: [6.6, 4.5], mark: [5.5, 2.9], dx: 0.6 },
  defendant: { home: [7.3, 4.9], mark: [4.3, 2.4], dx: -0.6 },
};
const GALLERY: Pt[] = [[1.0, 6.5], [2.4, 6.7], [3.8, 6.5], [5.2, 6.7], [6.6, 6.5], [7.8, 6.7], [0.3, 6.7], [8.6, 6.5]];
const STAND: Pt = [7.6, 1.35];
const BENCH: Pt = [4.5, 0.45];

/** The cast plus THE COURT, each with a seat and a look. Witnesses, experts, investigators and `other` sit in the gallery and speak from the stand. */
export function seatCast(cast: CastEntry[]): Record<string, Member> {
  const out: Record<string, Member> = {
    [COURT_ID]: { id: COURT_ID, name: 'The Court', role: 'presiding', kind: 'human', category: 'court', look: { kind: 'court', palette: COURT_PALETTE }, seat: { home: BENCH, mark: BENCH } },
  };
  const used: Record<string, number> = {};
  const taken = new Set<string>();
  let g = 0;
  for (const c of cast) {
    const t = TABLES[c.category];
    let seat: Seat;
    if (t) {
      const n = used[c.category] ?? 0;
      used[c.category] = n + 1;
      seat = { home: [t.home[0] + t.dx * n, t.home[1]], mark: [t.mark[0], t.mark[1] + 0.35 * n] };
    } else {
      seat = { home: [...GALLERY[g++ % GALLERY.length]!] as Pt, mark: [...STAND] as Pt };
    }
    out[c.id] = { ...c, look: { kind: c.kind, palette: paletteFor(c.id, c.kind, taken) }, seat };
  }
  return out;
}
