import type { Flute, Pallet, PackOutResult } from '@packout/engine';
import { insideDims } from '@packout/engine';
import type { Job } from '../job';
import { Iso } from '../draw/Iso';
import { LayerDiagram } from '../draw/LayerDiagram';
import { loadScene, type Box3D } from '../draw/geometry';
import { PATTERN_LABEL, stackingLabel } from '../describe';
import { cubeUnit, fmtCube, fmtInt, fmtLen, fmtPct, fmtWt, lenUnit, wtUnit, type UnitSystem } from '../units';
import { signed } from './Results';

interface Props {
  job: Job;
  result: PackOutResult;
  pallet: Pallet;
  flutes: Flute[];
  units: UnitSystem;
}

/** One-page letter spec sheet. Printing this page (Save as PDF) gives the PDF. */
export function SpecSheet({ job, result: r, pallet, flutes, units }: Props) {
  const isSheet = job.productType === 'sheet';
  const L = (v: number, dp?: number) => fmtLen(v, units, dp);
  const lu = lenUnit(units);
  const wu = wtUnit(units);
  const unitWord = isSheet ? 'sheets' : 'cases';
  const today = new Date().toLocaleDateString('en-US');
  const caseFlute = flutes.find((f) => f.id === job.caseFluteId);
  const sheetFlute = flutes.find((f) => f.id === job.fluteId);
  const id = !isSheet && caseFlute ? insideDims(job.length, job.width, job.height, caseFlute.caliper) : null;

  // The unit as entered (not as oriented on the pallet).
  const unitL = job.length;
  const unitW = job.width;
  const unitH = isSheet ? r.unitH : job.height;
  const unitWt = r.total > 0 ? r.netWeight / r.total : 0;
  const unitCube = unitL * unitW * unitH;
  const loadCube = r.load.length * r.load.width * r.load.height;
  const usableH = job.maxHeight - pallet.deckHeight;
  const nextLayerH = r.load.height + r.unitH;

  const title = `${job.name || (isSheet ? 'Die-cut sheet' : 'Case')} — ${L(unitL)} × ${L(unitW)}${isSheet ? '' : ` × ${L(unitH)}`} ${lu}`;
  // Icon of the unit: a case, or a few sheets with the thickness exaggerated so each sheet shows.
  const iconSheetH = Math.min(unitL, unitW) * 0.035;
  const caseBox: Box3D[] = isSheet
    ? Array.from({ length: 5 }, (_, i) => ({ x: 0, y: 0, z: i * iconSheetH, l: unitL, w: unitW, h: iconSheetH, rot: false, kind: 'unit' as const }))
    : [{ x: 0, y: 0, z: 0, l: unitL, w: unitW, h: unitH, rot: false, kind: 'unit' }];
  const strapping = job.strapping ? { count: job.strapCount, direction: job.strapDirection } : null;
  const scene = loadScene(r, pallet, isSheet, strapping);

  return (
    <div className="page">
      <header className="sheet-head">
        <div className="brand">
          <div className="logo">YOUR<br />LOGO</div>
          <div>
            <div className="doc-type">Pallet Pack-Out Specification</div>
            <h1>{title}</h1>
          </div>
        </div>
        <dl className="meta">
          <dt>Spec #</dt><dd className="mono">{job.specNo || '—'}</dd>
          <dt>SKU / Item</dt><dd className="mono">{job.sku || '—'}</dd>
          <dt>Revision</dt><dd className="mono">{job.revision || '—'}</dd>
          <dt>Date</dt><dd className="mono">{today}</dd>
        </dl>
      </header>

      <section className="s-headline">
        <div className="tihi">
          <div className="lbl">{isSheet ? 'Pack-out (stacks × sheets)' : 'Pack-out (Ti × Hi)'}</div>
          <div className="big num">
            {r.perLayer} <span className="eq">×</span> {isSheet ? r.sheetsPerStack : r.layers} <span className="eq">=</span> {fmtInt(r.total)} <small>{unitWord} / pallet</small>
          </div>
        </div>
        <div>
          <div className="lbl">Load size (L × W × H)</div>
          <div className="big num mid">{L(r.load.length)} × {L(r.load.width)} × {L(r.load.height)}<small> {lu}</small></div>
        </div>
        <div>
          <div className="lbl">Gross weight</div>
          <div className="big num">{fmtWt(r.grossWeight, units, 0)} <small>{wu}</small></div>
        </div>
        <div>
          <div className="lbl">{isSheet ? 'Stack height' : 'Total units'}</div>
          <div className="big num">
            {isSheet ? <>{L(r.load.height - pallet.deckHeight)} <small>{lu}</small></> : r.totalUnits ? <>{fmtInt(r.totalUnits)} <small>@ {job.unitsPerCase}/cs</small></> : <>— </>}
          </div>
        </div>
      </section>

      <section className="s-row views">
        <div className="panel">
          <h2>Unit load <span className="tag">3D view · fork entry {pallet.entry === '2-way' ? `on ${L(pallet.width, 0)} ${lu} ends` : 'all sides'}</span></h2>
          <Iso
            boxes={scene.boxes}
            straps={scene.straps}
            sheetCaption={isSheet}
            width={400}
            height={320}
            edgeWidth={r.oddLayer.count > 60 ? 0.3 : 0.7}
            labels={[
              { at: [pallet.length / 2, pallet.width, 0], text: L(r.load.length), dx: -14, dy: 18 },
              { at: [pallet.length, pallet.width / 2, 0], text: L(r.load.width), dx: 14, dy: 18 },
              { at: [pallet.length, 0, r.load.height / 2], text: L(r.load.height), dx: 10, anchor: 'start' },
            ]}
          />
          <div className="legend">
            <span><i className="sw" style={{ background: 'var(--kraft)' }} />{isSheet ? 'Stack' : 'Case lengthwise'}</span>
            <span><i className="sw" style={{ background: 'var(--rot)' }} />{isSheet ? 'Stack turned 90°' : 'Case turned 90°'}</span>
            <span><i className="sw" style={{ background: 'var(--wood-side)' }} />Pallet</span>
            {strapping && <span><i className="sw" style={{ background: 'var(--strap)' }} />Strap</span>}
          </div>
        </div>
        <div className="panel">
          <h2>{isSheet ? 'Stack pattern' : 'Layer pattern'} <span className="tag">{PATTERN_LABEL[r.pattern]} · {r.stacking === 'interlock' ? 'interlocked' : 'column'}</span></h2>
          <div className={r.stacking === 'interlock' ? 'layers two' : 'layers one'}>
            <div>
              <LayerDiagram layer={r.oddLayer} pallet={pallet} units={units} size={200} strapping={strapping} />
              <div className="layer-cap">{r.stacking === 'interlock' ? (isSheet ? 'Lifts 1, 3, 5 …' : oddList(r.layers)) : isSheet ? 'Full stack height' : 'All layers'}</div>
            </div>
            {r.stacking === 'interlock' && (
              <div>
                <LayerDiagram layer={r.evenLayer} pallet={pallet} units={units} size={200} strapping={strapping} />
                <div className="layer-cap">{isSheet ? 'Lifts 2, 4, 6 …' : evenList(r.layers)}</div>
              </div>
            )}
          </div>
          <div className="legend">
            <span>▶ Fork entry</span>
            <span><i className="sw dashed" />Pallet {L(pallet.length, 0)} × {L(pallet.width, 0)}</span>
            {r.stacking === 'interlock' && <span>Tied by layer above: <b className="num">{Math.round(r.bridging * 100)}%</b></span>}
          </div>
          <div className="case-iso">
            <Iso boxes={caseBox} width={150} height={96} pad={14} />
            <div>
              <b>{isSheet ? 'Sheet' : 'Case (OD)'}</b>
              <div>{L(unitL)} × {L(unitW)} {isSheet ? `× ${L(unitH, units === 'imperial' ? 4 : 2)}` : `× ${L(unitH)}`} {lu}</div>
              <div>{fmtWt(unitWt, units, isSheet ? 3 : 2)} {wu}{!isSheet && job.unitsPerCase ? ` · ${job.unitsPerCase} units` : ''}</div>
              <div>{isSheet ? sheetFlute ? sheetFlute.name : 'Custom thickness' : job.thisSideUp ? 'This side up' : `Placed ${r.orientation.toLowerCase()}`}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="s-row data">
        <div className="panel">
          <h2>Dimensions &amp; weights</h2>
          <table className="s-table">
            <thead>
              <tr>
                <th></th>
                {id && <th>Case ID</th>}
                <th>{isSheet ? 'Sheet' : 'Case OD'}</th>
                <th>Unit load<br />(incl. pallet)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Length</td>{id && <td className="n">{L(id.length, 3)} {lu}</td>}<td className="n">{L(unitL, 3)} {lu}</td><td className="n hl">{L(r.load.length)} {lu}</td></tr>
              <tr><td>Width</td>{id && <td className="n">{L(id.width, 3)} {lu}</td>}<td className="n">{L(unitW, 3)} {lu}</td><td className="n hl">{L(r.load.width)} {lu}</td></tr>
              <tr><td>Height</td>{id && <td className="n">{L(id.height, 3)} {lu}</td>}<td className="n">{L(unitH, isSheet ? 4 : 3)} {lu}</td><td className="n hl">{L(r.load.height)} {lu}</td></tr>
              <tr><td>Weight</td>{id && <td className="n">—</td>}<td className="n">{fmtWt(unitWt, units, isSheet ? 3 : 2)} {wu}</td><td className="n hl">{fmtWt(r.grossWeight, units)} {wu}</td></tr>
              <tr><td>Cube</td>{id && <td className="n">{fmtCube(id.length * id.width * id.height, units)} {cubeUnit(units)}</td>}<td className="n">{fmtCube(unitCube, units)} {cubeUnit(units)}</td><td className="n hl">{fmtCube(loadCube, units)} {cubeUnit(units)}</td></tr>
            </tbody>
          </table>
          <dl className="kv">
            {!isSheet && <><dt>Case orientation</dt><dd>{r.orientation}{job.thisSideUp ? ' (this side up)' : ''}</dd></>}
            <dt>Board</dt><dd>{isSheet ? sheetFlute ? `${sheetFlute.name}, ${L(r.unitH, 4)} ${lu} caliper` : `Custom, ${L(r.unitH, 4)} ${lu}` : caseFlute ? `${caseFlute.name}, ${L(caseFlute.caliper, 3)} ${lu} caliper` : 'Not specified'}</dd>
            <dt>Pallet</dt><dd>{pallet.name} · {L(pallet.length, 0)} × {L(pallet.width, 0)} × {L(pallet.deckHeight)} {lu} · {fmtWt(pallet.weight, units, 0)} {wu}</dd>
            <dt>Net load weight</dt><dd className="num">{fmtWt(r.netWeight, units)} {wu}</dd>
            <dt>Stacking</dt><dd>{stackingLabel(r)}{isSheet && r.stacking === 'interlock' ? ` · ${job.sheetsPerLift} sheets per lift` : ''}</dd>
            <dt>Strapping</dt><dd>{job.strapping ? `${job.strapCount} strap${job.strapCount === 1 ? '' : 's'}, ${job.strapDirection}` : 'None'}</dd>
          </dl>
        </div>

        <div className="panel">
          <h2>Limits &amp; efficiency</h2>
          <div className="limit">
            <div className="top"><span>Load height</span><span className="num"><b>{L(r.load.height)}</b> / {L(job.maxHeight)} {lu}</span></div>
            <div className="bar"><i style={{ width: `${Math.min(100, (r.load.height / job.maxHeight) * 100)}%` }} /></div>
          </div>
          <div className="limit">
            <div className="top"><span>Gross weight</span><span className="num"><b>{fmtWt(r.grossWeight, units, 0)}</b> / {fmtWt(job.maxGross, units, 0)} {wu}</span></div>
            <div className="bar muted-bar"><i style={{ width: `${Math.min(100, (r.grossWeight / job.maxGross) * 100)}%` }} /></div>
          </div>
          <div className="limit">
            <div className="top"><span>Overhang / underhang</span><span className="num">ends {signed(r.overhang.ends, units)} · sides {signed(r.overhang.sides, units)} {lu}</span></div>
          </div>
          <div className="controls">
            {r.limitedBy === 'height' && (isSheet
              ? <><b>Stack height set by height limit.</b> One more sheet would exceed {L(job.maxHeight)} {lu}.</>
              : <><b>Layer count set by height.</b> Another layer would reach {L(nextLayerH)} {lu} (limit {L(job.maxHeight)}).</>)}
            {r.limitedBy === 'weight' && <><b>{isSheet ? 'Sheet count' : 'Layer count'} set by weight.</b> More would exceed {fmtWt(job.maxGross, units, 0)} {wu} gross.</>}
            {r.limitedBy === 'max-layers' && <><b>Layer count set by the max-layers setting</b> ({job.maxLayers}).</>}
          </div>
          <div className="eff">
            <div className="ecard"><div className="v num">{fmtPct(r.areaEfficiency)}</div><div className="d">Area efficiency<br />footprint ÷ pallet area ({L(pallet.length, 0)} × {L(pallet.width, 0)})</div></div>
            <div className="ecard"><div className="v num">{fmtPct(r.cubeEfficiency)}</div><div className="d">Cube efficiency<br />volume ÷ pallet area × usable height ({L(usableH)} {lu})</div></div>
          </div>
          {r.provenOptimal ? (
            <div className="badge">Proven optimal: {r.perLayer} per {isSheet ? 'pallet footprint' : 'layer'} is the maximum possible</div>
          ) : (
            <div className="badge warn">Best found: {r.perLayer} per layer (theoretical max {r.upperBound})</div>
          )}
        </div>
      </section>

      <section className="s-row foot">
        <div className="panel">
          <h2>Notes</h2>
          <div className="notes">{job.notes || ' '}</div>
        </div>
        <div className="panel">
          <h2>Approval</h2>
          <div className="sign">
            <div><span>Prepared by{job.preparedBy ? `: ${job.preparedBy}` : ''}</span><span>Date</span></div>
            <div><span>Approved by</span><span>Date</span></div>
          </div>
        </div>
      </section>

      <footer className="sheet-foot">
        <span>Pallet Pack-Out · dimensions in {lu === 'in' ? 'inches' : 'millimetres'} · OD = outside, ID = inside</span>
        <span>Page 1 of 1</span>
      </footer>
    </div>
  );
}

const oddList = (n: number) => `Layers ${Array.from({ length: Math.ceil(n / 2) }, (_, i) => 2 * i + 1).join(', ')}`;
const evenList = (n: number) => `Layers ${Array.from({ length: Math.floor(n / 2) }, (_, i) => 2 * i + 2).join(', ')} (alternate)`;
