/**
 * Pallet, flute and trailer tables. For this single-user version they are kept in the
 * browser (localStorage), seeded from the engine's defaults. Phase 3 moves
 * them to a hosted database so they follow you to any computer.
 */
import { useCallback, useEffect, useState } from 'react';
import { SEED_FLUTES, SEED_PALLETS, SEED_TRAILERS, type Flute, type Pallet, type Trailer } from '@packout/engine';

const KEYS = { pallets: 'ppo.pallets.v1', flutes: 'ppo.flutes.v1', trailers: 'ppo.trailers.v1' } as const;

/**
 * Stored rows, plus any default rows added since this browser last saw the
 * defaults (a default the user deleted stays deleted). `legacy` lists the
 * defaults that existed before this tracking began.
 */
function load<T extends { id?: string }>(key: string, seed: T[], legacy?: string[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    const seenRaw = localStorage.getItem(`${key}.seeds`);
    if (raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v) && v.length) {
        const rows = v as T[];
        const seen = new Set<string | undefined>(seenRaw ? JSON.parse(seenRaw) : legacy ?? seed.map((r) => r.id));
        const added = seed.filter((r) => !seen.has(r.id) && !rows.some((x) => x.id === r.id));
        return [...added.map((x) => ({ ...x })), ...rows];
      }
    }
  } catch {
    /* storage blocked or corrupt: fall back to seed */
  }
  return seed.map((x) => ({ ...x }));
}

function save<T>(key: string, rows: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

function useTable<T extends { id?: string }>(key: string, seed: T[], legacy?: string[]) {
  const [rows, setRows] = useState<T[]>(() => load(key, seed, legacy));
  useEffect(() => {
    save(key, rows);
    // Record which defaults this browser has seen, so later additions show up once.
    save(`${key}.seeds`, seed.map((r) => r.id));
  }, [key, rows, seed]);
  const upsert = useCallback((row: T) => {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.id === row.id);
      if (i < 0) return [...rs, row];
      const next = rs.slice();
      next[i] = row;
      return next;
    });
  }, []);
  const remove = useCallback((id: string) => setRows((rs) => rs.filter((r) => r.id !== id)), []);
  const reset = useCallback(() => setRows(seed.map((x) => ({ ...x }))), [seed]);
  return { rows, upsert, remove, reset };
}

export const usePallets = () => useTable<Pallet>(KEYS.pallets, SEED_PALLETS, ['gma-48x40-2way']);
export const useFlutes = () => useTable<Flute>(KEYS.flutes, SEED_FLUTES);
export const useTrailers = () => useTable<Trailer>(KEYS.trailers, SEED_TRAILERS);

export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
