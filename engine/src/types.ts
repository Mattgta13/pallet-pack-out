/** Public input/output types. All lengths in the job's length unit (in or mm),
 *  all weights in the job's weight unit (lb or kg). */

export interface Pallet {
  id?: string;
  name: string;
  /** Length: the side along X. For a 2-way pallet this is the stringer direction;
   *  forks enter through the two W-wide ends. */
  length: number;
  width: number;
  deckHeight: number;
  weight: number;
  entry: '2-way' | '4-way';
  /** How a 4-way pallet is built: notched stringers (GMA style, the default) or blocks. */
  construction?: 'stringer' | 'block';
}

/** A trailer or container: inside dimensions (height = usable door height) and payload. */
export interface Trailer {
  id?: string;
  name: string;
  length: number;
  width: number;
  height: number;
  maxPayload: number;
}

export interface Flute {
  id: string;
  name: string;
  wall: 'single' | 'double' | 'triple';
  /** Nominal board thickness. */
  caliper: number;
  /** Combined board weight per unit area (lb/ft² or kg/m²). Estimate unless measured. */
  weightPerArea: number;
}

export interface CaseProduct {
  kind: 'case';
  name?: string;
  length: number;
  width: number;
  height: number;
  /** Weight of one filled case. */
  weight: number;
  unitsPerCase?: number;
  /** Only allow the height to stand vertical. */
  thisSideUp?: boolean;
  /** Board caliper, used to report inside dimensions. */
  caliper?: number;
}

export interface SheetProduct {
  kind: 'sheet';
  name?: string;
  length: number;
  width: number;
  /** Sheet thickness: the flute caliper, or a manual override. */
  thickness: number;
  /** Weight of one sheet. */
  weight: number;
  fluteId?: string;
  /** Custom die line: the blank's outer outline, normalised to the blank
   *  (u along the length, v along the width, both 0–1). Shapes are nested on the pallet. */
  outline?: [number, number][];
}

export type Product = CaseProduct | SheetProduct;

export type StackingStyle = 'column' | 'interlock' | 'auto';

export interface Constraints {
  /** Maximum overall load height, including the pallet deck. */
  maxHeight: number;
  /** Maximum gross weight, including the pallet. */
  maxGrossWeight: number;
  maxLayers?: number;
  /** Allowed overhang past each of the two "length" ends (negative = required underhang). */
  overhangEnds: number;
  /** Allowed overhang past each of the two long sides (negative = required underhang). */
  overhangSides: number;
  stacking: StackingStyle;
  /** Die-cut sheets, interlock only: sheets per lift (each lift alternates its layout). */
  sheetsPerLift?: number;
  /** Lock every unit in a layer to one direction: 'lengthwise' = the unit's length runs
   *  along the pallet length, 'crosswise' = turned 90°. Default 'mixed' (best fit). */
  direction?: Direction;
}

export type Direction = 'mixed' | 'lengthwise' | 'crosswise';

export interface PackOutInput {
  product: Product;
  pallet: Pallet;
  constraints: Constraints;
}

export interface Box2D {
  /** Position of the box corner, measured from the pallet's corner. */
  x: number;
  y: number;
  l: number;
  w: number;
  rot: boolean;
  /** Die-cut shapes: quarter turns of the blank, clockwise seen from above (0–3). */
  turn?: number;
}

export interface LayerPattern {
  count: number;
  boxes: Box2D[];
  /** Footprint of this layer's boxes. */
  extentL: number;
  extentW: number;
}

export type LimitingFactor = 'height' | 'weight' | 'max-layers';

export interface PackOutResult {
  /** e.g. "H vertical", "W vertical". */
  orientation: string;
  /** Footprint of one unit as placed (unrotated). */
  unitL: number;
  unitW: number;
  /** Height of one unit (case height, sheet thickness). */
  unitH: number;
  stacking: 'column' | 'interlock';
  direction: Direction;
  pattern: 'block' | 'two-block' | 'multi-block' | 'pinwheel' | 'nested' | 'empty';
  perLayer: number;
  /** Layers of cases; for sheets, lifts (column = 1 lift of the full stack). */
  layers: number;
  /** Sheets only: sheets per stack. */
  sheetsPerStack?: number;
  /** Total cases, or total sheets. */
  total: number;
  totalUnits?: number;
  oddLayer: LayerPattern;
  evenLayer: LayerPattern;
  /** Share of boxes in a layer that rest on two or more boxes below (0–1). */
  bridging: number;
  load: { length: number; width: number; height: number };
  overhang: { ends: number; sides: number };
  netWeight: number;
  grossWeight: number;
  limitedBy: LimitingFactor;
  /** Footprint of one layer ÷ pallet area. */
  areaEfficiency: number;
  /** Area efficiency × stacked height ÷ usable height. */
  cubeEfficiency: number;
  /** Direction locked and mixing directions would fit more: that actual count per layer. */
  mixedPerLayer?: number;
  notes: string[];
}
