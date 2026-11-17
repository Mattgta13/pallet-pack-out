/** The pack-out being edited. All lengths in inches, weights in pounds. */
import { useEffect, useState } from 'react';
import { sheetWeight, type Direction, type Flute, type PackOutInput, type Pallet, type StackingStyle } from '@packout/engine';

export interface Job {
  productType: 'case' | 'sheet';
  // identity / spec sheet header
  name: string;
  sku: string;
  specNo: string;
  revision: string;
  preparedBy: string;
  notes: string;
  // case
  length: number;
  width: number;
  height: number;
  weight: number;
  unitsPerCase: number;
  thisSideUp: boolean;
  caseFluteId: string; // '' = unknown, no inside dims
  // die-cut sheet
  fluteId: string;
  thicknessOverride: number | null;
  sheetWeightOverride: number | null;
  // pallet + limits
  palletId: string;
  maxHeight: number;
  maxGross: number;
  maxLayers: number | null;
  overhangEnds: number;
  overhangSides: number;
  stacking: StackingStyle;
  direction: Direction;
  sheetsPerLift: number;
  // strapping
  strapping: boolean;
  strapCount: number;
  strapDirection: 'lengthwise' | 'widthwise' | 'both ways';
}

export const DEFAULT_JOB: Job = {
  productType: 'case',
  name: 'Sample Shipper',
  sku: '',
  specNo: '',
  revision: 'A',
  preparedBy: '',
  notes: '',
  length: 16.2,
  width: 11.4,
  height: 9.1,
  weight: 5,
  unitsPerCase: 12,
  thisSideUp: true,
  caseFluteId: 'C',
  fluteId: 'C',
  thicknessOverride: null,
  sheetWeightOverride: null,
  palletId: 'gma-48x40-2way',
  maxHeight: 52,
  maxGross: 5000,
  maxLayers: null,
  overhangEnds: 0,
  overhangSides: 0,
  stacking: 'auto',
  direction: 'mixed',
  sheetsPerLift: 50,
  strapping: false,
  strapCount: 2,
  strapDirection: 'lengthwise',
};

const KEY = 'ppo.job.v1';

export function useJob() {
  const [job, setJob] = useState<Job>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...DEFAULT_JOB, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return DEFAULT_JOB;
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(job));
    } catch {
      /* ignore */
    }
  }, [job]);
  const set = <K extends keyof Job>(k: K, v: Job[K]) => setJob((j) => ({ ...j, [k]: v }));
  return { job, set, setJob, reset: () => setJob(DEFAULT_JOB) };
}

export function sheetThickness(job: Job, flute?: Flute) {
  return job.thicknessOverride ?? flute?.caliper ?? 0;
}

export function sheetUnitWeight(job: Job, flute?: Flute) {
  if (job.sheetWeightOverride != null) return job.sheetWeightOverride;
  return flute ? sheetWeight(job.length, job.width, flute) : 0;
}

/** Build the engine input, or an error message if the job is incomplete. */
export function toInput(job: Job, pallet: Pallet | undefined, flutes: Flute[]): PackOutInput | string {
  if (!pallet) return 'Choose a pallet.';
  if (!(job.length > 0 && job.width > 0)) return 'Enter the length and width.';
  const constraints = {
    maxHeight: job.maxHeight,
    maxGrossWeight: job.maxGross,
    maxLayers: job.maxLayers ?? undefined,
    overhangEnds: job.overhangEnds,
    overhangSides: job.overhangSides,
    stacking: job.stacking,
    direction: job.direction,
    sheetsPerLift: job.sheetsPerLift,
  };
  if (job.productType === 'case') {
    if (!(job.height > 0)) return 'Enter the case height.';
    const flute = flutes.find((f) => f.id === job.caseFluteId);
    return {
      product: {
        kind: 'case',
        name: job.name,
        length: job.length,
        width: job.width,
        height: job.height,
        weight: job.weight,
        unitsPerCase: job.unitsPerCase || undefined,
        thisSideUp: job.thisSideUp,
        caliper: flute?.caliper,
      },
      pallet,
      constraints,
    };
  }
  const flute = flutes.find((f) => f.id === job.fluteId);
  const t = sheetThickness(job, flute);
  if (!(t > 0)) return 'Choose a flute or enter a sheet thickness.';
  return {
    product: {
      kind: 'sheet',
      name: job.name,
      length: job.length,
      width: job.width,
      thickness: t,
      weight: sheetUnitWeight(job, flute),
      fluteId: flute?.id,
    },
    pallet,
    constraints,
  };
}
