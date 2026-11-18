import { describe, expect, it } from 'vitest';
import { SEED_TRAILERS, solveTruck } from '../src';

const van53 = SEED_TRAILERS.find((t) => t.id === 'van-53')!;
const pallet = (h = 50, weight = 800) => ({ length: 48, width: 40, height: h, weight });

describe('truck pack-out', () => {
  it('fits 30 GMA pallets in a 53\' van when pallets can be turned, 26 when not', () => {
    expect(solveTruck(van53, pallet(), { allowTurn: true, maxTiers: 1 }).pallets).toBe(30);
    const straight = solveTruck(van53, pallet(), { allowTurn: false, maxTiers: 1 });
    expect(straight.pallets).toBe(26);
    expect(straight.positions.every((p) => !p.turned)).toBe(true);
  });

  it('double-stacks when the height allows, and caps the count by payload', () => {
    const two = solveTruck(van53, pallet(50, 500), { allowTurn: true, maxTiers: 2 });
    expect(two.tiers).toBe(2);
    expect(two.pallets).toBe(60);
    const heavy = solveTruck(van53, pallet(50, 1000), { allowTurn: true, maxTiers: 2 });
    expect(heavy.pallets).toBe(45);
    expect(heavy.limitedBy).toBe('weight');
    expect(heavy.weight).toBeLessThanOrEqual(van53.maxPayload);
  });

  it('does not stack loads too tall for two tiers', () => {
    const r = solveTruck(van53, pallet(60), { allowTurn: true, maxTiers: 2 });
    expect(r.tiers).toBe(1);
    expect(r.pallets).toBe(30);
    expect(r.notes.join(' ')).toMatch(/Too tall/);
  });

  it('keeps every pallet inside the trailer with no overlaps', () => {
    for (const t of SEED_TRAILERS)
      for (const u of [pallet(), { length: 42, width: 42, height: 40, weight: 600 }, { length: 47.3, width: 39.1, height: 30, weight: 300 }]) {
        const r = solveTruck(t, u, { allowTurn: true, maxTiers: 2 });
        const ps = r.positions;
        for (const p of ps) {
          expect(p.x).toBeGreaterThanOrEqual(-1e-9);
          expect(p.y).toBeGreaterThanOrEqual(-1e-9);
          expect(p.x + p.l).toBeLessThanOrEqual(t.length + 1e-9);
          expect(p.y + p.w).toBeLessThanOrEqual(t.width + 1e-9);
        }
        for (let i = 0; i < ps.length; i++)
          for (let j = i + 1; j < ps.length; j++) {
            const a = ps[i], b = ps[j];
            const overlap = a.x < b.x + b.l - 1e-9 && b.x < a.x + a.l - 1e-9 && a.y < b.y + b.w - 1e-9 && b.y < a.y + a.w - 1e-9;
            expect(overlap).toBe(false);
          }
        expect(ps.reduce((s, p) => s + p.tiers, 0)).toBe(r.pallets);
      }
  });

  it('reports a load taller than the door', () => {
    const r = solveTruck(van53, pallet(120), { allowTurn: true, maxTiers: 1 });
    expect(r.pallets).toBe(0);
    expect(r.limitedBy).toBe('height');
  });
});
