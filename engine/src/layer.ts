/**
 * 2D layer solver: the Manufacturer's Pallet Loading Problem.
 *
 * Fit as many identical a × b rectangles (either way round) as possible into
 * an L × W rectangle. All values are integers (see units.ts).
 *
 * Method:
 *  - Sizes are restricted to "raster points": the lengths that can be built
 *    from whole boxes (i·a + j·b). Any space beyond the largest raster point
 *    can never hold a box, so it is trimmed off. This makes the search exact
 *    and small.
 *  - Guillotine dynamic programme: every rectangle is either filled with a
 *    single-orientation block, or cut straight across into two smaller
 *    rectangles that are solved the same way. This covers block, two-block
 *    and multi-strip patterns.
 *  - First-order non-guillotine (5-block) splits, after Morabito & Morales
 *    (1998): four blocks arranged around a centre block in a pinwheel. This
 *    finds pinwheel/interlock patterns that no straight cut can produce.
 *  - Ties keep the simpler pattern (a block beats a cut, a cut beats a
 *    5-block split).
 */

export interface Placement {
  x: number;
  y: number;
  /** Size along X. */
  l: number;
  /** Size along Y. */
  w: number;
  /** True when the box is turned 90° (its b side runs along X). */
  rot: boolean;
  /** Die-cut shapes: quarter turns of the blank, clockwise seen from above (0–3). */
  turn?: number;
}

export interface LayerSolution {
  count: number;
  placements: Placement[];
  /** Pattern family, for labelling. */
  pattern: 'block' | 'two-block' | 'multi-block' | 'pinwheel' | 'empty';
  /** False if the pinwheel search hit its work limit (count is still valid, maybe not maximal). */
  exhaustive: boolean;
}

/** All lengths i·a + j·b ≤ D, sorted ascending, including 0. */
export function rasterPoints(D: number, a: number, b: number): number[] {
  const s = new Set<number>();
  for (let i = 0; i * a <= D; i++) {
    for (let j = 0; i * a + j * b <= D; j++) s.add(i * a + j * b);
  }
  return [...s].sort((p, q) => p - q);
}

/** Index of the largest raster point ≤ d (R must be sorted and start at 0). */
function normIdx(R: number[], d: number): number {
  let lo = 0;
  let hi = R.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (R[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const blockCount = (X: number, Y: number, p: number, q: number) =>
  Math.floor(X / p) * Math.floor(Y / q);

/** floor(X·Y / (a·b)) without losing precision on large integers. */
const areaCap = (X: number, Y: number, a: number, b: number) =>
  Math.floor((X / a) * (Y / b) + 1e-9);

/**
 * Work limit for 5-block splits. Small boxes on a big pallet produce hundreds
 * of raster points; there the guillotine result almost always meets the upper
 * bound anyway, and an O(n^4) pinwheel search would take minutes.
 */
const MAX_FIVE_EVALS = 20_000_000;
const MAX_FIVE_DEPTH = 2;

export function solveLayer(L: number, W: number, a: number, b: number): LayerSolution {
  if (a <= 0 || b <= 0) throw new Error('Box dimensions must be positive');
  const Rx = rasterPoints(L, a, b);
  const Ry = rasterPoints(W, a, b);
  const nx = Rx.length;
  const ny = Ry.length;

  // Index of norm(R[i] − R[j]) for j ≤ i: the usable size left after a cut.
  const diffTable = (R: number[]) => {
    const n = R.length;
    const t = new Int32Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) t[i * n + j] = normIdx(R, R[i] - R[j]);
    return t;
  };
  const dx = diffTable(Rx);
  const dy = diffTable(Ry);
  const subX = (i: number, j: number) => dx[i * nx + j];
  const subY = (i: number, j: number) => dy[i * ny + j];

  // 5-block splits are used in every sub-rectangle when the raster is small,
  // otherwise only on the full layer.
  const fiveEverywhere = nx * ny <= 900;
  let fiveEvals = 0;
  let exhaustive = true;

  // Memo levels: 0 / 1 = 5-block allowed at that depth, 2 = guillotine only.
  const LEVELS = 3;
  const memoN = new Int32Array(nx * ny * LEVELS).fill(-1);
  const memoKind = new Int8Array(nx * ny * LEVELS); // 0 empty,1 block,2 block rot,3 vcut,4 hcut,5 five
  const memoArg = new Int32Array(nx * ny * LEVELS);
  const fiveArgs = new Map<number, [number, number, number, number]>();

  function level(depth: number, top: boolean) {
    return depth < MAX_FIVE_DEPTH && (fiveEverywhere || top) ? depth : 2;
  }

  /** Best count for the rectangle Rx[i] × Ry[j]. */
  function solve(i: number, j: number, lv: number): number {
    if (i === 0 || j === 0) return 0;
    const key = (lv * ny + j) * nx + i;
    if (memoN[key] >= 0) return memoN[key];
    const X = Rx[i];
    const Y = Ry[j];

    const cap = areaCap(X, Y, a, b);
    const n1 = blockCount(X, Y, a, b);
    const n2 = blockCount(X, Y, b, a);
    let best = Math.max(n1, n2);
    let kind = best === 0 ? 0 : n1 >= n2 ? 1 : 2;
    let arg = 0;
    // Children of straight cuts stay at the same depth but are never "top".
    const cl = lv === 2 ? 2 : fiveEverywhere ? lv : 2;

    if (best < cap) {
      for (let k = 1; k < nx && Rx[k] <= X / 2; k++) {
        const n = solve(k, j, cl) + solve(subX(i, k), j, cl);
        if (n > best) {
          best = n;
          kind = 3;
          arg = k;
          if (best >= cap) break;
        }
      }
    }
    if (best < cap) {
      for (let k = 1; k < ny && Ry[k] <= Y / 2; k++) {
        const n = solve(i, k, cl) + solve(i, subY(j, k), cl);
        if (n > best) {
          best = n;
          kind = 4;
          arg = k;
          if (best >= cap) break;
        }
      }
    }

    // First-order non-guillotine (pinwheel) split.
    //  ┌────────────┬──────┐
    //  │     4      │      │
    //  ├──────┬─────┤  3   │   y2
    //  │      │  5  │      │
    //  │  1   ├─────┴──────┤   y1
    //  │      │     2      │
    //  └──────┴────────────┘
    //        x1     x2
    if (lv < 2 && best < cap && fiveEvals < MAX_FIVE_EVALS) {
      const d = level(lv + 1, false);
      outer: for (let i1 = 1; i1 < i; i1++) {
        for (let i2 = i1 + 1; i2 < i; i2++) {
          for (let j1 = 1; j1 < j; j1++) {
            for (let j2 = j1 + 1; j2 < j; j2++) {
              if (++fiveEvals > MAX_FIVE_EVALS) {
                exhaustive = false;
                break outer;
              }
              const n =
                solve(i1, j2, d) +
                solve(subX(i, i1), j1, d) +
                solve(subX(i, i2), subY(j, j1), d) +
                solve(i2, subY(j, j2), d) +
                solve(subX(i2, i1), subY(j2, j1), d);
              if (n > best) {
                best = n;
                kind = 5;
                fiveArgs.set(key, [i1, i2, j1, j2]);
                if (best >= cap) break outer;
              }
            }
          }
        }
      }
    } else if (lv < 2 && best < cap) {
      exhaustive = false;
    }

    memoN[key] = best;
    memoKind[key] = kind;
    memoArg[key] = arg;
    return best;
  }

  const placements: Placement[] = [];
  const kinds = new Set<string>();

  function place(i: number, j: number, lv: number, ox: number, oy: number): void {
    if (i === 0 || j === 0) return;
    solve(i, j, lv);
    const key = (lv * ny + j) * nx + i;
    const kind = memoKind[key];
    const X = Rx[i];
    const Y = Ry[j];
    const cl = lv === 2 ? 2 : fiveEverywhere ? lv : 2;
    if (kind === 0) return;
    if (kind === 1 || kind === 2) {
      const rot = kind === 2;
      const p = rot ? b : a;
      const q = rot ? a : b;
      kinds.add(rot ? 'R' : 'N');
      const cx = Math.floor(X / p);
      const cy = Math.floor(Y / q);
      for (let u = 0; u < cx; u++)
        for (let v = 0; v < cy; v++) placements.push({ x: ox + u * p, y: oy + v * q, l: p, w: q, rot });
      return;
    }
    if (kind === 3) {
      const k = memoArg[key];
      kinds.add('cut');
      place(k, j, cl, ox, oy);
      place(subX(i, k), j, cl, ox + Rx[k], oy);
      return;
    }
    if (kind === 4) {
      const k = memoArg[key];
      kinds.add('cut');
      place(i, k, cl, ox, oy);
      place(i, subY(j, k), cl, ox, oy + Ry[k]);
      return;
    }
    const [i1, i2, j1, j2] = fiveArgs.get(key)!;
    kinds.add('five');
    const d = level(lv + 1, false);
    const x1 = Rx[i1], x2 = Rx[i2], y1 = Ry[j1], y2 = Ry[j2];
    place(i1, j2, d, ox, oy);
    place(subX(i, i1), j1, d, ox + x1, oy);
    place(subX(i, i2), subY(j, j1), d, ox + x2, oy + y1);
    place(i2, subY(j, j2), d, ox, oy + y2);
    place(subX(i2, i1), subY(j2, j1), d, ox + x1, oy + y1);
  }

  const topLv = level(0, true);
  const count = solve(nx - 1, ny - 1, topLv);
  place(nx - 1, ny - 1, topLv, 0, 0);

  if (placements.length !== count) {
    throw new Error(`Internal error: placed ${placements.length} of ${count}`);
  }

  let pattern: LayerSolution['pattern'] = 'empty';
  if (count > 0) {
    const rots = new Set(placements.map((p) => p.rot));
    if (kinds.has('five')) pattern = 'pinwheel';
    else if (rots.size === 1) pattern = 'block';
    else pattern = countBlocks(placements) <= 2 ? 'two-block' : 'multi-block';
  }
  return { count, placements, pattern, exhaustive };
}

/** Number of maximal same-orientation groups, used only for labelling. */
function countBlocks(ps: Placement[]): number {
  const seen = new Set<number>();
  let groups = 0;
  const touches = (p: Placement, q: Placement) =>
    p.rot === q.rot &&
    ((p.x + p.l === q.x || q.x + q.l === p.x) && p.y < q.y + q.w && q.y < p.y + p.w ||
      (p.y + p.w === q.y || q.y + q.w === p.y) && p.x < q.x + q.l && q.x < p.x + p.l);
  for (let i = 0; i < ps.length; i++) {
    if (seen.has(i)) continue;
    groups++;
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const k = stack.pop()!;
      for (let j = 0; j < ps.length; j++)
        if (!seen.has(j) && touches(ps[k], ps[j])) {
          seen.add(j);
          stack.push(j);
        }
    }
  }
  return groups;
}
