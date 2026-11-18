import type { Direction, Flute, Pallet, StackingStyle, Trailer } from '@packout/engine';
import type { Job } from '../job';
import { sheetThickness, sheetUnitWeight } from '../job';
import { fmtLen, fmtWt, lenUnit, type UnitSystem } from '../units';
import { DieLineField } from './DieLineField';
import type { LibraryTab } from './LibraryEditor';
import { Check, NumField, SelectField, Segmented, TextField } from './Fields';

interface Props {
  job: Job;
  set: <K extends keyof Job>(k: K, v: Job[K]) => void;
  units: UnitSystem;
  pallets: Pallet[];
  flutes: Flute[];
  trailers: Trailer[];
  onManage: (tab: LibraryTab) => void;
}

export function InputPanel({ job, set, units, pallets, flutes, trailers, onManage }: Props) {
  const isSheet = job.productType === 'sheet';
  const pallet = pallets.find((p) => p.id === job.palletId) ?? pallets[0];
  const flute = flutes.find((f) => f.id === job.fluteId);
  const trailer = trailers.find((t) => t.id === job.trailerId) ?? trailers[0];
  const fluteOptions = flutes.map((f) => ({
    value: f.id,
    label: `${f.name} — ${fmtLen(f.caliper, units, units === 'imperial' ? 4 : 1)} ${lenUnit(units)}`,
  }));

  return (
    <div className="inputs">
      <section className="card">
        <h3>Product</h3>
        <Segmented
          ariaLabel="Product type"
          value={job.productType}
          onChange={(v) => set('productType', v)}
          options={[
            { value: 'sheet', label: 'Die-cut sheet' },
            { value: 'case', label: 'Case' },
          ]}
        />
        <div className="grid2">
          <TextField label="Name" value={job.name} onChange={(v) => set('name', v)} />
          <TextField label="SKU / item #" value={job.sku} onChange={(v) => set('sku', v)} />
        </div>
        <div className={isSheet ? 'grid2' : 'grid3'}>
          <NumField label="Length" kind="len" units={units} value={job.length} onChange={(v) => set('length', v ?? 0)} />
          <NumField label="Width" kind="len" units={units} value={job.width} onChange={(v) => set('width', v ?? 0)} />
          {!isSheet && <NumField label="Height" kind="len" units={units} value={job.height} onChange={(v) => set('height', v ?? 0)} />}
        </div>

        {isSheet ? (
          <>
            <SelectField
              label="Flute (sets sheet thickness)"
              value={job.fluteId}
              onChange={(v) => set('fluteId', v)}
              options={fluteOptions}
              hint={<button type="button" className="link" onClick={() => onManage('flutes')}>Edit flute table</button>}
            />
            <div className="grid2">
              <NumField
                label="Thickness override"
                kind="len"
                units={units}
                allowBlank
                placeholder={flute ? fmtLen(flute.caliper, units, units === 'imperial' ? 4 : 1) : ''}
                value={job.thicknessOverride}
                onChange={(v) => set('thicknessOverride', v)}
              />
              <NumField
                label="Sheet weight"
                kind="wt"
                units={units}
                allowBlank
                placeholder={fmtWt(sheetUnitWeight({ ...job, sheetWeightOverride: null }, flute), units, 3)}
                value={job.sheetWeightOverride}
                onChange={(v) => set('sheetWeightOverride', v)}
                hint={job.sheetWeightOverride != null ? 'Manual value' : job.dieLine ? 'Die-cut area × flute weight' : 'Calculated from blank size × flute weight'}
              />
            </div>
            <p className="muted small">
              Using {fmtLen(sheetThickness(job, flute), units, units === 'imperial' ? 4 : 2)} {lenUnit(units)} per sheet; sheets lie flat.
            </p>
            <DieLineField
              die={job.dieLine}
              length={job.length}
              width={job.width}
              units={units}
              onChange={(d) => set('dieLine', d)}
              onSize={(l, w) => {
                set('length', l);
                set('width', w);
              }}
            />
          </>
        ) : (
          <>
            <div className="grid2">
              <NumField label="Case weight" kind="wt" units={units} value={job.weight} onChange={(v) => set('weight', v ?? 0)} />
              <NumField label="Units per case" units={units} value={job.unitsPerCase} onChange={(v) => set('unitsPerCase', Math.max(0, Math.round(v ?? 0)))} />
            </div>
            <SelectField
              label="Case board (for inside dimensions)"
              value={job.caseFluteId}
              onChange={(v) => set('caseFluteId', v)}
              options={[{ value: '', label: 'Not specified' }, ...fluteOptions]}
            />
            <Check label="This side up (height stays vertical)" checked={job.thisSideUp} onChange={(v) => set('thisSideUp', v)} />
          </>
        )}
      </section>

      <section className="card">
        <h3>Pallet &amp; limits</h3>
        <SelectField
          label="Pallet"
          value={job.palletId}
          onChange={(v) => set('palletId', v)}
          options={pallets.map((p) => ({ value: p.id ?? p.name, label: p.name }))}
          hint={<button type="button" className="link" onClick={() => onManage('pallets')}>Add or edit pallets</button>}
        />
        <div className="grid2">
          <NumField label="Max height (incl. pallet)" kind="len" units={units} value={job.maxHeight} onChange={(v) => set('maxHeight', v ?? 0)} />
          <NumField label="Max gross weight" kind="wt" units={units} value={job.maxGross} onChange={(v) => set('maxGross', v ?? 0)} />
          <NumField label="Overhang, each end" kind="len" units={units} value={job.overhangEnds} onChange={(v) => set('overhangEnds', v ?? 0)} hint="Negative = underhang" />
          <NumField label="Overhang, each side" kind="len" units={units} value={job.overhangSides} onChange={(v) => set('overhangSides', v ?? 0)} hint="Negative = underhang" />
          {!isSheet && (
            <NumField label="Max layers" units={units} allowBlank placeholder="No limit" value={job.maxLayers} onChange={(v) => set('maxLayers', v == null ? null : Math.max(1, Math.round(v)))} />
          )}
        </div>
      </section>

      <section className="card">
        <h3>Stacking</h3>
        <Segmented<StackingStyle>
          ariaLabel="Stacking style"
          value={job.stacking}
          onChange={(v) => set('stacking', v)}
          options={[
            { value: 'auto', label: 'Compare both' },
            { value: 'column', label: 'All layers same' },
            { value: 'interlock', label: 'Patterned' },
          ]}
        />
        <SelectField<Direction>
          label={isSheet ? 'Stack direction across the pallet' : 'Case direction across the pallet'}
          value={job.direction}
          onChange={(v) => set('direction', v)}
          options={[
            { value: 'mixed', label: 'Best fit (directions can mix)' },
            { value: 'lengthwise', label: `All lengthwise: ${fmtLen(job.length, units, 1)} along the pallet's ${fmtLen(pallet?.length ?? 0, units, 0)} ${lenUnit(units)} side` },
            { value: 'crosswise', label: `All crosswise: ${fmtLen(job.width, units, 1)} along the pallet's ${fmtLen(pallet?.length ?? 0, units, 0)} ${lenUnit(units)} side` },
          ]}
          hint={job.direction === 'mixed' ? 'Turns some units 90° when that fits more' : 'Every unit in a layer faces the same way'}
        />
        {isSheet && job.stacking !== 'column' && (
          <NumField label="Sheets per lift" units={units} value={job.sheetsPerLift} onChange={(v) => set('sheetsPerLift', Math.max(1, Math.round(v ?? 1)))} hint="Each lift alternates its layout" />
        )}
        <Check label="Strapping" checked={job.strapping} onChange={(v) => set('strapping', v)} />
        {job.strapping && (
          <div className="grid2">
            <NumField label="Straps" units={units} value={job.strapCount} onChange={(v) => set('strapCount', Math.max(1, Math.round(v ?? 1)))} />
            <SelectField
              label="Direction"
              value={job.strapDirection}
              onChange={(v) => set('strapDirection', v)}
              options={[
                { value: 'lengthwise', label: 'Lengthwise' },
                { value: 'widthwise', label: 'Widthwise' },
                { value: 'both ways', label: 'Both ways' },
              ]}
            />
          </div>
        )}
      </section>

      <section className="card">
        <h3>Spec sheet details</h3>
        <div className="grid2">
          <TextField label="Spec #" value={job.specNo} onChange={(v) => set('specNo', v)} />
          <TextField label="Prepared by" value={job.preparedBy} onChange={(v) => set('preparedBy', v)} />
        </div>
        <label className="field">
          <span className="field-label">Notes</span>
          <textarea rows={3} value={job.notes} onChange={(e) => set('notes', e.target.value)} />
        </label>
      </section>

      <section className="card">
        <h3>Truck load</h3>
        <Check label="Add truck pack-out page to the spec sheet" checked={job.truckPage} onChange={(v) => set('truckPage', v)} />
        {job.truckPage && (
          <>
            <SelectField
              label="Trailer"
              value={trailer?.id ?? ''}
              onChange={(v) => { set('trailerId', v); set('truckPayload', null); }}
              options={trailers.map((t) => ({ value: t.id ?? t.name, label: t.name }))}
              hint={<button type="button" className="link" onClick={() => onManage('trailers')}>Add or edit trailers</button>}
            />
            <div className="grid2">
              <NumField
                label="Max payload"
                kind="wt"
                units={units}
                allowBlank
                placeholder={trailer ? fmtWt(trailer.maxPayload, units, 0) : ''}
                value={job.truckPayload}
                onChange={(v) => set('truckPayload', v)}
                hint={job.truckPayload != null ? 'Manual value' : 'From the trailer table'}
              />
              <NumField
                label="Pallets to ship"
                units={units}
                allowBlank
                placeholder="Optional"
                value={job.orderPallets}
                onChange={(v) => set('orderPallets', v == null ? null : Math.max(1, Math.round(v)))}
                hint="Gives the trucks needed"
              />
            </div>
            <Check label="Pallets can be turned 90° in the trailer" checked={job.truckTurn} onChange={(v) => set('truckTurn', v)} />
            <Check label="Double-stack pallets when the height allows" checked={job.truckDoubleStack} onChange={(v) => set('truckDoubleStack', v)} />
          </>
        )}
      </section>
    </div>
  );
}
