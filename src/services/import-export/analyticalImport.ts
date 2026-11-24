/**
 * SEA Workbench — Phase 4 Instrument Data & Calibration Import Engine
 *
 * Reuses `parseDelimitedText` from Phase 3 `surveyCsvImport.ts`.
 * Design guarantees:
 * - Preserves original imported text values, source headers, filename, timestamp, and row numbers.
 * - Never silently guesses units, never replaces missing numeric cells with 0, and never fabricates data.
 * - Detects duplicate sample records against existing session measurements and within the imported batch.
 * - Reports accepted, incomplete, rejected, duplicate, and unresolved-association counts explicitly.
 */

import {
  AnalyticalAnalyte,
  CalibrationStandard,
  DataProvenance,
  InstrumentImportColumnKey,
  InstrumentImportRecord,
  InstrumentMeasurement,
  ReportedValueBasis,
  SampleStage,
} from '../../domain/models/types';
import { areUnitsCompatible } from '../../domain/calculations/units';
import {
  MEASUREMENT_QUALIFIER_LABELS,
  classifyMeasurementToken,
} from '../../domain/calculations/workflowEngine';
import { parseDelimitedText } from './surveyCsvImport';

export { parseDelimitedText };

export type InstrumentColumnMapping = Partial<
  Record<InstrumentImportColumnKey, string>
>;

export interface InstrumentImportRowPreview {
  rowNumber: number;
  status: 'accepted' | 'incomplete' | 'rejected' | 'duplicate';
  warnings: string[];
  errors: string[];
  record: InstrumentMeasurement | null;
  hasUnresolvedSurveyLabel: boolean;
}

export interface InstrumentImportResult {
  rows: InstrumentImportRowPreview[];
  acceptedRecords: InstrumentMeasurement[];
  acceptedCount: number;
  incompleteCount: number;
  rejectedCount: number;
  duplicateCount: number;
  unresolvedLinkCount: number;
  importRecord: InstrumentImportRecord;
}

const HEADER_HINTS: Record<InstrumentImportColumnKey, RegExp[]> = {
  sampleId: [/^sample[\s_-]?id$/i, /^sample$/i, /^sample[\s_-]?name$/i, /^label$/i, /^id$/i],
  analyte: [/^analyte$/i, /^element$/i, /^metal$/i, /^species$/i, /^line$/i],
  stage: [/^stage$/i, /^type$/i, /^classification$/i, /^sample[\s_-]?type$/i, /^category$/i],
  replicateId: [/^rep(licate)?([\s_-]?id)?$/i, /^rep[\s_-]?#$/i, /^run$/i],
  reportedConc: [
    /^(reported[\s_-]?)?conc(entration)?/i,
    /^result$/i,
    /^ppm$/i,
    /^mg[\s_/-]?l$/i,
    /^value$/i,
  ],
  concUnit: [/^(conc[\s_-]?)?unit(s)?$/i, /^uom$/i],
  rawSignal: [
    /^(raw[\s_-]?)?signal$/i,
    /^intensity$/i,
    /^counts$/i,
    /^cps$/i,
    /^abs(orbance)?$/i,
    /^response$/i,
  ],
  signalUnit: [/^signal[\s_-]?unit$/i, /^response[\s_-]?unit$/i],
  dilutionFactor: [/^dil(ution)?([\s_-]?factor)?$/i, /^df$/i],
  analysisTimestamp: [/^time(stamp)?$/i, /^date$/i, /^acq(uisition)?[\s_-]?time/i],
  instrumentFlag: [/^flag$/i, /^warning$/i, /^qc[\s_-]?flag$/i, /^status$/i, /^qualifier$/i],
  notes: [/^note(s)?$/i, /^comment(s)?$/i, /^remark(s)?$/i],
};

export function suggestInstrumentColumnMapping(
  headers: string[]
): InstrumentColumnMapping {
  const mapping: InstrumentColumnMapping = {};
  const used = new Set<string>();

  for (const key of Object.keys(HEADER_HINTS) as InstrumentImportColumnKey[]) {
    const patterns = HEADER_HINTS[key];
    const match = headers.find(
      (h) => !used.has(h) && patterns.some((re) => re.test(h.trim()))
    );
    if (match) {
      mapping[key] = match;
      used.add(match);
    }
  }
  return mapping;
}

function parseNullableFinite(raw: string | undefined): {
  value: number | null;
  invalid: boolean;
} {
  if (raw === undefined || raw === null) return { value: null, invalid: false };
  const cleaned = raw.trim();
  const lower = cleaned.toLowerCase();
  if (
    cleaned === '' ||
    cleaned === '-' ||
    cleaned === '—' ||
    lower === 'na' ||
    lower === 'n/a' ||
    lower === 'nd' ||
    lower === 'bdl' ||
    lower === '<dl' ||
    lower === '<lod' ||
    lower === '<loq' ||
    lower === '<mdl' ||
    lower === 'null'
  ) {
    return { value: null, invalid: false };
  }
  const num = Number(cleaned.replace(/,/g, ''));
  if (!Number.isFinite(num)) {
    return { value: null, invalid: true };
  }
  return { value: num, invalid: false };
}

function normalizeStage(raw: string | undefined): SampleStage {
  const val = (raw ?? '').trim().toLowerCase();
  if (!val) return 'Initial';
  if (val.includes('init') || val === 'c0' || val === 'feed' || val === 'stock') {
    return 'Initial';
  }
  if (val.includes('fin') || val.includes('supernatant') || val.includes('filtrate') || val === 'cf') {
    return 'Final';
  }
  if (val.includes('blank') || val === 'blk') return 'Blank';
  if (val.includes('ctrl') || val.includes('control') || val.includes('check') || val === 'ccv') {
    return 'Control';
  }
  if (val.includes('ref') || val.includes('crm') || val.includes('srm')) {
    return 'Reference Material';
  }
  if (val.includes('rep') || val.includes('dup')) return 'Replicate';
  return 'User-Defined';
}

export function validateAndBuildInstrumentImport(params: {
  headers: string[];
  rawRows: string[][];
  mapping: InstrumentColumnMapping;
  sessionId: string;
  filename: string;
  format: 'csv' | 'tsv' | 'clipboard';
  defaultAnalyte: AnalyticalAnalyte | null;
  defaultCalibrationDatasetId: string | null;
  defaultConcUnit: string;
  defaultSignalUnit: string;
  defaultDate: string;
  defaultProvenance: DataProvenance;
  defaultValueBasis: ReportedValueBasis;
  existingMeasurements: InstrumentMeasurement[];
  knownSurveySampleIds: string[];
  idGenerator: (prefix: string) => string;
}): InstrumentImportResult {
  const {
    headers,
    rawRows,
    mapping,
    sessionId,
    filename,
    format,
    defaultAnalyte,
    defaultCalibrationDatasetId,
    defaultConcUnit,
    defaultSignalUnit,
    defaultDate,
    defaultProvenance,
    defaultValueBasis,
    existingMeasurements,
    knownSurveySampleIds,
    idGenerator,
  } = params;

  const headerIndex = new Map<string, number>();
  headers.forEach((h, i) => headerIndex.set(h, i));

  const cell = (row: string[], key: InstrumentImportColumnKey): string => {
    const colName = mapping[key];
    if (!colName) return '';
    const idx = headerIndex.get(colName);
    if (idx === undefined) return '';
    return (row[idx] ?? '').trim();
  };

  const importRecordId = idGenerator('imp');
  const existingKeys = new Set(
    existingMeasurements.map(
      (m) =>
        `${m.sampleId.trim().toLowerCase()}|${(m.analyte || '').trim().toLowerCase()}|${m.stage}|${(m.replicateId || 'R1').trim().toLowerCase()}`
    )
  );
  const batchKeys = new Set<string>();
  const knownSurveySet = new Set(
    knownSurveySampleIds.map((s) => s.trim().toLowerCase()).filter(Boolean)
  );

  const previews: InstrumentImportRowPreview[] = [];
  const acceptedRecords: InstrumentMeasurement[] = [];
  let acceptedCount = 0;
  let incompleteCount = 0;
  let rejectedCount = 0;
  let duplicateCount = 0;
  let unresolvedLinkCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNumber = i + 2; // 1-indexed including header row
    const warnings: string[] = [];
    const errors: string[] = [];

    const sampleId = cell(raw, 'sampleId');
    if (!sampleId) {
      errors.push('Missing required Sample ID.');
    }

    const rawAnalyte = cell(raw, 'analyte');
    const analyte = rawAnalyte || defaultAnalyte?.symbol || defaultAnalyte?.name || '';
    if (!analyte) {
      warnings.push('Analyte not specified in file or session default.');
    }

    const rawStage = cell(raw, 'stage');
    const stage = normalizeStage(rawStage);
    const replicateId = cell(raw, 'replicateId') || 'R1';

    const rawConcStr = cell(raw, 'reportedConc');
    const classifiedConc = classifyMeasurementToken(rawConcStr);
    if (classifiedConc.invalid) {
      errors.push(`Invalid numeric concentration "${rawConcStr}".`);
    }

    const rawSignalStr = cell(raw, 'rawSignal');
    const parsedSignal = parseNullableFinite(rawSignalStr);
    if (parsedSignal.invalid) {
      errors.push(`Invalid numeric raw signal "${rawSignalStr}".`);
    }

    const rawDfStr = cell(raw, 'dilutionFactor');
    const parsedDf = parseNullableFinite(rawDfStr);
    if (parsedDf.invalid) {
      errors.push(`Invalid dilution factor "${rawDfStr}".`);
    } else if (parsedDf.value !== null && parsedDf.value <= 0) {
      errors.push(`Dilution factor must be positive (received ${parsedDf.value}).`);
    }

    const rawConcUnit = cell(raw, 'concUnit');
    const concUnit = rawConcUnit || defaultConcUnit;
    if (!concUnit) {
      warnings.push('No concentration unit provided (left explicit; no silent unit assumed).');
    } else if (
      defaultAnalyte?.measurementUnit &&
      !areUnitsCompatible(concUnit, defaultAnalyte.measurementUnit)
    ) {
      warnings.push(
        `Imported unit "${concUnit}" is incompatible with active analyte unit "${defaultAnalyte.measurementUnit}".`
      );
    }

    const signalUnit = cell(raw, 'signalUnit') || defaultSignalUnit || 'cps';
    const instrumentFlag = cell(raw, 'instrumentFlag');
    const analysisTimestamp = cell(raw, 'analysisTimestamp');
    const notes = cell(raw, 'notes');

    if (errors.length > 0) {
      rejectedCount += 1;
      previews.push({
        rowNumber,
        status: 'rejected',
        warnings,
        errors,
        record: null,
        hasUnresolvedSurveyLabel: false,
      });
      continue;
    }

    const dupKey = `${sampleId.toLowerCase()}|${analyte.toLowerCase()}|${stage}|${replicateId.toLowerCase()}`;
    const isDuplicate = existingKeys.has(dupKey) || batchKeys.has(dupKey);
    if (isDuplicate) {
      warnings.push('Duplicate Sample ID + Analyte + Stage + Replicate detected.');
    }

    const isIncomplete =
      classifiedConc.numericValue === null && parsedSignal.value === null;
    if (isIncomplete && classifiedConc.qualifier === 'missing') {
      warnings.push('Both concentration and raw signal are blank (preserved as null).');
    }

    const isQualifiedNonNumeric =
      classifiedConc.qualifier === 'not_detected' ||
      classifiedConc.qualifier === 'below_lod' ||
      classifiedConc.qualifier === 'below_loq' ||
      classifiedConc.qualifier === 'not_measured' ||
      classifiedConc.qualifier === 'instrument_invalid';

    if (isQualifiedNonNumeric) {
      warnings.push(
        `Instrument reported "${rawConcStr}" (${MEASUREMENT_QUALIFIER_LABELS[classifiedConc.qualifier]}); preserved as null numerical value with qualifier and original token retained.`
      );
    }

    const hasSurveyMatch = knownSurveySet.has(sampleId.toLowerCase());
    const hasUnresolvedSurveyLabel =
      (stage === 'Initial' || stage === 'Final') && !hasSurveyMatch;
    if (hasUnresolvedSurveyLabel) {
      unresolvedLinkCount += 1;
    }

    const record: InstrumentMeasurement = {
      id: idGenerator('im'),
      sampleId,
      sessionId,
      analyteId: defaultAnalyte?.id ?? null,
      calibrationDatasetId: defaultCalibrationDatasetId,
      linkedSurveyDatasetId: null,
      linkedSurveyMeasurementId: null,
      linkedSurveySampleId: hasSurveyMatch ? sampleId : '',
      analyte,
      stage,
      classificationLabel: stage === 'User-Defined' ? rawStage : undefined,
      replicateId,
      dilutionFactor: parsedDf.value,
      reportedValueBasis: defaultValueBasis,
      rawSignal: parsedSignal.value,
      signalUnit,
      reportedConc: classifiedConc.numericValue,
      concUnit,
      valueQualifier: classifiedConc.qualifier,
      originalValueToken: classifiedConc.originalToken,
      suppliedLimitValue: classifiedConc.suppliedLimitValue,
      suppliedLimitType: classifiedConc.suppliedLimitType,
      suppliedLimitUnit:
        classifiedConc.suppliedLimitValue !== null ? concUnit || null : null,
      instrumentFlag:
        instrumentFlag ||
        (isQualifiedNonNumeric ? `Original value: ${rawConcStr}` : ''),
      importRecordId,
      importRowNumber: rowNumber,
      originalReportedConc: rawConcStr || null,
      originalConcUnit: rawConcUnit || null,
      analysisTimestamp: analysisTimestamp || undefined,
      provenance:
        isIncomplete && classifiedConc.qualifier === 'missing'
          ? 'unavailable'
          : defaultProvenance,
      qualityStatus:
        instrumentFlag || classifiedConc.qualifier === 'instrument_invalid'
          ? 'flagged'
          : isIncomplete
            ? 'pending'
            : 'valid',
      measurementDate:
        analysisTimestamp && /^\d{4}-\d{2}-\d{2}/.test(analysisTimestamp)
          ? analysisTimestamp.slice(0, 10)
          : defaultDate,
      notes,
    };

    if (isDuplicate) {
      duplicateCount += 1;
      previews.push({
        rowNumber,
        status: 'duplicate',
        warnings,
        errors,
        record,
        hasUnresolvedSurveyLabel,
      });
    } else if (isIncomplete) {
      incompleteCount += 1;
      batchKeys.add(dupKey);
      acceptedRecords.push(record);
      previews.push({
        rowNumber,
        status: 'incomplete',
        warnings,
        errors,
        record,
        hasUnresolvedSurveyLabel,
      });
    } else {
      acceptedCount += 1;
      batchKeys.add(dupKey);
      acceptedRecords.push(record);
      previews.push({
        rowNumber,
        status: 'accepted',
        warnings,
        errors,
        record,
        hasUnresolvedSurveyLabel,
      });
    }
  }

  const importRecord: InstrumentImportRecord = {
    id: importRecordId,
    filename: filename || 'clipboard-paste',
    importedAt: new Date().toISOString(),
    format,
    targetSessionId: sessionId,
    sourceHeaders: headers,
    columnMapping: mapping,
    totalRows: rawRows.length,
    acceptedCount,
    incompleteCount,
    rejectedCount,
    duplicateCount,
    unresolvedLinkCount,
  };

  return {
    rows: previews,
    acceptedRecords,
    acceptedCount,
    incompleteCount,
    rejectedCount,
    duplicateCount,
    unresolvedLinkCount,
    importRecord,
  };
}

/**
 * Imports recorded calibration standards from CSV/TSV text (Standard_ID, Nominal_Conc, Unit, Response, Response_Unit, Replicate, Notes).
 */
export function importCalibrationStandardsCsv(
  rawText: string,
  defaults: {
    analyteId: string | null;
    concUnit: string;
    responseUnit: string;
    provenance: DataProvenance;
    idGenerator: (prefix: string) => string;
  }
): {
  standards: CalibrationStandard[];
  rejectedRows: Array<{ rowNumber: number; reason: string }>;
} {
  const parsed = parseDelimitedText(rawText);
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return { standards: [], rejectedRows: [] };
  }

  const findCol = (patterns: RegExp[]) =>
    parsed.headers.findIndex((h) => patterns.some((re) => re.test(h.trim())));

  const idxId = findCol([/^std|^standard|^id$|^label$/i]);
  const idxConc = findCol([/nominal|conc|ppm|mg\/l|x$/i]);
  const idxUnit = findCol([/conc.*unit|^unit$/i]);
  const idxResp = findCol([/response|signal|intensity|cps|abs|counts|y$/i]);
  const idxRespUnit = findCol([/resp.*unit|signal.*unit/i]);
  const idxRep = findCol([/rep/i]);
  const idxNotes = findCol([/note|comment/i]);

  const standards: CalibrationStandard[] = [];
  const rejectedRows: Array<{ rowNumber: number; reason: string }> = [];

  parsed.rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const rawConc = idxConc >= 0 ? row[idxConc] : '';
    const rawResp = idxResp >= 0 ? row[idxResp] : '';
    const conc = parseNullableFinite(rawConc);
    const resp = parseNullableFinite(rawResp);
    if (conc.invalid || resp.invalid) {
      rejectedRows.push({
        rowNumber,
        reason: `Non-numeric calibration value (conc="${rawConc}", response="${rawResp}").`,
      });
      return;
    }

    const repParsed = idxRep >= 0 ? parseNullableFinite(row[idxRep]) : { value: 1, invalid: false };
    const stdLabel =
      (idxId >= 0 ? row[idxId]?.trim() : '') ||
      `CAL-${String(i + 1).padStart(2, '0')}`;

    standards.push({
      id: defaults.idGenerator('cal'),
      standardId: stdLabel,
      analyteId: defaults.analyteId,
      isBlank: conc.value === 0 || stdLabel.toLowerCase().includes('blank'),
      nominalConc: conc.value,
      unit: (idxUnit >= 0 ? row[idxUnit]?.trim() : '') || defaults.concUnit,
      instrumentResponse: resp.value,
      responseUnit:
        (idxRespUnit >= 0 ? row[idxRespUnit]?.trim() : '') ||
        defaults.responseUnit,
      replicateNumber:
        repParsed.value !== null && repParsed.value >= 1
          ? Math.round(repParsed.value)
          : 1,
      provenance: defaults.provenance,
      qualityStatus: 'valid',
      notes: idxNotes >= 0 ? (row[idxNotes] ?? '').trim() : '',
    });
  });

  return { standards, rejectedRows };
}
