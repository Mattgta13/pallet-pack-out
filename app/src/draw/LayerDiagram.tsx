import type { LayerPattern, Pallet } from '@packout/engine';
import { fmtLen, type UnitSystem } from '../units';
import { strapSpan, strapsFor, topDeckBoards, type Strapping } from './geometry';

interface Props {
  layer: LayerPattern;
  pallet: Pallet;
  units: UnitSystem;
  size?: number;
  strapping?: Strapping | null;
}

const STRAP_W = 0.75;

/** Top-down layer diagram: deck boards, numbered units (turned units shaded), fork entry arrows and straps. */
export function LayerDiagram({ layer, pallet, units, size = 220, strapping }: Props) {
  const boxes = layer.boxes;
  let minX = 0, minY = 0, maxX = pallet.length, maxY = pallet.width;
  for (const b of boxes) {
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.l); maxY = Math.max(maxY, b.y + b.w);
  }
  const padX = 22, padTop = 24, padBot = 22;
  const s = Math.min((size - 2 * padX) / (maxX - minX), (size * 0.82 - padTop - padBot) / (maxY - minY));
  const vbH = padTop + (maxY - minY) * s + padBot;
  const X = (x: number) => padX + (x - minX) * s + ((size - 2 * padX) - (maxX - minX) * s) / 2;
  const Y = (y: number) => padTop + (y - minY) * s;

  const lMinX = Math.min(...boxes.map((b) => b.x));
  const lMaxX = Math.max(...boxes.map((b) => b.x + b.l));
  const fontSize = Math.max(6, Math.min(11, Math.min(...boxes.map((b) => Math.min(b.l, b.w))) * s * 0.45));
  const fork = pallet.entry === '2-way';
  const my = Y(pallet.width / 2);
  const straps = strapsFor(boxes.map((b) => ({ ...b, z: 0, h: 1, kind: 'unit' as const })), strapping);
  const strapPx = Math.max(2.5, STRAP_W * s);
  const ax = X(minX) + (X(maxX) - X(minX)) * 0.12; // 4-way side arrows, clear of the labels

  return (
    <svg viewBox={`0 0 ${size} ${vbH}`} role="img" aria-label="Layer pattern, top view">
      {/* pallet: top deck boards over a dashed outline */}
      <rect x={X(0)} y={Y(0)} width={pallet.length * s} height={pallet.width * s} fill="var(--pallet-bg)" stroke="var(--ink-2)" strokeDasharray="3 2" />
      {topDeckBoards(pallet).map((d, i) => (
        <rect key={`d${i}`} x={X(d.x)} y={Y(0)} width={d.l * s} height={pallet.width * s} fill="var(--wood-top)" stroke="var(--wood-edge)" strokeWidth={0.4} />
      ))}
      {boxes.map((b, i) => (
        <g key={i}>
          <rect
            x={X(b.x)} y={Y(b.y)} width={b.l * s} height={b.w * s}
            fill={b.rot ? 'var(--rot)' : 'var(--kraft)'}
            stroke={b.rot ? 'var(--rot-dark)' : 'var(--kraft-dark)'}
          />
          {boxes.length <= 80 && (
            <text x={X(b.x) + (b.l * s) / 2} y={Y(b.y) + (b.w * s) / 2 + fontSize * 0.35} textAnchor="middle" fontSize={fontSize} fontWeight={600} fill="#1c2430">
              {i + 1}
            </text>
          )}
        </g>
      ))}
      {straps.map((st, i) => {
        const span = strapSpan(boxes, st, pallet.length, pallet.width);
        if (!span) return null;
        const [a0, a1] = span;
        return st.axis === 'x' ? (
          <rect key={`s${i}`} x={X(a0)} y={Y(st.at) - strapPx / 2} width={(a1 - a0) * s} height={strapPx} fill="var(--strap)" opacity={0.9} />
        ) : (
          <rect key={`s${i}`} x={X(st.at) - strapPx / 2} y={Y(a0)} width={strapPx} height={(a1 - a0) * s} fill="var(--strap)" opacity={0.9} />
        );
      })}
      {/* load length dimension */}
      <line x1={X(lMinX)} y1={Y(minY) - 9} x2={X(lMaxX)} y2={Y(minY) - 9} stroke="var(--ink)" strokeWidth={0.8} />
      <line x1={X(lMinX)} y1={Y(minY) - 12} x2={X(lMinX)} y2={Y(minY) - 6} stroke="var(--ink)" />
      <line x1={X(lMaxX)} y1={Y(minY) - 12} x2={X(lMaxX)} y2={Y(minY) - 6} stroke="var(--ink)" />
      <text className="dim" x={(X(lMinX) + X(lMaxX)) / 2} y={Y(minY) - 12} textAnchor="middle" fontSize={9}>
        {fmtLen(layer.extentL, units)}
      </text>
      <text className="dim" x={(X(lMinX) + X(lMaxX)) / 2} y={Y(maxY) + 14} textAnchor="middle" fontSize={9}>
        ← {fmtLen(layer.extentW, units)} deep →
      </text>
      {/* fork entry on the two ends (2-way) or all sides (4-way) */}
      <path d={`M ${X(minX) - 14} ${my - 5} L ${X(minX) - 6} ${my} L ${X(minX) - 14} ${my + 5} Z`} fill="var(--ink)" />
      <path d={`M ${X(maxX) + 14} ${my - 5} L ${X(maxX) + 6} ${my} L ${X(maxX) + 14} ${my + 5} Z`} fill="var(--ink)" />
      {!fork && (
        <>
          <path d={`M ${ax - 5} ${Y(minY) - 21} L ${ax} ${Y(minY) - 14} L ${ax + 5} ${Y(minY) - 21} Z`} fill="var(--ink)" />
          <path d={`M ${ax - 5} ${Y(maxY) + 21} L ${ax} ${Y(maxY) + 14} L ${ax + 5} ${Y(maxY) + 21} Z`} fill="var(--ink)" />
        </>
      )}
    </svg>
  );
}
