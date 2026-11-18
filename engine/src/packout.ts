/**
 * Full pallet pack-out: orientation × layer pattern × stacking × limits.
 */
import { solveLayer, type LayerSolution, type Placement } from './layer';
import { nestLayer, polygonArea, shapeBridging, type NestLayout, type Pt } from './nest';
import { toInt, toNum } from './units';
import type {
  Box2D,
  LayerPattern,
  LimitingFactor,
  PackOutInput,
  PackOutResult,
} from './types';

const EPS = 1e-9;

interface Orientation {
  name: string;
  a: number; // footprint along X (int)
  b: number; // footprint along Y (int)
  h: number; // vertical (int)
}

function orientations(input: PackOutInput): Orientation[] {
  const p = input.product;
  if (p.kind === 'sheet') {
    return [{ name: 'Flat', a: toInt(p.length), b: toInt(p.width), h: toInt(p.thickness) }];
  }
  const L = toInt(p.length);
  const W = toInt(p.width);
  const H = toInt(p.height);
  const list: Orientation[] = [{ name: 'Height vertical', a: L, b: W, h: H }];
  if (!p.thisSideUp) {
    list.push({ name: 'Width vertical', a: L, b: H, h: W });
    list.push({ name: 'Length vertical', a: W, b: H, h: L });
  }
  // Drop duplicates (e.g. a cube, or two equal sides).
  const seen = new Set<string>();
  return list.filter((o) => {
    const k = `${Math.max(o.a, o.b)}x${Math.min(o.a, o.b)}x${o.h}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- layer geometry (integer units, origin at the layer's own corner) ----------

interface RawLayer {
  boxes: Placement[];
  extL: number;
  extW: number;
}

function raw(boxes: Placement[]): RawLayer {
  let extL = 0;
  let extW = 0;
  for (const p of boxes) {
    extL = Math.max(extL, p.x + p.l);
    extW = Math.max(extW, p.y + p.w);
  }
  return { boxes, extL, extW };
}

const rot180 = (r: RawLayer): RawLayer => ({
  ...r,
  boxes: r.boxes.map((p) => ({ ...p, x: r.extL - p.x - p.l, y: r.extW - p.y - p.w })),
});
const mirrorX = (r: RawLayer): RawLayer => ({
  ...r,
  boxes: r.boxes.map((p) => ({ ...p, x: r.extL - p.x - p.l })),
});
const mirrorY = (r: RawLayer): RawLayer => ({
  ...r,
  boxes: r.boxes.map((p) => ({ ...p, y: r.extW - p.y - p.w })),
});

/**
 * Centre a layer on the pallet, then centre every unit within the free space
 * around it (inside the layer's footprint), so no stack is left pushed against
 * one side of a gap. Units that touch move together as a group.
 */
function centre(r: RawLayer, PL: number, PW: number): Placement[] {
  const dx = (PL - r.extL) / 2;
  const dy = (PW - r.extW) / 2;
  const boxes = r.boxes.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  settle(boxes, 'y', dy, dy + r.extW);
  settle(boxes, 'x', dx, dx + r.extL);
  return boxes;
}

/**
 * Along one axis: push every box as far as it goes to the low side, then to the
 * high side (keeping order), and place it halfway between. Both pushed layouts
 * are valid and keep the same order, so their average is valid too.
 */
function settle(boxes: Placement[], axis: 'x' | 'y', lo: number, hi: number): void {
  const pos = (b: Placement) => (axis === 'x' ? b.x : b.y);
  const len = (b: Placement) => (axis === 'x' ? b.l : b.w);
  const overlapsAcross = (a: Placement, b: Placement) =>
    axis === 'x' ? a.y < b.y + b.w && b.y < a.y + a.w : a.x < b.x + b.l && b.x < a.x + a.l;

  const asc = boxes.map((_, i) => i).sort((i, j) => pos(boxes[i]) - pos(boxes[j]));
  const low = new Array<number>(boxes.length);
  const high = new Array<number>(boxes.length);
  for (let k = 0; k < asc.length; k++) {
    const i = asc[k];
    let v = lo;
    for (let m = 0; m < k; m++) {
      const j = asc[m];
      if (overlapsAcross(boxes[i], boxes[j])) v = Math.max(v, low[j] + len(boxes[j]));
    }
    low[i] = v;
  }
  for (let k = asc.length - 1; k >= 0; k--) {
    const i = asc[k];
    let v = hi - len(boxes[i]);
    for (let m = asc.length - 1; m > k; m--) {
      const j = asc[m];
      if (overlapsAcross(boxes[i], boxes[j])) v = Math.min(v, high[j] - len(boxes[i]));
    }
    high[i] = v;
  }
  for (let i = 0; i < boxes.length; i++) {
    const v = (low[i] + high[i]) / 2;
    if (axis === 'x') boxes[i].x = v;
    else boxes[i].y = v;
  }
}

/** Share of upper boxes resting on 2+ lower boxes. */
export function bridging(lower: Placement[], upper: Placement[]): number {
  if (upper.length === 0) return 0;
  let bridged = 0;
  for (const u of upper) {
    let n = 0;
    for (const d of lower) {
      const ox = Math.min(u.x + u.l, d.x + d.l) - Math.max(u.x, d.x);
      const oy = Math.min(u.y + u.w, d.y + d.w) - Math.max(u.y, d.y);
      if (ox > 0 && oy > 0) n++;
      if (n >= 2) break;
    }
    if (n >= 2) bridged++;
  }
  return bridged / upper.length;
}

function toPattern(boxes: Placement[]): LayerPattern {
  const out: Box2D[] = boxes.map((p) => ({
    x: toNum(p.x),
    y: toNum(p.y),
    l: toNum(p.l),
    w: toNum(p.w),
    rot: p.rot,
    ...(p.turn != null ? { turn: p.turn } : {}),
  }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of boxes) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.l);
    maxY = Math.max(maxY, p.y + p.w);
  }
  return {
    count: boxes.length,
    boxes: out,
    extentL: boxes.length ? toNum(maxX - minX) : 0,
    extentW: boxes.length ? toNum(maxY - minY) : 0,
  };
}

/** Pick the alternate layer with the most bridging. */
function bestAlternate(
  base: RawLayer,
  others: RawLayer[],
  PL: number,
  PW: number,
): { even: Placement[]; bridging: number } {
  const odd = centre(base, PL, PW);
  const candidates: RawLayer[] = [];
  for (const r of [base, ...others]) candidates.push(rot180(r), mirrorX(r), mirrorY(r), r);
  let best = { even: odd, bridging: 0 };
  for (const c of candidates) {
    const placed = centre(c, PL, PW);
    const br = bridging(odd, placed);
    if (br > best.bridging + EPS) best = { even: placed, bridging: br };
  }
  return best;
}

/** Solve the transposed problem to get a second, often different, layer with the same count. */
function transposedLayer(UL: number, UW: number, a: number, b: number): Placement[] | null {
  const t = solveLayer(UW, UL, b, a);
  return t.placements.map((p) => ({
    x: p.y,
    y: p.x,
    l: p.w,
    w: p.l,
    rot: a === b ? false : !(p.w === a && p.l === b),
  }));
}

/** Every unit the same way round: a plain grid. */
function blockLayer(UL: number, UW: number, a: number, b: number, turned: boolean): LayerSolution {
  const p = turned ? b : a;
  const q = turned ? a : b;
  const nx = Math.floor(UL / p);
  const ny = Math.floor(UW / q);
  const placements: Placement[] = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) placements.push({ x: i * p, y: j * q, l: p, w: q, rot: turned });
  return { count: placements.length, placements, pattern: placements.length ? 'block' : 'empty', exhaustive: true };
}

/** A nested layout as integer placements, centred on the pallet as one group. */
function centreNest(n: NestLayout, PL: number, PW: number): Placement[] {
  const ps = n.placements.map((p) => ({ x: toInt(p.x), y: toInt(p.y), l: toInt(p.l), w: toInt(p.w), rot: p.turn % 2 === 1, turn: p.turn }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ps) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x + p.l); maxY = Math.max(maxY, p.y + p.w); }
  const dx = Math.round((PL - (maxX - minX)) / 2) - minX;
  const dy = Math.round((PW - (maxY - minY)) / 2) - minY;
  return ps.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

/** The same layout turned 180° on the pallet. */
const turnLayer180 = (ps: Placement[], PL: number, PW: number): Placement[] =>
  ps.map((p) => ({ ...p, x: PL - p.x - p.l, y: PW - p.y - p.w, turn: ((p.turn ?? 0) + 2) % 4 }));

const asNest = (ps: Placement[]) => ps.map((p) => ({ x: toNum(p.x), y: toNum(p.y), l: toNum(p.l), w: toNum(p.w), turn: p.turn ?? 0 }));

const TURNS: Record<string, number[]> = { mixed: [0, 1, 2, 3], lengthwise: [0, 2], crosswise: [1, 3] };

export function solvePackOut(input: PackOutInput): PackOutResult[] {
  const { product, pallet, constraints: c } = input;
  const PL = toInt(pallet.length);
  const PW = toInt(pallet.width);
  const UL = PL + 2 * toInt(c.overhangEnds);
  const UW = PW + 2 * toInt(c.overhangSides);
  const usableH = toInt(c.maxHeight) - toInt(pallet.deckHeight);
  const weightBudget = c.maxGrossWeight - pallet.weight;

  if (UL <= 0 || UW <= 0) throw new Error('Usable pallet area is zero; check underhang settings.');
  if (usableH <= 0) throw new Error('Max height is at or below the pallet deck height.');

  const results: PackOutResult[] = [];

  for (const o of orientations(input)) {
    if (o.h > usableH) continue;
    const direction = c.direction ?? 'mixed';
    const best = solveLayer(UL, UW, o.a, o.b);
    const sol = direction === 'mixed' ? best : blockLayer(UL, UW, o.a, o.b, direction === 'crosswise');
    if (sol.count === 0 && !(product.kind === 'sheet' && product.outline)) continue;
    const base = raw(sol.placements);

    // Die-cut shapes: nest the real outlines and use that when it fits more than rectangles.
    const outline = product.kind === 'sheet' && product.outline && product.outline.length >= 3 ? (product.outline as Pt[]) : null;
    const shapeFrac = outline ? polygonArea(outline) : 1;
    let nests: NestLayout[] = [];
    let mixedNest = 0;
    if (outline) {
      const a = toNum(o.a), b = toNum(o.b);
      nests = nestLayer(outline, a, b, toNum(UL), toNum(UW), { turns: TURNS[direction], keep: 4 });
      if (direction !== 'mixed') mixedNest = nestLayer(outline, a, b, toNum(UL), toNum(UW), { turns: TURNS.mixed, keep: 1 })[0]?.count ?? 0;
    }
    const shaped = nests.length > 0 && nests[0].count > sol.count;
    const topNests = shaped ? nests.filter((n) => n.count === nests[0].count) : [];

    const styles: ('column' | 'interlock')[] =
      c.stacking === 'auto' ? ['column', 'interlock'] : [c.stacking];

    for (const style of styles) {
      const notes: string[] = [];
      if (!shaped && !sol.exhaustive)
        notes.push('Very small unit for this pallet: pinwheel search was capped, so a slightly better layer may exist.');
      const count = shaped ? topNests[0].count : sol.count;
      const mixedBest = Math.max(best.count, mixedNest);
      // A locked direction that costs units is reported through mixedPerLayer.
      if (shaped) notes.push(`Die-cut shapes nested (${topNests[0].kind}): ${count} per layer; as plain rectangles only ${sol.count} fit.`);
      const odd = shaped ? centreNest(topNests[0], PL, PW) : centre(base, PL, PW);
      let even = odd;
      let br = 0;
      if (style === 'interlock' && shaped) {
        // Alternate lift: another layout with the same count, or this one turned 180°, whichever ties the stacks below best.
        const a = toNum(o.a), b = toNum(o.b);
        const lower = asNest(odd);
        for (const n of topNests) {
          const cn = centreNest(n, PL, PW);
          for (const cand of [cn, turnLayer180(cn, PL, PW)]) {
            const v = shapeBridging(outline!, a, b, lower, asNest(cand));
            if (v > br + EPS) { br = v; even = cand; }
          }
        }
        if (br === 0) {
          if (c.stacking === 'auto') continue;
          notes.push('No alternate layer with the same count bridges the seams below; stacked as column.');
        }
      } else if (style === 'interlock') {
        const t = direction === 'mixed' ? transposedLayer(UL, UW, o.a, o.b) : null;
        const others = t && t.length === sol.count ? [raw(t)] : [];
        const alt = bestAlternate(base, others, PL, PW);
        if (alt.bridging === 0) {
          if (c.stacking === 'auto') continue; // nothing to compare against column
          notes.push(
            'No alternate layer with the same count bridges the seams below; stacked as column.',
          );
        } else {
          even = alt.even;
          br = alt.bridging;
        }
      }

      if (count === 0) continue;
      const perLayer = count;
      let layers: number;
      let total: number;
      let stackedH: number;
      let limitedBy: LimitingFactor;
      let sheetsPerStack: number | undefined;

      if (product.kind === 'case') {
        const byH = Math.floor(usableH / o.h);
        const byW =
          product.weight > 0 ? Math.floor(weightBudget / (perLayer * product.weight) + EPS) : Infinity;
        const byM = c.maxLayers ?? Infinity;
        layers = Math.min(byH, byW, byM);
        limitedBy = layers === byH ? 'height' : layers === byW ? 'weight' : 'max-layers';
        if (layers <= 0) continue;
        total = perLayer * layers;
        stackedH = layers * o.h;
      } else {
        const byH = Math.floor(usableH / o.h);
        const byW =
          product.weight > 0 ? Math.floor(weightBudget / (perLayer * product.weight) + EPS) : Infinity;
        sheetsPerStack = Math.min(byH, byW);
        limitedBy = sheetsPerStack === byH ? 'height' : 'weight';
        if (sheetsPerStack <= 0) continue;
        if (style === 'interlock') {
          const lift = Math.max(1, Math.floor(c.sheetsPerLift ?? 0));
          if (!c.sheetsPerLift) notes.push('Sheets per lift not set; using 1 sheet per lift.');
          layers = Math.ceil(sheetsPerStack / lift);
        } else {
          layers = 1;
        }
        total = perLayer * sheetsPerStack;
        stackedH = sheetsPerStack * o.h;
      }

      const unitWeight = product.weight;
      const net = total * unitWeight;
      const all = layers > 1 || style === 'interlock' ? [...odd, ...even] : odd;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of all) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + p.l);
        maxY = Math.max(maxY, p.y + p.w);
      }
      const loadL = maxX - minX;
      const loadW = maxY - minY;
      const areaEff = (perLayer * o.a * o.b * shapeFrac) / (PL * PW);

      results.push({
        orientation: o.name,
        unitL: toNum(o.a),
        unitW: toNum(o.b),
        unitH: toNum(o.h),
        stacking: style === 'interlock' && br > 0 ? 'interlock' : 'column',
        direction,
        pattern: shaped ? 'nested' : sol.pattern,
        perLayer,
        layers,
        sheetsPerStack,
        total,
        totalUnits:
          product.kind === 'case' && product.unitsPerCase ? total * product.unitsPerCase : undefined,
        oddLayer: toPattern(odd),
        evenLayer: toPattern(even),
        bridging: br,
        load: {
          length: toNum(loadL),
          width: toNum(loadW),
          height: toNum(toInt(pallet.deckHeight) + stackedH),
        },
        overhang: { ends: toNum((loadL - PL) / 2), sides: toNum((loadW - PW) / 2) },
        netWeight: net,
        grossWeight: net + pallet.weight,
        limitedBy,
        areaEfficiency: areaEff,
        cubeEfficiency: (areaEff * stackedH) / usableH,
        mixedPerLayer: direction !== 'mixed' && mixedBest > count ? mixedBest : undefined,
        notes,
      });
    }
  }

  results.sort(
    (p, q) =>
      q.total - p.total ||
      q.cubeEfficiency - p.cubeEfficiency ||
      (p.stacking === 'column' ? 0 : 1) - (q.stacking === 'column' ? 0 : 1),
  );
  return results;
}
