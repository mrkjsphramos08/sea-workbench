/**
 * SEA Workbench — Structured Survey CSV & Clipboard Paste Import Workflow
 *
 * Guarantees:
 * - RFC-4180 compliant parsing supporting both comma-separated CSV and tab-separated clipboard paste.
 * - Unambiguous column alias mapping without silent guesses on incompatible units.
 * - Preserves empty cells strictly as `null` (never coerces missing data to 0).
 * - Never silently discards invalid rows; classifies accepted, incomplete, and rejected rows transparently.
 */

import {
  DataProvenance,
  MeasurementQualityStatus,
  SurveyMeasurement,
} from '../../domain/models/types';
import {
  areUnitsCompatible,
  convertUnit,
} from '../../domain/calculations/units';
import { generateUuid } from '../../data/demo/demoWorkspace';

export type ImportTargetField =
  | 'ignore'
  | 'sampleId'
  | 'sampleGroupId'
  | 'replicateId'
  | 'targetInitialPh'
  | 'measuredInitialPh'
  | 'measuredFinalPh'
  | 'initialConcPpm'
  | 'finalConcPpm'
  | 'supportMassMg'
  | 'solutionVolumeMl'
  | 'recordedUptakeUmolM2'
  | 'qualityStatus'
  | 'provenance'
  | 'measurementDate'
  | 'notes';

export interface ParsedDelimitedTable {
  delimiter: ',' | '\t' | ';';
  headers: string[];
  rows: string[][];
}

export interface CsvColumnMapping {
  columnIndex: number;
  header: string;
  targetField: ImportTargetField;
  sourceUnit: string;
}

export interface CsvImportRowIssue {
  rowNumber: number;
  rawSampleId: string;
  severity: 'error' | 'warning';
  field: string;
  message: string;
}

export interface CsvImportValidationResult {
  acceptedRows: SurveyMeasurement[];
  incompleteRowNumbers: number[];
  rejectedRows: Array<{ rowNumber: number; rawValues: string[]; reasons: string[] }>;
  issues: CsvImportRowIssue[];
  unitErrors: string[];
  summary: {
    totalSourceRows: number;
    acceptedCount: number;
    incompleteCount: number;
    rejectedCount: number;
  };
}

export const TARGET_FIELD_METADATA: Record<
  ImportTargetField,
  { label: string; expectedUnit: string | null; isNumeric: boolean }
> = {
  ignore: { label: 'Ignore Column', expectedUnit: null, isNumeric: false },
  sampleId: { label: 'Sample ID', expectedUnit: null, isNumeric: false },
  sampleGroupId: { label: 'Sample Group ID', expectedUnit: null, isNumeric: false },
  replicateId: { label: 'Replicate ID', expectedUnit: null, isNumeric: false },
  targetInitialPh: { label: 'Target Initial pH', expectedUnit: 'pH', isNumeric: true },
  measuredInitialPh: { label: 'Measured Initial pH', expectedUnit: 'pH', isNumeric: true },
  measuredFinalPh: { label: 'Measured Final pH', expectedUnit: 'pH', isNumeric: true },
  initialConcPpm: { label: 'Initial Conc. (C₀)', expectedUnit: 'ppm', isNumeric: true },
  finalConcPpm: { label: 'Final Conc. (Cf)', expectedUnit: 'ppm', isNumeric: true },
  supportMassMg: { label: 'Support Mass', expectedUnit: 'mg', isNumeric: true },
  solutionVolumeMl: { label: 'Solution Volume', expectedUnit: 'mL', isNumeric: true },
  recordedUptakeUmolM2: {
    label: 'Recorded Uptake',
    expectedUnit: 'µmol/m²',
    isNumeric: true,
  },
  qualityStatus: { label: 'Quality Status', expectedUnit: null, isNumeric: false },
  provenance: { label: 'Data Provenance', expectedUnit: null, isNumeric: false },
  measurementDate: { label: 'Measurement Date', expectedUnit: null, isNumeric: false },
  notes: { label: 'Researcher Notes', expectedUnit: null, isNumeric: false },
};

function detectDelimiter(text: string): ',' | '\t' | ';' {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  if (tabCount > commaCount && tabCount >= semiCount) return '\t';
  if (semiCount > commaCount && semiCount > tabCount) return ';';
  return ',';
}

/**
 * Parses CSV or tab-separated spreadsheet text preserving quoted commas and line breaks.
 */
export function parseDelimitedText(
  rawText: string,
  forcedDelimiter?: ',' | '\t' | ';'
): ParsedDelimitedTable {
  const cleaned = rawText.replace(/^\uFEFF/, '');
  const delimiter = forcedDelimiter ?? detectDelimiter(cleaned);

  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r') {
      if (cleaned[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) {
        records.push(row);
      }
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) {
        records.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) {
    records.push(row);
  }

  if (records.length === 0) {
    return { delimiter, headers: [], rows: [] };
  }

  const headers = records[0];
  const rows = records.slice(1);
  return { delimiter, headers, rows };
}

function extractUnitFromHeader(header: string): string {
  const match = header.match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim() : '';
}

export function suggestCsvColumnMappings(headers: string[]): CsvColumnMapping[] {
  return headers.map((header, idx) => {
    const normalized = header
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const unitInHeader = extractUnitFromHeader(header);

    let targetField: ImportTargetField = 'ignore';

    if (
      normalized === 'sample_id' ||
      normalized === 'sample' ||
      normalized === 'sample_name'
    ) {
      targetField = 'sampleId';
    } else if (
      normalized === 'sample_group_id' ||
      normalized === 'group_id' ||
      normalized === 'group' ||
      normalized === 'replicate_group'
    ) {
      targetField = 'sampleGroupId';
    } else if (
      normalized === 'replicate_id' ||
      normalized === 'replicate' ||
      normalized === 'rep'
    ) {
      targetField = 'replicateId';
    } else if (
      normalized === 'target_initial_ph' ||
      normalized === 'target_ph' ||
      normalized === 'target_phi'
    ) {
      targetField = 'targetInitialPh';
    } else if (
      normalized === 'measured_initial_ph' ||
      normalized === 'initial_ph' ||
      normalized === 'phi' ||
      normalized === 'ph_i' ||
      normalized === 'ph_initial'
    ) {
      targetField = 'measuredInitialPh';
    } else if (
      normalized === 'measured_final_ph' ||
      normalized === 'final_ph' ||
      normalized === 'phf' ||
      normalized === 'ph_f' ||
      normalized === 'ph_final' ||
      normalized === 'equilibrium_ph'
    ) {
      targetField = 'measuredFinalPh';
    } else if (
      normalized === 'initial_concentration' ||
      normalized === 'initial_conc' ||
      normalized === 'initial_conc_ppm' ||
      normalized === 'initial_concentration_ppm' ||
      normalized === 'c0' ||
      normalized === 'c_0' ||
      normalized === 'ci'
    ) {
      targetField = 'initialConcPpm';
    } else if (
      normalized === 'final_concentration' ||
      normalized === 'final_conc' ||
      normalized === 'final_conc_ppm' ||
      normalized === 'final_concentration_ppm' ||
      normalized === 'cf' ||
      normalized === 'c_f'
    ) {
      targetField = 'finalConcPpm';
    } else if (
      normalized === 'support_mass' ||
      normalized === 'mass' ||
      normalized === 'mass_mg' ||
      normalized === 'support_mass_mg'
    ) {
      targetField = 'supportMassMg';
    } else if (
      normalized === 'solution_volume' ||
      normalized === 'volume' ||
      normalized === 'vol' ||
      normalized === 'volume_ml' ||
      normalized === 'solution_volume_ml'
    ) {
      targetField = 'solutionVolumeMl';
    } else if (
      normalized === 'recorded_uptake' ||
      normalized === 'uptake' ||
      normalized === 'metal_uptake' ||
      normalized === 'uptake_umol_m2'
    ) {
      targetField = 'recordedUptakeUmolM2';
    } else if (normalized === 'quality_status' || normalized === 'quality') {
      targetField = 'qualityStatus';
    } else if (normalized === 'data_provenance' || normalized === 'provenance') {
      targetField = 'provenance';
    } else if (normalized === 'measurement_date' || normalized === 'date') {
      targetField = 'measurementDate';
    } else if (
      normalized === 'notes' ||
      normalized === 'note' ||
      normalized === 'comments'
    ) {
      targetField = 'notes';
    }

    const defaultUnit = TARGET_FIELD_METADATA[targetField].expectedUnit ?? '';
    return {
      columnIndex: idx,
      header,
      targetField,
      sourceUnit: unitInHeader || defaultUnit,
    };
  });
}

const VALID_QUALITY_STATUSES: MeasurementQualityStatus[] = [
  'valid',
  'flagged',
  'excluded_by_user',
  'pending',
];

const VALID_PROVENANCES: DataProvenance[] = [
  'user_entered',
  'literature_reference',
  'manufacturer_spec',
  'measured_experimental',
  'theoretical_estimate',
  'derived_calculated',
  'synthetic_demo',
  'unavailable',
];

function parseStrictNumericCell(
  raw: string
): { kind: 'empty' } | { kind: 'valid'; value: number } | { kind: 'invalid' } {
  const trimmed = raw.trim();
  if (
    trimmed === '' ||
    trimmed === '—' ||
    trimmed === '-' ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'na' ||
    trimmed.toLowerCase() === 'n/a'
  ) {
    return { kind: 'empty' };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return { kind: 'invalid' };
  }
  return { kind: 'valid', value: n };
}

/**
 * Validates mapped CSV/TSV rows, verifies unit compatibility, preserves missing cells as null,
 * and returns a transparent breakdown of accepted, incomplete, and rejected rows.
 */
export function validateAndBuildCsvImport(
  table: ParsedDelimitedTable,
  mappings: CsvColumnMapping[],
  options: {
    defaultDate: string;
    defaultProvenance?: DataProvenance;
    surveyMode: 'uptake' | 'pzc';
    existingRowCount?: number;
  }
): CsvImportValidationResult {
  const unitErrors: string[] = [];
  const activeMappings = mappings.filter((m) => m.targetField !== 'ignore');

  // Check unit compatibility up front — never silently convert ambiguous or incompatible units
  for (const map of activeMappings) {
    const meta = TARGET_FIELD_METADATA[map.targetField];
    if (!meta.expectedUnit) continue;
    const srcUnit = map.sourceUnit.trim();
    if (!srcUnit) continue;

    // Normalize common ASCII spellings of µmol/m²
    const normalizedSrc =
      srcUnit === 'umol/m2' || srcUnit === 'umol/m^2' ? 'µmol/m²' : srcUnit;
    if (
      normalizedSrc !== meta.expectedUnit &&
      !areUnitsCompatible(normalizedSrc, meta.expectedUnit)
    ) {
      unitErrors.push(
        `Column "${map.header}" (${meta.label}) specifies unit "${srcUnit}", which is incompatible with expected unit "${meta.expectedUnit}". Automatic conversion is blocked.`
      );
    }
  }

  const acceptedRows: SurveyMeasurement[] = [];
  const incompleteRowNumbers: number[] = [];
  const rejectedRows: Array<{
    rowNumber: number;
    rawValues: string[];
    reasons: string[];
  }> = [];
  const issues: CsvImportRowIssue[] = [];

  if (unitErrors.length > 0) {
    return {
      acceptedRows: [],
      incompleteRowNumbers: [],
      rejectedRows: table.rows.map((r, i) => ({
        rowNumber: i + 2,
        rawValues: r,
        reasons: [...unitErrors],
      })),
      issues: unitErrors.map((msg) => ({
        rowNumber: 1,
        rawSampleId: 'Header',
        severity: 'error',
        field: 'unit',
        message: msg,
      })),
      unitErrors,
      summary: {
        totalSourceRows: table.rows.length,
        acceptedCount: 0,
        incompleteCount: 0,
        rejectedCount: table.rows.length,
      },
    };
  }

  const prefix = options.surveyMode === 'pzc' ? 'PZC' : 'UPT';
  const baseIndex = options.existingRowCount ?? 0;

  table.rows.forEach((cells, idx) => {
    const rowNumber = idx + 2; // 1-indexed including header row
    const rowReasons: string[] = [];

    const draft: SurveyMeasurement = {
      id: generateUuid('sm'),
      sampleId: '',
      sampleGroupId: '',
      replicateId: 'R1',
      targetInitialPh: null,
      measuredInitialPh: null,
      measuredFinalPh: null,
      initialConcPpm: null,
      finalConcPpm: null,
      supportMassMg: null,
      solutionVolumeMl: null,
      recordedUptakeUmolM2: null,
      uptakeUnit: 'µmol/m²',
      concUnit: 'ppm',
      provenance: options.defaultProvenance ?? 'measured_experimental',
      qualityStatus: 'valid',
      linkedInitialMeasurementId: null,
      linkedFinalMeasurementId: null,
      measurementDate: options.defaultDate,
      notes: '',
    };

    for (const map of activeMappings) {
      const rawCell = cells[map.columnIndex] ?? '';
      const meta = TARGET_FIELD_METADATA[map.targetField];

      if (meta.isNumeric) {
        const parsed = parseStrictNumericCell(rawCell);
        if (parsed.kind === 'empty') {
          continue; // Preserve missing value strictly as null
        }
        if (parsed.kind === 'invalid') {
          const msg = `Invalid numeric value "${rawCell}" for ${meta.label}.`;
          rowReasons.push(msg);
          issues.push({
            rowNumber,
            rawSampleId: draft.sampleId || `Row ${rowNumber}`,
            severity: 'error',
            field: map.targetField,
            message: msg,
          });
          continue;
        }

        let finalVal = parsed.value;
        const srcUnit = map.sourceUnit.trim();
        const normalizedSrc =
          srcUnit === 'umol/m2' || srcUnit === 'umol/m^2' ? 'µmol/m²' : srcUnit;

        if (
          meta.expectedUnit &&
          normalizedSrc &&
          normalizedSrc !== meta.expectedUnit
        ) {
          const converted = convertUnit(finalVal, normalizedSrc, meta.expectedUnit);
          if (!converted.ok || converted.value === null) {
            const msg =
              converted.error ??
              `Unable to convert "${srcUnit}" to "${meta.expectedUnit}".`;
            rowReasons.push(msg);
            issues.push({
              rowNumber,
              rawSampleId: draft.sampleId || `Row ${rowNumber}`,
              severity: 'error',
              field: map.targetField,
              message: msg,
            });
            continue;
          }
          finalVal = converted.value;
        }

        // Physical range sanity checks
        if (
          (map.targetField === 'targetInitialPh' ||
            map.targetField === 'measuredInitialPh' ||
            map.targetField === 'measuredFinalPh') &&
          (finalVal < -1 || finalVal > 15)
        ) {
          const msg = `pH value ${finalVal} is outside plausible range [-1, 15].`;
          rowReasons.push(msg);
          issues.push({
            rowNumber,
            rawSampleId: draft.sampleId || `Row ${rowNumber}`,
            severity: 'error',
            field: map.targetField,
            message: msg,
          });
          continue;
        }

        if (
          (map.targetField === 'supportMassMg' ||
            map.targetField === 'solutionVolumeMl' ||
            map.targetField === 'initialConcPpm' ||
            map.targetField === 'finalConcPpm') &&
          finalVal < 0
        ) {
          const msg = `${meta.label} cannot be negative (${finalVal}).`;
          rowReasons.push(msg);
          issues.push({
            rowNumber,
            rawSampleId: draft.sampleId || `Row ${rowNumber}`,
            severity: 'error',
            field: map.targetField,
            message: msg,
          });
          continue;
        }

        switch (map.targetField) {
          case 'targetInitialPh':
            draft.targetInitialPh = finalVal;
            break;
          case 'measuredInitialPh':
            draft.measuredInitialPh = finalVal;
            break;
          case 'measuredFinalPh':
            draft.measuredFinalPh = finalVal;
            break;
          case 'initialConcPpm':
            draft.initialConcPpm = finalVal;
            break;
          case 'finalConcPpm':
            draft.finalConcPpm = finalVal;
            break;
          case 'supportMassMg':
            draft.supportMassMg = finalVal;
            break;
          case 'solutionVolumeMl':
            draft.solutionVolumeMl = finalVal;
            break;
          case 'recordedUptakeUmolM2':
            draft.recordedUptakeUmolM2 = finalVal;
            break;
        }
      } else {
        const trimmed = rawCell.trim();
        switch (map.targetField) {
          case 'sampleId':
            draft.sampleId = trimmed;
            break;
          case 'sampleGroupId':
            draft.sampleGroupId = trimmed;
            break;
          case 'replicateId':
            if (trimmed) draft.replicateId = trimmed;
            break;
          case 'qualityStatus': {
            const norm = trimmed.toLowerCase().replace(/\s+/g, '_');
            if (
              norm &&
              VALID_QUALITY_STATUSES.includes(norm as MeasurementQualityStatus)
            ) {
              draft.qualityStatus = norm as MeasurementQualityStatus;
            } else if (norm === 'excluded') {
              draft.qualityStatus = 'excluded_by_user';
            }
            break;
          }
          case 'provenance': {
            const norm = trimmed.toLowerCase().replace(/\s+/g, '_');
            if (norm && VALID_PROVENANCES.includes(norm as DataProvenance)) {
              draft.provenance = norm as DataProvenance;
            }
            break;
          }
          case 'measurementDate':
            if (trimmed) draft.measurementDate = trimmed;
            break;
          case 'notes':
            draft.notes = trimmed;
            break;
        }
      }
    }

    if (rowReasons.length > 0) {
      rejectedRows.push({ rowNumber, rawValues: cells, reasons: rowReasons });
      return;
    }

    if (!draft.sampleId) {
      draft.sampleId = `${prefix}-${String(baseIndex + acceptedRows.length + 1).padStart(2, '0')}`;
    }
    if (!draft.sampleGroupId) {
      draft.sampleGroupId = `GRP-${draft.sampleId}`;
    }

    const isIncomplete =
      options.surveyMode === 'pzc'
        ? draft.measuredInitialPh === null || draft.measuredFinalPh === null
        : draft.measuredFinalPh === null || draft.recordedUptakeUmolM2 === null;

    if (isIncomplete) {
      incompleteRowNumbers.push(rowNumber);
      issues.push({
        rowNumber,
        rawSampleId: draft.sampleId,
        severity: 'warning',
        field: 'completeness',
        message:
          'Imported with missing measurement value(s); preserved strictly as null (never coerced to zero).',
      });
    }

    acceptedRows.push(draft);
  });

  return {
    acceptedRows,
    incompleteRowNumbers,
    rejectedRows,
    issues,
    unitErrors,
    summary: {
      totalSourceRows: table.rows.length,
      acceptedCount: acceptedRows.length,
      incompleteCount: incompleteRowNumbers.length,
      rejectedCount: rejectedRows.length,
    },
  };
}
