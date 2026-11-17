import type { PackOutResult } from '@packout/engine';

export const PATTERN_LABEL: Record<PackOutResult['pattern'], string> = {
  block: 'Block',
  'two-block': 'Two-block',
  'multi-block': 'Multi-block',
  pinwheel: 'Pinwheel',
  empty: '—',
};

export const stackingLabel = (r: PackOutResult) => (r.stacking === 'interlock' ? 'Patterned (interlock)' : 'All layers same (column)');

export const resultKey = (r: PackOutResult) => `${r.orientation}|${r.stacking}`;

/** Empty for best fit; otherwise e.g. "all lengthwise". */
export const directionLabel = (r: PackOutResult) => (r.direction === 'mixed' ? '' : `all ${r.direction}`);
