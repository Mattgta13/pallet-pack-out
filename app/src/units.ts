/** The app stores everything in inches and pounds; these helpers convert for display. */
export type UnitSystem = 'imperial' | 'metric';

export const MM_PER_IN = 25.4;
export const KG_PER_LB = 0.45359237;

export const lenUnit = (u: UnitSystem) => (u === 'imperial' ? 'in' : 'mm');
export const wtUnit = (u: UnitSystem) => (u === 'imperial' ? 'lb' : 'kg');
export const cubeUnit = (u: UnitSystem) => (u === 'imperial' ? 'ft³' : 'm³');

export const lenOut = (inches: number, u: UnitSystem) => (u === 'imperial' ? inches : inches * MM_PER_IN);
export const lenIn = (v: number, u: UnitSystem) => (u === 'imperial' ? v : v / MM_PER_IN);
export const wtOut = (lb: number, u: UnitSystem) => (u === 'imperial' ? lb : lb * KG_PER_LB);
export const wtIn = (v: number, u: UnitSystem) => (u === 'imperial' ? v : v / KG_PER_LB);
/** Cubic inches → ft³ or m³. */
export const cubeOut = (in3: number, u: UnitSystem) =>
  u === 'imperial' ? in3 / 1728 : (in3 * MM_PER_IN ** 3) / 1e9;

const nf = (d: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Length with sensible precision: 2 dp in inches, 0 dp in mm. */
export const fmtLen = (inches: number, u: UnitSystem, dp?: number) =>
  nf(dp ?? (u === 'imperial' ? 2 : 0)).format(lenOut(inches, u));
export const fmtWt = (lb: number, u: UnitSystem, dp = 1) => nf(dp).format(wtOut(lb, u));
export const fmtCube = (in3: number, u: UnitSystem) => nf(3).format(cubeOut(in3, u));
export const fmtInt = (n: number) => nf(0).format(n);
export const fmtPct = (x: number) => `${nf(2).format(x * 100)}%`;
