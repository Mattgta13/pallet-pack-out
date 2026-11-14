/**
 * Slow but exact reference solver for small integer instances, used only by
 * the tests to check that the fast solver really finds the maximum.
 * Fills cells in row-major order: the first empty cell is either the corner
 * of a box (either orientation) or left empty for good.
 */
export function exactMax(L: number, W: number, a: number, b: number, budgetMs = 2000): number | null {
  const grid = new Uint8Array(L * W);
  const area = a * b;
  let best = 0;
  let free = L * W;
  const deadline = Date.now() + budgetMs;
  let timedOut = false;

  const fits = (x: number, y: number, p: number, q: number) => {
    if (x + p > L || y + q > W) return false;
    for (let j = y; j < y + q; j++)
      for (let i = x; i < x + p; i++) if (grid[j * L + i]) return false;
    return true;
  };
  const set = (x: number, y: number, p: number, q: number, v: number) => {
    for (let j = y; j < y + q; j++) for (let i = x; i < x + p; i++) grid[j * L + i] = v;
  };

  function rec(start: number, count: number): void {
    if (timedOut) return;
    if (Date.now() > deadline) {
      timedOut = true;
      return;
    }
    if (count + Math.floor(free / area) <= best) return;
    let k = start;
    while (k < L * W && grid[k]) k++;
    if (k >= L * W) {
      if (count > best) best = count;
      return;
    }
    const x = k % L;
    const y = Math.floor(k / L);
    const orients = a === b ? [[a, b]] : [[a, b], [b, a]];
    for (const [p, q] of orients) {
      if (fits(x, y, p, q)) {
        set(x, y, p, q, 1);
        free -= area;
        rec(k + 1, count + 1);
        free += area;
        set(x, y, p, q, 0);
      }
    }
    // leave this cell empty
    grid[k] = 2;
    free -= 1;
    rec(k + 1, count);
    free += 1;
    grid[k] = 0;
  }
  rec(0, 0);
  return timedOut ? null : best;
}
