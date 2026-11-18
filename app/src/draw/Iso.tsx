import type { Box3D, BoxKind, Strap } from './geometry';
import { paintOrder, strapQuads } from './geometry';
import { shapeInBox, type Shape } from '../dieline';

const C30 = Math.cos(Math.PI / 6);

type Tones = { top: string; right: string; left: string; edge: string };
const UNIT: Tones = { top: 'var(--kraft)', right: 'var(--kraft-side)', left: 'var(--kraft-dark)', edge: '#6e4f2b' };
const ROT: Tones = { top: 'var(--rot)', right: 'var(--rot-side)', left: 'var(--rot-dark)', edge: '#22466b' };
const WOOD: Record<Exclude<BoxKind, 'unit'>, Tones> = {
  deck: { top: 'var(--wood-top)', right: 'var(--wood-side)', left: 'var(--wood-dark)', edge: 'var(--wood-edge)' },
  stringer: { top: 'var(--wood-side)', right: 'var(--wood-dark)', left: 'var(--wood-deep)', edge: 'var(--wood-edge)' },
  block: { top: 'var(--wood-side)', right: 'var(--wood-dark)', left: 'var(--wood-deep)', edge: 'var(--wood-edge)' },
};

/** Real poly strap is about ½"–¾" wide. */
const STRAP_W = 0.75;
/** Minimum on-screen gap between drawn sheet lines. */
const SHEET_LINE_PX = 3;

interface Label {
  /** World point to anchor at. */
  at: [number, number, number];
  text: string;
  dx?: number;
  dy?: number;
  anchor?: 'start' | 'middle' | 'end';
}

interface Props {
  boxes: Box3D[];
  straps?: Strap[];
  labels?: Label[];
  width: number;
  height: number;
  pad?: number;
  /** Thin edges for very many boxes. */
  edgeWidth?: number;
  /** Write "each line = N sheets" in the corner when sheet lines are thinned out. */
  sheetCaption?: boolean;
  /** Custom die line: stacks are drawn in its shape instead of as rectangles. */
  shape?: Shape | null;
  /** Trailer / container box drawn around the load: floor and back walls behind, open edges in front. */
  frame?: { l: number; w: number; h: number } | null;
}

/** Isometric SVG drawing, scaled to fit the given box. Viewer looks from +x, +y, +z. */
export function Iso({ boxes, straps = [], labels = [], width, height, pad = 28, edgeWidth = 0.7, sheetCaption, shape, frame }: Props) {
  const proj = (x: number, y: number, z: number): [number, number] => [(x - y) * C30, (x + y) * 0.5 - z];

  // Fit to the view box.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const fitBoxes = frame ? [...boxes, { x: 0, y: 0, z: 0, l: frame.l, w: frame.w, h: frame.h }] : boxes;
  for (const b of fitBoxes)
    for (const [x, y, z] of [
      [b.x, b.y, b.z], [b.x + b.l, b.y, b.z], [b.x, b.y + b.w, b.z], [b.x + b.l, b.y + b.w, b.z],
      [b.x, b.y, b.z + b.h], [b.x + b.l, b.y + b.w, b.z + b.h], [b.x + b.l, b.y, b.z + b.h], [b.x, b.y + b.w, b.z + b.h],
    ]) {
      const [u, v] = proj(x, y, z);
      minX = Math.min(minX, u); maxX = Math.max(maxX, u);
      minY = Math.min(minY, v); maxY = Math.max(maxY, v);
    }
  const k = Math.min((width - 2 * pad) / (maxX - minX || 1), (height - 2 * pad) / (maxY - minY || 1));
  const ox = (width - (maxX - minX) * k) / 2 - minX * k;
  const oy = (height - (maxY - minY) * k) / 2 - minY * k;
  const P = (x: number, y: number, z: number) => {
    const [u, v] = proj(x, y, z);
    return `${(ox + u * k).toFixed(2)},${(oy + v * k).toFixed(2)}`;
  };
  const poly = (...pts: string[]) => pts.join(' ');

  // Sheet lines: draw every Nth sheet so lines stay at least SHEET_LINE_PX apart.
  const sheetH = boxes.find((b) => b.sheetH)?.sheetH;
  const sheetStep = sheetH ? Math.max(1, Math.ceil(SHEET_LINE_PX / (sheetH * k))) : 0;

  // Units whose top is covered by another unit sitting on them (no die-line detail needed there).
  const units = shape ? boxes.filter((b) => b.kind === 'unit') : [];
  const covered = (b: Box3D) =>
    units.some((o) => o !== b && Math.abs(o.z - (b.z + b.h)) < 1e-6 && o.x < b.x + b.l && b.x < o.x + o.l && o.y < b.y + b.w && b.y < o.y + o.w);

  /** A stack in the die line's shape: visible walls back to front, sheet lines, then the top with its cut and crease lines. */
  const shapedBox = (b: Box3D, c: Tones, st: { stroke: string; strokeWidth: number }) => {
    const sh = shapeInBox(shape!, b, b.q ?? 0);
    const o = sh.outline;
    const n = o.length;
    let a2 = 0;
    for (let j = 0; j < n; j++) a2 += o[j][0] * o[(j + 1) % n][1] - o[(j + 1) % n][0] * o[j][1];
    const { z, h } = b;
    const walls: { p: [number, number]; q: [number, number]; key: number; right: boolean }[] = [];
    const vis: boolean[] = [];
    for (let j = 0; j < n; j++) {
      const p = o[j], q = o[(j + 1) % n];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const nx = a2 > 0 ? dy : -dy, ny = a2 > 0 ? -dx : dx; // outward normal
      const v = nx + ny > 1e-9;
      vis.push(v);
      if (v) walls.push({ p, q, key: p[0] + p[1] + q[0] + q[1], right: nx > ny });
    }
    walls.sort((u, v) => u.key - v.key);
    const step = b.sheetH && sheetStep ? b.sheetH * sheetStep : 0;
    const zs: number[] = [];
    if (step) for (let zz = z + step; zz < z + h - step * 0.5; zz += step) zs.push(zz);
    const els: JSX.Element[] = [];
    walls.forEach((w, j) => {
      const fill = w.right ? c.right : c.left;
      els.push(<polygon key={`w${j}`} points={poly(P(w.p[0], w.p[1], z), P(w.q[0], w.q[1], z), P(w.q[0], w.q[1], z + h), P(w.p[0], w.p[1], z + h))} fill={fill} stroke={fill} strokeWidth={0.4} strokeLinejoin="round" />);
      if (zs.length) els.push(<path key={`l${j}`} d={zs.map((zz) => `M${P(w.p[0], w.p[1], zz)}L${P(w.q[0], w.q[1], zz)}`).join('')} stroke={c.edge} strokeOpacity={0.35} strokeWidth={0.45} fill="none" />);
    });
    // Silhouette: bottom edge of the visible walls and vertical edges at corners.
    let bottom = '';
    let corners = '';
    for (let j = 0; j < n; j++) {
      if (!vis[j]) continue;
      const p = o[j], q = o[(j + 1) % n];
      bottom += `M${P(p[0], p[1], z)}L${P(q[0], q[1], z)}`;
      const prev = (j - 1 + n) % n;
      const r = o[prev];
      const t1 = Math.atan2(p[1] - r[1], p[0] - r[0]), t2 = Math.atan2(q[1] - p[1], q[0] - p[0]);
      let turn = Math.abs(t2 - t1);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      if (!vis[prev] || turn > Math.PI / 7) corners += `M${P(p[0], p[1], z)}L${P(p[0], p[1], z + h)}`;
      if (!vis[(j + 1) % n]) corners += `M${P(q[0], q[1], z)}L${P(q[0], q[1], z + h)}`;
    }
    els.push(<path key="sil" d={bottom + corners} stroke={c.edge} strokeWidth={st.strokeWidth} fill="none" strokeLinejoin="round" />);
    const top = z + h;
    els.push(<polygon key="top" points={poly(...o.map(([x, y]) => P(x, y, top)))} fill={c.top} stroke={c.edge} strokeWidth={st.strokeWidth} strokeLinejoin="round" />);
    // Cut and crease lines on visible tops that are big enough to read.
    if (!covered(b) && Math.min(b.l, b.w) * k > 18) {
      const line = (ls: [number, number][][]) => ls.map((l) => l.map(([x, y], m) => `${m ? 'L' : 'M'}${P(x, y, top)}`).join('')).join('');
      els.push(<path key="cut" d={line(sh.cut)} stroke="var(--die-cut)" strokeOpacity={0.75} strokeWidth={0.6} fill="none" />);
      if (sh.crease.length) els.push(<path key="crease" d={line(sh.crease)} stroke="var(--die-crease)" strokeOpacity={0.8} strokeWidth={0.55} strokeDasharray="2.5 1.8" fill="none" />);
    }
    return els;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={frame ? '3D view of the trailer load' : '3D view of the pallet load'}>
      {frame && (
        <g className="frame-back">
          <polygon points={poly(P(0, 0, 0), P(frame.l, 0, 0), P(frame.l, frame.w, 0), P(0, frame.w, 0))} fill="var(--trailer-floor)" stroke="var(--trailer-edge)" strokeWidth={0.8} />
          <polygon points={poly(P(0, 0, 0), P(0, frame.w, 0), P(0, frame.w, frame.h), P(0, 0, frame.h))} fill="var(--trailer-wall)" stroke="var(--trailer-edge)" strokeWidth={0.8} />
          <polygon points={poly(P(0, 0, 0), P(frame.l, 0, 0), P(frame.l, 0, frame.h), P(0, 0, frame.h))} fill="var(--trailer-wall-2)" stroke="var(--trailer-edge)" strokeWidth={0.8} />
        </g>
      )}
      {paintOrder(boxes).map((b, i) => {
        const c = b.kind === 'unit' ? (b.rot ? ROT : UNIT) : WOOD[b.kind];
        const { x, y, z, l, w, h } = b;
        const st = { stroke: c.edge, strokeWidth: b.kind === 'unit' ? edgeWidth : 0.5, strokeLinejoin: 'round' as const };
        if (shape && b.kind === 'unit') return <g key={i}>{shapedBox(b, c, st)}</g>;
        const lines: JSX.Element[] = [];
        if (b.sheetH && sheetStep) {
          const step = b.sheetH * sheetStep;
          for (let zz = z + step, j = 0; zz < z + h - step * 0.5; zz += step, j++) {
            lines.push(
              <polyline key={j} points={poly(P(x, y + w, zz), P(x + l, y + w, zz), P(x + l, y, zz))} fill="none" stroke={c.edge} strokeOpacity={0.35} strokeWidth={0.45} />,
            );
          }
        }
        return (
          <g key={i}>
            <polygon points={poly(P(x, y + w, z), P(x + l, y + w, z), P(x + l, y + w, z + h), P(x, y + w, z + h))} fill={c.left} {...st} />
            <polygon points={poly(P(x + l, y, z), P(x + l, y + w, z), P(x + l, y + w, z + h), P(x + l, y, z + h))} fill={c.right} {...st} />
            <polygon points={poly(P(x, y, z + h), P(x + l, y, z + h), P(x + l, y + w, z + h), P(x, y + w, z + h))} fill={c.top} {...st} />
            {lines}
          </g>
        );
      })}

      {/* Straps: over the top of the load and down its front faces, edge to edge. */}
      {straps.map((st, i) => (
        <g key={`s${i}`} className="strap">
          {strapQuads(boxes, st, STRAP_W).map((q, j) => (
            <polygon key={j} points={poly(...q.map((p) => P(...p)))} fill="var(--strap)" stroke="var(--strap-edge)" strokeWidth={0.5} strokeLinejoin="round" />
          ))}
        </g>
      ))}

      {frame && (
        <path
          d={`M${P(0, frame.w, frame.h)}L${P(frame.l, frame.w, frame.h)}L${P(frame.l, 0, frame.h)}M${P(frame.l, frame.w, frame.h)}L${P(frame.l, frame.w, 0)}M${P(0, frame.w, 0)}L${P(0, frame.w, frame.h)}M${P(frame.l, 0, 0)}L${P(frame.l, 0, frame.h)}`}
          fill="none"
          stroke="var(--trailer-edge)"
          strokeWidth={0.8}
          strokeDasharray="4 3"
        />
      )}

      {labels.map((lb, i) => {
        const [sx, sy] = P(...lb.at).split(',').map(Number);
        return (
          <text key={i} className="dim" x={sx + (lb.dx ?? 0)} y={sy + (lb.dy ?? 0)} textAnchor={lb.anchor ?? 'middle'}>
            {lb.text}
          </text>
        );
      })}
      {sheetCaption && sheetStep > 1 && (
        <text x={8} y={height - 8} fontSize={9.5} fill="var(--ink-2)">
          Each line = {sheetStep} sheets
        </text>
      )}
    </svg>
  );
}
