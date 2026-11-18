/**
 * Nesting identical die-cut shapes on a pallet layer.
 *
 * The blank's outline is rasterised on a fine grid, conservatively: a cell is
 * filled if the shape touches it at all, so two placements whose cells don't
 * collide cannot overlap in reality. Each row of a mask is a list of x-intervals,
 * which turns "how far must B move to clear A at this vertical offset" into
 * exact interval arithmetic.
 *
 * Layouts tried:
 *  - a lattice of single shapes (any of the four quarter turns), each row offset
 *    sideways so shapes slot into the row below (tabs into notches);
 *  - a lattice of nested pairs: a shape and a copy turned 180°, pushed together
 *    as tightly as their outlines allow;
 *  - the pallet split in two (along either axis) with a different lattice in each part.
 * Every final layout is checked against the true polygons for overlap.
 */

export type Pt = [number, number];

/** Quarter turn of normalised blank coordinates, clockwise seen from above (y down). */
const turnUV = ([u, v]: Pt): Pt => [1 - v, u];

/** The outline in real units for a blank a (along u) × b (along v), turned `t` quarter turns. */
export function turnedOutline(outline: Pt[], a: number, b: number, t: number): { pts: Pt[]; l: number; w: number } {
  const k = ((t % 4) + 4) % 4;
  const l = k % 2 ? b : a;
  const w = k % 2 ? a : b;
  const pts = outline.map((p) => {
    let q = p;
    for (let i = 0; i < k; i++) q = turnUV(q);
    return [q[0] * l, q[1] * w] as Pt;
  });
  return { pts, l, w };
}

export function polygonArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

// ---------------------------------------------------------------- masks

interface Mask {
  /** Size in cells. */
  w: number;
  h: number;
  /** Per row: sorted, disjoint [x0, x1) cell intervals. */
  rows: number[][];
  cells: number;
}

/** x-intervals of the polygon cut by the horizontal line y. */
function crossSection(p: Pt[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0, n = p.length; i < n; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % n];
    if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
  }
  return xs.sort((a, b) => a - b);
}

function mergeIntervals(iv: number[][]): number[] {
  iv.sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  for (const [a, b] of iv) {
    if (out.length && a <= out[out.length - 1]) out[out.length - 1] = Math.max(out[out.length - 1], b);
    else out.push(a, b);
  }
  return out;
}

/**
 * Conservative raster of a polygon placed with its bounding box at the origin.
 * Between consecutive vertex heights every cross-section interval moves linearly,
 * so the union over a band is the hull of each interval at the band's two ends.
 */
function rasterise(p: Pt[], l: number, w: number, cell: number): Mask {
  const cols = Math.ceil(l / cell - 1e-9);
  const nrows = Math.ceil(w / cell - 1e-9);
  const vys = [...new Set(p.map((q) => q[1]))].sort((a, b) => a - b);
  const rows: number[][] = [];
  let cells = 0;
  const eps = cell * 1e-6;
  for (let r = 0; r < nrows; r++) {
    const y0 = r * cell, y1 = Math.min(w, (r + 1) * cell);
    const levels = [y0, ...vys.filter((y) => y > y0 && y < y1), y1];
    const iv: number[][] = [];
    for (let k = 0; k + 1 < levels.length; k++) {
      const ya = levels[k], yb = levels[k + 1];
      if (yb - ya < eps * 2) continue;
      const a = crossSection(p, ya + eps), b = crossSection(p, yb - eps), m = crossSection(p, (ya + yb) / 2);
      if (a.length === b.length && a.length === m.length) {
        for (let i = 0; i + 1 < a.length; i += 2) iv.push([Math.min(a[i], b[i]), Math.max(a[i + 1], b[i + 1])]);
      } else {
        for (const s of [a, b, m]) for (let i = 0; i + 1 < s.length; i += 2) iv.push([s[i], s[i + 1]]);
      }
    }
    const cellsIv = iv.map(([a, b]) => [Math.max(0, Math.floor(a / cell + 1e-7)), Math.min(cols, Math.ceil(b / cell - 1e-7))]).filter(([a, b]) => b > a);
    const merged = mergeIntervals(cellsIv);
    for (let i = 0; i < merged.length; i += 2) cells += merged[i + 1] - merged[i];
    rows.push(merged);
  }
  return { w: cols, h: nrows, rows, cells };
}

/** Union of masks, each shifted (dx, dy) ≥ 0. */
function unionMask(parts: { m: Mask; dx: number; dy: number }[]): Mask {
  const w = Math.max(...parts.map((p) => p.dx + p.m.w));
  const h = Math.max(...parts.map((p) => p.dy + p.m.h));
  const rows: number[][] = [];
  let cells = 0;
  for (let r = 0; r < h; r++) {
    const iv: number[][] = [];
    for (const { m, dx, dy } of parts) {
      const row = m.rows[r - dy];
      if (!row) continue;
      for (let i = 0; i < row.length; i += 2) iv.push([row[i] + dx, row[i + 1] + dx]);
    }
    const merged = mergeIntervals(iv);
    for (let i = 0; i < merged.length; i += 2) cells += merged[i + 1] - merged[i];
    rows.push(merged);
  }
  return { w, h, rows, cells };
}

/** Integer shifts vx at which B, placed at (vx, dy), would overlap A. Merged closed intervals. */
function forbidden(A: Mask, B: Mask, dy: number): number[] {
  const iv: number[][] = [];
  for (let r = Math.max(0, dy); r < Math.min(A.h, dy + B.h); r++) {
    const ra = A.rows[r], rb = B.rows[r - dy];
    for (let i = 0; i < ra.length; i += 2)
      for (let j = 0; j < rb.length; j += 2) iv.push([ra[i] - rb[j + 1] + 1, ra[i + 1] - rb[j] - 1]);
  }
  iv.sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  for (const [a, b] of iv) {
    if (b < a) continue;
    if (out.length && a <= out[out.length - 1] + 1) out[out.length - 1] = Math.max(out[out.length - 1], b);
    else out.push(a, b);
  }
  return out;
}

const isForbidden = (F: number[], v: number) => {
  for (let i = 0; i < F.length; i += 2) if (v >= F[i] && v <= F[i + 1]) return true;
  return false;
};

function minFree(F: number[], lo: number): number {
  let v = lo;
  for (let i = 0; i < F.length; i += 2) {
    if (F[i + 1] < v) continue;
    if (F[i] > v) break;
    v = F[i + 1] + 1;
  }
  return v;
}

// ---------------------------------------------------------------- motifs and lattices

interface Part {
  /** Offset inside the motif, real units. */
  dx: number;
  dy: number;
  turn: number;
}

interface Motif {
  /** Conservative raster, for the fast search. */
  mask: Mask;
  parts: Part[];
  /** Real bounding size. */
  w: number;
  h: number;
}

interface CellLattice {
  sx: number;
  ox: number;
  oy: number;
}

interface Lattice {
  motif: Motif;
  /** Step along a row, next-row sideways offset, row pitch (real units). */
  sx: number;
  ox: number;
  oy: number;
}

/** Candidate lattices in grid cells, from the conservative raster. */
function cellLattices(M: Mask): CellLattice[] {
  const F0 = forbidden(M, M, 0);
  let sx = minFree(F0, 1);
  for (let guard = 0; guard < 1000; guard++) {
    let ok = true;
    for (let k = 2; k * sx <= M.w + sx; k++) if (isForbidden(F0, k * sx)) { ok = false; break; }
    if (ok) break;
    sx = minFree(F0, sx + 1);
  }
  const out: CellLattice[] = [];
  const valid = (ox: number, oy: number) => {
    for (let m = 1; m * oy < M.h; m++) {
      const F = forbidden(M, M, m * oy);
      const res = (((m * ox) % sx) + sx) % sx;
      for (let k = -Math.ceil(M.w / sx) - 1; k <= Math.ceil(M.w / sx) + 1; k++) if (isForbidden(F, res + k * sx)) return false;
    }
    return true;
  };
  let foundShear = false;
  let foundAligned = false;
  for (let oy = 1; oy <= M.h && !(foundShear && foundAligned); oy++) {
    const F = forbidden(M, M, oy);
    const bad = new Uint8Array(sx);
    for (let i = 0; i < F.length; i += 2) {
      if (F[i + 1] - F[i] + 1 >= sx) { bad.fill(1); break; }
      for (let v = F[i]; v <= F[i + 1]; v++) bad[((v % sx) + sx) % sx] = 1;
    }
    if (!foundShear) {
      const free: number[] = [];
      for (let r = 1; r < sx; r++) if (!bad[r]) free.push(r);
      if (free.length) {
        // A spread of the free sideways offsets: the fit at the pallet edges differs.
        const pick = free.length <= 5 ? free : [0, 1, 2, 3, 4].map((i) => free[Math.round((i * (free.length - 1)) / 4)]);
        for (const ox of new Set(pick)) if (valid(ox, oy)) { out.push({ sx, ox, oy }); foundShear = true; }
      }
    }
    if (!foundAligned && !bad[0] && valid(0, oy)) {
      out.push({ sx, ox: 0, oy });
      foundAligned = true;
    }
  }
  return out;
}

/**
 * Smallest value in (lo, hi] that is clear, by bisection against the exact
 * outlines. `hi` is known clear (from the conservative raster).
 */
function tighten(lo: number, hi: number, clear: (v: number) => boolean, tol: number): number {
  if (clear(lo)) return lo;
  for (let i = 0; i < 30 && hi - lo > tol; i++) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ---------------------------------------------------------------- real-unit counting

/** Most motifs of a lattice inside a w × h region, and the row phase that achieves it. */
function latticeCount(L: Lattice, w: number, h: number): { n: number; phase: number } {
  const { w: mw, h: mh } = L.motif;
  const e = 1e-9 * Math.max(w, h, 1);
  if (mw > w + e || mh > h + e) return { n: 0, phase: 0 };
  const rowsN = Math.floor((h - mh + e) / L.oy) + 1;
  let best = { n: 0, phase: 0 };
  const steps = 32;
  for (let s = 0; s < steps; s++) {
    const phase = (s * L.sx) / steps;
    let n = 0;
    for (let j = 0; j < rowsN; j++) {
      const start = mod(phase + j * L.ox, L.sx);
      if (start <= w - mw + e) n += Math.floor((w - mw - start + e) / L.sx) + 1;
    }
    if (n > best.n) best = { n, phase };
  }
  return { n: best.n * L.motif.parts.length, phase: best.phase };
}

const mod = (v: number, m: number) => ((v % m) + m) % m;

function latticeCells(L: Lattice, w: number, h: number, phase: number, x0: number, y0: number) {
  const { w: mw, h: mh } = L.motif;
  const e = 1e-9 * Math.max(w, h, 1);
  const out: { x: number; y: number; turn: number }[] = [];
  const rowsN = Math.floor((h - mh + e) / L.oy) + 1;
  for (let j = 0; j < rowsN; j++) {
    const start = mod(phase + j * L.ox, L.sx);
    for (let x = start; x <= w - mw + e; x += L.sx)
      for (const p of L.motif.parts) out.push({ x: x0 + x + p.dx, y: y0 + j * L.oy + p.dy, turn: p.turn });
  }
  return out;
}

// ---------------------------------------------------------------- exact overlap check

function segCross(a: Pt, b: Pt, c: Pt, d: Pt, eps: number): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}

function inside(p: Pt[], q: Pt): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Interior points of a polygon (cell centres well inside it), for containment tests. */
function interiorPoints(p: Pt[], n = 6): Pt[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const q: Pt = [x0 + ((i + 0.5) * (x1 - x0)) / n, y0 + ((j + 0.5) * (y1 - y0)) / n];
      if (inside(p, q)) out.push(q);
    }
  return out;
}

/** True when two polygons' interiors overlap (touching edges don't count). */
export function polygonsOverlap(a: Pt[], b: Pt[], eps = 1e-9): boolean {
  const bb = (p: Pt[]) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  };
  const A = bb(a), B = bb(b);
  if (A[2] <= B[0] + eps || B[2] <= A[0] + eps || A[3] <= B[1] + eps || B[3] <= A[1] + eps) return false;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) if (segCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length], eps)) return true;
  return interiorPoints(a).some((q) => inside(b, q)) || interiorPoints(b).some((q) => inside(a, q));
}

// ---------------------------------------------------------------- solver

export interface NestPlacement {
  x: number;
  y: number;
  /** Bounding box of the turned shape. */
  l: number;
  w: number;
  /** Quarter turns of the blank, clockwise seen from above. */
  turn: number;
}

export interface NestLayout {
  count: number;
  placements: NestPlacement[];
  /** e.g. "nested pairs, rows offset" — for notes. */
  kind: string;
}

export interface NestOptions {
  /** Allowed quarter turns. */
  turns: number[];
  /** Grid cells across the larger side of the region (resolution). */
  resolution?: number;
  /** How many best distinct layouts to return (for interlock alternates). */
  keep?: number;
}

/**
 * Best layouts of identical shapes (outline normalised to the blank, u along a)
 * inside an RL × RW region. Coordinates are real numbers from the region's corner.
 */
export function nestLayer(outline: Pt[], a: number, b: number, RL: number, RW: number, opts: NestOptions): NestLayout[] {
  const cell = Math.max(RL, RW) / (opts.resolution ?? 360);
  const turns = [...new Set(opts.turns.map((t) => ((t % 4) + 4) % 4))];
  const shapes = new Map<number, { pts: Pt[]; l: number; w: number; mask: Mask }>();
  for (let t = 0; t < 4; t++) {
    const s = turnedOutline(outline, a, b, t);
    shapes.set(t, { ...s, mask: rasterise(s.pts, s.l, s.w, cell) });
  }

  const tol = cell * 1e-3;
  const polyAt = (t: number, x: number, y: number) => shapes.get(t)!.pts.map(([px, py]) => [px + x, py + y] as Pt);
  const motifPolys = (m: { parts: Part[] }, x: number, y: number) => m.parts.map((p) => polyAt(p.turn, p.dx + x, p.dy + y));
  /** No overlap between the motif at the origin and copies at the given offsets. */
  const clearOf = (m: { parts: Part[] }, offs: Pt[]) => {
    const base = motifPolys(m, 0, 0);
    for (const [x, y] of offs) for (const q of motifPolys(m, x, y)) for (const p of base) if (polygonsOverlap(p, q, tol * 1e-3)) return false;
    return true;
  };

  // Motifs: each allowed single, and each nested pair (turn t with t + 2) when both are allowed.
  const motifs: { m: Motif; kind: string }[] = [];
  for (const t of turns) {
    const sh = shapes.get(t)!;
    motifs.push({ m: { mask: sh.mask, parts: [{ dx: 0, dy: 0, turn: t }], w: sh.l, h: sh.w }, kind: 'single' });
  }
  for (const t of turns) {
    const t2 = (t + 2) % 4;
    if (!turns.includes(t2) || t2 < t) continue;
    const SA = shapes.get(t)!, SB = shapes.get(t2)!;
    const A = SA.mask, B = SB.mask;
    let best: { area: number; vx: number; vy: number } | null = null;
    for (let vy = -B.h + 1; vy < A.h; vy++) {
      const vx = minFree(forbidden(A, B, vy), -B.w + 1);
      const area = (Math.max(A.w, vx + B.w) - Math.min(0, vx)) * (Math.max(A.h, vy + B.h) - Math.min(0, vy));
      if (!best || area < best.area) best = { area, vx, vy };
    }
    if (!best) continue;
    // Pull B in against A's true outline.
    const vy = best.vy * cell;
    const clearPair = (vx: number) => !polygonsOverlap(SA.pts, polyAt(t2, vx, vy), tol * 1e-3);
    const vx = tighten((best.vx - 1) * cell, best.vx * cell, clearPair, tol);
    const x0 = Math.min(0, vx), y0 = Math.min(0, vy);
    const w = Math.max(SA.l, vx + SB.l) - x0, h = Math.max(SA.w, vy + SB.w) - y0;
    // Only worth it when the two genuinely tuck into each other.
    if (w * h >= SA.l * SA.w * 2 * 0.995) continue;
    const parts = [{ dx: -x0, dy: -y0, turn: t }, { dx: vx - x0, dy: vy - y0, turn: t2 }];
    const ax = Math.max(0, -best.vx), ay = Math.max(0, -best.vy);
    const mask = unionMask([{ m: A, dx: ax, dy: ay }, { m: B, dx: ax + best.vx, dy: ay + best.vy }]);
    motifs.push({ m: { mask, parts, w, h }, kind: 'pair' });
  }

  // Lattices: found on the raster, then tightened against the true outlines.
  const lattices: { L: Lattice; kind: string }[] = [];
  for (const { m, kind } of motifs) {
    for (const cl of cellLattices(m.mask)) {
      const kRange = (sx: number) => Math.ceil(m.w / sx) + 1;
      const sx = tighten((cl.sx - 1) * cell, cl.sx * cell, (v) => clearOf(m, Array.from({ length: kRange(v) }, (_, k) => [(k + 1) * v, 0] as Pt)), tol);
      const ox = cl.ox * cell;
      const rowsClear = (oy: number) => {
        const offs: Pt[] = [];
        for (let r = 1; r * oy < m.h + oy; r++)
          for (let k = -kRange(sx); k <= kRange(sx); k++) offs.push([r * ox + k * sx, r * oy]);
        return clearOf(m, offs);
      };
      const oy = tighten((cl.oy - 1) * cell, cl.oy * cell, rowsClear, tol);
      if (sx > 0 && oy > 0) lattices.push({ L: { motif: m, sx, ox, oy }, kind });
    }
  }

  type Cand = { count: number; cells: { x: number; y: number; turn: number }[]; kind: string };
  const bestIn = (w: number, h: number) => {
    let best: { n: number; L: Lattice; phase: number; kind: string } | null = null;
    for (const { L, kind } of lattices) {
      const r = latticeCount(L, w, h);
      if (r.n > (best?.n ?? 0)) best = { n: r.n, L, phase: r.phase, kind };
    }
    return best;
  };

  const cands: Cand[] = [];
  // Whole region, every lattice.
  for (const { L, kind } of lattices) {
    const r = latticeCount(L, RL, RW);
    if (r.n) cands.push({ count: r.n, cells: latticeCells(L, RL, RW, r.phase, 0, 0), kind: kindLabel(kind, L) });
  }
  // Two zones, split across X or across Y.
  const nCuts = 120;
  for (const axis of ['x', 'y'] as const) {
    const span = axis === 'x' ? RL : RW;
    for (let i = 1; i < nCuts; i++) {
      const c = (span * i) / nCuts;
      const p = axis === 'x' ? bestIn(c, RW) : bestIn(RL, c);
      const q = axis === 'x' ? bestIn(RL - c, RW) : bestIn(RL, RW - c);
      if (!p || !q) continue;
      const n = p.n + q.n;
      if (cands.length && n <= Math.max(...cands.map((k) => k.count))) continue;
      const cells = axis === 'x'
        ? [...latticeCells(p.L, c, RW, p.phase, 0, 0), ...latticeCells(q.L, RL - c, RW, q.phase, c, 0)]
        : [...latticeCells(p.L, RL, c, p.phase, 0, 0), ...latticeCells(q.L, RL, RW - c, q.phase, 0, c)];
      cands.push({ count: n, cells, kind: 'two zones' });
    }
  }

  cands.sort((p, q) => q.count - p.count);
  const out: NestLayout[] = [];
  const seen = new Set<string>();
  for (const c of cands) {
    if (out.length >= (opts.keep ?? 4)) break;
    const placements = c.cells.map(({ x, y, turn }) => {
      const s = shapes.get(turn)!;
      return { x, y, l: s.l, w: s.w, turn };
    });
    const key = placements.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.turn}`).sort().join(';');
    if (seen.has(key)) continue;
    seen.add(key);
    if (!verify(placements, shapes, RL, RW)) continue;
    out.push({ count: placements.length, placements, kind: c.kind });
  }
  return out;
}

function kindLabel(kind: string, L: Lattice): string {
  const base = kind === 'pair' ? 'nested pairs' : 'single shapes';
  return L.ox ? `${base}, rows offset` : base;
}

/** Exact check: inside the region and no two shapes overlapping. */
function verify(ps: NestPlacement[], shapes: Map<number, { pts: Pt[] }>, RL: number, RW: number): boolean {
  const tol = 1e-9 * Math.max(RL, RW);
  const polys = ps.map((p) => shapes.get(p.turn)!.pts.map(([x, y]) => [x + p.x, y + p.y] as Pt));
  for (const p of ps) if (p.x < -tol || p.y < -tol || p.x + p.l > RL + tol || p.y + p.w > RW + tol) return false;
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++) if (polygonsOverlap(polys[i], polys[j], tol)) return false;
  return true;
}

/** Share of upper shapes resting on two or more lower shapes (by real overlap area, sampled). */
export function shapeBridging(outline: Pt[], a: number, b: number, lower: NestPlacement[], upper: NestPlacement[]): number {
  if (!upper.length) return 0;
  const polys = new Map<number, Pt[]>();
  for (let t = 0; t < 4; t++) polys.set(t, turnedOutline(outline, a, b, t).pts);
  const place = (p: NestPlacement) => polys.get(((p.turn % 4) + 4) % 4)!.map(([x, y]) => [x + p.x, y + p.y] as Pt);
  const lowerPolys = lower.map((p) => ({ p, poly: place(p) }));
  let bridged = 0;
  for (const u of upper) {
    const up = place(u);
    const samples = interiorPoints(up, 10);
    if (!samples.length) continue;
    let n = 0;
    for (const { p, poly } of lowerPolys) {
      if (p.x >= u.x + u.l || u.x >= p.x + p.l || p.y >= u.y + u.w || u.y >= p.y + p.w) continue;
      const hits = samples.filter((q) => inside(poly, q)).length;
      if (hits >= Math.max(1, samples.length * 0.03)) n++;
      if (n >= 2) break;
    }
    if (n >= 2) bridged++;
  }
  return bridged / upper.length;
}
