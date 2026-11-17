import { useEffect, useRef, useState } from 'react';
import type { Flute, Pallet } from '@packout/engine';
import { newId } from '../library';
import { lenUnit, wtUnit, type UnitSystem } from '../units';
import { NumField, SelectField, TextField } from './Fields';

interface Table<T> {
  rows: T[];
  upsert: (r: T) => void;
  remove: (id: string) => void;
  reset: () => void;
}

interface Props {
  tab: 'pallets' | 'flutes';
  onTab: (t: 'pallets' | 'flutes') => void;
  pallets: Table<Pallet>;
  flutes: Table<Flute>;
  units: UnitSystem;
  onClose: () => void;
  inUse: { palletId: string; fluteIds: string[] };
}

/** Editable pallet and flute tables. */
export function LibraryEditor({ tab, onTab, pallets, flutes, units, onClose, inUse }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog ref={ref} className="library" onClose={onClose} onCancel={onClose}>
      <div className="lib-head">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'pallets'} className={tab === 'pallets' ? 'on' : ''} onClick={() => onTab('pallets')}>Pallets</button>
          <button role="tab" aria-selected={tab === 'flutes'} className={tab === 'flutes' ? 'on' : ''} onClick={() => onTab('flutes')}>Flutes</button>
        </div>
        <button className="ghost" onClick={() => ref.current?.close()}>Done</button>
      </div>
      {tab === 'pallets' ? <PalletTable t={pallets} units={units} inUse={inUse.palletId} /> : <FluteTable t={flutes} units={units} inUse={inUse.fluteIds} />}
    </dialog>
  );
}

function PalletTable({ t, units, inUse }: { t: Table<Pallet>; units: UnitSystem; inUse: string }) {
  const [editing, setEditing] = useState<Pallet | null>(null);
  return (
    <div className="lib-body">
      <table className="lib">
        <thead>
          <tr><th>Name</th><th>L × W × deck ({lenUnit(units)})</th><th>Weight ({wtUnit(units)})</th><th>Entry</th><th></th></tr>
        </thead>
        <tbody>
          {t.rows.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td className="num">{show(p.length, units)} × {show(p.width, units)} × {show(p.deckHeight, units)}</td>
              <td className="num">{units === 'imperial' ? p.weight : (p.weight * 0.45359237).toFixed(1)}</td>
              <td>{p.entry}</td>
              <td className="actions">
                <button className="link" onClick={() => setEditing({ ...p })}>Edit</button>
                <button className="link danger" disabled={p.id === inUse || t.rows.length === 1} title={p.id === inUse ? 'In use by the current pack-out' : undefined} onClick={() => p.id && t.remove(p.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing ? (
        <div className="lib-form">
          <TextField label="Name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
          <div className="grid3">
            <NumField label="Length (stringer direction)" kind="len" units={units} value={editing.length} onChange={(v) => setEditing({ ...editing, length: v ?? 0 })} />
            <NumField label="Width" kind="len" units={units} value={editing.width} onChange={(v) => setEditing({ ...editing, width: v ?? 0 })} />
            <NumField label="Deck height" kind="len" units={units} value={editing.deckHeight} onChange={(v) => setEditing({ ...editing, deckHeight: v ?? 0 })} />
            <NumField label="Pallet weight" kind="wt" units={units} value={editing.weight} onChange={(v) => setEditing({ ...editing, weight: v ?? 0 })} />
            <SelectField label="Entry" value={editing.entry} onChange={(v) => setEditing({ ...editing, entry: v })} options={[{ value: '2-way', label: '2-way' }, { value: '4-way', label: '4-way' }]} />
          </div>
          <div className="row-actions">
            <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="primary" disabled={!editing.name || !(editing.length > 0 && editing.width > 0)} onClick={() => { t.upsert(editing); setEditing(null); }}>Save pallet</button>
          </div>
        </div>
      ) : (
        <div className="row-actions">
          <button className="ghost" onClick={() => { if (confirm('Restore the default pallet list? Your custom pallets will be removed.')) t.reset(); }}>Restore defaults</button>
          <button className="primary" onClick={() => setEditing({ id: newId('pallet'), name: '', length: 48, width: 40, deckHeight: 5.5, weight: 45, entry: '2-way' })}>Add pallet</button>
        </div>
      )}
    </div>
  );
}

function FluteTable({ t, units, inUse }: { t: Table<Flute>; units: UnitSystem; inUse: string[] }) {
  const [editing, setEditing] = useState<Flute | null>(null);
  const areaUnit = units === 'imperial' ? 'lb/ft²' : 'kg/m²';
  const areaOut = (v: number) => (units === 'imperial' ? v : v * 4.88243);
  const areaIn = (v: number) => (units === 'imperial' ? v : v / 4.88243);
  return (
    <div className="lib-body">
      <table className="lib">
        <thead>
          <tr><th>Flute</th><th>Wall</th><th>Caliper ({lenUnit(units)})</th><th>Board weight ({areaUnit})</th><th></th></tr>
        </thead>
        <tbody>
          {t.rows.map((f) => (
            <tr key={f.id}>
              <td>{f.name}</td>
              <td>{f.wall}</td>
              <td className="num">{units === 'imperial' ? f.caliper.toFixed(4) : (f.caliper * 25.4).toFixed(2)}</td>
              <td className="num">{areaOut(f.weightPerArea).toFixed(3)}</td>
              <td className="actions">
                <button className="link" onClick={() => setEditing({ ...f })}>Edit</button>
                <button className="link danger" disabled={inUse.includes(f.id)} title={inUse.includes(f.id) ? 'In use by the current pack-out' : undefined} onClick={() => t.remove(f.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Calipers and weights are typical values; real board varies by mill. Edit them to match your supplier's specs.</p>
      {editing ? (
        <div className="lib-form">
          <div className="grid2">
            <TextField label="Name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
            <SelectField label="Wall" value={editing.wall} onChange={(v) => setEditing({ ...editing, wall: v })} options={[{ value: 'single', label: 'Single' }, { value: 'double', label: 'Double' }, { value: 'triple', label: 'Triple' }]} />
            <NumField label="Caliper" kind="len" units={units} value={editing.caliper} onChange={(v) => setEditing({ ...editing, caliper: v ?? 0 })} hint="Fractions OK, e.g. 5/32" />
            <NumField label={`Board weight (${areaUnit})`} units={units} value={areaOut(editing.weightPerArea)} onChange={(v) => setEditing({ ...editing, weightPerArea: areaIn(v ?? 0) })} />
          </div>
          <div className="row-actions">
            <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="primary" disabled={!editing.name || !(editing.caliper > 0)} onClick={() => { t.upsert(editing); setEditing(null); }}>Save flute</button>
          </div>
        </div>
      ) : (
        <div className="row-actions">
          <button className="ghost" onClick={() => { if (confirm('Restore the default flute list? Your changes will be lost.')) t.reset(); }}>Restore defaults</button>
          <button className="primary" onClick={() => setEditing({ id: newId('flute'), name: '', wall: 'single', caliper: 0.125, weightPerArea: 0.1 })}>Add flute</button>
        </div>
      )}
    </div>
  );
}

const show = (inches: number, u: UnitSystem) => (u === 'imperial' ? +inches.toFixed(3) : Math.round(inches * 25.4));
