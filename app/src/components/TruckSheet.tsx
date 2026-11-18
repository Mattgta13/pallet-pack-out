import type { Pallet, PackOutResult, Trailer, TruckPlan, TruckRow } from '@packout/engine';
import type { Job } from '../job';
import { planTruck } from '../truck';
import { Iso } from '../draw/Iso';
import { fmtRun, truckScene, TruckPlanView, TruckSideView } from '../draw/TruckDiagram';
import { fmtInt, fmtLen, fmtPct, fmtWt, lenUnit, wtUnit, type UnitSystem } from '../units';

interface Props {
  job: Job;
  result: PackOutResult;
  pallet: Pallet;
  trailers: Trailer[];
  units: UnitSystem;
  showNotes?: boolean;
  logo?: string | null;
  onPickLogo?: () => void;
}

/** "13 rows of 2 straight, 1 row of 2 turned" */
function rowsText(rows: TruckRow[]) {
  const groups: { r: TruckRow; n: number }[] = [];
  for (const r of rows) {
    const g = groups[groups.length - 1];
    if (g && g.r.straight === r.straight && g.r.turned === r.turned) g.n++;
    else groups.push({ r, n: 1 });
  }
  return groups
    .map(({ r, n }) => {
      const what = [r.straight && `${r.straight} straight`, r.turned && `${r.turned} turned`].filter(Boolean).join(' + ');
      return `${n} row${n === 1 ? '' : 's'} of ${what}`;
    })
    .join(', ');
}

/** Second spec-sheet page: how the unit loads go on a truck. */
export function TruckSheet({ job, result: r, pallet, trailers, units, showNotes = true, logo, onPickLogo }: Props) {
  const isSheet = job.productType === 'sheet';
  const trailer = trailers.find((t) => t.id === job.trailerId) ?? trailers[0];
  if (!trailer) return null;
  const L = (v: number, dp?: number) => fmtLen(v, units, dp);
  const lu = lenUnit(units);
  const wu = wtUnit(units);
  const unitWord = isSheet ? 'inserts' : 'cases';
  const today = new Date().toLocaleDateString('en-US');
  const title = job.name || (isSheet ? 'Die-cut insert' : 'Case');

  const plan = planTruck(job, r, pallet, trailer);
  const perTruck = plan.pallets * r.total;
  // What the options cost: turning pallets, double-stacking.
  const withTurn = job.truckTurn ? null : planTruck(job, r, pallet, trailer, true);
  const withStack = job.truckDoubleStack ? null : planTruck({ ...job, truckDoubleStack: true }, r, pallet, trailer);
  const optimized = !withTurn || withTurn.pallets <= plan.pallets;
  const stackGain = withStack && withStack.pallets > plan.pallets ? withStack.pallets : 0;

  const all = trailers.map((t) => ({ t, p: t.id === trailer.id ? plan : planTruck(job, r, pallet, t) }));
  const bestUnits = Math.max(...all.map((a) => a.p.pallets));
  const trucks = job.orderPallets && plan.pallets ? Math.ceil(job.orderPallets / plan.pallets) : null;
  const turned = plan.positions.filter((p) => p.tiers > 0 && p.turned).length;
  const stackH = plan.tiers * r.load.height;

  const boxes = truckScene(plan, r, pallet);
  const note = bestNote(plan, withTurn);

  return (
    <div className="page">
      <header className="sheet-head">
        <div className="brand">
          {logo ? (
            <img className="logo-img" src={logo} alt="Company logo" />
          ) : (
            <button type="button" className="logo" onClick={onPickLogo} title="Upload a logo; it is used on every spec sheet">YOUR<br />LOGO</button>
          )}
          <div>
            <div className="doc-type">Truck Pack-Out Specification</div>
            <h1>{title}</h1>
          </div>
        </div>
        <dl className="meta">
          <dt>Spec #</dt><dd className="mono">{job.specNo || '—'}</dd>
          <dt>SKU / Item</dt><dd className="mono">{job.sku || '—'}</dd>
          <dt>Trailer</dt><dd className="mono">{trailer.name}</dd>
          <dt>Date</dt><dd className="mono">{today}</dd>
        </dl>
      </header>

      <section className="s-headline truck">
        <div className="tihi">
          <div className="lbl">Truck load (pallets × {unitWord})</div>
          <div className="big num">
            {plan.pallets} <span className="eq">×</span> {fmtInt(r.total)} <span className="eq">=</span> <span className="total">{fmtInt(perTruck)}<small>{unitWord} / truck</small></span>
          </div>
        </div>
        <div>
          <div className="lbl">Trailer inside (L × W × H)</div>
          <div className="big num mid">{L(trailer.length, 0)} × {L(trailer.width, 1)} × {L(trailer.height, 0)}<small> {lu}</small></div>
        </div>
        <div>
          <div className="lbl">Load weight</div>
          <div className="big num">{fmtWt(plan.weight, units, 0)} <small>{wu}</small></div>
        </div>
        <div>
          <div className="lbl">{trucks ? `Trucks for ${fmtInt(job.orderPallets!)} pallets` : 'Floor used'}</div>
          <div className="big num">{trucks ? <>{fmtInt(trucks)} <small>truck{trucks === 1 ? '' : 's'}</small></> : <>{fmtRun(plan.usedLength, units)} <small>of {fmtRun(trailer.length, units)}</small></>}</div>
        </div>
      </section>

      <section className="s-row truck-views">
        <div className="panel">
          <h2>Trailer load <span className="tag">3D view · loaded from the doors</span></h2>
          <Iso boxes={boxes} frame={{ l: trailer.length, w: trailer.width, h: trailer.height }} width={400} height={250} pad={12} edgeWidth={0.5} />
          <div className="legend">
            <span><i className="sw" style={{ background: 'var(--kraft)' }} />Pallet straight</span>
            <span><i className="sw" style={{ background: 'var(--rot)' }} />Pallet turned 90°</span>
            <span><i className="sw" style={{ background: 'var(--wood-side)' }} />Pallet deck</span>
          </div>
        </div>
        <div className="panel">
          <h2>Side view <span className="tag">{plan.tiers > 1 ? 'double-stacked' : 'single tier'}</span></h2>
          <TruckSideView plan={plan} units={units} deck={pallet.deckHeight} unitH={r.load.height} />
          <dl className="kv">
            <dt>Unit load</dt><dd>{L(Math.max(pallet.length, r.load.length))} × {L(Math.max(pallet.width, r.load.width))} × {L(r.load.height)} {lu} · {fmtWt(r.grossWeight, units, 0)} {wu}</dd>
            <dt>Floor pattern</dt><dd>{rowsText(plan.rows) || '—'}</dd>
            <dt>Floor spots</dt><dd>{plan.floorSpots}{turned ? ` · ${turned} turned 90°` : ''}</dd>
            <dt>Tiers</dt><dd>{plan.tiers > 1 ? `2 high · ${L(stackH)} ${lu} of ${L(trailer.height)}` : `1 · ${L(r.load.height)} ${lu} of ${L(trailer.height)}`}</dd>
            <dt>Payload</dt><dd>{fmtWt(plan.payload, units, 0)} {wu}{job.truckPayload != null ? ' (set for this load)' : ''}</dd>
          </dl>
        </div>
      </section>

      <section className="panel">
        <h2>Floor plan <span className="tag">top view · numbers give the loading order from the nose{plan.tiers > 1 ? ' · ×2 = stacked two high' : ''}</span></h2>
        <TruckPlanView plan={plan} units={units} />
      </section>

      <section className="s-row truck-data">
        <div className="panel">
          <h2>Limits &amp; efficiency</h2>
          <div className="limit">
            <div className="top"><span>Floor length</span><span className="num"><b>{fmtRun(plan.usedLength, units)}</b> / {fmtRun(trailer.length, units)}</span></div>
            <div className="bar"><i style={{ width: `${Math.min(100, (plan.usedLength / trailer.length) * 100)}%` }} /></div>
          </div>
          <div className="limit">
            <div className="top"><span>Payload</span><span className="num"><b>{fmtWt(plan.weight, units, 0)}</b> / {fmtWt(plan.payload, units, 0)} {wu}</span></div>
            <div className="bar muted-bar"><i style={{ width: `${Math.min(100, (plan.weight / (plan.payload || 1)) * 100)}%` }} /></div>
          </div>
          <div className="limit">
            <div className="top"><span>Load height</span><span className="num"><b>{L(stackH)}</b> / {L(trailer.height)} {lu}</span></div>
            <div className="bar"><i style={{ width: `${Math.min(100, (stackH / trailer.height) * 100)}%` }} /></div>
          </div>
          <div className="controls">
            {plan.limitedBy === 'floor' && <><b>Pallet count set by floor space.</b> {plan.tiers > 1 ? 'Every spot is stacked two high.' : 'Every floor spot is used.'}</>}
            {plan.limitedBy === 'weight' && <><b>Pallet count set by payload.</b> One more pallet would exceed {fmtWt(plan.payload, units, 0)} {wu}.</>}
            {plan.limitedBy === 'height' && <><b>Too tall to double-stack.</b> Two loads are {L(r.load.height * 2)} {lu}; the door is {L(trailer.height)} {lu}.</>}
            {stackGain > 0 && <> Double-stacking would fit {stackGain} pallets if the load can carry the weight.</>}
          </div>
          <div className="eff">
            <div className="ecard"><div className="v num">{fmtPct(plan.floorUtil)}</div><div className="d">Floor utilization<br />pallet footprints ÷ trailer floor</div></div>
            <div className="ecard"><div className="v num">{fmtPct(plan.cubeUtil)}</div><div className="d">Cube utilization<br />load volume ÷ trailer volume</div></div>
          </div>
          {showNotes && <div className={optimized ? 'badge' : 'badge warn'}>{note}</div>}
        </div>

        <div className="panel">
          <h2>Trailer comparison <span className="tag">same unit load and settings</span></h2>
          <table className="s-table">
            <thead>
              <tr><th>Trailer</th><th>Pallets</th><th>{isSheet ? 'Inserts' : 'Cases'}</th><th>Weight, {wu}</th><th>Floor</th><th>Limit</th></tr>
            </thead>
            <tbody>
              {all.map(({ t, p }) => (
                <tr key={t.id ?? t.name} className={t.id === trailer.id ? 'sel' : undefined}>
                  <td className="l">{t.name}{t.id === trailer.id ? ' ◂' : ''}</td>
                  <td className={p.pallets === bestUnits && p.pallets > 0 ? 'n best' : 'n'}>{p.pallets}</td>
                  <td className="n">{fmtInt(p.pallets * r.total)}</td>
                  <td className="n">{fmtWt(p.weight, units, 0)}</td>
                  <td className="n">{fmtPct(p.floorUtil)}</td>
                  <td>{LIMIT[p.limitedBy]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sheet-hint">Green marks the most pallets per trip. ◂ is the trailer this sheet is for.</p>
        </div>
      </section>

      <footer className="sheet-foot">
        <span>Pallet Pack-Out · dimensions in {lu === 'in' ? 'inches' : 'millimetres'} · trailer sizes are inside dimensions</span>
        <span>Page 2 of 2</span>
      </footer>
    </div>
  );
}

const LIMIT: Record<TruckPlan['limitedBy'], string> = { floor: 'Floor', weight: 'Payload', height: 'Height' };

function bestNote(plan: TruckPlan, withTurn: TruckPlan | null) {
  const n = plan.pallets;
  if (withTurn && withTurn.pallets > n) return `Not optimized: ${n} pallets with all straight. Turning some 90° would fit ${withTurn.pallets}.`;
  if (!n) return 'The unit load does not fit this trailer.';
  const on = plan.positions.filter((p) => p.tiers > 0);
  const turned = on.filter((p) => p.turned).length;
  const how = !turned ? ', all straight' : turned === on.length ? ', all turned 90°' : ', mixing straight and turned pallets';
  return `Best found: ${n} pallets per truck${how}.`;
}
