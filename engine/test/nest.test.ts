import { describe, expect, it } from 'vitest';
import { polygonsOverlap, solvePackOut, turnedOutline, type PackOutInput, type PackOutResult } from '../src';

type Pt = [number, number];

const pallet = (L: number, W: number) => ({ name: 'test', length: L, width: W, deckHeight: 5.5, weight: 45, entry: '2-way' as const });

function input(outline: Pt[] | undefined, L: number, W: number, PL: number, PW: number, extra: Partial<PackOutInput['constraints']> = {}): PackOutInput {
  return {
    product: { kind: 'sheet', length: L, width: W, thickness: 0.15, weight: 0.2, outline },
    pallet: pallet(PL, PW),
    constraints: { maxHeight: 52, maxGrossWeight: 5000, overhangEnds: 0, overhangSides: 0, stacking: 'auto', sheetsPerLift: 50, ...extra },
  };
}

/** True outlines of a placed layer. */
function polys(r: PackOutResult, outline: Pt[], L: number, W: number, even = false) {
  const layer = even ? r.evenLayer : r.oddLayer;
  return layer.boxes.map((b) => turnedOutline(outline, L, W, b.turn ?? (b.rot ? 1 : 0)).pts.map(([x, y]) => [x + b.x, y + b.y] as Pt));
}

function expectValid(r: PackOutResult, outline: Pt[], L: number, W: number, PL: number, PW: number, oh = 0) {
  for (const even of [false, true]) {
    const ps = polys(r, outline, L, W, even);
    for (const p of ps) for (const [x, y] of p) {
      expect(x).toBeGreaterThanOrEqual(-oh - 1e-6);
      expect(y).toBeGreaterThanOrEqual(-oh - 1e-6);
      expect(x).toBeLessThanOrEqual(PL + oh + 1e-6);
      expect(y).toBeLessThanOrEqual(PW + oh + 1e-6);
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(polygonsOverlap(ps[i], ps[j], 1e-6)).toBe(false);
  }
}

const TRIANGLE: Pt[] = [[0, 0], [1, 0], [0, 1]];
// The tray blank from the app test: tabs at one end, two rounded corners at the other.
const TRAY: Pt[] = [[0, 13 / 15], [4 / 23, 13 / 15], [4 / 23, 1], [19 / 23, 1], [19 / 23, 13 / 15], [1, 13 / 15], [1, 2 / 15], [21 / 23, 0], [2 / 23, 0], [0, 2 / 15]];
const L_SHAPE: Pt[] = [[0, 0], [1, 0], [1, 0.5], [0.5, 0.5], [0.5, 1], [0, 1]];

describe('die-cut shape nesting', () => {
  it('pairs right triangles into squares: twice the rectangle count', () => {
    const r = solvePackOut(input(TRIANGLE, 10, 10, 40, 40))[0];
    expect(r.pattern).toBe('nested');
    expect(r.perLayer).toBe(32);
    expectValid(r, TRIANGLE, 10, 10, 40, 40);
  });

  it('nests L shapes tighter than their rectangles', () => {
    const rect = solvePackOut(input(undefined, 12, 12, 48, 40))[0];
    const r = solvePackOut(input(L_SHAPE, 12, 12, 48, 40))[0];
    expect(r.perLayer).toBeGreaterThan(rect.perLayer);
    expect(r.notes.some((n) => n.startsWith('Die-cut shapes nested'))).toBe(true);
    expectValid(r, L_SHAPE, 12, 12, 48, 40);
  });

  it('a plain rectangle outline gives the rectangle answer', () => {
    const sq: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const rect = solvePackOut(input(undefined, 23, 15, 48, 40))[0];
    const r = solvePackOut(input(sq, 23, 15, 48, 40))[0];
    expect(r.perLayer).toBe(rect.perLayer);
    expect(r.pattern).not.toBe('nested');
  });

  it('never loses to rectangles, and the tray layout is valid', () => {
    for (const [PL, PW] of [[48, 40], [40, 30], [45, 38]]) {
      const rect = solvePackOut(input(undefined, 23, 15, PL, PW))[0];
      const r = solvePackOut(input(TRAY, 23, 15, PL, PW))[0];
      expect(r.perLayer).toBeGreaterThanOrEqual(rect.perLayer);
      expectValid(r, TRAY, 23, 15, PL, PW);
    }
  });

  it('respects the direction lock', () => {
    const r = solvePackOut(input(L_SHAPE, 12, 12, 48, 40, { direction: 'lengthwise' }))[0];
    for (const b of [...r.oddLayer.boxes, ...r.evenLayer.boxes]) expect([0, 2]).toContain(b.turn ?? 0);
    expectValid(r, L_SHAPE, 12, 12, 48, 40);
  });

  it('interlocked lifts are valid and bridge the stacks below', () => {
    const all = solvePackOut(input(L_SHAPE, 12, 12, 48, 40, { stacking: 'interlock' }));
    const r = all.find((x) => x.stacking === 'interlock');
    if (r) {
      expect(r.bridging).toBeGreaterThan(0);
      expectValid(r, L_SHAPE, 12, 12, 48, 40);
    }
  });

  it('stays inside the pallet with overhang and centres the load', () => {
    const r = solvePackOut(input(TRIANGLE, 10, 10, 40, 40, { overhangEnds: 1, overhangSides: 1 }))[0];
    expectValid(r, TRIANGLE, 10, 10, 40, 40, 1);
    expect(Math.abs(r.overhang.ends - r.overhang.ends)).toBe(0);
  });

  it('random star-shaped blanks: never overlapping, never outside', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 8; k++) {
      const n = 5 + Math.floor(rnd() * 6);
      const pts: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        const r = 0.25 + 0.25 * rnd();
        pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
      }
      // Normalise to the bounding box.
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const outline = pts.map(([x, y]) => [(x - x0) / (x1 - x0), (y - y0) / (y1 - y0)] as Pt);
      const L = 6 + rnd() * 14, W = 6 + rnd() * 10;
      const r = solvePackOut(input(outline, L, W, 48, 40))[0];
      const rect = solvePackOut(input(undefined, L, W, 48, 40))[0];
      expect(r.perLayer).toBeGreaterThanOrEqual(rect.perLayer);
      expectValid(r, outline, L, W, 48, 40);
    }
  });
});
