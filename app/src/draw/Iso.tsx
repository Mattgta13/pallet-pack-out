import type { Box3D, BoxKind, Strap } from './geometry';
import { paintOrder } from './geometry';

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
}

/** Isometric SVG drawing, scaled to fit the given box. Viewer looks from +x, +y, +z. */
export function Iso({ boxes, straps = [], labels = [], width, height, pad = 28, edgeWidth = 0.7, sheetCaption }: Props) {
  const proj = (x: number, y: number, z: number): [number, number] => [(x - y) * C30, (x + y) * 0.5 - z];

  // Fit to the view box.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes)
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

  // Strap extents: around the whole load and pallet.
  const units = boxes.filter((b) => b.kind === 'unit');
  const ext = {
    x0: Math.min(...boxes.map((b) => b.x)),
    x1: Math.max(...boxes.map((b) => b.x + b.l)),
    y0: Math.min(...boxes.map((b) => b.y)),
    y1: Math.max(...boxes.map((b) => b.y + b.w)),
    top: units.length ? Math.max(...units.map((b) => b.z + b.h)) : 0,
  };
  const sw = STRAP_W / 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="3D view of the pallet load">
      {paintOrder(boxes).map((b, i) => {
        const c = b.kind === 'unit' ? (b.rot ? ROT : UNIT) : WOOD[b.kind];
        const { x, y, z, l, w, h } = b;
        const st = { stroke: c.edge, strokeWidth: b.kind === 'unit' ? edgeWidth : 0.5, strokeLinejoin: 'round' as const };
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

      {/* Straps: visible runs over the top and down the two front faces. */}
      {straps.map((s, i) => {
        const { x0, x1, y0, y1, top } = ext;
        const lift = 0.05; // sit just proud of the surface
        const parts =
          s.axis === 'x'
            ? [
                poly(P(x0, s.at - sw, top + lift), P(x1, s.at - sw, top + lift), P(x1, s.at + sw, top + lift), P(x0, s.at + sw, top + lift)),
                poly(P(x1 + lift, s.at - sw, 0), P(x1 + lift, s.at + sw, 0), P(x1 + lift, s.at + sw, top + lift), P(x1 + lift, s.at - sw, top + lift)),
              ]
            : [
                poly(P(s.at - sw, y0, top + lift), P(s.at + sw, y0, top + lift), P(s.at + sw, y1, top + lift), P(s.at - sw, y1, top + lift)),
                poly(P(s.at - sw, y1 + lift, 0), P(s.at + sw, y1 + lift, 0), P(s.at + sw, y1 + lift, top + lift), P(s.at - sw, y1 + lift, top + lift)),
              ];
        return (
          <g key={`s${i}`} className="strap">
            {parts.map((pts, j) => (
              <polygon key={j} points={pts} fill="var(--strap)" stroke="var(--strap-edge)" strokeWidth={0.6} />
            ))}
          </g>
        );
      })}

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
