import { useState } from 'react';
import type { Pallet, PackOutResult } from '@packout/engine';
import { Iso } from '../draw/Iso';
import { LayerDiagram } from '../draw/LayerDiagram';
import { loadScene, rotateScene, type Strapping } from '../draw/geometry';
import { PATTERN_LABEL, resultKey, stackingLabel } from '../describe';
import { fmtInt, fmtLen, fmtPct, fmtWt, lenUnit, wtUnit, type UnitSystem } from '../units';

interface Props {
  results: PackOutResult[];
  selected: PackOutResult | undefined;
  onSelect: (key: string) => void;
  pallet: Pallet;
  isSheet: boolean;
  units: UnitSystem;
  maxHeight: number;
  maxGross: number;
  busy: boolean;
  error: string | null;
  ms: number | null;
  onOpenSpec: () => void;
  strapping: Strapping | null;
}

export function Results({ results, selected, onSelect, pallet, isSheet, units, maxHeight, maxGross, busy, error, ms, onOpenSpec, strapping }: Props) {
  const [turns, setTurns] = useState(0);

  if (error) return <div className="empty card"><b>Can't calculate yet.</b> {error}</div>;
  if (!results.length) return <div className="empty card">{busy ? 'Calculating…' : 'Nothing fits within these limits. Check the dimensions, max height and weight.'}</div>;
  const r = selected ?? results[0];
  const unitWord = isSheet ? 'sheets' : 'cases';
  const best = results[0].total;

  const scene = rotateScene(loadScene(r, pallet, isSheet, strapping), turns);
  const xLen = turns % 2 === 0 ? r.load.length : r.load.width;
  const yLen = turns % 2 === 0 ? r.load.width : r.load.length;

  return (
    <div className="results">
      <section className="card">
        <div className="card-head">
          <h3>Options</h3>
          <span className="muted small">{busy ? 'Recalculating…' : ms != null ? `Solved in ${ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`}` : ''}</span>
        </div>
        <div className="table-wrap">
          <table className="options">
            <thead>
              <tr>
                <th>Orientation</th>
                <th>Stacking</th>
                <th>Pattern</th>
                <th className="r">{isSheet ? 'Stacks' : 'Per layer'}</th>
                <th className="r">{isSheet ? 'Sheets/stack' : 'Layers'}</th>
                <th className="r">Total {unitWord}</th>
                <th className="r">Cube eff.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((x) => {
                const k = resultKey(x);
                const on = resultKey(r) === k;
                return (
                  <tr key={k} className={on ? 'on' : ''} onClick={() => onSelect(k)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(k)} aria-selected={on}>
                    <td>{x.orientation}</td>
                    <td>{x.stacking === 'interlock' ? `Patterned · ${Math.round(x.bridging * 100)}% tied` : 'All same'}</td>
                    <td>{PATTERN_LABEL[x.pattern]}</td>
                    <td className="r num">{x.perLayer}</td>
                    <td className="r num">{isSheet ? x.sheetsPerStack : x.layers}</td>
                    <td className="r num"><b>{fmtInt(x.total)}</b>{x.total < best && <span className="delta"> −{fmtInt(best - x.total)}</span>}</td>
                    <td className="r num">{fmtPct(x.cubeEfficiency)}</td>
                    <td>{x.provenOptimal && <span className="pill ok" title="No layer pattern can fit more of this footprint">Optimal</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card detail">
        <div className="card-head">
          <h3>
            {r.orientation} · {stackingLabel(r)}
          </h3>
          <button type="button" className="primary" onClick={onOpenSpec}>Open spec sheet</button>
        </div>

        <div className="headline">
          <div className="tihi">
            <span className="lbl">{isSheet ? 'Stacks × sheets' : 'Ti × Hi'}</span>
            <span className="big num">
              {isSheet ? `${r.perLayer} × ${r.sheetsPerStack} = ${fmtInt(r.total)}` : `${r.perLayer} × ${r.layers} = ${fmtInt(r.total)}`}
            </span>
            <span className="sub">{unitWord} per pallet{r.totalUnits ? ` · ${fmtInt(r.totalUnits)} units` : ''}</span>
          </div>
          <div>
            <span className="lbl">Load (L × W × H)</span>
            <span className="mid num">{fmtLen(r.load.length, units)} × {fmtLen(r.load.width, units)} × {fmtLen(r.load.height, units)} {lenUnit(units)}</span>
          </div>
          <div>
            <span className="lbl">Gross weight</span>
            <span className="mid num">{fmtWt(r.grossWeight, units, 0)} {wtUnit(units)}</span>
          </div>
        </div>

        <div className="views">
          <div className="view3d">
            <Iso
              boxes={scene.boxes}
              straps={scene.straps}
              sheetCaption={isSheet}
              width={420}
              height={340}
              edgeWidth={r.oddLayer.count > 60 ? 0.3 : 0.7}
              labels={[
                { at: [scene.L / 2, scene.W, 0], text: fmtLen(xLen, units), dx: -14, dy: 18 },
                { at: [scene.L, scene.W / 2, 0], text: fmtLen(yLen, units), dx: 14, dy: 18 },
                { at: [scene.L, 0, r.load.height / 2], text: fmtLen(r.load.height, units), dx: 10, anchor: 'start' },
              ]}
            />
            <div className="view-tools">
              <button type="button" onClick={() => setTurns((t) => t + 3)} aria-label="Rotate left">⟲</button>
              <button type="button" onClick={() => setTurns((t) => t + 1)} aria-label="Rotate right">⟳</button>
            </div>
          </div>
          <div className="layers">
            <div>
              <LayerDiagram layer={r.oddLayer} pallet={pallet} units={units} strapping={strapping} />
              <div className="cap">{r.stacking === 'interlock' ? (isSheet ? 'Odd lifts' : 'Odd layers') : isSheet ? 'Every stack' : 'Every layer'}</div>
            </div>
            {r.stacking === 'interlock' && (
              <div>
                <LayerDiagram layer={r.evenLayer} pallet={pallet} units={units} strapping={strapping} />
                <div className="cap">{isSheet ? 'Even lifts' : 'Even layers'}</div>
              </div>
            )}
          </div>
        </div>

        <div className="facts">
          <Fact label="Height used" value={`${fmtLen(r.load.height, units)} / ${fmtLen(maxHeight, units)} ${lenUnit(units)}`} bar={r.load.height / maxHeight} />
          <Fact label="Weight used" value={`${fmtWt(r.grossWeight, units, 0)} / ${fmtWt(maxGross, units, 0)} ${wtUnit(units)}`} bar={r.grossWeight / maxGross} />
          <Fact label="Area efficiency" value={fmtPct(r.areaEfficiency)} />
          <Fact label="Cube efficiency" value={fmtPct(r.cubeEfficiency)} />
          <Fact label="Overhang ends / sides" value={`${signed(r.overhang.ends, units)} / ${signed(r.overhang.sides, units)} ${lenUnit(units)}`} />
          <Fact label="Limited by" value={limitText(r)} />
        </div>
        {r.provenOptimal ? (
          <p className="ok-line">✓ Proven optimal: {r.perLayer} per layer is the most this footprint can fit.</p>
        ) : (
          <p className="muted small">Best found: {r.perLayer} per layer. The theoretical maximum is {r.upperBound}; it may not be reachable.</p>
        )}
        {r.notes.map((n) => <p key={n} className="note small">{n}</p>)}
      </section>
    </div>
  );
}

function Fact({ label, value, bar }: { label: string; value: string; bar?: number }) {
  return (
    <div className="fact">
      <span className="lbl">{label}</span>
      <span className="num">{value}</span>
      {bar != null && <span className="bar"><i style={{ width: `${Math.min(100, bar * 100)}%` }} /></span>}
    </div>
  );
}

export const signed = (v: number, u: UnitSystem) => `${v > 0.00005 ? '+' : ''}${fmtLen(v, u)}`;

export function limitText(r: PackOutResult) {
  if (r.limitedBy === 'height') return 'Height';
  if (r.limitedBy === 'weight') return 'Weight';
  return 'Max layers';
}
