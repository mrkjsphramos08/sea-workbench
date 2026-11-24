import { PhysicalQuantityType } from '../models/types';
import { isValidFiniteNumber } from './numericValidation';

export interface UnitDefinition {
  symbol: string;
  canonicalSymbol: string;
  quantityType: PhysicalQuantityType;
  /** Convert value in this unit to canonical unit */
  toCanonical: (v: number) => number;
  /** Convert value from canonical unit to this unit */
  fromCanonical: (v: number) => number;
}

const LINEAR = (factor: number) => ({
  toCanonical: (v: number) => v * factor,
  fromCanonical: (v: number) => v / factor,
});

const UNIT_REGISTRY: Record<string, UnitDefinition> = {
  // Mass (canonical: g)
  g: { symbol: 'g', canonicalSymbol: 'g', quantityType: 'mass', ...LINEAR(1) },
  mg: { symbol: 'mg', canonicalSymbol: 'g', quantityType: 'mass', ...LINEAR(1e-3) },
  ug: { symbol: 'µg', canonicalSymbol: 'g', quantityType: 'mass', ...LINEAR(1e-6) },
  'µg': { symbol: 'µg', canonicalSymbol: 'g', quantityType: 'mass', ...LINEAR(1e-6) },
  kg: { symbol: 'kg', canonicalSymbol: 'g', quantityType: 'mass', ...LINEAR(1e3) },

  // Volume (canonical: L)
  L: { symbol: 'L', canonicalSymbol: 'L', quantityType: 'volume', ...LINEAR(1) },
  mL: { symbol: 'mL', canonicalSymbol: 'L', quantityType: 'volume', ...LINEAR(1e-3) },
  uL: { symbol: 'µL', canonicalSymbol: 'L', quantityType: 'volume', ...LINEAR(1e-6) },
  'µL': { symbol: 'µL', canonicalSymbol: 'L', quantityType: 'volume', ...LINEAR(1e-6) },

  // Concentration (canonical: mg/L, equivalent to ppm in dilute aqueous media — noted explicitly)
  'mg/L': { symbol: 'mg/L', canonicalSymbol: 'mg/L', quantityType: 'concentration', ...LINEAR(1) },
  ppm: { symbol: 'ppm', canonicalSymbol: 'mg/L', quantityType: 'concentration', ...LINEAR(1) },
  'mg/L (ppm)': {
    symbol: 'mg/L (ppm)',
    canonicalSymbol: 'mg/L',
    quantityType: 'concentration',
    ...LINEAR(1),
  },
  ppb: { symbol: 'ppb', canonicalSymbol: 'mg/L', quantityType: 'concentration', ...LINEAR(1e-3) },
  'µg/L': { symbol: 'µg/L', canonicalSymbol: 'mg/L', quantityType: 'concentration', ...LINEAR(1e-3) },
  'g/L': { symbol: 'g/L', canonicalSymbol: 'mg/L', quantityType: 'concentration', ...LINEAR(1e3) },

  // Specific surface area (canonical: m²/g)
  'm²/g': { symbol: 'm²/g', canonicalSymbol: 'm²/g', quantityType: 'surface_area', ...LINEAR(1) },
  'm2/g': { symbol: 'm²/g', canonicalSymbol: 'm²/g', quantityType: 'surface_area', ...LINEAR(1) },

  // Surface loading (canonical: m²/L)
  'm²/L': { symbol: 'm²/L', canonicalSymbol: 'm²/L', quantityType: 'surface_loading', ...LINEAR(1) },
  'm2/L': { symbol: 'm²/L', canonicalSymbol: 'm²/L', quantityType: 'surface_loading', ...LINEAR(1) },
  'm²/mL': { symbol: 'm²/mL', canonicalSymbol: 'm²/L', quantityType: 'surface_loading', ...LINEAR(1e3) },

  // Temperature (canonical: K)
  K: {
    symbol: 'K',
    canonicalSymbol: 'K',
    quantityType: 'temperature',
    toCanonical: (v) => v,
    fromCanonical: (v) => v,
  },
  '°C': {
    symbol: '°C',
    canonicalSymbol: 'K',
    quantityType: 'temperature',
    toCanonical: (v) => v + 273.15,
    fromCanonical: (v) => v - 273.15,
  },
  C: {
    symbol: '°C',
    canonicalSymbol: 'K',
    quantityType: 'temperature',
    toCanonical: (v) => v + 273.15,
    fromCanonical: (v) => v - 273.15,
  },

  // pH (canonical: pH)
  pH: { symbol: 'pH', canonicalSymbol: 'pH', quantityType: 'ph', ...LINEAR(1) },

  // Uptake (canonical: µmol/m²)
  'µmol/m²': { symbol: 'µmol/m²', canonicalSymbol: 'µmol/m²', quantityType: 'uptake', ...LINEAR(1) },
  'umol/m2': { symbol: 'µmol/m²', canonicalSymbol: 'µmol/m²', quantityType: 'uptake', ...LINEAR(1) },
  'mmol/m²': { symbol: 'mmol/m²', canonicalSymbol: 'µmol/m²', quantityType: 'uptake', ...LINEAR(1e3) },

  // Time (canonical: s)
  s: { symbol: 's', canonicalSymbol: 's', quantityType: 'time', ...LINEAR(1) },
  min: { symbol: 'min', canonicalSymbol: 's', quantityType: 'time', ...LINEAR(60) },
  h: { symbol: 'h', canonicalSymbol: 's', quantityType: 'time', ...LINEAR(3600) },

  // Molar mass (canonical: g/mol)
  'g/mol': { symbol: 'g/mol', canonicalSymbol: 'g/mol', quantityType: 'molar_mass', ...LINEAR(1) },
};

export interface UnitConversionResult {
  ok: boolean;
  value: number | null;
  fromUnit: string;
  toUnit: string;
  error: string | null;
}

export function getUnitDefinition(unit: string): UnitDefinition | null {
  const key = unit.trim();
  return UNIT_REGISTRY[key] ?? null;
}

export function areUnitsCompatible(unitA: string, unitB: string): boolean {
  const defA = getUnitDefinition(unitA);
  const defB = getUnitDefinition(unitB);
  if (!defA || !defB) return false;
  return defA.quantityType === defB.quantityType;
}

/**
 * Explicitly converts a finite numeric value between compatible physical units.
 * Rejects incompatible unit pairs or unknown units without silent fallback.
 */
export function convertUnit(
  value: number | null,
  fromUnit: string,
  toUnit: string
): UnitConversionResult {
  if (value === null) {
    return {
      ok: false,
      value: null,
      fromUnit,
      toUnit,
      error: 'Cannot convert a missing (null) value.',
    };
  }
  if (!isValidFiniteNumber(value)) {
    return {
      ok: false,
      value: null,
      fromUnit,
      toUnit,
      error: 'Cannot convert a non-finite numeric value.',
    };
  }

  const defFrom = getUnitDefinition(fromUnit);
  const defTo = getUnitDefinition(toUnit);
  if (!defFrom) {
    return {
      ok: false,
      value: null,
      fromUnit,
      toUnit,
      error: `Unrecognized source unit "${fromUnit}".`,
    };
  }
  if (!defTo) {
    return {
      ok: false,
      value: null,
      fromUnit,
      toUnit,
      error: `Unrecognized target unit "${toUnit}".`,
    };
  }
  if (defFrom.quantityType !== defTo.quantityType) {
    return {
      ok: false,
      value: null,
      fromUnit,
      toUnit,
      error: `Incompatible units: cannot convert ${defFrom.quantityType} ("${fromUnit}") to ${defTo.quantityType} ("${toUnit}").`,
    };
  }

  if (defFrom.symbol === defTo.symbol) {
    return { ok: true, value, fromUnit: defFrom.symbol, toUnit: defTo.symbol, error: null };
  }

  const canonical = defFrom.toCanonical(value);
  const converted = defTo.fromCanonical(canonical);
  return {
    ok: true,
    value: converted,
    fromUnit: defFrom.symbol,
    toUnit: defTo.symbol,
    error: null,
  };
}
