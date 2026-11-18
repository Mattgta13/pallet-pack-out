/**
 * Pallet, flute and trailer tables. For this single-user version they are kept in the
 * browser (localStorage), seeded from the engine's defaults. Phase 3 moves
 * them to a hosted database so they follow you to any computer.
 */
import { useCallback, useEffect, useState } from 'react';
import { SEED_FLUTES, SEED_PALLETS, SEED_TRAILERS, type Flute, type Pallet, type Trailer } from '@packout/engine';

const KEYS = { pallets: 'ppo.pallets.v1', flutes: 'ppo.flutes.v1', trailers: 'ppo.trailers.v1' } as const;

function load<T>(key: string, seed: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v) && v.length) return v as T[];
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

function useTable<T extends { id?: string }>(key: string, seed: T[]) {
  const [rows, setRows] = useState<T[]>(() => load(key, seed));
  useEffect(() => save(key, rows), [key, rows]);
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

export const usePallets = () => useTable<Pallet>(KEYS.pallets, SEED_PALLETS);
export const useFlutes = () => useTable<Flute>(KEYS.flutes, SEED_FLUTES);
export const useTrailers = () => useTable<Trailer>(KEYS.trailers, SEED_TRAILERS);

export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
