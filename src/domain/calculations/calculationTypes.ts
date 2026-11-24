import { DataProvenance } from '../models/types';

export type CalculationResultStatus =
  | 'available'
  | 'missing_inputs'
  | 'invalid_inputs'
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
  value: T;
  unit: string;
  status: CalculationResultStatus;
  provenance: DataProvenance;
  assumptions: string[];
  validationMessages: string[];
  reviewStatus: CalculationReviewStatus;
}
