/** Truck pack-out for the spec sheet's second page. */
import { solveTruck, type Pallet, type PackOutResult, type Trailer, type TruckPlan, type TruckUnit } from '@packout/engine';
import type { Job } from './job';

/** One unit load on the trailer floor: the larger of pallet and load, full height, gross weight. */
export function truckUnit(r: PackOutResult, pallet: Pallet): TruckUnit {
  return {
    length: Math.max(pallet.length, r.load.length),
    width: Math.max(pallet.width, r.load.width),
    height: r.load.height,
    weight: r.grossWeight,
  };
}

export function planTruck(job: Job, r: PackOutResult, pallet: Pallet, trailer: Trailer, allowTurn = job.truckTurn): TruckPlan {
  return solveTruck(trailer, truckUnit(r, pallet), {
    allowTurn,
    maxTiers: job.truckDoubleStack ? 2 : 1,
    // A payload override applies to the chosen trailer only.
    maxPayload: job.truckPayload != null && trailer.id === job.trailerId ? job.truckPayload : undefined,
  });
}
