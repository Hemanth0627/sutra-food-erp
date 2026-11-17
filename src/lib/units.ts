import { D, Dec, DecimalLike } from "./decimal";

export type UnitDimension = "MASS" | "VOLUME" | "COUNT";

export interface UnitDef {
  code: string;
  dimension: UnitDimension;
  /** Multiplier to the dimension's base unit (kg, litre, piece). */
  toBase: DecimalLike;
}

export class UnitConversionError extends Error {}

/** Standard unit catalogue seeded into the Unit table. */
export const STANDARD_UNITS: { code: string; name: string; dimension: UnitDimension; toBase: string }[] = [
  { code: "KG", name: "Kilogram", dimension: "MASS", toBase: "1" },
  { code: "G", name: "Gram", dimension: "MASS", toBase: "0.001" },
  { code: "L", name: "Litre", dimension: "VOLUME", toBase: "1" },
  { code: "ML", name: "Millilitre", dimension: "VOLUME", toBase: "0.001" },
  { code: "PCS", name: "Pieces", dimension: "COUNT", toBase: "1" },
  { code: "PKT", name: "Packets", dimension: "COUNT", toBase: "1" },
];

export function canConvert(from: UnitDef, to: UnitDef): boolean {
  return from.dimension === to.dimension;
}

/** Converts a quantity between two units of the same dimension. 1200 G -> 1.2 KG. */
export function convertQuantity(quantity: DecimalLike, from: UnitDef, to: UnitDef): Dec {
  if (from.code === to.code) return D(quantity);
  if (!canConvert(from, to)) {
    throw new UnitConversionError(`Cannot convert ${from.code} (${from.dimension}) to ${to.code} (${to.dimension})`);
  }
  return D(quantity).times(D(from.toBase)).div(D(to.toBase));
}

/** Converts a rate (price per `from` unit) to a price per `to` unit. ₹45/KG -> ₹0.045/G. */
export function convertRate(rate: DecimalLike, from: UnitDef, to: UnitDef): Dec {
  if (from.code === to.code) return D(rate);
  if (!canConvert(from, to)) {
    throw new UnitConversionError(`Cannot convert ${from.code} (${from.dimension}) to ${to.code} (${to.dimension})`);
  }
  return D(rate).times(D(to.toBase)).div(D(from.toBase));
}
