/**
 * Upper bounds on how many a × b boxes can fit in an L × W layer.
 * When the solver's count equals the bound, the layer is proven optimal.
 */
import { rasterPoints } from './layer';

/** Usable lengths after trimming space no box combination can fill. */
export function normalizedSize(L: number, W: number, a: number, b: number) {
  const Rx = rasterPoints(L, a, b);
  const Ry = rasterPoints(W, a, b);
  return { X: Rx[Rx.length - 1], Y: Ry[Ry.length - 1] };
}

/** floor(X·Y / a·b) on the trimmed area. */
export function areaBound(L: number, W: number, a: number, b: number): number {
  const { X, Y } = normalizedSize(L, W, a, b);
  return Number((BigInt(X) * BigInt(Y)) / (BigInt(a) * BigInt(b)));
}

/**
 * Barnes (1979) bound. Each a × b box can be cut into unit-wide 1 × a bars
 * (and also into 1 × b bars). Packing an X × Y rectangle with 1 × n bars always
 * leaves at least min(r·s, (n−r)(n−s)) uncovered, where r = X mod n and
 * s = Y mod n. So the boxes can cover at most X·Y minus the larger of the
 * two wastes.
 */
export function barnesBound(L: number, W: number, a: number, b: number): number {
  const { X, Y } = normalizedSize(L, W, a, b);
  const BX = BigInt(X);
  const BY = BigInt(Y);
  const waste = (n: bigint) => {
    const r = BX % n;
    const s = BY % n;
    const w1 = r * s;
    const w2 = (n - r) * (n - s);
    return w1 < w2 ? w1 : w2;
  };
  const wa = waste(BigInt(a));
  const wb = waste(BigInt(b));
  const w = wa > wb ? wa : wb;
  return Number((BX * BY - w) / (BigInt(a) * BigInt(b)));
}

export function upperBound(L: number, W: number, a: number, b: number): number {
  return Math.min(areaBound(L, W, a, b), barnesBound(L, W, a, b));
}
