import { describe, expect, it } from 'vitest';
import {
  solveLayer,
  upperBound,
  solvePackOut,
  insideDims,
  sheetWeight,
  SEED_FLUTES,
  type PackOutInput,
  type Placement,
} from '../src/index';
import { exactMax } from './exact';

function assertValid(L: number, W: number, ps: Placement[]) {
  for (const p of ps) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x + p.l).toBeLessThanOrEqual(L);
    expect(p.y + p.w).toBeLessThanOrEqual(W);
  }
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const p = ps[i], q = ps[j];
      const overlap = p.x < q.x + q.l && q.x < p.x + p.l && p.y < q.y + q.w && q.y < p.y + p.w;
      expect(overlap, `boxes ${i} and ${j} overlap`).toBe(false);
    }
}

// ---------------------------------------------------------------------------
// Reference case: the TOPS Pro report supplied by the user.
// Shipper 16.20 × 11.40 × 9.10 OD, 5.00 lb, GMA 48 × 40 × 4.00 pallet (65 lb),
// 0.30" overhang on each end. TOPS reported 10/layer × 5 = 50, load
// 48.60 × 39.00 × 49.50, 315 lb, area eff 96.19 %, cubic eff 89.32 %.
// ---------------------------------------------------------------------------
const topsInput = (maxHeight: number): PackOutInput => ({
  product: { kind: 'case', length: 16.2, width: 11.4, height: 9.1, weight: 5, thisSideUp: true, unitsPerCase: 12 },
  pallet: { name: 'GMA notched', length: 48, width: 40, deckHeight: 4, weight: 65, entry: '2-way' },
  constraints: {
    maxHeight,
    maxGrossWeight: 5000,
    overhangEnds: 0.3,
    overhangSides: 0,
    stacking: 'interlock',
  },
});

describe('TOPS reference load', () => {
  it('reproduces every number on the TOPS sheet (53" max height)', () => {
    const [r] = solvePackOut(topsInput(53));
    expect(r.orientation).toBe('Height vertical');
    expect(r.perLayer).toBe(10);
    expect(r.layers).toBe(5);
    expect(r.total).toBe(50);
    expect(r.load.length).toBeCloseTo(48.6, 6);
    expect(r.load.width).toBeCloseTo(39.0, 6);
    expect(r.load.height).toBeCloseTo(49.5, 6);
    expect(r.grossWeight).toBeCloseTo(315, 6);
    expect(r.areaEfficiency * 100).toBeCloseTo(96.19, 2);
    expect(r.cubeEfficiency * 100).toBeCloseTo(89.32, 2);
    expect(r.overhang.ends).toBeCloseTo(0.3, 6);
    expect(r.overhang.sides).toBeCloseTo(-0.5, 6);
    expect(r.pattern).toBe('two-block');
    expect(r.provenOptimal).toBe(true);
    expect(r.stacking).toBe('interlock');
    expect(r.bridging).toBeGreaterThan(0);
    expect(r.limitedBy).toBe('height');
    expect(r.totalUnits).toBe(600);
  });

  it('matches the mock-up with the 52" default', () => {
    const [r] = solvePackOut(topsInput(52));
    expect(r.total).toBe(50);
    expect(r.cubeEfficiency * 100).toBeCloseTo(91.18, 2);
  });

  it('inside dims from 0.156" caliper match TOPS ID column', () => {
    const d = insideDims(16.2, 11.4, 9.1, 0.156);
    expect(d.length).toBeCloseTo(15.888, 3);
    expect(d.width).toBeCloseTo(11.088, 2);
    expect(d.height).toBeCloseTo(8.476, 2);
  });

  it('fits 9 per layer (proven max) without the overhang', () => {
    const input = topsInput(52);
    input.constraints.overhangEnds = 0;
    const [r] = solvePackOut(input);
    expect(r.perLayer).toBe(9);
    expect(r.provenOptimal).toBe(true);
    expect(r.overhang.ends).toBeLessThanOrEqual(0);
  });
});

describe('layer solver vs exact search', () => {
  // Deterministic pseudo-random instances small enough for exhaustive search.
  let seed = 12345;
  const rnd = (lo: number, hi: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return lo + (seed % (hi - lo + 1));
  };
  const cases: [number, number, number, number][] = [];
  for (let k = 0; k < 60; k++) {
    const a = rnd(2, 6);
    const b = rnd(1, a);
    cases.push([rnd(a, 14), rnd(a, 13), a, b]);
  }
  // Known awkward ones where straight cuts lose a box.
  cases.push([10, 9, 3, 2], [13, 11, 5, 2], [11, 8, 3, 2], [14, 13, 5, 3]);

  it.each(cases)('%i × %i with %i × %i boxes', (L, W, a, b) => {
    const sol = solveLayer(L, W, a, b);
    assertValid(L, W, sol.placements);
    const exact = exactMax(L, W, a, b, 4000);
    const ub = upperBound(L, W, a, b);
    expect(ub).toBeGreaterThanOrEqual(sol.count);
    if (exact !== null) {
      expect(ub).toBeGreaterThanOrEqual(exact);
      expect(sol.count).toBe(exact);
    }
  });
});

describe('random sweep: 400 instances up to 22 × 20', () => {
  it('every layer is optimal (by bound or exhaustive search)', () => {
    let seed = 7;
    const rnd = (lo: number, hi: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return lo + (seed % (hi - lo + 1));
    };
    const misses: string[] = [];
    for (let k = 0; k < 400; k++) {
      const a = rnd(2, 8), b = rnd(1, a), L = rnd(a, 22), W = rnd(a, 20);
      const s = solveLayer(L, W, a, b).count;
      if (s === upperBound(L, W, a, b)) continue;
      const e = exactMax(L, W, a, b, 5000);
      if (e === null || e !== s) misses.push(`${L}x${W} ${a}x${b}: ${s} vs ${e}`);
    }
    expect(misses).toEqual([]);
  }, 60_000);
});

describe('real-size layers stay valid and fast', () => {
  it('handles a tiny unit (2.1 × 1.3 on 48 × 40) in under 3 s', () => {
    const t = Date.now();
    const s = solveLayer(48e6, 40e6, 2.1e6, 1.3e6);
    expect(Date.now() - t).toBeLessThan(3000);
    expect(s.count).toBeGreaterThanOrEqual(700);
  });

  const L = 48_000_000, W = 40_000_000; // 48 × 40 in at the engine scale
  const sizes: [number, number][] = [
    [16.2, 11.4], [12, 10], [15.5, 9.25], [11.75, 8.6], [9, 6.5], [20, 13], [7.2, 4.9], [24, 15.75],
  ];
  it.each(sizes)('%f × %f on 48 × 40', (a, b) => {
    const A = Math.round(a * 1e6), B = Math.round(b * 1e6);
    const t = Date.now();
    const sol = solveLayer(L, W, A, B);
    expect(Date.now() - t).toBeLessThan(3000);
    assertValid(L, W, sol.placements);
    expect(sol.count).toBeLessThanOrEqual(upperBound(L, W, A, B));
  });
});

describe('centred layouts stay valid', () => {
  it('never overlaps and stays inside the usable area (200 random loads)', () => {
    let seed = 99;
    const rnd = (lo: number, hi: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return lo + ((seed % 10000) / 10000) * (hi - lo);
    };
    for (let k = 0; k < 200; k++) {
      const PL = 36 + Math.round(rnd(0, 12)), PW = 30 + Math.round(rnd(0, 18));
      const oh = Math.round(rnd(-1, 1) * 4) / 4;
      for (const r of solvePackOut({
        product: { kind: 'sheet', length: +rnd(6, 30).toFixed(2), width: +rnd(5, 24).toFixed(2), thickness: 0.125, weight: 0.2 },
        pallet: { name: 'p', length: PL, width: PW, deckHeight: 5, weight: 40, entry: '2-way' },
        constraints: { maxHeight: 50, maxGrossWeight: 5000, overhangEnds: oh, overhangSides: 0, stacking: 'auto' },
      })) {
        const tol = 1e-6;
        for (const layer of [r.oddLayer, r.evenLayer]) {
          const ps = layer.boxes;
          for (const p of ps) {
            expect(p.x).toBeGreaterThanOrEqual(-oh - tol);
            expect(p.x + p.l).toBeLessThanOrEqual(PL + oh + tol);
            expect(p.y).toBeGreaterThanOrEqual(-tol);
            expect(p.y + p.w).toBeLessThanOrEqual(PW + tol);
          }
          for (let i = 0; i < ps.length; i++)
            for (let j = i + 1; j < ps.length; j++) {
              const p = ps[i], q = ps[j];
              const overlap =
                p.x < q.x + q.l - tol && q.x < p.x + p.l - tol && p.y < q.y + q.w - tol && q.y < p.y + p.w - tol;
              expect(overlap, `${PL}x${PW} oh ${oh}: boxes ${i} and ${j} overlap`).toBe(false);
            }
        }
      }
    }
  });
});

describe('limits', () => {
  it('stops at the weight limit and says so', () => {
    const input = topsInput(52);
    input.product = { ...input.product, weight: 120 } as typeof input.product;
    input.constraints.maxGrossWeight = 5000;
    const [r] = solvePackOut(input);
    // 10 per layer × 120 lb = 1,200 lb per layer; (5000 − 65) / 1200 = 4.1 → 4 layers
    expect(r.layers).toBe(4);
    expect(r.limitedBy).toBe('weight');
    expect(r.grossWeight).toBeLessThanOrEqual(5000);
  });

  it('honours max layers', () => {
    const input = topsInput(52);
    input.constraints.maxLayers = 3;
    const [r] = solvePackOut(input);
    expect(r.layers).toBe(3);
    expect(r.limitedBy).toBe('max-layers');
  });

  it('tries other orientations when "this side up" is off', () => {
    const input = topsInput(52);
    (input.product as { thisSideUp: boolean }).thisSideUp = false;
    const results = solvePackOut(input);
    expect(new Set(results.map((r) => r.orientation)).size).toBeGreaterThan(1);
    // results are sorted best first
    for (let i = 1; i < results.length; i++) expect(results[i - 1].total).toBeGreaterThanOrEqual(results[i].total);
  });

  it('auto returns column and interlock side by side', () => {
    const input = topsInput(52);
    input.constraints.stacking = 'auto';
    const r = solvePackOut(input).filter((x) => x.orientation === 'Height vertical');
    expect(r.map((x) => x.stacking).sort()).toEqual(['column', 'interlock']);
  });
});

describe('die-cut sheets', () => {
  const C = SEED_FLUTES.find((f) => f.id === 'C')!;
  const sheet = (l: number, w: number, stacking: 'column' | 'interlock', lift?: number): PackOutInput => ({
    product: { kind: 'sheet', length: l, width: w, thickness: C.caliper, weight: sheetWeight(l, w, C), fluteId: 'C' },
    pallet: { name: 'GMA', length: 48, width: 40, deckHeight: 5.5, weight: 45, entry: '2-way' },
    constraints: { maxHeight: 52, maxGrossWeight: 5000, overhangEnds: 0, overhangSides: 0, stacking, sheetsPerLift: lift },
  });

  it('stacks a large blank one-up to the height limit', () => {
    const [r] = solvePackOut(sheet(40, 30, 'column'));
    expect(r.perLayer).toBe(1);
    // usable 46.5" / 0.15625" = 297.6 → 297 sheets
    expect(r.sheetsPerStack).toBe(297);
    expect(r.total).toBe(297);
    expect(r.load.height).toBeCloseTo(5.5 + 297 * 0.15625, 6);
    expect(r.limitedBy).toBe('height');
  });

  it('centres each stack in the free space around it', () => {
    const input = sheet(23, 15, 'column');
    input.pallet = { ...input.pallet, length: 40, width: 30 };
    const [r] = solvePackOut(input);
    expect(r.perLayer).toBe(3);
    // Load 38 × 30 centred on the 40 × 30 pallet.
    expect(r.overhang.ends).toBeCloseTo(-1, 6);
    // The lone turned stack (23 deep) sits halfway down its 30" column: 3.5" gap each side.
    const turned = r.oddLayer.boxes.filter((b) => b.rot);
    expect(turned).toHaveLength(1);
    expect(turned[0].y).toBeCloseTo(3.5, 6);
    // The two unturned stacks stay together as a group.
    const flat = r.oddLayer.boxes.filter((b) => !b.rot).sort((p, q) => p.y - q.y);
    expect(flat[1].y).toBeCloseTo(flat[0].y + flat[0].w, 6);
  });

  it('centres a short strip of turned cases as a group (TOPS load)', () => {
    const [r] = solvePackOut(topsInput(53));
    const strip = r.oddLayer.boxes.filter((b) => b.rot).sort((p, q) => p.x - q.x);
    const left = strip[0].x - -0.3;
    const right = 48.3 - (strip[3].x + strip[3].l);
    expect(left).toBeCloseTo(right, 6);
    for (let i = 1; i < 4; i++) expect(strip[i].x).toBeCloseTo(strip[i - 1].x + strip[i - 1].l, 6);
  });

  it('can lock every stack to one direction, either way', () => {
    const base = sheet(23, 15, 'column');
    const mixed = solvePackOut(base)[0];
    expect(mixed.perLayer).toBe(5);
    expect(mixed.direction).toBe('mixed');

    // 23 along the 48" length: 2 × 2 = 4 stacks, all unturned
    const len = solvePackOut({ ...base, constraints: { ...base.constraints, direction: 'lengthwise' } })[0];
    expect(len.perLayer).toBe(4);
    expect(len.direction).toBe('lengthwise');
    expect(len.pattern).toBe('block');
    expect(len.oddLayer.boxes.every((b) => !b.rot && b.l === 23 && b.w === 15)).toBe(true);
    expect(len.notes.join(' ')).toMatch(/would fit 5/);

    // 15 along the 48" length: 3 × 1 = 3 stacks, all turned
    const cross = solvePackOut({ ...base, constraints: { ...base.constraints, direction: 'crosswise' } })[0];
    expect(cross.perLayer).toBe(3);
    expect(cross.oddLayer.boxes.every((b) => b.rot && b.l === 15 && b.w === 23)).toBe(true);
  });

  it('puts several stacks of a small blank side by side, interlocked by lift', () => {
    const [r] = solvePackOut(sheet(23, 15, 'interlock', 50));
    expect(r.perLayer).toBeGreaterThanOrEqual(4);
    expect(r.total).toBe(r.perLayer * r.sheetsPerStack!);
    expect(r.layers).toBe(Math.ceil(r.sheetsPerStack! / 50));
  });
});
