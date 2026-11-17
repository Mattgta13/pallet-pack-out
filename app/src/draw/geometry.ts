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

type Pt = [number, number, number];

/**
 * The visible part of a strap as flat pieces (each four 3D corners). Across the
 * top it hugs the load, edge to edge; down the front it runs in straight lines
 * to the pallet's top edge, then down the side of the pallet and back under it,
 * the way a tensioned strap sits on a real load. Hidden runs (back face,
 * underside) are left out.
 */
export function strapQuads(boxes: Box3D[], s: Strap, width: number, lift = 0.04): Pt[][] {
  const hw = width / 2;
  const c = s.at;
  const across = (b: Box3D) => (s.axis === 'x' ? [b.y, b.y + b.w] : [b.x, b.x + b.l]);
  const along = (b: Box3D) => (s.axis === 'x' ? [b.x, b.x + b.l] : [b.y, b.y + b.w]);
  const hit = boxes.filter((b) => {
    if (b.kind !== 'unit') return false;
    const [a0, a1] = across(b);
    // Any box under the strap's width, so a strap lying on a seam between rows still counts.
    return a0 < c + hw - 1e-9 && c - hw + 1e-9 < a1;
  });
  if (!hit.length) return [];

  // Group the boxes the strap crosses into horizontal bands (layers or lifts).
  const bands = new Map<number, { z0: number; z1: number; back: number; face: number }>();
  for (const b of hit) {
    const key = Math.round(b.z * 1e4);
    const [a0, a1] = along(b);
    const g = bands.get(key) ?? { z0: b.z, z1: b.z + b.h, back: Infinity, face: -Infinity };
    g.z1 = Math.max(g.z1, b.z + b.h);
    g.back = Math.min(g.back, a0);
    g.face = Math.max(g.face, a1);
    bands.set(key, g);
  }
  const list = [...bands.values()].sort((p, q) => p.z0 - q.z0);

  // Local (along, z) → world point, on one side of the strap's centre line.
  const W = (a: number, side: number, z: number): Pt => (s.axis === 'x' ? [a, c + side * hw, z] : [c + side * hw, a, z]);
  const flat = (a0: number, a1: number, z: number): Pt[] => [W(a0, -1, z), W(a1, -1, z), W(a1, 1, z), W(a0, 1, z)];

  // Pallet edge on the visible side, and the top deck the strap wraps under.
  const pallet = boxes.filter((b) => b.kind !== 'unit');
  const deckTop = list[0].z0;
  const palletFace = pallet.length ? Math.max(...pallet.map((b) => along(b)[1])) : -Infinity;

  const out: Pt[][] = [];
  const top = list[list.length - 1];
  out.push(flat(top.back, top.face + lift, top.z1 + lift));

  // Down the front, the tensioned strap runs in straight lines from the top edge of
  // the load to the bottom edge of the pallet, over the outermost corners of the
  // layers and pallet: with no overhang it slopes out to the pallet's top edge and
  // drops down its side; with overhang it angles back in from the load's bottom edge.
  const end = Math.max(palletFace, list[0].face);
  const byZ = new Map<number, [number, number]>();
  const add = (a: number, z: number) => {
    const k = Math.round(z * 1e4);
    const p = byZ.get(k);
    if (!p || a > p[0]) byZ.set(k, [a, z]);
  };
  for (const g of list) { add(g.face, g.z1); add(g.face, g.z0); }
  add(end, deckTop);
  // Down the pallet to its bottom edge. Where the load overhangs, this angles back in.
  if (Number.isFinite(palletFace)) add(palletFace, 0);
  const pts = [...byZ.values()].sort((p, q) => q[1] - p[1]);
  const hull: [number, number][] = [];
  for (const p of pts) {
    // Drop the last point while it lies on or inside the line from the one before it to p.
    while (hull.length >= 2) {
      const o = hull[hull.length - 2], m = hull[hull.length - 1];
      const onLine = o[0] + ((p[0] - o[0]) * (m[1] - o[1])) / (p[1] - o[1]);
      if (m[0] > onLine + 1e-6) break;
      hull.pop();
    }
    hull.push(p);
  }
  for (let k = 0; k + 1 < hull.length; k++) {
    const [a0, z0] = hull[k], [a1, z1] = hull[k + 1];
    out.push([W(a0 + lift, -1, z0 + lift), W(a0 + lift, 1, z0 + lift), W(a1 + lift, 1, z1), W(a1 + lift, -1, z1)]);
  }
  return out;
}

/** Along-strap extent of a strap in the top view: over the units it crosses and out to the pallet edges. */
export function strapSpan(boxes: { x: number; y: number; l: number; w: number }[], s: Strap, L: number, W: number): [number, number] | null {
  const t = 1e-6; // a strap lying on a seam between rows still counts
  const hit = boxes.filter((b) => (s.axis === 'x' ? b.y <= s.at + t && s.at - t <= b.y + b.w : b.x <= s.at + t && s.at - t <= b.x + b.l));
  if (!hit.length) return null;
  return s.axis === 'x'
    ? [Math.min(0, ...hit.map((b) => b.x)), Math.max(L, ...hit.map((b) => b.x + b.l))]
    : [Math.min(0, ...hit.map((b) => b.y)), Math.max(W, ...hit.map((b) => b.y + b.w))];
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
