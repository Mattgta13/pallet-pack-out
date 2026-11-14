/**
 * All geometry is solved in integers so results are exact.
 * Inputs (inches or mm, whichever the user works in) are scaled by 1,000,000,
 * which represents any value down to 1/64" or 0.001 mm exactly.
 */
export const SCALE = 1_000_000;

export const toInt = (x: number): number => Math.round(x * SCALE);
export const toNum = (n: number): number => n / SCALE;

export const IN_PER_MM = 1 / 25.4;
export const LB_PER_KG = 2.2046226218;
