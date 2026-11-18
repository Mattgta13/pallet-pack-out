import type { Pallet, PackOutResult, TruckPlan } from '@packout/engine';
import type { Box3D } from './geometry';
import { fmtLen, lenUnit, type UnitSystem } from '../units';

const TONE = {
  straight: { fill: 'var(--kraft)', edge: 'var(--kraft-dark)' },
  turned: { fill: 'var(--rot)', edge: 'var(--rot-dark)' },
};

/** Long lengths read better in feet (or metres). */
export const fmtRun = (inches: number, u: UnitSystem) =>
  u === 'imperial' ? `${(inches / 12).toFixed(1)} ft` : `${(inches * 0.0254).toFixed(2)} m`;

/** Unit loads on the trailer floor as 3D boxes: a pallet deck under each load, tier on tier. */
export function truckScene(plan: TruckPlan, r: PackOutResult, pallet: Pallet): Box3D[] {
  const boxes: Box3D[] = [];
  const H = r.load.height;
  const deck = Math.min(pallet.deckHeight, H);
  for (const s of plan.positions) {
    for (let t = 0; t < s.tiers; t++) {
      const z = t * H;
      const pl = s.turned ? pallet.width : pallet.length, pw = s.turned ? pallet.length : pallet.width;
      const ll = s.turned ? r.load.width : r.load.length, lw = s.turned ? r.load.length : r.load.width;
      boxes.push({ x: s.x + (s.l - pl) / 2, y: s.y + (s.w - pw) / 2, z, l: pl, w: pw, h: deck, rot: false, kind: 'deck' });
      if (H > deck) boxes.push({ x: s.x + (s.l - ll) / 2, y: s.y + (s.w - lw) / 2, z: z + deck, l: ll, w: lw, h: H - deck, rot: s.turned, kind: 'unit' });
    }
  }
  return boxes;
}

interface Props {
  plan: TruckPlan;
  units: UnitSystem;
  width?: number;
}

/** Top view: nose on the left, doors on the right; each spot numbered in loading order. */
export function TruckPlanView({ plan, units, width = 700 }: Props) {
  const { trailer: T } = plan;
  const padL = 26, padR = 34, padT = 8, padB = 30;
  const k = (width - padL - padR) / T.length;
  const h = T.width * k + padT + padB;
  const X = (v: number) => padL + v * k;
  const Y = (v: number) => padT + v * k;
  const lu = lenUnit(units);
  const order = plan.positions
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.tiers > 0);
  const font = Math.max(6.5, Math.min(11, Math.min(...plan.positions.map((p) => Math.min(p.l, p.w))) * k * 0.3));
  return (
    <svg className="truck-plan" viewBox={`0 0 ${width} ${h}`} role="img" aria-label="Top view of the trailer load">
      <rect x={X(0)} y={Y(0)} width={T.length * k} height={T.width * k} fill="var(--trailer-floor)" stroke="var(--ink-2)" strokeWidth={1.2} />
      {/* Doors */}
      <line x1={X(T.length)} y1={Y(0)} x2={X(T.length)} y2={Y(T.width)} stroke="var(--accent)" strokeWidth={3} />
      <text x={X(T.length) + 8} y={Y(T.width / 2)} fontSize={8} fill="var(--ink-2)" textAnchor="middle" transform={`rotate(90 ${X(T.length) + 8} ${Y(T.width / 2)})`}>DOORS</text>
      <text x={X(0) - 8} y={Y(T.width / 2)} fontSize={8} fill="var(--ink-2)" textAnchor="middle" transform={`rotate(-90 ${X(0) - 8} ${Y(T.width / 2)})`}>NOSE</text>
      {plan.positions.map((p, i) => {
        const c = p.turned ? TONE.turned : TONE.straight;
        const empty = p.tiers === 0;
        return (
          <g key={i}>
            <rect
              x={X(p.x) + 0.6}
              y={Y(p.y) + 0.6}
              width={p.l * k - 1.2}
              height={p.w * k - 1.2}
              fill={empty ? 'none' : c.fill}
              stroke={empty ? 'var(--ink-3)' : c.edge}
              strokeDasharray={empty ? '3 2' : undefined}
              strokeWidth={0.8}
            />
            {p.tiers > 1 && (
              <rect x={X(p.x) + 3} y={Y(p.y) + 3} width={p.l * k - 6} height={p.w * k - 6} fill="none" stroke={c.edge} strokeWidth={0.6} />
            )}
          </g>
        );
      })}
      {order.map(({ p }, n) => (
        <text key={n} x={X(p.x + p.l / 2)} y={Y(p.y + p.w / 2) + font * 0.35} fontSize={font} textAnchor="middle" fill="var(--ink)" fontWeight={600}>
          {n + 1}{p.tiers > 1 ? '×2' : ''}
        </text>
      ))}
      {/* Length dimension, and how much floor the load takes */}
      <g fontSize={8.5} fill="var(--ink-2)">
        <line x1={X(0)} y1={h - 18} x2={X(T.length)} y2={h - 18} stroke="var(--ink-3)" strokeWidth={0.7} />
        <line x1={X(0)} y1={h - 22} x2={X(0)} y2={h - 14} stroke="var(--ink-3)" strokeWidth={0.7} />
        <line x1={X(T.length)} y1={h - 22} x2={X(T.length)} y2={h - 14} stroke="var(--ink-3)" strokeWidth={0.7} />
        {plan.usedLength > 0 && plan.usedLength < T.length - 1 && (
          <>
            <line x1={X(plan.usedLength)} y1={Y(0)} x2={X(plan.usedLength)} y2={h - 14} stroke="var(--accent)" strokeWidth={0.8} strokeDasharray="3 2" />
            <text x={X(plan.usedLength) - 3} y={h - 21} textAnchor="end" fill="var(--accent)">load {fmtRun(plan.usedLength, units)}</text>
          </>
        )}
        <text x={X(T.length / 2)} y={h - 5} textAnchor="middle">
          inside length {fmtLen(T.length, units, 0)} {lu} ({fmtRun(T.length, units)}) × {fmtLen(T.width, units, 1)} {lu} wide
        </text>
      </g>
    </svg>
  );
}

/** Side view: tiers along the trailer against the door height. */
export function TruckSideView({ plan, units, width = 340, deck, unitH: H }: Props & { deck: number; unitH: number }) {
  const { trailer: T } = plan;
  const padL = 30, padR = 8, padT = 10, padB = 18;
  const k = (width - padL - padR) / T.length;
  const h = T.height * k + padT + padB;
  const X = (v: number) => padL + v * k;
  const Z = (v: number) => padT + (T.height - v) * k;
  // Rows: the tallest stack in each row, seen from the side.
  const rows = new Map<number, { x: number; l: number; tiers: number; turned: boolean }>();
  for (const p of plan.positions) {
    const key = Math.round(p.x * 1e4);
    const cur = rows.get(key);
    if (!cur || p.tiers > cur.tiers) rows.set(key, { x: p.x, l: p.l, tiers: p.tiers, turned: p.turned });
  }
  return (
    <svg className="truck-side" viewBox={`0 0 ${width} ${h}`} role="img" aria-label="Side view of the trailer load">
      <rect x={X(0)} y={Z(T.height)} width={T.length * k} height={T.height * k} fill="var(--trailer-wall)" stroke="var(--ink-2)" strokeWidth={1} />
      {[...rows.values()].map((r, i) =>
        Array.from({ length: r.tiers }, (_, t) => {
          const c = r.turned ? TONE.turned : TONE.straight;
          const z0 = t * H;
          return (
            <g key={`${i}-${t}`}>
              <rect x={X(r.x) + 0.4} y={Z(z0 + deck)} width={r.l * k - 0.8} height={deck * k} fill="var(--wood-side)" stroke="var(--wood-edge)" strokeWidth={0.4} />
              <rect x={X(r.x) + 0.4} y={Z(z0 + H)} width={r.l * k - 0.8} height={(H - deck) * k} fill={c.fill} stroke={c.edge} strokeWidth={0.5} />
            </g>
          );
        }),
      )}
      <g fontSize={8} fill="var(--ink-2)">
        <text x={X(0) - 4} y={Z(T.height) + 8} textAnchor="end">{fmtLen(T.height, units, 0)}</text>
        <text x={X(0) - 4} y={Z(0)} textAnchor="end">0</text>
        <text x={X(0)} y={h - 5}>nose</text>
        <text x={X(T.length)} y={h - 5} textAnchor="end">doors</text>
      </g>
    </svg>
  );
}
