/**
 * Custom die lines: read a DXF or SVG file, split cut lines from creases, find the
 * blank's outer outline, and keep it all in coordinates normalised to the blank's
 * bounding box (u along the file's X, v along the file's Y, both 0…1, v down).
 * Packing still uses that bounding rectangle; the shape is for the drawings and
 * the sheet weight.
 */

export type DieUnit = 'in' | 'mm' | 'cm' | 'pt' | 'px';
export type UV = [number, number];

export const DIE_UNITS: { value: DieUnit; label: string; toIn: number }[] = [
  { value: 'in', label: 'Inches', toIn: 1 },
  { value: 'mm', label: 'Millimetres', toIn: 1 / 25.4 },
  { value: 'cm', label: 'Centimetres', toIn: 1 / 2.54 },
  { value: 'pt', label: 'Points (1/72 in)', toIn: 1 / 72 },
  { value: 'px', label: 'Pixels (1/96 in)', toIn: 1 / 96 },
];

export interface DieLine {
  name: string;
  format: 'dxf' | 'svg';
  /** Bounding size in file units. */
  rawW: number;
  rawH: number;
  unit: DieUnit;
  /** How the unit was decided, for the UI. */
  unitSource: 'file' | 'guess' | 'user';
  /** Outer outline of the blank (closed). */
  outline: UV[];
  cut: UV[][];
  crease: UV[][];
  /** Outline area ÷ bounding-box area. */
  areaFraction: number;
  /** True when no closed outline was found and the outline is the convex hull. */
  approxOutline: boolean;
}

export const unitToIn = (u: DieUnit) => DIE_UNITS.find((d) => d.value === u)!.toIn;

/** Die-line size in inches, file X × file Y. */
export function dieSize(d: DieLine): [number, number] {
  const f = unitToIn(d.unit);
  return [d.rawW * f, d.rawH * f];
}

type XY = [number, number];
interface RawPath {
  pts: XY[];
  crease: boolean;
}

const CREASE_RE = /crease|score|fold|perf|bend|rule.?2|kiss/i;
const IGNORE_RE = /^(dim|dims|dimension|dimensions|text|notes?|title|annotation|bleed|print|graphics?|art|artwork|varnish|glue)$/i;

// ---------------------------------------------------------------- DXF

function bulgeArc(p0: XY, p1: XY, b: number): XY[] {
  const theta = 4 * Math.atan(b);
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const chord = Math.hypot(dx, dy);
  if (!chord || Math.abs(b) < 1e-9) return [p1];
  const h = chord / 2 / Math.tan(theta / 2);
  const cx = (p0[0] + p1[0]) / 2 - (dy / chord) * h;
  const cy = (p0[1] + p1[1]) / 2 + (dx / chord) * h;
  const r = Math.hypot(p0[0] - cx, p0[1] - cy);
  const a0 = Math.atan2(p0[1] - cy, p0[0] - cx);
  const n = Math.max(4, Math.ceil(Math.abs(theta) / (Math.PI / 36)));
  const out: XY[] = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + (theta * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  out[out.length - 1] = p1;
  return out;
}

function arcPts(cx: number, cy: number, rx: number, ry: number, rotation: number, a0: number, a1: number): XY[] {
  while (a1 <= a0) a1 += 2 * Math.PI;
  const n = Math.max(8, Math.ceil((a1 - a0) / (Math.PI / 36)));
  const cr = Math.cos(rotation), sr = Math.sin(rotation);
  const out: XY[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = rx * Math.cos(a), y = ry * Math.sin(a);
    out.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return out;
}

/** B-spline points by de Boor's algorithm. */
function splinePts(ctrl: XY[], knots: number[], degree: number): XY[] {
  const n = ctrl.length;
  if (n < 2) return ctrl;
  if (knots.length !== n + degree + 1) return ctrl;
  const lo = knots[degree], hi = knots[n];
  const steps = Math.max(16, n * 8);
  const out: XY[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s === steps ? hi - 1e-9 * (hi - lo) : lo + ((hi - lo) * s) / steps;
    let k = degree;
    while (k < n - 1 && t >= knots[k + 1]) k++;
    const d: XY[] = [];
    for (let j = 0; j <= degree; j++) d.push([...ctrl[k - degree + j]] as XY);
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const i = k - degree + j;
        const den = knots[i + degree + 1 - r] - knots[i];
        const a = den ? (t - knots[i]) / den : 0;
        d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]];
      }
    }
    out.push(d[degree]);
  }
  return out;
}

const INSUNITS: Record<number, DieUnit | 'ft' | 'm'> = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };

export function parseDxf(text: string): { paths: RawPath[]; unit: DieUnit | null; scale: number } {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(c)) throw new Error('This does not look like a text (ASCII) DXF file.');
    pairs.push([c, lines[i + 1].trim()]);
  }

  let unit: DieUnit | null = null;
  let scale = 1;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === 9 && pairs[i][1] === '$INSUNITS') {
      const v = INSUNITS[parseInt(pairs[i + 1]?.[1] ?? '0', 10)];
      if (v === 'ft') { unit = 'in'; scale = 12; } else if (v === 'm') { unit = 'mm'; scale = 1000; } else if (v) unit = v;
      break;
    }
  }

  // Entities section only.
  let start = -1, end = pairs.length;
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i][0] === 0 && pairs[i][1] === 'SECTION' && pairs[i + 1][0] === 2 && pairs[i + 1][1] === 'ENTITIES') start = i + 2;
    else if (start >= 0 && pairs[i][0] === 0 && pairs[i][1] === 'ENDSEC') { end = i; break; }
  }
  if (start < 0) throw new Error('No ENTITIES section in this DXF file.');

  type Ent = { type: string; g: [number, string][] };
  const ents: Ent[] = [];
  for (let i = start; i < end; i++) {
    if (pairs[i][0] === 0) ents.push({ type: pairs[i][1], g: [] });
    else ents[ents.length - 1]?.g.push(pairs[i]);
  }

  const paths: RawPath[] = [];
  let sawInsert = false;
  const num = (e: Ent, c: number, d = 0) => {
    const p = e.g.find((x) => x[0] === c);
    return p ? parseFloat(p[1]) : d;
  };
  const str = (e: Ent, c: number) => e.g.find((x) => x[0] === c)?.[1] ?? '';
  const push = (e: Ent, pts: XY[]) => {
    const layer = str(e, 8), ltype = str(e, 6);
    if (IGNORE_RE.test(layer) || pts.length < 2) return;
    paths.push({ pts, crease: CREASE_RE.test(layer) || /dash|hidden|dot|center/i.test(ltype) });
  };
  const polyWithBulges = (verts: { p: XY; b: number }[], closed: boolean): XY[] => {
    if (!verts.length) return [];
    const out: XY[] = [verts[0].p];
    const n = verts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = verts[i], b = verts[(i + 1) % n];
      if (Math.abs(a.b) > 1e-9) out.push(...bulgeArc(a.p, b.p, a.b));
      else out.push(b.p);
    }
    return out;
  };

  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    switch (e.type) {
      case 'LINE':
        push(e, [[num(e, 10), num(e, 20)], [num(e, 11), num(e, 21)]]);
        break;
      case 'LWPOLYLINE': {
        const verts: { p: XY; b: number }[] = [];
        for (const [c, v] of e.g) {
          if (c === 10) verts.push({ p: [parseFloat(v), 0], b: 0 });
          else if (c === 20 && verts.length) verts[verts.length - 1].p[1] = parseFloat(v);
          else if (c === 42 && verts.length) verts[verts.length - 1].b = parseFloat(v);
        }
        push(e, polyWithBulges(verts, (num(e, 70) & 1) === 1));
        break;
      }
      case 'POLYLINE': {
        const flags = num(e, 70);
        const verts: { p: XY; b: number }[] = [];
        let j = i + 1;
        for (; j < ents.length && ents[j].type === 'VERTEX'; j++) verts.push({ p: [num(ents[j], 10), num(ents[j], 20)], b: num(ents[j], 42) });
        i = j; // skip SEQEND
        if (!(flags & (16 | 64))) push(e, polyWithBulges(verts, (flags & 1) === 1));
        break;
      }
      case 'ARC': {
        const d = Math.PI / 180;
        push(e, arcPts(num(e, 10), num(e, 20), num(e, 40), num(e, 40), 0, num(e, 50) * d, num(e, 51) * d));
        break;
      }
      case 'CIRCLE':
        push(e, arcPts(num(e, 10), num(e, 20), num(e, 40), num(e, 40), 0, 0, 2 * Math.PI));
        break;
      case 'ELLIPSE': {
        const mx = num(e, 11), my = num(e, 21);
        const rx = Math.hypot(mx, my);
        push(e, arcPts(num(e, 10), num(e, 20), rx, rx * num(e, 40, 1), Math.atan2(my, mx), num(e, 41, 0), num(e, 42, 2 * Math.PI)));
        break;
      }
      case 'SPLINE': {
        const fit: XY[] = [], ctrl: XY[] = [], knots: number[] = [];
        for (const [c, v] of e.g) {
          if (c === 11) fit.push([parseFloat(v), 0]);
          else if (c === 21 && fit.length) fit[fit.length - 1][1] = parseFloat(v);
          else if (c === 10) ctrl.push([parseFloat(v), 0]);
          else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1][1] = parseFloat(v);
          else if (c === 40) knots.push(parseFloat(v));
        }
        push(e, ctrl.length >= 2 ? splinePts(ctrl, knots, num(e, 71, 3)) : fit);
        break;
      }
      case 'INSERT':
        sawInsert = true;
        break;
    }
  }
  if (!paths.length) {
    throw new Error(sawInsert ? 'The drawing is inside blocks. Explode the blocks in your CAD program and export again.' : 'No lines found in this DXF file.');
  }
  if (scale !== 1) for (const p of paths) p.pts = p.pts.map(([x, y]) => [x * scale, y * scale]);
  return { paths, unit, scale };
}

// ---------------------------------------------------------------- SVG

const SVG_UNIT_RE = /^\s*([\d.]+)\s*(in|mm|cm|pt|pc|px)?\s*$/i;

/** Parse an SVG in the page (it needs layout to sample curves). Y runs down. */
export function parseSvg(text: string): { paths: RawPath[]; unit: DieUnit | null; guess: DieUnit } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('This does not look like an SVG file.');

  // Absolute width/height units make the file's size exact (the browser converts them to px at 96/in).
  const wm = SVG_UNIT_RE.exec(root.getAttribute('width') ?? '');
  const absolute = !!wm?.[2] && wm[2].toLowerCase() !== 'px';
  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (!root.getAttribute('width') && vb.length === 4) root.setAttribute('width', String(vb[2]));
  if (!root.getAttribute('height') && vb.length === 4) root.setAttribute('height', String(vb[3]));
  const illustrator = /Adobe Illustrator/i.test(text);

  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  const svg = document.importNode(root, true) as unknown as SVGSVGElement;
  host.appendChild(svg);
  document.body.appendChild(host);
  const paths: RawPath[] = [];
  let userToPx = 1;
  try {
    const els = [...svg.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse')] as SVGGeometryElement[];
    const usable = els.filter((el) => !el.closest('defs,clipPath,mask,symbol,pattern,marker'));
    const stroked = usable.filter((el) => getComputedStyle(el).stroke !== 'none');
    const list = stroked.length ? stroked : usable;
    const rootM = svg.getScreenCTM()?.inverse();
    // CSS px per root user unit (viewBox scaling).
    userToPx = vb.length === 4 && vb[2] > 0 ? svg.width.baseVal.value / vb[2] : 1;
    let diag = 0;
    for (const el of list) {
      try {
        const bb = el.getBBox();
        diag = Math.max(diag, Math.hypot(bb.width, bb.height));
      } catch { /* not rendered */ }
    }
    const step = Math.max(diag / 900, 1e-6);

    for (const el of list) {
      const m0 = el.getScreenCTM();
      if (!m0 || !rootM) continue;
      const m = rootM.multiply(m0);
      const tx = (x: number, y: number): XY => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
      const names = [] as string[];
      for (let n: Element | null = el; n && n !== svg; n = n.parentElement) {
        names.push(n.id, n.getAttribute('class') ?? '', n.getAttribute('inkscape:label') ?? '', n.getAttribute('data-name') ?? '');
      }
      const label = names.join(' ');
      if (names.some((s) => IGNORE_RE.test(s.trim()))) continue;
      const crease = CREASE_RE.test(label) || (getComputedStyle(el).strokeDasharray || 'none') !== 'none';
      const tag = el.tagName.toLowerCase();
      const polys: XY[][] = [];
      if (tag === 'line') {
        const l = el as SVGLineElement;
        polys.push([tx(l.x1.baseVal.value, l.y1.baseVal.value), tx(l.x2.baseVal.value, l.y2.baseVal.value)]);
      } else if (tag === 'polyline' || tag === 'polygon') {
        const pts = [...(el as SVGPolylineElement).points].map((p) => tx(p.x, p.y));
        if (tag === 'polygon' && pts.length) pts.push(pts[0]);
        polys.push(pts);
      } else if (tag === 'rect' && !(el as SVGRectElement).rx.baseVal.value) {
        const r = el as SVGRectElement;
        const x = r.x.baseVal.value, y = r.y.baseVal.value, w = r.width.baseVal.value, h = r.height.baseVal.value;
        polys.push([tx(x, y), tx(x + w, y), tx(x + w, y + h), tx(x, y + h), tx(x, y)]);
      } else {
        const len = el.getTotalLength();
        if (!(len > 0)) continue;
        const n = Math.min(4000, Math.max(8, Math.ceil(len / step)));
        let cur: XY[] = [];
        let prev: DOMPoint | null = null;
        for (let i = 0; i <= n; i++) {
          const p = el.getPointAtLength((len * i) / n);
          // A jump between samples is a move-to inside the path: start a new piece.
          if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > (len / n) * 1.5 + 1e-9) {
            if (cur.length > 1) polys.push(cur);
            cur = [];
          }
          cur.push(tx(p.x, p.y));
          prev = p;
        }
        if (cur.length > 1) polys.push(cur);
      }
      for (const pts of polys) if (pts.length > 1) paths.push({ pts, crease });
    }
  } finally {
    host.remove();
  }
  if (!paths.length) throw new Error('No lines found in this SVG file.');
  // Coordinates are in the root's user units (the viewBox). Convert them to the
  // unit the file declares, or to px when it declares none (then guess what px means).
  const declared = (wm?.[2] ?? '').toLowerCase();
  const unit: DieUnit | null = absolute ? (declared === 'pc' ? 'pt' : (declared as DieUnit)) : null;
  const scale = userToPx / (unit ? unitToIn(unit) * 96 : 1);
  if (scale !== 1) for (const p of paths) p.pts = p.pts.map(([x, y]) => [x * scale, y * scale]);
  return { paths, unit, guess: illustrator ? 'pt' : 'px' };
}

// ---------------------------------------------------------------- geometry

function area(p: XY[]): number {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

function hull(pts: XY[]): XY[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: XY[] = [], hi: XY[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/** Ramer–Douglas–Peucker. */
function simplify(pts: XY[], tol: number): XY[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = L ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Join open pieces end to end into closed loops (tolerance `tol`). */
function closedLoops(paths: XY[][], tol: number): XY[][] {
  const near = (a: XY, b: XY) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
  const loops: XY[][] = [];
  const open: XY[][] = [];
  for (const p of paths) (p.length > 2 && near(p[0], p[p.length - 1]) ? loops : open).push(p);
  const used = new Uint8Array(open.length);
  for (let s = 0; s < open.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const chain: XY[] = [...open[s]];
    for (let guard = 0; guard < open.length; guard++) {
      if (chain.length > 2 && near(chain[0], chain[chain.length - 1])) break;
      const end = chain[chain.length - 1];
      let found = -1, rev = false;
      for (let j = 0; j < open.length; j++) {
        if (used[j]) continue;
        if (near(open[j][0], end)) { found = j; break; }
        if (near(open[j][open[j].length - 1], end)) { found = j; rev = true; break; }
      }
      if (found < 0) break;
      used[found] = 1;
      const seg = rev ? [...open[found]].reverse() : open[found];
      chain.push(...seg.slice(1));
    }
    if (chain.length > 2 && near(chain[0], chain[chain.length - 1])) loops.push(chain);
  }
  return loops;
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** Turn parsed pieces into a normalised die line. `yUp` for DXF (flip so the drawing reads as in the file). */
export function buildDieLine(name: string, format: 'dxf' | 'svg', paths: RawPath[], unit: DieUnit, unitSource: DieLine['unitSource'], yUp: boolean): DieLine {
  let cuts = paths.filter((p) => !p.crease);
  let creases = paths.filter((p) => p.crease);
  if (!cuts.length) { cuts = creases; creases = []; }

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of cuts) for (const [x, y] of p.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0, h = y1 - y0;
  if (!(w > 0 && h > 0)) throw new Error('The die line has no width or height.');
  const size = Math.max(w, h);

  // Outer outline: the biggest closed loop of cut lines; the convex hull if none closes.
  const loops = closedLoops(cuts.map((p) => p.pts), size * 0.002);
  let outline = loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
  let approx = false;
  if (!outline || Math.abs(area(outline)) < w * h * 0.2) {
    outline = hull(cuts.flatMap((p) => p.pts));
    approx = true;
  }
  outline = simplify(outline, size * 0.0015);
  if (outline.length > 1 && outline[0][0] === outline[outline.length - 1][0] && outline[0][1] === outline[outline.length - 1][1]) outline = outline.slice(0, -1);

  const norm = (pts: XY[]): UV[] => pts.map(([x, y]) => [r4((x - x0) / w), r4(yUp ? (y1 - y) / h : (y - y0) / h)]);
  let tol = size * 0.001;
  let cut = cuts.map((p) => simplify(p.pts, tol));
  let crease = creases.map((p) => simplify(p.pts, tol));
  // Keep stored geometry modest.
  for (let k = 0; k < 4 && cut.concat(crease).reduce((s, p) => s + p.length, 0) > 12000; k++) {
    tol *= 2;
    cut = cut.map((p) => simplify(p, tol));
    crease = crease.map((p) => simplify(p, tol));
  }

  return {
    name,
    format,
    rawW: w,
    rawH: h,
    unit,
    unitSource,
    outline: norm(outline),
    cut: cut.map(norm),
    crease: crease.map(norm),
    areaFraction: Math.min(1, Math.abs(area(outline)) / (w * h)),
    approxOutline: approx,
  };
}

/** Read an uploaded file into a die line. */
export async function readDieLine(file: File): Promise<DieLine> {
  const text = await file.text();
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'svg' || /^\s*(<\?xml|<svg)/i.test(text)) {
    const { paths, unit, guess } = parseSvg(text);
    return buildDieLine(file.name, 'svg', paths, unit ?? guess, unit ? 'file' : 'guess', false);
  }
  if (ext === 'dxf' || /^\s*0\s*\r?\n\s*SECTION/i.test(text)) {
    const { paths, unit } = parseDxf(text);
    let u = unit;
    let src: DieLine['unitSource'] = 'file';
    if (!u) {
      // No units in the file: a blank over 60 units across is almost surely millimetres.
      const xs = paths.flatMap((p) => p.pts.map((q) => q[0]));
      u = Math.max(...xs) - Math.min(...xs) > 60 ? 'mm' : 'in';
      src = 'guess';
    }
    return buildDieLine(file.name, 'dxf', paths, u, src, true);
  }
  throw new Error('Upload a DXF or SVG die line.');
}

// ---------------------------------------------------------------- placing on the pallet

/** Die line as it sits on a blank of length L (along u) × width W (along v). */
export interface Shape {
  die: DieLine;
  L: number;
  W: number;
}

/** Quarter turn of normalised coords, clockwise as seen from above (y down). */
const turn = ([u, v]: UV): UV => [1 - v, u];

/** Quarter turns that bring the file onto the blank (its long side along the blank's long side). */
function baseTurns(die: DieLine, L: number, W: number): number {
  return die.rawW >= die.rawH === L >= W ? 0 : 1;
}

/** The outline in the blank's own frame (u along the length), for the nesting solver. */
export function blankOutline(die: DieLine, L: number, W: number): UV[] {
  const k = baseTurns(die, L, W);
  return die.outline.map((p) => {
    let t = p;
    for (let i = 0; i < k; i++) t = turn(t);
    return t;
  });
}

/**
 * The die line as drawn in one placed box: outline and lines in world x/y.
 * The file's long side follows the blank's long side. `q` is the scene's
 * view-turn count for that box (0 when the view is not rotated).
 */
export function shapeInBox(shape: Shape, b: { x: number; y: number; l: number; w: number; turn?: number }, q = 0) {
  const { die, L, W } = shape;
  let orient: number;
  if (b.turn != null) {
    // The solver placed this blank at a known quarter turn.
    orient = b.turn;
  } else {
    // Rectangle layouts: read the turn off the box's size; for square blanks use the view turns only.
    const tol = Math.max(L, W) * 1e-3;
    const same = Math.abs(b.l - L) <= tol && Math.abs(b.w - W) <= tol;
    const swapped = Math.abs(b.l - W) <= tol && Math.abs(b.w - L) <= tol;
    orient = swapped && !same ? 1 : 0;
    // A view turn changes which side is which: undo it to find the original placement.
    if (q % 2 === 1 && Math.abs(L - W) > tol) orient ^= 1;
  }
  const k = (((baseTurns(die, L, W) + orient + q) % 4) + 4) % 4;
  const map = (p: UV): [number, number] => {
    let t = p;
    for (let i = 0; i < k; i++) t = turn(t);
    return [b.x + t[0] * b.l, b.y + t[1] * b.w];
  };
  return {
    outline: die.outline.map(map),
    cut: die.cut.map((p) => p.map(map)),
    crease: die.crease.map((p) => p.map(map)),
  };
}

/** SVG path data for polylines. */
export function pathD(lines: [number, number][][], f: (p: [number, number]) => [number, number]): string {
  let d = '';
  for (const l of lines) {
    l.forEach((p, i) => {
      const [x, y] = f(p);
      d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    });
  }
  return d;
}

/** A point well inside a polygon for its label: the centroid when it is inside, else the inside point nearest to it. */
export function labelPoint(poly: [number, number][]): [number, number] {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n];
    const c = x0 * y1 - x1 * y0;
    a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  const c: [number, number] = a ? [cx / (3 * a), cy / (3 * a)] : poly[0];
  const inside = (q: [number, number]) => {
    let r = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) r = !r;
    }
    return r;
  };
  // Distance to the nearest edge: prefer points with room around them.
  const room = (q: [number, number]) => {
    let d = Infinity;
    for (let i = 0, n = poly.length; i < n; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n];
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((q[0] - x0) * dx + (q[1] - y0) * dy) / L2));
      d = Math.min(d, Math.hypot(q[0] - x0 - t * dx, q[1] - y0 - t * dy));
    }
    return d;
  };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let best = c, score = inside(c) ? room(c) : -Infinity;
  const n = 12;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const q: [number, number] = [x0 + ((i + 0.5) * (x1 - x0)) / n, y0 + ((j + 0.5) * (y1 - y0)) / n];
      if (!inside(q)) continue;
      // Room around the point, with a small pull towards the centroid.
      const v = room(q) - 0.15 * Math.hypot(q[0] - c[0], q[1] - c[1]);
      if (v > score) { score = v; best = q; }
    }
  return best;
}
