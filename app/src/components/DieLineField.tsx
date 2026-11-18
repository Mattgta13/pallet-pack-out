import { useRef, useState } from 'react';
import { DIE_UNITS, dieSize, pathD, readDieLine, type DieLine, type DieUnit } from '../dieline';
import { fmtLen, lenUnit, type UnitSystem } from '../units';

interface Props {
  die: DieLine | null;
  length: number;
  width: number;
  units: UnitSystem;
  onChange: (die: DieLine | null) => void;
  /** Set the blank's length and width (inches). */
  onSize: (length: number, width: number) => void;
}

/** Small drawing of the die line: outline filled, cuts solid, creases dashed. */
export function DiePreview({ die, w = 120, h = 80 }: { die: DieLine; w?: number; h?: number }) {
  const pad = 4;
  const s = Math.min((w - 2 * pad) / die.rawW, (h - 2 * pad) / die.rawH);
  const dw = die.rawW * s, dh = die.rawH * s;
  const f = ([u, v]: [number, number]): [number, number] => [(w - dw) / 2 + u * dw, (h - dh) / 2 + v * dh];
  return (
    <svg className="die-preview" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Die line preview">
      <path d={pathD([[...die.outline, die.outline[0]]], f)} fill="var(--kraft)" stroke="none" />
      <path d={pathD(die.cut, f)} fill="none" stroke="var(--die-cut)" strokeWidth={0.8} />
      <path d={pathD(die.crease, f)} fill="none" stroke="var(--die-crease)" strokeWidth={0.7} strokeDasharray="2 1.5" />
    </svg>
  );
}

export function DieLineField({ die, length, width, units, onChange, onSize }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const d = await readDieLine(file);
      onChange(d);
      const [l, w] = dieSize(d);
      onSize(round(l), round(w));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const setUnit = (u: DieUnit) => {
    if (!die) return;
    const d = { ...die, unit: u, unitSource: 'user' as const };
    onChange(d);
    const [l, w] = dieSize(d);
    onSize(round(l), round(w));
  };

  const size = die ? dieSize(die) : null;
  const tol = 0.01 * Math.max(length, width);
  const fits = size && ((Math.abs(size[0] - length) <= tol && Math.abs(size[1] - width) <= tol) || (Math.abs(size[0] - width) <= tol && Math.abs(size[1] - length) <= tol));
  const lu = lenUnit(units);

  return (
    <div className="field die-field">
      <span className="field-label">Die line <span className="muted">(optional)</span></span>
      <input ref={input} type="file" accept=".dxf,.svg,image/svg+xml" hidden onChange={(e) => load(e.target.files?.[0])} />
      {!die ? (
        <div
          className="die-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            load(e.dataTransfer.files[0]);
          }}
        >
          <button type="button" className="ghost" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? 'Reading…' : 'Upload die line…'}
          </button>
          <span className="muted small">DXF or SVG, or drop the file here. Shows the custom shape in the drawings.</span>
        </div>
      ) : (
        <div className="die-card">
          <DiePreview die={die} />
          <div className="die-info">
            <b title={die.name}>{die.name}</b>
            <span className="small">
              {fmtLen(size![0], units)} × {fmtLen(size![1], units)} {lu} · {Math.round(die.areaFraction * 100)}% of the rectangle
            </span>
            <label className="small die-unit">
              File units
              <select value={die.unit} onChange={(e) => setUnit(e.target.value as DieUnit)}>
                {DIE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
              {die.unitSource === 'guess' && <span className="warn-text">guessed, please check</span>}
            </label>
            <div className="die-actions">
              <button type="button" className="link" onClick={() => input.current?.click()}>Replace</button>
              <button type="button" className="link" onClick={() => onChange(null)}>Remove</button>
            </div>
          </div>
        </div>
      )}
      {die && !fits && (
        <p className="note small">
          Length × width differ from the die line ({fmtLen(size![0], units)} × {fmtLen(size![1], units)} {lu}); the shape is stretched to fit.{' '}
          <button type="button" className="link" onClick={() => onSize(round(size![0]), round(size![1]))}>Use die-line size</button>
        </p>
      )}
      {die?.approxOutline && <p className="muted small">The outline isn't one closed cut line, so its outer edge is approximated.</p>}
      {die && <p className="muted small">Stacks are packed by the blank's rectangle; the sheet weight uses the die-cut area.</p>}
      {error && <p className="note small">{error}</p>}
    </div>
  );
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;
