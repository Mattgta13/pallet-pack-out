/**
 * Truck pack-out: unit loads (pallets) on a trailer floor, loaded from the rear
 * door with a forklift. Pallets go in rows across the trailer. A row can hold
 * pallets "straight" (pallet length along the trailer), "turned" (pallet width
 * along the trailer), or a mix of both. The best mix of rows along the trailer is
 * found exactly, then pallets are stacked two high where the height allows and
 * the count is capped by the payload.
 */
import type { Trailer } from './types';

const EPS = 1e-9;

export interface TruckUnit {
  /** Footprint of one unit load (the larger of pallet and load), and its height. */
  length: number;
  width: number;
  height: number;
  /** Gross weight of one unit load, pallet included. */
  weight: number;
}

export interface TruckOptions {
  /** Pallets may be loaded turned 90° (needs 4-way entry or a pallet jack). */
  allowTurn: boolean;
  /** Most tiers: 1, or 2 to double-stack when the height allows. */
  maxTiers: number;
  /** Payload limit to use instead of the trailer's. */
  maxPayload?: number;
}

export interface TruckPosition {
  /** From the trailer's nose (x) and left wall (y). */
  x: number;
  y: number;
  /** Footprint as placed (along the trailer, across). */
  l: number;
  w: number;
  turned: boolean;
  /** Pallets stacked on this spot (0 = empty floor spot). */
  tiers: number;
}

export interface TruckRow {
  straight: number;
  turned: number;
  /** Depth of the row along the trailer. */
  depth: number;
}

export type TruckLimit = 'floor' | 'weight' | 'height';

export interface TruckPlan {
  trailer: Trailer;
  payload: number;
  rows: TruckRow[];
  positions: TruckPosition[];
  /** Floor spots available. */
  floorSpots: number;
  /** Tiers the height allows (capped by the option). */
  tiers: number;
  /** Pallets on the truck. */
  pallets: number;
  limitedBy: TruckLimit;
  /** Length of floor used from the nose. */
  usedLength: number;
  /** Floor area under pallets ÷ trailer floor. */
  floorUtil: number;
  /** Load volume ÷ trailer volume. */
  cubeUtil: number;
  /** Total gross weight of the pallets. */
  weight: number;
  notes: string[];
}

/** Best row of each depth: the most pallets across the trailer width. */
function rowTypes(W: number, u: TruckUnit, allowTurn: boolean): TruckRow[] {
  const best = new Map<number, TruckRow>();
  const maxS = Math.floor((W + EPS) / u.width);
  for (let s = 0; s <= maxS; s++) {
    const rest = W - s * u.width;
    const maxT = allowTurn ? Math.floor((rest + EPS) / u.length) : 0;
    for (let t = 0; t <= maxT; t++) {
      if (s + t === 0) continue;
      const depth = Math.max(s ? u.length : 0, t ? u.width : 0);
      const key = Math.round(depth * 1e6);
      const cur = best.get(key);
      const mixed = s > 0 && t > 0;
      const curMixed = cur ? cur.straight > 0 && cur.turned > 0 : true;
      // Most pallets; on a tie prefer a row of one kind (simpler to load).
      if (!cur || s + t > cur.straight + cur.turned || (s + t === cur.straight + cur.turned && curMixed && !mixed)) {
        best.set(key, { straight: s, turned: t, depth });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.depth - a.depth);
}

export function solveTruck(trailer: Trailer, u: TruckUnit, opt: TruckOptions): TruckPlan {
  const L = trailer.length, W = trailer.width, H = trailer.height;
  const payload = opt.maxPayload ?? trailer.maxPayload;
  const notes: string[] = [];
  const tiers = Math.max(0, Math.min(opt.maxTiers, Math.floor((H + EPS) / u.height)));
  const empty = (limitedBy: TruckLimit): TruckPlan => ({
    trailer, payload, rows: [], positions: [], floorSpots: 0, tiers, pallets: 0, limitedBy,
    usedLength: 0, floorUtil: 0, cubeUtil: 0, weight: 0, notes,
  });
  if (!(u.length > 0 && u.width > 0 && u.height > 0)) return empty('floor');
  if (tiers === 0) {
    notes.push('The unit load is taller than the trailer door.');
    return empty('height');
  }

  // Rows along the trailer: two depths at most, so try every split exactly.
  const types = rowTypes(W, u, opt.allowTurn);
  if (!types.length) {
    notes.push('The pallet is wider than the trailer.');
    return empty('floor');
  }
  const [A, B] = types;
  const cA = A.straight + A.turned;
  const cB = B ? B.straight + B.turned : 0;
  let best = { n: -1, x: 0, y: 0, used: Infinity };
  for (let x = 0; x * A.depth <= L + EPS; x++) {
    const y = B ? Math.floor((L - x * A.depth + EPS) / B.depth) : 0;
    const n = x * cA + y * cB;
    const used = x * A.depth + (B ? y * B.depth : 0);
    if (n > best.n || (n === best.n && used < best.used - EPS)) best = { n, x, y, used };
  }
  const rows: TruckRow[] = [...Array(best.x).fill(A), ...(B ? Array(best.y).fill(B) : [])];

  // Lay the rows out from the nose; each row's pallets side by side, centred across the trailer.
  const spots: TruckPosition[] = [];
  let x = 0;
  for (const r of rows) {
    const across = r.straight * u.width + r.turned * u.length;
    let y = (W - across) / 2;
    for (let i = 0; i < r.straight; i++, y += u.width) spots.push({ x, y, l: u.length, w: u.width, turned: false, tiers: 0 });
    for (let i = 0; i < r.turned; i++, y += u.length) spots.push({ x, y, l: u.width, w: u.length, turned: true, tiers: 0 });
    x += r.depth;
  }

  const byFloor = spots.length * tiers;
  const byWeight = u.weight > 0 ? Math.floor((payload + EPS) / u.weight) : Infinity;
  const pallets = Math.min(byFloor, byWeight);
  const limitedBy: TruckLimit = byWeight < byFloor ? 'weight' : tiers < opt.maxTiers ? 'height' : 'floor';
  if (opt.maxTiers > 1 && tiers < opt.maxTiers) notes.push(`Too tall to stack ${opt.maxTiers} high in this trailer (${round(u.height * opt.maxTiers)} > ${round(H)}).`);

  // One tier on every spot first (from the nose), then the second tier from the nose.
  let left = pallets;
  for (const s of spots) if (left > 0) { s.tiers = 1; left--; }
  for (let t = 1; t < tiers; t++) for (const s of spots) if (left > 0) { s.tiers++; left--; }
  if (limitedBy === 'weight') {
    notes.push(`Payload limit reached at ${pallets} pallets (${round(pallets * u.weight)} of ${round(payload)}).`);
    if (pallets < spots.length) notes.push('Spread the weight over the axles: the plan fills from the nose; adjust spacing when loading.');
  }

  const onFloor = spots.filter((s) => s.tiers > 0);
  return {
    trailer,
    payload,
    rows,
    positions: spots,
    floorSpots: spots.length,
    tiers,
    pallets,
    limitedBy,
    usedLength: onFloor.length ? Math.max(...onFloor.map((s) => s.x + s.l)) : 0,
    floorUtil: (onFloor.length * u.length * u.width) / (L * W),
    cubeUtil: (pallets * u.length * u.width * u.height) / (L * W * H),
    weight: pallets * u.weight,
    notes,
  };
}

const round = (v: number) => Math.round(v * 10) / 10;
