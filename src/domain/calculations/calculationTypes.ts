import { CALC_ENGINE_VERSION, DataProvenance } from '../models/types';

export type CalculationResultStatus =
  | 'available'
  | 'valid'
  | 'missing_inputs'
  | 'insufficient_data'
  | 'invalid_inputs'
  | 'invalid_input'
  | 'not_applicable'
  | 'synthetic_data'
  | 'incompatible_units'
  | 'unsupported_model'
  | 'pending_scientific_review';

export type CalculationReviewStatus =
  | 'general_numerical'
  | 'exploratory_only'
  | 'pending_scientific_review';

export interface CalculationResult<T = number | null> {
  calculationId: string;
  calculationVersion: string;
  inputRefs: string[];
  excludedInputRefs?: string[];
  value: T;
  data?: T | null;
  unit: string;
  status: CalculationResultStatus;
  provenance: DataProvenance;
  assumptions: string[];
  validationMessages: string[];
  warnings?: string[];
  containsSynthetic?: boolean;
  reviewStatus: CalculationReviewStatus;
}

export function createCalculationResult<T>(params: {
  calculationId: string;
  status: CalculationResultStatus;
  data: T | null;
  unit?: string;
  inputRefs?: string[];
  excludedInputRefs?: string[];
  assumptions?: string[];
  warnings?: string[];
  containsSynthetic?: boolean;
  provenance?: DataProvenance;
  reviewStatus?: CalculationReviewStatus;
}): CalculationResult<T> {
  const warnings = params.warnings || [];
  return {
    calculationId: params.calculationId,
    calculationVersion: CALC_ENGINE_VERSION,
    inputRefs: params.inputRefs || [],
    excludedInputRefs: params.excludedInputRefs || [],
    value: params.data as T,
    data: params.data,
    unit: params.unit || '',
    status: params.status,
    provenance:
      params.provenance ||
      (params.containsSynthetic ? 'synthetic_demo' : 'derived_calculated'),
    assumptions: params.assumptions || [],
    validationMessages: warnings,
    warnings,
    containsSynthetic: Boolean(params.containsSynthetic),
    reviewStatus: params.reviewStatus || 'general_numerical',
  };
}

