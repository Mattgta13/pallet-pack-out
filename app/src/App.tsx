import { useEffect, useMemo, useState } from 'react';
import { InputPanel } from './components/InputPanel';
import { Results } from './components/Results';
import { SpecSheet } from './components/SpecSheet';
import { LibraryEditor } from './components/LibraryEditor';
import { Segmented } from './components/Fields';
import { toInput, useJob } from './job';
import { useFlutes, usePallets } from './library';
import { useSolver } from './useSolver';
import { resultKey } from './describe';
import type { UnitSystem } from './units';

const UNITS_KEY = 'ppo.units.v1';
const NOTES_KEY = 'ppo.showNotes.v1';

export default function App() {
  const { job, set, reset } = useJob();
  const pallets = usePallets();
  const flutes = useFlutes();
  const [units, setUnits] = useState<UnitSystem>(() => {
    try {
      return (localStorage.getItem(UNITS_KEY) as UnitSystem) || 'imperial';
    } catch {
      return 'imperial';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(UNITS_KEY, units);
    } catch {
      /* ignore */
    }
  }, [units]);

  // Optimization notes: one setting for the results panel and the spec sheet.
  const [showNotes, setShowNotes] = useState(() => {
    try { return localStorage.getItem(NOTES_KEY) !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(NOTES_KEY, showNotes ? '1' : '0'); } catch { /* ignore */ }
  }, [showNotes]);

  const [view, setView] = useState<'calc' | 'spec'>('calc');
  const [library, setLibrary] = useState<null | 'pallets' | 'flutes'>(null);
  const [selKey, setSelKey] = useState<string | null>(null);

  const pallet = pallets.rows.find((p) => p.id === job.palletId) ?? pallets.rows[0];
  // Keep the job pointing at a pallet that exists.
  useEffect(() => {
    if (pallet && pallet.id !== job.palletId && pallet.id) set('palletId', pallet.id);
  }, [pallet, job.palletId, set]);

  const input = useMemo(() => toInput(job, pallet, flutes.rows), [job, pallet, flutes.rows]);
  const { results, error, busy, ms } = useSolver(input);
  const selected = results.find((r) => resultKey(r) === selKey) ?? results[0];

  return (
    <div className={`app view-${view}`}>
      <header className="topbar">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="3" y="13" width="18" height="3" rx="0.5" fill="var(--pallet)" />
            <rect x="4" y="5" width="7.5" height="7.5" rx="0.5" fill="var(--kraft)" stroke="var(--kraft-dark)" />
            <rect x="12.5" y="5" width="7.5" height="7.5" rx="0.5" fill="var(--rot)" stroke="var(--rot-dark)" />
            <rect x="4" y="17" width="2" height="3" fill="var(--pallet-dark)" /><rect x="11" y="17" width="2" height="3" fill="var(--pallet-dark)" /><rect x="18" y="17" width="2" height="3" fill="var(--pallet-dark)" />
          </svg>
          <span>Pallet Pack-Out</span>
        </div>
        <div className="topbar-right">
          <Segmented ariaLabel="Units" value={units} onChange={setUnits} options={[{ value: 'imperial', label: 'in / lb' }, { value: 'metric', label: 'mm / kg' }]} />
          {view === 'calc' ? (
            <>
              <button className="ghost" onClick={() => { if (confirm('Start a new pack-out? The current inputs will be cleared.')) reset(); }}>New</button>
              <button className="primary" disabled={!selected} onClick={() => setView('spec')}>Spec sheet</button>
            </>
          ) : (
            <>
              <button className="ghost" onClick={() => setView('calc')}>← Back to calculator</button>
              <button className="primary" onClick={() => window.print()}>Print / Save PDF</button>
            </>
          )}
        </div>
      </header>

      {view === 'calc' || !selected || !pallet ? (
        <main className="calc">
          <InputPanel job={job} set={set} units={units} pallets={pallets.rows} flutes={flutes.rows} onManage={setLibrary} />
          {pallet ? (
            <Results
              results={results}
              selected={selected}
              onSelect={setSelKey}
              pallet={pallet}
              isSheet={job.productType === 'sheet'}
              units={units}
              maxHeight={job.maxHeight}
              maxGross={job.maxGross}
              busy={busy}
              error={error}
              ms={ms}
              onOpenSpec={() => setView('spec')}
              strapping={job.strapping ? { count: job.strapCount, direction: job.strapDirection } : null}
              showNotes={showNotes}
              onShowNotes={setShowNotes}
            />
          ) : (
            <div className="empty card">Add a pallet to get started.</div>
          )}
        </main>
      ) : (
        <main className="spec">
          <SpecSheet job={job} result={selected} pallet={pallet} flutes={flutes.rows} units={units} showNotes={showNotes} />
        </main>
      )}

      {library && (
        <LibraryEditor
          tab={library}
          onTab={setLibrary}
          pallets={pallets}
          flutes={flutes}
          units={units}
          onClose={() => setLibrary(null)}
          inUse={{ palletId: job.palletId, fluteIds: [job.fluteId, job.caseFluteId].filter(Boolean) }}
        />
      )}
    </div>
  );
}
