/**
 * Seed data for the editable pallet and flute tables (inches / lb).
 * These are typical industry values; real board and pallets vary by supplier,
 * so the app lets the user edit every row.
 */
import type { Flute, Pallet, Trailer } from './types';

export const SEED_PALLETS: Pallet[] = [
  { id: 'gma-48x40-4way', name: 'GMA 48 × 40 (4-way)', length: 48, width: 40, deckHeight: 5.5, weight: 48, entry: '4-way', construction: 'stringer' },
  { id: 'gma-48x40-2way', name: 'GMA 48 × 40 (2-way)', length: 48, width: 40, deckHeight: 5.5, weight: 45, entry: '2-way' },
];

/** Typical inside sizes (height = door opening) and road-legal payloads. Edit to match your carriers. */
export const SEED_TRAILERS: Trailer[] = [
  { id: 'van-53', name: "53' dry van", length: 630, width: 98.5, height: 106, maxPayload: 45000 },
  { id: 'van-48', name: "48' dry van", length: 570, width: 98.5, height: 106, maxPayload: 45000 },
  { id: 'reefer-53', name: "53' reefer", length: 618, width: 98, height: 100, maxPayload: 43500 },
  { id: 'hc-40', name: "40' high-cube container", length: 473, width: 92.5, height: 101, maxPayload: 44000 },
  { id: 'dc-20', name: "20' container", length: 233, width: 92.5, height: 89.5, maxPayload: 38000 },
];

export const SEED_FLUTES: Flute[] = [
  { id: 'F', name: 'F flute', wall: 'single', caliper: 1 / 32, weightPerArea: 0.08 },
  { id: 'E', name: 'E flute', wall: 'single', caliper: 1 / 16, weightPerArea: 0.085 },
  { id: 'B', name: 'B flute', wall: 'single', caliper: 1 / 8, weightPerArea: 0.095 },
  { id: 'C', name: 'C flute', wall: 'single', caliper: 5 / 32, weightPerArea: 0.11 },
  { id: 'A', name: 'A flute', wall: 'single', caliper: 3 / 16, weightPerArea: 0.12 },
  { id: 'EB', name: 'EB double wall', wall: 'double', caliper: 3 / 16, weightPerArea: 0.17 },
  { id: 'BC', name: 'BC double wall', wall: 'double', caliper: 1 / 4, weightPerArea: 0.2 },
  { id: 'AAA', name: 'Triple wall', wall: 'triple', caliper: 1 / 2, weightPerArea: 0.45 },
];

/** Weight of one die-cut sheet from its blank size (inches) and the flute's lb/ft². */
export function sheetWeight(lengthIn: number, widthIn: number, flute: Flute): number {
  return ((lengthIn * widthIn) / 144) * flute.weightPerArea;
}

/** Inside dimensions of an RSC from outside dimensions and board caliper:
 *  L and W lose two walls, H loses the four flap thicknesses (top and bottom). */
export function insideDims(l: number, w: number, h: number, caliper: number) {
  return { length: l - 2 * caliper, width: w - 2 * caliper, height: h - 4 * caliper };
}
