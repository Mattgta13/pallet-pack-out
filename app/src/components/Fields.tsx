import { useEffect, useState, type ReactNode } from 'react';
import { lenIn, lenOut, lenUnit, wtIn, wtOut, wtUnit, type UnitSystem } from '../units';

type Kind = 'len' | 'wt' | 'plain';

interface NumProps {
  label: string;
  /** Value in inches / pounds (or plain). null = blank. */
  value: number | null;
  onChange: (v: number | null) => void;
  kind?: Kind;
  units: UnitSystem;
  allowBlank?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  step?: number;
}

const toDisplay = (v: number | null, kind: Kind, u: UnitSystem) => {
  if (v == null) return '';
  const d = kind === 'len' ? lenOut(v, u) : kind === 'wt' ? wtOut(v, u) : v;
  // Imperial values are stored exactly; metric ones are converted, so trim to useful precision.
  const dp = u === 'imperial' || kind === 'plain' ? 4 : kind === 'len' ? 2 : 3;
  const f = 10 ** dp;
  return String(Math.round(d * f) / f);
};

/** Number input that shows and accepts the current unit system but stores inches/pounds. */
export function NumField({ label, value, onChange, kind = 'plain', units, allowBlank, placeholder, hint, step }: NumProps) {
  const [text, setText] = useState(toDisplay(value, kind, units));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(toDisplay(value, kind, units));
  }, [value, kind, units, focused]);
  const unit = kind === 'len' ? lenUnit(units) : kind === 'wt' ? wtUnit(units) : '';
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          step={step}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(toDisplay(value, kind, units));
          }}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            if (t.trim() === '') {
              if (allowBlank) onChange(null);
              return;
            }
            const n = evalNumber(t);
            if (n == null) return;
            onChange(kind === 'len' ? lenIn(n, units) : kind === 'wt' ? wtIn(n, units) : n);
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Accepts decimals and simple fractions: "16.2", "5/32", "16 3/16". */
export function evalNumber(t: string): number | null {
  const s = t.trim().replace(/,/g, '');
  const mixed = s.match(/^(-?\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const frac = Number(mixed[2]) / Number(mixed[3]);
    return whole < 0 ? whole - frac : whole + frac;
  }
  const frac = s.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n : null;
}

export function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A button that asks for a second click instead of a browser confirm() pop-up
 * (pop-ups are blocked in some browsers and app panes, which silently cancels).
 */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'ghost', title }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string; title?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={armed ? `${className} confirm-armed` : className}
      title={title}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
