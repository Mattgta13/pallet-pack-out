import type { Box2D, Pallet, PackOutResult } from '@packout/engine';

export type BoxKind = 'unit' | 'deck' | 'stringer' | 'block';

export interface Box3D {
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  rot: boolean;
  kind: BoxKind;
  /** Die-cut sheet stacks: thickness of one sheet, so the drawing can show sheet lines. */
  sheetH?: number;
}

/** A strap lying in a vertical plane: along X at y = at, or along Y at x = at. */
export interface Strap {
  axis: 'x' | 'y';
  at: number;
}

export interface Scene {
  boxes: Box3D[];
  straps: Strap[];
  /** Pallet footprint in the current view orientation. */
  L: number;
  W: number;
}

export interface Strapping {
  count: number;
  direction: 'lengthwise' | 'widthwise' | 'both ways';
}

const BOARD_T = 0.75; // deck board thickness, in
const STRINGER_W = 1.5;
const BLOCK = 5.5; // block footprint for block pallets

/** Evenly spread `n` boards of width `bw` along a run of length `len` (first and last flush with the ends). */
function spread(n: number, len: number, bw: number): number[] {
  if (n <= 1) return [(len - bw) / 2];
  return Array.from({ length: n }, (_, i) => (i * (len - bw)) / (n - 1));
}

/**
 * Pallet built from real parts, in inches. Length runs along X.
 *  - 2-way stringer pallet (GMA style): bottom deck boards across the width,
 *    three stringers along the length (forks enter at the X ends), top deck
 *    boards across the width.
 *  - 4-way block pallet: bottom boards along the length, 3 × 3 blocks,
 *    stringer boards along the length, top deck boards across the width.
 */
export function palletBoxes(p: Pallet): Box3D[] {
  const L = p.length;
  const W = p.width;
  const H = p.deckHeight;
  const t = Math.min(BOARD_T, H * 0.16);
  const out: Box3D[] = [];
  const box = (x: number, y: number, z: number, l: number, w: number, h: number, kind: BoxKind) =>
    out.push({ x, y, z, l, w, h, rot: false, kind });

  const topN = Math.max(5, Math.round(L / 7));
  const topW = Math.min(5.5, (L / topN) * 0.72);
  const runners = W > 48 ? 4 : 3;

  if (p.entry === '2-way') {
    const botN = Math.max(3, Math.round(L / 11));
    for (const x of spread(botN, L, topW)) box(x, 0, 0, topW, W, t, 'deck');
    for (const y of spread(runners, W, STRINGER_W)) box(0, y, t, L, STRINGER_W, H - 2 * t, 'stringer');
  } else {
    const bw = Math.min(BLOCK, W / 6);
    const ys = spread(runners, W, bw);
    for (const y of ys) box(0, y, 0, L, bw, t, 'deck');
    const blockH = H - 3 * t;
    for (const y of ys) for (const x of spread(3, L, bw)) box(x, y, t, bw, bw, blockH, 'block');
    for (const y of ys) box(0, y, H - 2 * t, L, bw, t, 'stringer');
  }
  for (const x of spread(topN, L, topW)) box(x, 0, H - t, topW, W, t, 'deck');
  return out;
}

/** Top deck boards only, for the top-view diagrams. */
export function topDeckBoards(p: Pallet): { x: number; l: number }[] {
  const topN = Math.max(5, Math.round(p.length / 7));
  const topW = Math.min(5.5, (p.length / topN) * 0.72);
  return spread(topN, p.length, topW).map((x) => ({ x, l: topW }));
}

/** Expand a result into a 3D scene (pallet coordinates, inches). */
export function loadScene(r: PackOutResult, pallet: Pallet, isSheet: boolean, strapping?: Strapping | null): Scene {
  const out: Box3D[] = palletBoxes(pallet);
  const layerBoxes = (i: number): Box2D[] => (i % 2 === 0 ? r.oddLayer.boxes : r.evenLayer.boxes);

  if (!isSheet) {
    for (let i = 0; i < r.layers; i++) {
      const z = pallet.deckHeight + i * r.unitH;
      for (const b of layerBoxes(i)) out.push({ ...b, z, h: r.unitH, kind: 'unit' });
    }
  } else {
    // Sheets: each lift is one block per stack, with sheet lines drawn on it.
    const sheets = r.sheetsPerStack ?? 0;
    const perLift = r.layers > 0 ? Math.ceil(sheets / r.layers) : sheets;
    let done = 0;
    for (let i = 0; i < r.layers && done < sheets; i++) {
      const n = Math.min(perLift, sheets - done);
      const z = pallet.deckHeight + done * r.unitH;
      for (const b of layerBoxes(i)) out.push({ ...b, z, h: n * r.unitH, kind: 'unit', sheetH: r.unitH });
      done += n;
    }
  }
  return { boxes: out, straps: strapsFor(out, strapping), L: pallet.length, W: pallet.width };
}

/** Evenly spaced straps across the load: 2 straps sit at ¼ and ¾. */
export function strapsFor(boxes: Box3D[], s?: Strapping | null): Strap[] {
  if (!s || s.count < 1) return [];
  const units = boxes.filter((b) => b.kind === 'unit');
  if (!units.length) return [];
  const minX = Math.min(...units.map((b) => b.x));
  const maxX = Math.max(...units.map((b) => b.x + b.l));
  const minY = Math.min(...units.map((b) => b.y));
  const maxY = Math.max(...units.map((b) => b.y + b.w));
  const at = (lo: number, hi: number) => Array.from({ length: s.count }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / s.count);
  const out: Strap[] = [];
  if (s.direction !== 'widthwise') for (const y of at(minY, maxY)) out.push({ axis: 'x', at: y });
  if (s.direction !== 'lengthwise') for (const x of at(minX, maxX)) out.push({ axis: 'y', at: x });
  return out;
}

/** Turn the whole scene 90° clockwise (seen from above) `turns` times. */
export function rotateScene(scene: Scene, turns: number): Scene {
  let { boxes, straps, L, W } = scene;
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
    const w0 = W;
    boxes = boxes.map((b) => ({ ...b, x: w0 - (b.y + b.w), y: b.x, l: b.w, w: b.l }));
    // (x, y) → (W − y, x): a strap along X at y=c becomes along Y at x = W − c, and vice versa.
    straps = straps.map((s) => (s.axis === 'x' ? { axis: 'y', at: w0 - s.at } : { axis: 'x', at: s.at }));
    [L, W] = [W, L];
  }
  return { boxes, straps, L, W };
}

/** Painter's order: level by level from the bottom, back-to-front within a level. */
export function paintOrder(boxes: Box3D[]): Box3D[] {
  const byZ = new Map<number, Box3D[]>();
  for (const b of boxes) {
    const k = Math.round(b.z * 1e4);
    if (!byZ.has(k)) byZ.set(k, []);
    byZ.get(k)!.push(b);
  }
  const out: Box3D[] = [];
  for (const k of [...byZ.keys()].sort((a, b) => a - b)) {
    const rest = byZ.get(k)!.slice();
    while (rest.length) {
      // a box with nothing behind it (smaller x or y, overlapping in the other axis)
      const i = rest.findIndex(
        (a) =>
          !rest.some(
            (b) =>
              b !== a &&
              ((b.x + b.l <= a.x + 1e-9 && b.y < a.y + a.w && a.y < b.y + b.w) ||
                (b.y + b.w <= a.y + 1e-9 && b.x < a.x + a.l && a.x < b.x + b.l) ||
                (b.x + b.l <= a.x + 1e-9 && b.y + b.w <= a.y + 1e-9)),
          ),
      );
      out.push(rest.splice(i < 0 ? 0 : i, 1)[0]);
    }
  }
  return out;
}
