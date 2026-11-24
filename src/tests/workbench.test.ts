import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCalibrationDataset,
  analyzeSurveyDataset,
  areUnitsCompatible,
  buildAnalyticalAnalysisProvenance,
  buildAnalyticalSessionComparison,
  buildConsolidatedReviewItems,
  buildDatasetComparison,
  buildExperimentTimeline,
  buildSurveyAnalysisProvenance,
  buildSurveyChartSeries,
  buildUnifiedSampleRegistry,
  classifyMeasurementToken,
  compareExperimentSnapshots,
  computeAnalyticalReplicateGroups,
  computeDescriptiveStatistics,
  computeDistributionBins,
  computeLinearRegression,
  computeSurveyReplicateGroups,
  convertUnit,
  createExperimentSnapshotRecord,
  detectAnalyticalQualityIssues,
  evaluateAnalyticalBoundary,
  evaluateAnalyticalSessionOverview,
  evaluateBatchSynthesisBoundary,
  evaluateDilutionConsistency,
  evaluateFigureReproducibility,
  evaluateSurveyCompleteness,
  formatQualifiedMeasurementValue,
  formatScientificNumber,
  formatWithScientificNotation,
  hasExperimentChangedSinceSnapshot,
  parseOptionalNumber,
  recoverResearchTimer,
  resolveSurveyAnalyticalLinks,
  restoreSnapshotAsIndependentExperiment,
  suggestSurveyAnalyticalMatches,
  verifyAuthoritativeSync,
} from '../domain/calculations/seaMath';
import {
  validateBackupEnvelope,
  validateExperimentId,
  validateNewExperimentInput,
} from '../domain/validation/validators';
import {
  createBlankExperiment,
  createBlankSurveyDataset,
  createInitialDemoWorkspace,
  createSupportSnapshot,
  duplicateExperimentRecord,
  duplicateSurveyDatasetRecord,
  generateUniqueExperimentId,
} from '../data/demo/demoWorkspace';
import {
  createBlankAnalyticalSession,
  createSyntheticAnalyticalSession,
  duplicateAnalyticalSessionRecord,
} from '../data/demo/analyticalFixtures';
import {
  getAllExperimentInstrumentMeasurements,
  projectExperimentCompatibilityMirrors,
} from '../domain/models/projections';
import {
  StorageLike,
  WORKSPACE_STORAGE_KEY,
  computeStorageDiagnostics,
  loadWorkspaceFromStorage,
  saveWorkspaceToStorage,
} from '../services/persistence/storage';
import { migrateWorkspaceToCurrentSchema } from '../services/persistence/migration';
import {
  exportAnalyticalReplicateStatsCsv,
  exportAnalyticalSessionSamplesCsv,
  exportCalibrationDatasetCsv,
  exportCalibrationStandardsCsv,
  exportComparativeDatasetsCsv,
  exportDilutionRecordsCsv,
  exportExploratoryRegressionSummaryCsv,
  exportInstrumentMeasurementsCsv,
  exportMeasurementLinkageCsv,
  exportQualityReviewCsv,
  exportRegressionResidualsCsv,
  exportReplicateSummaryCsv,
  exportStatisticalAnalysisCsv,
  exportSurveyMeasurementsCsv,
  parseWorkspaceBackup,
  serializeAnalyticalSessionJson,
  serializeSurveyDatasetJson,
  serializeWorkspaceBackup,
} from '../services/import-export/backup';
import {
  parseDelimitedText,
  suggestCsvColumnMappings,
  validateAndBuildCsvImport,
} from '../services/import-export/surveyCsvImport';
import {
  importCalibrationStandardsCsv,
  suggestInstrumentColumnMapping,
  validateAndBuildInstrumentImport,
} from '../services/import-export/analyticalImport';
import { buildResearchExportPackage } from '../services/import-export/researchPackage';
import { listZipEntries } from '../services/import-export/zipArchive';
import {
  APP_VERSION,
  InstrumentMeasurement,
  ResearchTimer,
  SurveyMeasurement,
  WORKSPACE_SCHEMA_VERSION,
} from '../domain/models/types';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/* ============================================================================
 * PHASE 1 FOUNDATIONAL TESTS (Preserved)
 * ============================================================================ */

test('1. numeric parsing preserves missing values and never produces NaN, Infinity, or silent zero', () => {
  assert.equal(parseOptionalNumber(''), null);
  assert.equal(parseOptionalNumber('   '), null);
  assert.equal(parseOptionalNumber(null), null);
  assert.equal(parseOptionalNumber(undefined), null);
  assert.equal(parseOptionalNumber('not-a-number'), null);
  assert.equal(parseOptionalNumber(Number.NaN), null);
  assert.equal(parseOptionalNumber(Number.POSITIVE_INFINITY), null);
  assert.equal(parseOptionalNumber('0'), 0);
  assert.equal(parseOptionalNumber('11.45'), 11.45);
  assert.equal(formatScientificNumber(null, 2), '—');
  assert.equal(formatScientificNumber(Number.NaN, 2), '—');
  assert.equal(formatScientificNumber(3.8, 2), '3.80');
});

test('2. experiment ID validation enforces uniqueness and valid characters', () => {
  const demo = createInitialDemoWorkspace();
  const duplicateCheck = validateExperimentId('SEA-DEMO-001', demo.experiments);
  assert.equal(duplicateCheck.valid, false);
  assert.ok(duplicateCheck.errors.some((e) => e.includes('already assigned')));

  const invalidChars = validateExperimentId('SEA 001/bad', demo.experiments);
  assert.equal(invalidChars.valid, false);

  const uniqueId = generateUniqueExperimentId(demo.experiments);
  const validCheck = validateNewExperimentInput({
    experimentId: uniqueId,
    title: 'Pd on Alumina Baseline',
    researcher: 'Dr. A. Chen',
    existingExperiments: demo.experiments,
  });
  assert.equal(validCheck.valid, true);
});

test('3. duplicating an experiment creates a fully independent deep copy with unique IDs and remapped links', () => {
  const demo = createInitialDemoWorkspace();
  const original = demo.experiments[0];
  const copy = duplicateExperimentRecord(original, demo.experiments);

  assert.notEqual(copy.uuid, original.uuid);
  assert.notEqual(copy.experimentId, original.experimentId);
  assert.equal(copy.isDemonstration, false);
  assert.equal(copy.scientificReviewStatus, 'Unreviewed');
  assert.equal(copy.surveyMeasurements.length, original.surveyMeasurements.length);
  assert.notEqual(copy.surveyMeasurements[0].id, original.surveyMeasurements[0].id);

  // Linked analytical IDs in the copy must point to the copy's new instrument measurement IDs
  const copiedLinkedRow = copy.surveyMeasurements.find(
    (r) => r.sampleId === 'UPT-04'
  );
  assert.ok(copiedLinkedRow?.linkedInitialMeasurementId);
  assert.ok(
    copy.instrumentMeasurements.some(
      (m) => m.id === copiedLinkedRow.linkedInitialMeasurementId
    )
  );
  assert.notEqual(
    copiedLinkedRow.linkedInitialMeasurementId,
    original.surveyMeasurements.find((r) => r.sampleId === 'UPT-04')
      ?.linkedInitialMeasurementId
  );

  // Mutating copy must NOT affect original
  copy.title = 'Modified Independent Copy';
  copy.surveyMeasurements[0].measuredFinalPh = 9.99;
  copy.batch.actualSupportMassG = 4.25;

  assert.notEqual(original.title, 'Modified Independent Copy');
  assert.notEqual(original.surveyMeasurements[0].measuredFinalPh, 9.99);
  assert.notEqual(original.batch.actualSupportMassG, 4.25);
});

test('4. material snapshots preserve historical properties when source database records are modified', () => {
  const demo = createInitialDemoWorkspace();
  const sourceSupport = demo.supports[0];
  const snapshot = createSupportSnapshot(sourceSupport);

  const originalBet = snapshot.supportData?.betSurfaceArea.value;
  assert.equal(originalBet, 300.0);

  // Mutate the live database material directly
  sourceSupport.betSurfaceArea.value = 450.5;
  sourceSupport.pzc.value = 6.1;
  sourceSupport.name = 'Renamed Silica Material';

  // Historical snapshot must remain unchanged
  assert.equal(snapshot.supportData?.betSurfaceArea.value, 300.0);
  assert.equal(snapshot.supportData?.pzc.value, 3.8);
  assert.notEqual(snapshot.supportData?.name, 'Renamed Silica Material');
});

test('5. seaMath boundaries never fabricate unreviewed SEA calculations and preserve nulls', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];

  const batchBoundary = evaluateBatchSynthesisBoundary(exp.batch);
  assert.equal(batchBoundary.status, 'unavailable_phase_1');
  for (const field of batchBoundary.fields) {
    assert.equal(field.value, null);
    assert.equal(field.resultStatus, 'pending_scientific_review');
    assert.equal(field.provenance, 'unavailable');
  }

  const analyticalBoundary = evaluateAnalyticalBoundary(
    exp.calibrationStandards,
    exp.instrumentMeasurements,
    exp.analyticalConfig
  );
  assert.equal(analyticalBoundary.validCalibrationPoints, 7);
  for (const field of analyticalBoundary.fields) {
    assert.equal(field.value, null);
    assert.equal(field.resultStatus, 'pending_scientific_review');
  }

  const series = buildSurveyChartSeries(exp.surveyMeasurements);
  const missingRow = series.find((s) => s.sampleId === 'UPT-06');
  assert.ok(missingRow);
  assert.equal(missingRow.recordedUptakeUmolM2, null);
});

test('6. localStorage persistence saves, reloads, rejects malformed JSON, and keeps deleted demo records deleted', () => {
  const storage = new MemoryStorage();
  const demo = createInitialDemoWorkspace();

  const afterDelete = {
    ...demo,
    experiments: [],
    activeExperimentUuid: null,
    hasInitializedDemo: true,
  };
  const saved = saveWorkspaceToStorage(afterDelete, storage);
  assert.equal(saved.ok, true);
  assert.ok(saved.byteSize > 0);

  const reloaded = loadWorkspaceFromStorage(storage);
  assert.equal(reloaded.status, 'loaded');
  assert.equal(reloaded.data?.experiments.length, 0);
  assert.equal(reloaded.data?.hasInitializedDemo, true);

  storage.setItem(WORKSPACE_STORAGE_KEY, '{invalid-json');
  const corrupted = loadWorkspaceFromStorage(storage);
  assert.equal(corrupted.status, 'corrupted');
  assert.ok(corrupted.error && corrupted.error.includes('malformed JSON'));
});

test('7. JSON backup export/import round-trips cleanly and rejects malformed or unsupported future schemas', () => {
  const demo = createInitialDemoWorkspace();
  const blank = createBlankExperiment({
    experimentId: 'SEA-2026-002',
    title: 'Blank Isolation Test',
    projectId: null,
    researcher: 'Dr. R. Patel',
    type: 'Batch Synthesis',
  });
  demo.experiments.push(blank);

  const exportedJson = serializeWorkspaceBackup(demo);
  const parsed = parseWorkspaceBackup(exportedJson);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.data?.workspace.experiments.length, demo.experiments.length);
  assert.equal(parsed.data?.workspace.precursors.length, demo.precursors.length);
  assert.equal(parsed.data?.workspace.supports.length, demo.supports.length);

  assert.equal(validateBackupEnvelope('not json').valid, false);
  assert.equal(
    validateBackupEnvelope(JSON.stringify({ format: 'other-app', workspace: {} })).valid,
    false
  );

  // Unsupported future major schema version (6.0.0)
  const badSchema = JSON.parse(exportedJson);
  badSchema.workspace.schemaVersion = '6.0.0';
  const badSchemaResult = validateBackupEnvelope(JSON.stringify(badSchema));
  assert.equal(badSchemaResult.valid, false);
  assert.ok(
    badSchemaResult.errors.some((e) => e.includes('Incompatible major schema version'))
  );
});

test('8. CSV exports include unit & UUID headers, preserve empty nulls as blank cells, and escape commas', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];

  const surveyCsv = exportSurveyMeasurementsCsv(exp, exp.surveyMeasurements);
  const surveyLines = surveyCsv.split('\r\n');
  assert.ok(surveyLines[0].includes('Sample_Group_ID'));
  assert.ok(surveyLines[0].includes('Measured_Initial_pH (pH)'));
  assert.ok(surveyLines[0].includes('Recorded_Uptake (umol/m2)'));
  assert.ok(surveyLines[0].includes('Data_Provenance'));
  assert.ok(surveyLines[0].includes('Linked_Initial_Analytical_UUID'));
  assert.equal(surveyLines.length, exp.surveyMeasurements.length + 1);

  const upt06Line = surveyLines.find((l) => l.includes('UPT-06'));
  assert.ok(upt06Line);
  assert.ok(upt06Line.includes(',200,,'));

  const calCsv = exportCalibrationStandardsCsv(exp, exp.calibrationStandards);
  assert.ok(calCsv.includes('Nominal_Concentration'));
  assert.ok(calCsv.includes('Quality_Status'));
  assert.ok(calCsv.includes('CAL-05'));

  const anaCsv = exportInstrumentMeasurementsCsv(exp, exp.instrumentMeasurements);
  assert.ok(anaCsv.includes('Dilution_Factor'));
  assert.ok(anaCsv.includes('ICP-UPT04-INIT'));
});

/* ============================================================================
 * PHASE 2 TESTS — Demo Consistency, Units, Statistics, Regression, Links & Migration
 * ============================================================================ */

test('9. demonstration experiment consistency: both support and precursor snapshots match metadata', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];

  assert.ok(exp.batch.supportId);
  assert.ok(exp.batch.supportSnapshot?.supportData);
  assert.ok(exp.batch.precursorId);
  assert.ok(exp.batch.precursorSnapshot?.precursorData);
  assert.equal(
    exp.batch.precursorSnapshot.precursorData.metalIdentity,
    'Pt'
  );
  assert.equal(
    exp.batch.supportSnapshot.supportData.composition,
    'SiO2'
  );
  assert.ok(exp.batch.supportSnapshot.supportData.references.length >= 1);
  assert.ok(exp.batch.precursorSnapshot.precursorData.references.length >= 1);
});

test('10. explicit unit conversion handles compatible units and cleanly rejects incompatible or non-finite inputs', () => {
  assert.equal(areUnitsCompatible('mg', 'g'), true);
  assert.equal(areUnitsCompatible('mL', 'L'), true);
  assert.equal(areUnitsCompatible('ppb', 'ppm'), true);
  assert.equal(areUnitsCompatible('°C', 'K'), true);
  assert.equal(areUnitsCompatible('mg', 'mL'), false);
  assert.equal(areUnitsCompatible('ppm', 'pH'), false);

  const mgToG = convertUnit(250, 'mg', 'g');
  assert.equal(mgToG.ok, true);
  assert.ok(Math.abs((mgToG.value ?? 0) - 0.25) < 1e-12);

  const ppbToPpm = convertUnit(500, 'ppb', 'ppm');
  assert.equal(ppbToPpm.ok, true);
  assert.ok(Math.abs((ppbToPpm.value ?? 0) - 0.5) < 1e-12);

  const cToK = convertUnit(25, '°C', 'K');
  assert.equal(cToK.ok, true);
  assert.ok(Math.abs((cToK.value ?? 0) - 298.15) < 1e-12);

  const kToC = convertUnit(298.15, 'K', '°C');
  assert.equal(kToC.ok, true);
  assert.ok(Math.abs((kToC.value ?? 0) - 25) < 1e-12);

  // Incompatible dimensions
  const badDim = convertUnit(10, 'mg', 'mL');
  assert.equal(badDim.ok, false);
  assert.equal(badDim.value, null);
  assert.ok(badDim.error && badDim.error.toLowerCase().includes('incompatible'));

  // Null and non-finite inputs
  assert.equal(convertUnit(null, 'mg', 'g').ok, false);
  assert.equal(convertUnit(Number.NaN, 'mg', 'g').ok, false);
  assert.equal(convertUnit(Number.POSITIVE_INFINITY, 'mg', 'g').ok, false);

  // Scientific notation formatting
  assert.equal(formatWithScientificNotation(0.0000452, { sigFigs: 3 }), '4.520e-5');
  assert.equal(formatWithScientificNotation(0, { fixedDecimals: 2 }), '0.00');
  assert.equal(formatWithScientificNotation(null, { sigFigs: 3 }), '—');
});

test('11. descriptive statistics match exact analytical values and enforce edge-case guardrails', () => {
  // Classic dataset [2, 4, 4, 4, 5, 5, 7, 9]: mean=5, median=4.5, sample var=32/7, sample sd=sqrt(32/7)
  const known = computeDescriptiveStatistics([2, 4, 4, 4, 5, 5, 7, 9], {
    unit: 'ppm',
  });
  assert.equal(known.status, 'available');
  assert.equal(known.value.validCount, 8);
  assert.equal(known.value.missingCount, 0);
  assert.equal(known.value.mean, 5);
  assert.equal(known.value.median, 4.5);
  assert.equal(known.value.min, 2);
  assert.equal(known.value.max, 9);
  assert.equal(known.value.range, 7);
  assert.ok(Math.abs((known.value.sampleVariance ?? 0) - 32 / 7) < 1e-12);
  assert.ok(Math.abs((known.value.sampleStdDev ?? 0) - Math.sqrt(32 / 7)) < 1e-12);
  assert.ok(
    Math.abs((known.value.sem ?? 0) - Math.sqrt(32 / 7) / Math.sqrt(8)) < 1e-12
  );
  assert.ok(
    Math.abs((known.value.rsdPercent ?? 0) - (Math.sqrt(32 / 7) / 5) * 100) <
      1e-10
  );

  // Single observation (n = 1): mean & median defined, SD/SEM/RSD must be null
  const single = computeDescriptiveStatistics([4.25], { unit: 'pH' });
  assert.equal(single.status, 'available');
  assert.equal(single.value.validCount, 1);
  assert.equal(single.value.mean, 4.25);
  assert.equal(single.value.median, 4.25);
  assert.equal(single.value.sampleVariance, null);
  assert.equal(single.value.sampleStdDev, null);
  assert.equal(single.value.sem, null);
  assert.equal(single.value.rsdPercent, null);

  // Missing values are excluded (NEVER coerced to 0), while explicit 0 IS valid
  const withNullAndZero = computeDescriptiveStatistics([0, 2, null, undefined, 4], {
    unit: 'µmol/m²',
  });
  assert.equal(withNullAndZero.value.validCount, 3);
  assert.equal(withNullAndZero.value.missingCount, 2);
  assert.equal(withNullAndZero.value.mean, 2);
  assert.equal(withNullAndZero.value.min, 0);

  // Constant values -> sample SD = 0
  const constant = computeDescriptiveStatistics([5, 5, 5], { unit: 'pH' });
  assert.equal(constant.value.sampleVariance, 0);
  assert.equal(constant.value.sampleStdDev, 0);
  assert.equal(constant.value.rsdPercent, 0);

  // Zero-mean dataset -> %RSD undefined (null) with explicit validation message
  const zeroMean = computeDescriptiveStatistics([-1, 0, 1], { unit: 'ΔpH' });
  assert.equal(zeroMean.value.mean, 0);
  assert.equal(zeroMean.value.rsdPercent, null);
  assert.ok(
    zeroMean.validationMessages.some((m) => m.toLowerCase().includes('undefined'))
  );

  // Non-finite values rejected cleanly
  const invalid = computeDescriptiveStatistics(
    [1, Number.NaN, Number.POSITIVE_INFINITY, 3],
    { unit: 'ppm' }
  );
  assert.equal(invalid.value.validCount, 2);
  assert.equal(invalid.value.invalidCount, 2);
  assert.equal(invalid.value.mean, 2);

  // Empty dataset
  const empty = computeDescriptiveStatistics([null, undefined], { unit: 'ppm' });
  assert.equal(empty.status, 'missing_inputs');
  assert.equal(empty.value.mean, null);
});

test('12. replicate grouping strictly respects explicit sampleGroupId and never auto-groups by pH proximity', () => {
  const baseRow = (
    id: string,
    sampleId: string,
    sampleGroupId: string,
    pH: number,
    uptake: number | null,
    qualityStatus: SurveyMeasurement['qualityStatus'] = 'valid'
  ): SurveyMeasurement => ({
    id,
    sampleId,
    sampleGroupId,
    replicateId: 'R1',
    targetInitialPh: pH,
    measuredInitialPh: pH,
    measuredFinalPh: pH - 0.1,
    initialConcPpm: 200,
    finalConcPpm: 150,
    supportMassMg: 200,
    solutionVolumeMl: 50,
    recordedUptakeUmolM2: uptake,
    provenance: 'measured_experimental',
    qualityStatus,
    linkedInitialMeasurementId: null,
    linkedFinalMeasurementId: null,
    measurementDate: '2026-04-01',
    notes: '',
  });

  // Two rows with identical pH=9.00 but DIFFERENT sampleGroupId must stay separate!
  const rows: SurveyMeasurement[] = [
    baseRow('r1', 'S1', 'GRP-A', 9.0, 1.0),
    baseRow('r2', 'S2', 'GRP-A', 9.0, 1.4),
    baseRow('r3', 'S3', 'GRP-B', 9.0, 2.0),
    baseRow('r4', 'S4', 'GRP-A', 9.0, 9.9, 'excluded_by_user'),
  ];

  const groups = computeSurveyReplicateGroups(rows);
  assert.equal(groups.length, 2);

  const grpA = groups.find((g) => g.sampleGroupId === 'GRP-A');
  const grpB = groups.find((g) => g.sampleGroupId === 'GRP-B');
  assert.ok(grpA && grpB);
  assert.equal(grpA.memberRowIds.length, 2); // excluded_by_user omitted
  assert.ok(Math.abs((grpA.uptakeStats.value.mean ?? 0) - 1.2) < 1e-12);
  assert.ok(grpA.uptakeStats.value.sampleStdDev !== null);
  assert.equal(grpB.memberRowIds.length, 1);
  assert.equal(grpB.uptakeStats.value.sampleStdDev, null);

  // Full survey analysis propagates excluded count
  const analysis = analyzeSurveyDataset(rows);
  assert.equal(analysis.totalRows, 4);
  assert.equal(analysis.includedRows, 3);
  assert.equal(analysis.excludedByUserCount, 1);
});

test('13. exploratory OLS linear regression computes exact slope, free intercept, R², residuals, and rejects degenerate cases', () => {
  const opts = { xUnit: 'ppm', yUnit: 'cps' };

  // Exact linear dataset: y = 2.5x + 1.2 (must NOT force through origin)
  const exact = computeLinearRegression(
    [
      { id: 'p1', label: 'S1', x: 0, y: 1.2 },
      { id: 'p2', label: 'S2', x: 2, y: 6.2 },
      { id: 'p3', label: 'S3', x: 4, y: 11.2 },
      { id: 'p4', label: 'S4', x: 10, y: 26.2 },
    ],
    opts
  );
  assert.equal(exact.status, 'available');
  assert.equal(exact.reviewStatus, 'exploratory_only');
  assert.ok(Math.abs((exact.value.slope ?? 0) - 2.5) < 1e-12);
  assert.ok(Math.abs((exact.value.intercept ?? 0) - 1.2) < 1e-12);
  assert.ok(Math.abs((exact.value.rSquared ?? 0) - 1.0) < 1e-12);
  assert.ok(Math.abs(exact.value.rss ?? 1) < 1e-12);
  assert.equal(exact.value.fittedPoints.length, 4);

  // Noisy dataset: verify sum of residuals ~ 0 and RSS > 0
  const noisy = computeLinearRegression(
    [
      { id: 'n1', label: 'N1', x: 1, y: 2.1 },
      { id: 'n2', label: 'N2', x: 2, y: 3.9 },
      { id: 'n3', label: 'N3', x: 3, y: 6.2 },
      { id: 'n4', label: 'N4', x: 4, y: 7.8 },
      { id: 'n5', label: 'N5', x: null, y: 10.0 }, // excluded cleanly
    ],
    opts
  );
  assert.equal(noisy.status, 'available');
  assert.equal(noisy.value.validCount, 4);
  assert.equal(noisy.value.excludedCount, 1);
  assert.ok((noisy.value.rss ?? 0) > 0);
  const residualSum = noisy.value.fittedPoints.reduce(
    (acc, p) => acc + p.residual,
    0
  );
  assert.ok(Math.abs(residualSum) < 1e-10);

  // Insufficient points (n < 2)
  const tooFew = computeLinearRegression(
    [{ id: 'o1', label: 'O1', x: 5, y: 10 }],
    opts
  );
  assert.equal(tooFew.status, 'missing_inputs');
  assert.equal(tooFew.value.slope, null);

  // Degenerate zero x-variance (all x identical)
  const sameX = computeLinearRegression(
    [
      { id: 'x1', label: 'X1', x: 5, y: 10 },
      { id: 'x2', label: 'X2', x: 5, y: 15 },
    ],
    opts
  );
  assert.equal(sameX.status, 'invalid_inputs');
  assert.equal(sameX.value.regressionStatus, 'degenerate_x_variance');
  assert.equal(sameX.value.slope, null);

  // Constant y values -> slope=0, R² undefined (null)
  const flatY = computeLinearRegression(
    [
      { id: 'y1', label: 'Y1', x: 1, y: 7 },
      { id: 'y2', label: 'Y2', x: 2, y: 7 },
      { id: 'y3', label: 'Y3', x: 3, y: 7 },
    ],
    opts
  );
  assert.equal(flatY.status, 'available');
  assert.equal(flatY.value.slope, 0);
  assert.equal(flatY.value.intercept, 7);
  assert.equal(flatY.value.rSquared, null);
  assert.equal(flatY.value.regressionStatus, 'constant_y');
});

test('14. survey-to-analytical links compute dilution-adjusted values, flag discrepancies without silent overwrite, and survive source deletion', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];

  // Demo row UPT-04 is linked to im-demo-1 (Initial, 20.02 ppm * 10 = 200.2 ppm) and im-demo-2 (Final, 9.46 ppm * 10 = 94.6 ppm)
  const initialLinks = resolveSurveyAnalyticalLinks(
    exp.surveyMeasurements,
    exp.instrumentMeasurements
  );
  const upt04 = exp.surveyMeasurements.find((r) => r.sampleId === 'UPT-04')!;
  const upt04Link = initialLinks[upt04.id];
  assert.equal(upt04Link.initial.sourceUnavailable, false);
  assert.ok(
    Math.abs((upt04Link.initial.linkedEffectiveConcPpm ?? 0) - 200.2) < 1e-9
  );
  assert.ok(
    Math.abs((upt04Link.final.linkedEffectiveConcPpm ?? 0) - 94.6) < 1e-9
  );

  // Modify analytical reportedConc so it strongly disagrees with survey row (manual value must NOT be overwritten)
  const originalFinalConc = upt04.finalConcPpm;
  const modifiedInstruments: InstrumentMeasurement[] =
    exp.instrumentMeasurements.map((m) =>
      m.id === 'im-demo-2' ? { ...m, reportedConc: 15.0 } : m
    );
  const discrepancyLinks = resolveSurveyAnalyticalLinks(
    exp.surveyMeasurements,
    modifiedInstruments
  );
  assert.equal(discrepancyLinks[upt04.id].final.hasDiscrepancy, true);
  assert.ok(
    Math.abs(
      (discrepancyLinks[upt04.id].final.discrepancyDeltaPpm ?? 0) -
        ((originalFinalConc ?? 0) - 150.0)
    ) < 1e-9
  );
  // Original survey row value untouched
  assert.equal(upt04.finalConcPpm, originalFinalConc);

  // Delete analytical source record -> gracefully reports sourceUnavailable without crashing or losing survey value
  const withoutSource = exp.instrumentMeasurements.filter(
    (m) => m.id !== 'im-demo-2'
  );
  const deletedLinks = resolveSurveyAnalyticalLinks(
    exp.surveyMeasurements,
    withoutSource
  );
  assert.equal(deletedLinks[upt04.id].final.sourceUnavailable, true);
  assert.equal(deletedLinks[upt04.id].final.linkedRecord, null);
  assert.equal(upt04.finalConcPpm, originalFinalConc);
});

test('15. Phase 1 (v1.0.0) workspace and JSON backup deterministically migrate to v2.0.0 preserving all records', () => {
  const phase1Workspace = {
    schemaVersion: '1.0.0',
    appVersion: '0.1.0-phase1',
    projects: [
      {
        id: 'prj-p1',
        code: 'P1-TEST',
        name: 'Legacy Phase 1 Project',
        description: 'Existing user project',
        principalInvestigator: 'Dr. Legacy',
        isDemonstration: false,
        createdAt: '2026-01-10T00:00:00.000Z',
        updatedAt: '2026-01-10T00:00:00.000Z',
      },
    ],
    experiments: [
      {
        uuid: 'exp-p1-uuid',
        experimentId: 'SEA-P1-001',
        title: 'Legacy Pt/Alumina Run',
        projectId: 'prj-p1',
        researcher: 'Dr. Legacy',
        type: 'Uptake Survey',
        objective: 'Preserve all fields across schema migration.',
        experimentDate: '2026-01-12',
        status: 'In Progress',
        scientificReviewStatus: 'Unreviewed',
        isDemonstration: false,
        tags: ['legacy'],
        createdAt: '2026-01-12T00:00:00.000Z',
        updatedAt: '2026-01-12T00:00:00.000Z',
        dataVersion: '1.0.0',
        batch: {
          supportId: null,
          supportSnapshot: null,
          precursorId: null,
          precursorSnapshot: null,
          plannedSupportMassG: 1.5,
          actualSupportMassG: null,
          plannedSolutionVolumeMl: 100,
          actualSolutionVolumeMl: null,
          plannedSurfaceLoadingM2L: 500,
          actualSurfaceLoadingM2L: null,
          plannedTargetMetalLoadingWtPct: 1.0,
          actualMeasuredMetalLoadingWtPct: null,
          plannedInitialPh: 3.0,
          actualInitialPh: 3.05,
          actualFinalPh: null,
          plannedPrecursorConcPpm: 150,
          actualPrecursorConcPpm: null,
          contactTimeMin: 60,
          temperatureC: 22,
          agitationMode: 'Orbital shaker',
          dataProvenance: 'measured_experimental',
          notes: '',
        },
        surveyConfig: {
          mode: 'uptake',
          targetSurfaceLoadingM2L: 500,
          equilibrationTimeMin: 60,
          temperatureC: 22,
          backgroundElectrolyte: 'DI water',
          chartTitle: 'Legacy Chart',
          showSyntheticNotice: false,
          dataProvenance: 'measured_experimental',
        },
        surveyMeasurements: [
          {
            id: 'sm-p1-1',
            sampleId: 'UPT-01',
            replicateId: 'R1',
            targetInitialPh: 3.0,
            measuredInitialPh: 3.02,
            measuredFinalPh: 3.45,
            initialConcPpm: 150,
            finalConcPpm: null,
            supportMassMg: 200,
            solutionVolumeMl: 50,
            recordedUptakeUmolM2: null,
            provenance: 'measured_experimental',
            notes: 'Missing Cf must stay null',
          },
        ],
        analyticalConfig: {
          instrumentType: 'ICP-OES',
          instrumentModel: 'Legacy ICP',
          analyteElement: 'Pt',
          wavelengthNm: 214.423,
          matrixDescription: '2% HNO3',
          calibrationUnits: 'ppm',
          analystName: 'Dr. Legacy',
          analysisDate: '2026-01-13',
          dataProvenance: 'measured_experimental',
          notes: '',
        },
        calibrationStandards: [
          {
            id: 'cal-p1-1',
            standardId: 'CAL-01',
            nominalConc: 0,
            unit: 'ppm',
            instrumentResponse: 10,
            responseUnit: 'cps',
            replicateNumber: 1,
            provenance: 'measured_experimental',
            notes: '',
          },
        ],
        instrumentMeasurements: [
          {
            id: 'im-p1-1',
            sampleId: 'ANA-01',
            linkedSurveySampleId: 'UPT-01',
            stage: 'Initial',
            replicateId: 'R1',
            dilutionFactor: 5,
            rawSignal: 12000,
            signalUnit: 'cps',
            reportedConc: 30,
            concUnit: 'ppm',
            provenance: 'measured_experimental',
            notes: '',
          },
        ],
        observations: [],
        benchChecklist: [],
        benchTimer: {
          elapsedMs: 120000,
          countdownDurationSec: 1800,
          countdownRemainingMs: 900000,
          startedAt: '2026-01-12T08:00:00.000Z',
          completedAt: null,
        },
        benchLogs: [],
        reportConfig: {
          mode: 'post-experiment',
          includeMaterialSnapshots: true,
          includeBatchRecords: true,
          includeSurveyTable: true,
          includeSurveyFigure: true,
          includeAnalyticalRecords: true,
          includeObservations: true,
          includeBenchChecklist: true,
          institutionHeader: 'Legacy Lab',
          reportFooterNote: 'Legacy Footer',
        },
        generalObservations: 'Preserved legacy observation.',
      },
    ],
    activeExperimentUuid: 'exp-p1-uuid',
    precursors: [],
    supports: [],
    preferences: { sidebarCollapsed: false, defaultResearcher: 'Dr. Legacy' },
    hasInitializedDemo: true,
    lastSavedAt: '2026-01-12T10:00:00.000Z',
  };

  // Direct migration
  const migrated = migrateWorkspaceToCurrentSchema(phase1Workspace);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.fromVersion, '1.0.0');
  assert.ok(migrated.data);
  assert.equal(migrated.data.schemaVersion, WORKSPACE_SCHEMA_VERSION);
  assert.equal(migrated.data.experiments.length, 1);

  const exp = migrated.data.experiments[0];
  assert.equal(exp.title, 'Legacy Pt/Alumina Run');
  assert.equal(exp.batch.actualSupportMassG, null); // null preserved
  assert.equal(exp.surveyMeasurements[0].finalConcPpm, null); // null preserved
  assert.equal(exp.surveyMeasurements[0].sampleGroupId, 'GRP-UPT-01');
  assert.equal(exp.surveyMeasurements[0].qualityStatus, 'valid');
  assert.equal(exp.surveyConfig.chartDisplayMode, 'individual');
  assert.equal(exp.surveyConfig.errorBarMode, 'none');
  assert.equal(exp.benchTimer.activeCountdownDurationSec, 1800);
  assert.equal(exp.benchTimer.countdownStatus, 'paused');
  assert.equal(exp.benchTimer.elapsedStatus, 'paused');
  assert.equal(exp.reportConfig.includeStatisticalSummaries, true);
  assert.equal(exp.reportConfig.includeRegressionSummary, true);

  // Backup import of a Phase 1 JSON envelope must also migrate cleanly
  const phase1Backup = JSON.stringify({
    format: 'sea-workbench-backup',
    schemaVersion: '1.0.0',
    appVersion: '0.1.0-phase1',
    exportedAt: '2026-01-12T10:00:00.000Z',
    workspace: phase1Workspace,
  });
  const parsed = parseWorkspaceBackup(phase1Backup);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.data?.workspace.schemaVersion, WORKSPACE_SCHEMA_VERSION);
  assert.equal(parsed.data?.workspace.experiments[0].experimentId, 'SEA-P1-001');
  assert.equal(parsed.data?.workspace.experiments[0].surveyDatasets.length, 1);
});

/* ============================================================================
 * PHASE 3 TESTS — Multi-Dataset Workspace, CSV Import/Export, Diagnostics,
 * Comparative Analysis, Schema Migration (2.0.0 -> 3.0.0), and Scale Benchmarks
 * ============================================================================ */

test('16. Phase 3 multi-dataset management creates independent deep copies with unique UUIDs and 3 labeled demo series', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];

  // Demo experiment ships with 3 clearly labeled synthetic datasets
  assert.equal(exp.surveyDatasets.length, 3);
  assert.ok(exp.surveyDatasets.every((d) => d.isDemonstration));
  assert.ok(exp.surveyDatasets.some((d) => d.datasetId === 'DS-UPT-01'));
  assert.ok(exp.surveyDatasets.some((d) => d.datasetId === 'DS-UPT-02'));
  assert.ok(exp.surveyDatasets.some((d) => d.datasetId === 'DS-PZC-01'));

  // Blank dataset starts cleanly with zero synthetic rows
  const blankDs = createBlankSurveyDataset({
    datasetId: 'DS-NEW-01',
    title: 'Blank Pt/TiO2 Uptake Series',
    mode: 'uptake',
    researcher: 'Dr. S. Lin',
    supportSnapshot: exp.batch.supportSnapshot,
    precursorSnapshot: exp.batch.precursorSnapshot,
  });
  assert.equal(blankDs.measurements.length, 0);
  assert.equal(blankDs.isDemonstration, false);

  // Duplicating a dataset creates completely independent UUIDs and isolated records
  const src = exp.surveyDatasets[0];
  const dup = duplicateSurveyDatasetRecord(src, exp.surveyDatasets);
  assert.notEqual(dup.id, src.id);
  assert.notEqual(dup.datasetId, src.datasetId);
  assert.equal(dup.isDemonstration, false);
  assert.equal(dup.measurements.length, src.measurements.length);
  assert.notEqual(dup.measurements[0].id, src.measurements[0].id);

  dup.title = 'Isolated Duplicate Title';
  dup.measurements[0].recordedUptakeUmolM2 = 9.99;
  assert.notEqual(src.title, 'Isolated Duplicate Title');
  assert.notEqual(src.measurements[0].recordedUptakeUmolM2, 9.99);
});

test('17. CSV and TSV spreadsheet import maps aliases, converts compatible units, preserves nulls, and blocks incompatible units', () => {
  // Tab-separated clipboard paste with compatible mass unit (g -> mg), missing cell, and invalid row
  const tsvInput = [
    'Sample_ID\tGroup\tRep\tInitial_pH (pH)\tFinal_pH (pH)\tSupport_Mass (g)\tUptake (umol/m2)\tNotes',
    'S-01\tGRP-01\tR1\t4.00\t4.20\t0.5\t1.25\tValid row with g->mg conversion',
    'S-02\tGRP-01\tR2\t4.05\t4.25\t0.5\t\tMissing uptake must stay null',
    'S-03\tGRP-02\tR1\tabc\t5.00\t0.5\t1.10\tInvalid numeric pH must be rejected',
  ].join('\n');

  const parsed = parseDelimitedText(tsvInput);
  assert.equal(parsed.delimiter, '\t');
  assert.equal(parsed.headers.length, 8);
  assert.equal(parsed.rows.length, 3);

  const mappings = suggestCsvColumnMappings(parsed.headers);
  const res = validateAndBuildCsvImport(parsed, mappings, {
    defaultDate: '2026-04-10',
    surveyMode: 'uptake',
    existingRowCount: 0,
  });

  assert.equal(res.unitErrors.length, 0);
  assert.equal(res.summary.acceptedCount, 2);
  assert.equal(res.summary.incompleteCount, 1);
  assert.equal(res.summary.rejectedCount, 1);

  // Verify explicit g -> mg conversion (0.5 g = 500 mg) and strict null preservation
  assert.equal(res.acceptedRows[0].supportMassMg, 500);
  assert.equal(res.acceptedRows[0].recordedUptakeUmolM2, 1.25);
  assert.equal(res.acceptedRows[1].recordedUptakeUmolM2, null);

  // Incompatible unit (mL mapped to Support Mass expected mg) must be blocked completely
  const badUnitCsv = `Sample_ID,Support_Mass (mL),Final_pH (pH)\nS-BAD,50,7.2`;
  const badParsed = parseDelimitedText(badUnitCsv);
  const badMappings = suggestCsvColumnMappings(badParsed.headers);
  const badRes = validateAndBuildCsvImport(badParsed, badMappings, {
    defaultDate: '2026-04-10',
    surveyMode: 'uptake',
  });
  assert.ok(badRes.unitErrors.length > 0);
  assert.equal(badRes.acceptedRows.length, 0);
  assert.equal(badRes.summary.rejectedCount, 1);
});

test('18. Phase 3 extended exports produce valid replicate, statistical, comparative CSVs and standalone survey JSON', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const ds1 = exp.surveyDatasets[0];
  const ds2 = exp.surveyDatasets[1];

  const analysis = analyzeSurveyDataset(ds1.measurements, {
    excludeFlagged: false,
  });

  const rawWithMeta = exportSurveyMeasurementsCsv(exp, ds1.measurements, {
    datasetId: ds1.datasetId,
    title: ds1.title,
    mode: ds1.mode,
  });
  assert.ok(rawWithMeta.includes('Dataset_ID'));
  assert.ok(rawWithMeta.includes('Exclusion_Reason'));
  assert.ok(rawWithMeta.includes('DS-UPT-01'));

  const repCsv = exportReplicateSummaryCsv(exp.experimentId, ds1, analysis);
  assert.ok(repCsv.includes('Sample_Group_ID'));
  assert.ok(repCsv.includes('Sample_SD_Uptake (umol/m2)'));
  assert.ok(repCsv.includes('GRP-PH09'));

  const statCsv = exportStatisticalAnalysisCsv(exp.experimentId, ds1, analysis);
  assert.ok(statCsv.includes('Recorded Metal Uptake'));
  assert.ok(statCsv.includes('Recorded Delta pH (pHf - pHi)'));

  const comp = buildDatasetComparison([
    { experiment: exp, dataset: ds1 },
    { experiment: exp, dataset: ds2 },
  ]);
  const compCsv = exportComparativeDatasetsCsv(comp);
  assert.ok(compCsv.includes('DS-UPT-01'));
  assert.ok(compCsv.includes('DS-UPT-02'));
  assert.ok(compCsv.includes('Target_SL (m2/L)'));

  const dsJson = serializeSurveyDatasetJson(exp, ds1);
  const parsedJson = JSON.parse(dsJson);
  assert.equal(parsedJson.format, 'sea-workbench-survey-dataset');
  assert.equal(parsedJson.dataset.datasetId, 'DS-UPT-01');
  assert.equal(parsedJson.dataset.measurements.length, ds1.measurements.length);
});

test('19. flagged observation exclusion toggle and documented exclusion reversibility recompute statistics accurately', () => {
  const demo = createInitialDemoWorkspace();
  const ds1 = demo.experiments[0].surveyDatasets[0];

  // DS-UPT-01 contains 1 flagged row (UPT-05B) and 1 user-excluded row (UPT-03X)
  const includeFlagged = analyzeSurveyDataset(ds1.measurements, {
    excludeFlagged: false,
  });
  const excludeFlagged = analyzeSurveyDataset(ds1.measurements, {
    excludeFlagged: true,
  });

  assert.equal(includeFlagged.flaggedCount, 1);
  assert.equal(includeFlagged.excludedByUserCount, 1);
  assert.equal(excludeFlagged.includedRows, includeFlagged.includedRows - 1);
  assert.equal(excludeFlagged.excludeFlaggedApplied, true);

  // Reversing user exclusion on UPT-03X increases includedRows by 1 deterministically
  const restoredRows = ds1.measurements.map((r) =>
    r.sampleId === 'UPT-03X'
      ? { ...r, qualityStatus: 'valid' as const }
      : r
  );
  const afterRestore = analyzeSurveyDataset(restoredRows, {
    excludeFlagged: false,
  });
  assert.equal(afterRestore.includedRows, includeFlagged.includedRows + 1);
  assert.equal(afterRestore.excludedByUserCount, 0);
});

test('20. completeness diagnostics separate missing/flagged/discrepancy counts from scientific validity', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const ds1 = exp.surveyDatasets[0];

  const report = evaluateSurveyCompleteness(ds1, exp.instrumentMeasurements);
  assert.equal(report.totalSamples, ds1.measurements.length);
  assert.equal(report.missingUptakeCount, 1); // UPT-06
  assert.equal(report.flaggedCount, 1); // UPT-05B
  assert.equal(report.excludedCount, 1); // UPT-03X
  assert.equal(report.containsSynthetic, true);
  assert.ok(
    report.completenessDisclaimer.toLowerCase().includes('scientific validity')
  );
});

test('21. comparative multi-dataset analysis flags condition differences and blocks incompatible units', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const ds1 = exp.surveyDatasets[0]; // SL 1000 m2/L
  const ds2 = exp.surveyDatasets[1]; // SL 2500 m2/L

  const comp = buildDatasetComparison([
    { experiment: exp, dataset: ds1 },
    { experiment: exp, dataset: ds2 },
  ]);
  assert.equal(comp.unitsCompatible, true);
  assert.ok(
    comp.conditionDifferences.some((d) =>
      d.toLowerCase().includes('surface loading')
    )
  );

  // Introduce an incompatible uptake unit on a copy -> must block comparison
  const badUnitDs = duplicateSurveyDatasetRecord(ds2, exp.surveyDatasets);
  badUnitDs.measurements = badUnitDs.measurements.map((m) => ({
    ...m,
    uptakeUnit: 'mg/L',
  }));
  const badComp = buildDatasetComparison([
    { experiment: exp, dataset: ds1 },
    { experiment: exp, dataset: badUnitDs },
  ]);
  assert.equal(badComp.unitsCompatible, false);
  assert.ok(
    badComp.unitIncompatibilityReason &&
      badComp.unitIncompatibilityReason.includes('Incompatible uptake units')
  );
});

test('22. distribution binning excludes missing nulls without zero-coercion and handles constant series', () => {
  const bins = computeDistributionBins([1.0, 2.0, null, undefined, 3.0, 4.0], 4, 1);
  const totalCount = bins.reduce((acc, b) => acc + b.count, 0);
  assert.equal(totalCount, 4);
  assert.equal(bins.length, 4);

  const constantBins = computeDistributionBins([2.5, 2.5, 2.5], 5, 2);
  assert.equal(constantBins.length, 1);
  assert.equal(constantBins[0].count, 3);
});

test('23. Phase 2 (v2.0.0) workspace deterministically migrates to v3.0.0 wrapping survey data into surveyDatasets[0]', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  // Construct a realistic v2.0.0 workspace object (without surveyDatasets / activeSurveyDatasetId)
  const legacyV2Exp = { ...exp } as Record<string, unknown>;
  delete legacyV2Exp.surveyDatasets;
  delete legacyV2Exp.activeSurveyDatasetId;
  delete legacyV2Exp.datasetComparison;
  legacyV2Exp.dataVersion = '2.0.0';

  const v2Workspace = {
    ...demo,
    schemaVersion: '2.0.0',
    appVersion: '0.2.0',
    experiments: [legacyV2Exp],
  };

  const migrated = migrateWorkspaceToCurrentSchema(v2Workspace);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.fromVersion, '2.0.0');
  assert.ok(migrated.data);
  assert.equal(migrated.data.schemaVersion, WORKSPACE_SCHEMA_VERSION);

  const migratedExp = migrated.data.experiments[0];
  assert.equal(migratedExp.surveyDatasets.length, 1);
  assert.equal(
    migratedExp.activeSurveyDatasetId,
    migratedExp.surveyDatasets[0].id
  );
  assert.equal(
    migratedExp.surveyDatasets[0].measurements.length,
    exp.surveyMeasurements.length
  );
  // Stable measurement UUIDs and analytical links preserved identically
  assert.equal(
    migratedExp.surveyDatasets[0].measurements[0].id,
    exp.surveyMeasurements[0].id
  );
  assert.equal(
    migratedExp.surveyDatasets[0].measurements.find((r) => r.sampleId === 'UPT-04')
      ?.linkedInitialMeasurementId,
    exp.surveyMeasurements.find((r) => r.sampleId === 'UPT-04')
      ?.linkedInitialMeasurementId
  );
});

test('24. editing a source measurement deterministically updates derived statistics, chart series, and completeness', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const ds = exp.surveyDatasets[0];

  const beforeStats = analyzeSurveyDataset(ds.measurements);
  const beforeComp = evaluateSurveyCompleteness(ds, exp.instrumentMeasurements);

  // Fill previously missing UPT-06 uptake value with 1.50
  const editedRows = ds.measurements.map((r) =>
    r.sampleId === 'UPT-06'
      ? { ...r, recordedUptakeUmolM2: 1.5 }
      : r
  );
  const editedDs = { ...ds, measurements: editedRows };

  const afterStats = analyzeSurveyDataset(editedDs.measurements);
  const afterComp = evaluateSurveyCompleteness(
    editedDs,
    exp.instrumentMeasurements
  );
  const afterSeries = buildSurveyChartSeries(editedDs.measurements);

  assert.equal(
    afterStats.uptakeStats.value.validCount,
    beforeStats.uptakeStats.value.validCount + 1
  );
  assert.equal(afterComp.missingUptakeCount, beforeComp.missingUptakeCount - 1);
  assert.equal(
    afterSeries.find((p) => p.sampleId === 'UPT-06')?.recordedUptakeUmolM2,
    1.5
  );
});

test('25. performance benchmark on 100, 500, and 1,000 survey measurement rows completes well within interactive bounds', () => {
  const sizes = [100, 500, 1000] as const;
  const results: Array<{
    rows: number;
    csvImportMs: number;
    statsMs: number;
    seriesMs: number;
    completenessMs: number;
  }> = [];

  for (const n of sizes) {
    const csvLines = [
      'Sample_ID,Sample_Group_ID,Replicate_ID,Measured_Initial_pH (pH),Measured_Final_pH (pH),Initial_Conc (ppm),Final_Conc (ppm),Support_Mass (mg),Solution_Volume (mL),Recorded_Uptake (umol/m2)',
    ];
    for (let i = 0; i < n; i += 1) {
      const grp = `GRP-${String(Math.floor(i / 2) + 1).padStart(3, '0')}`;
      const pHi = (2 + (i % 100) * 0.1).toFixed(2);
      const pHf = (2 + (i % 100) * 0.095).toFixed(2);
      const uptake = ((i % 25) * 0.12 + 0.05).toFixed(3);
      csvLines.push(
        `S-${i + 1},${grp},R${(i % 2) + 1},${pHi},${pHf},200,145,500,50,${uptake}`
      );
    }
    const rawCsv = csvLines.join('\n');

    const t0 = performance.now();
    const parsed = parseDelimitedText(rawCsv);
    const mappings = suggestCsvColumnMappings(parsed.headers);
    const imported = validateAndBuildCsvImport(parsed, mappings, {
      defaultDate: '2026-04-10',
      surveyMode: 'uptake',
    });
    const t1 = performance.now();

    assert.equal(imported.acceptedRows.length, n);

    const ds = createBlankSurveyDataset({
      datasetId: `BENCH-${n}`,
      title: `Benchmark ${n} rows`,
      mode: 'uptake',
      researcher: 'Benchmark',
      supportSnapshot: null,
      precursorSnapshot: null,
    });
    ds.measurements = imported.acceptedRows;

    const t2 = performance.now();
    const analysis = analyzeSurveyDataset(ds.measurements);
    const t3 = performance.now();

    const series = buildSurveyChartSeries(ds.measurements);
    const t4 = performance.now();

    const completeness = evaluateSurveyCompleteness(ds, []);
    const t5 = performance.now();

    assert.equal(analysis.includedRows, n);
    assert.equal(series.length, n);
    assert.equal(completeness.totalSamples, n);

    results.push({
      rows: n,
      csvImportMs: Number((t1 - t0).toFixed(2)),
      statsMs: Number((t3 - t2).toFixed(2)),
      seriesMs: Number((t4 - t3).toFixed(2)),
      completenessMs: Number((t5 - t4).toFixed(2)),
    });
  }

  console.log('PHASE3_BENCHMARK_RESULTS:', JSON.stringify(results));
  // Ensure 1,000-row stats + series + completeness stays comfortably under 500ms
  const r1000 = results[results.length - 1];
  assert.ok(r1000.statsMs < 500, `1000-row stats took ${r1000.statsMs}ms`);
  assert.ok(r1000.csvImportMs < 1000, `1000-row CSV import took ${r1000.csvImportMs}ms`);
});

/* ============================================================================
 * PHASE 4 TESTS — Analytical Chemistry & Instrument Data Workspace
 * ============================================================================ */

test('26. Phase 4 multi-session architecture ships 2 labeled synthetic sessions, blank creation, and independent deep duplication', () => {
  assert.equal(APP_VERSION, '0.5.0');
  assert.equal(WORKSPACE_SCHEMA_VERSION, '5.0.0');

  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];

  // Demo experiment ships with ICP-OES (Pt + Si multi-analyte) and Flame AAS (Pt) sessions
  assert.equal(exp.analyticalSessions.length, 2);
  assert.ok(exp.analyticalSessions.every((s) => s.isDemonstration));
  const icp = exp.analyticalSessions.find((s) => s.sessionId === 'ANA-ICP-01')!;
  const aas = exp.analyticalSessions.find((s) => s.sessionId === 'ANA-AAS-02')!;
  assert.ok(icp && aas);
  assert.equal(icp.technique, 'ICP-OES');
  assert.equal(icp.analytes.length, 2);
  assert.equal(aas.technique, 'Flame AAS');

  // Legacy demo IDs preserved so Phase 2/3 links resolve across sessions
  assert.ok(icp.sampleMeasurements.some((m) => m.id === 'im-demo-1'));
  assert.ok(icp.sampleMeasurements.some((m) => m.id === 'im-demo-2'));
  assert.ok(icp.sampleMeasurements.some((m) => m.id === 'im-demo-3'));

  // Blank session starts cleanly with zero synthetic rows
  const blank = createBlankAnalyticalSession({
    experimentUuid: exp.uuid,
    sessionId: 'ANA-BLANK-01',
    title: 'Blank Pd ICP-MS Session',
    technique: 'ICP-MS',
    analyst: 'Dr. K. Sato',
  });
  assert.equal(blank.isDemonstration, false);
  assert.equal(blank.sampleMeasurements.length, 0);
  assert.equal(blank.calibrationDatasets.length, 1);
  assert.equal(blank.calibrationDatasets[0].standards.length, 0);

  // Independent duplication assigns brand-new UUIDs and leaves source untouched
  const { session: dup } = duplicateAnalyticalSessionRecord(
    icp,
    exp.analyticalSessions
  );
  assert.notEqual(dup.id, icp.id);
  assert.notEqual(dup.sessionId, icp.sessionId);
  assert.equal(dup.isDemonstration, false);
  assert.equal(dup.sampleMeasurements.length, icp.sampleMeasurements.length);
  assert.notEqual(dup.sampleMeasurements[0].id, icp.sampleMeasurements[0].id);
  assert.notEqual(
    dup.calibrationDatasets[0].id,
    icp.calibrationDatasets[0].id
  );
  assert.notEqual(
    dup.calibrationDatasets[0].standards[0].id,
    icp.calibrationDatasets[0].standards[0].id
  );

  dup.title = 'Mutated Duplicate Session';
  dup.sampleMeasurements[0].reportedConc = 999.9;
  assert.notEqual(icp.title, 'Mutated Duplicate Session');
  assert.notEqual(icp.sampleMeasurements[0].reportedConc, 999.9);
});

test('27. Phase 4 authoritative projection aggregates instrumentMeasurements across ALL sessions so survey links never break on session switch', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const aas = exp.analyticalSessions.find((s) => s.sessionId === 'ANA-AAS-02')!;

  // Switch active analytical session to ANA-AAS-02 (which does NOT own im-demo-1/2)
  const switched = projectExperimentCompatibilityMirrors({
    ...exp,
    activeAnalyticalSessionId: aas.id,
  });

  // Compatibility mirror analyticalConfig reflects ANA-AAS-02
  assert.equal(switched.analyticalConfig.instrumentType, 'Flame AAS');

  // Yet instrumentMeasurements aggregates all sessions, preserving UPT-04 links to im-demo-1 & im-demo-2!
  const allInst = getAllExperimentInstrumentMeasurements(switched);
  assert.ok(allInst.some((m) => m.id === 'im-demo-1'));
  assert.ok(allInst.some((m) => m.id === 'im-demo-2'));
  assert.ok(switched.instrumentMeasurements.some((m) => m.id === 'im-demo-1'));

  const links = resolveSurveyAnalyticalLinks(
    switched.surveyMeasurements,
    switched.instrumentMeasurements
  );
  const upt04 = switched.surveyMeasurements.find((r) => r.sampleId === 'UPT-04')!;
  assert.equal(links[upt04.id].initial.sourceUnavailable, false);
  assert.equal(links[upt04.id].final.sourceUnavailable, false);
});

test('28. Phase 4 instrument CSV/TSV import preserves original values, maps BDL/blank to null, detects duplicates, and imports calibration standards', () => {
  let seq = 0;
  const idGen = (prefix: string) => `${prefix}-test-${++seq}`;

  const tsv = [
    'Sample_ID\tAnalyte\tStage\tRep\tDilution_Factor\tRaw_Signal\tReported_Conc\tConc_Unit\tInstrument_Flag\tNotes',
    'ICP-S1\tPt\tInitial\tR1\t10\t128400\t19.85\tppm\t\tClean ICP read',
    'ICP-S2\tPt\tFinal\tR1\t10\t420\t<LOD\tppm\tBDL\tBelow instrument reporting limit',
    'ICP-S1\tPt\tInitial\tR1\t10\t128400\t19.85\tppm\t\tDuplicate row test',
    'ICP-S3\tPt\tFinal\tR1\t5\t65100\t\tppm\t\tBlank concentration stays null',
  ].join('\n');

  const parsed = parseDelimitedText(tsv);
  assert.equal(parsed.delimiter, '\t');
  const mapping = suggestInstrumentColumnMapping(parsed.headers);

  const result = validateAndBuildInstrumentImport({
    headers: parsed.headers,
    rawRows: parsed.rows,
    mapping,
    sessionId: 'sess-test-1',
    filename: 'icp_batch.tsv',
    format: 'tsv',
    defaultAnalyte: {
      id: 'an-pt',
      name: 'Platinum',
      symbol: 'Pt',
      wavelengthNm: 214.423,
      measurementUnit: 'ppm',
      methodReference: '',
      calibrationDatasetId: null,
      notes: '',
    },
    defaultCalibrationDatasetId: null,
    defaultConcUnit: 'ppm',
    defaultSignalUnit: 'cps',
    defaultDate: '2026-04-12',
    defaultProvenance: 'measured_experimental',
    defaultValueBasis: 'as_measured_diluted',
    existingMeasurements: [],
    knownSurveySampleIds: ['UPT-04'],
    idGenerator: idGen,
  });

  // Duplicate row is detected; BDL row stays null without silent zero-coercion; blank stays null
  assert.equal(result.duplicateCount, 1);
  assert.ok(result.acceptedRecords.length >= 2);
  const s1 = result.acceptedRecords.find((r) => r.sampleId === 'ICP-S1')!;
  const s3 = result.acceptedRecords.find((r) => r.sampleId === 'ICP-S3')!;
  assert.equal(s1.reportedConc, 19.85);
  assert.equal(s1.originalReportedConc, '19.85');
  assert.equal(s3.reportedConc, null);
  const s2Preview = result.rows.find((p) => p.record?.sampleId === 'ICP-S2')!;
  assert.ok(s2Preview);
  // BDL cell must NEVER silently become 0
  if (s2Preview.record) {
    assert.equal(s2Preview.record.reportedConc, null);
  }

  // Calibration standards CSV import
  const calCsv = [
    'Standard_ID,Nominal_Conc,Instrument_Response,Replicate,Notes',
    'STD-0,0,12,1,Blank',
    'STD-1,5,32100,1,Low std',
    'STD-2,20,128500,1,High std',
    'STD-BAD,abc,5000,1,Invalid numeric conc',
  ].join('\n');
  const calRes = importCalibrationStandardsCsv(calCsv, {
    analyteId: 'an-pt',
    concUnit: 'ppm',
    responseUnit: 'cps',
    provenance: 'measured_experimental',
    idGenerator: idGen,
  });
  assert.equal(calRes.standards.length, 3);
  assert.equal(calRes.rejectedRows.length, 1);
});

test('29. Phase 4 calibration analysis reuses OLS regression, computes residuals & replicate stats, and respects explicit exclusions', () => {
  const demo = createInitialDemoWorkspace();
  const icp = demo.experiments[0].analyticalSessions[0];
  const ptCal = icp.calibrationDatasets[0];

  const analysis = analyzeCalibrationDataset(ptCal)!;
  assert.ok(analysis);
  assert.equal(analysis.regression.status, 'available');
  assert.equal(analysis.regression.reviewStatus, 'exploratory_only');
  assert.equal(analysis.excludedCount, 1); // CAL-05 is excluded_by_user in demo fixture
  assert.ok(analysis.includedCount >= 4);
  assert.ok((analysis.regression.value.rSquared ?? 0) > 0.999);
  assert.equal(analysis.diagnosticPoints.length, analysis.includedCount);
  assert.ok(analysis.replicateLevels.length >= 4);

  // Restoring CAL-100X deterministically updates includedCount & regression
  const restoredCal = {
    ...ptCal,
    standards: ptCal.standards.map((s) =>
      s.standardId === 'CAL-100X'
        ? { ...s, qualityStatus: 'valid' as const, exclusionReason: '' }
        : s
    ),
  };
  const restoredAnalysis = analyzeCalibrationDataset(restoredCal)!;
  assert.equal(restoredAnalysis.excludedCount, 0);
  assert.equal(restoredAnalysis.includedCount, analysis.includedCount + 1);
});

test('30. Phase 4 dilution consistency diagnostics detect factor mismatches & prevent double-application of dilution factors', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const icp = exp.analyticalSessions[0];

  // Create a deliberate dilution factor conflict & double-correction risk
  const testSession = {
    ...icp,
    sampleMeasurements: [
      ...icp.sampleMeasurements,
      {
        id: 'im-precorrected',
        sampleId: 'ICP-PRE-01',
        sessionId: icp.id,
        analyteId: icp.analytes[0].id,
        analyte: 'Pt',
        linkedSurveySampleId: 'UPT-04',
        stage: 'Final' as const,
        replicateId: 'R1',
        dilutionFactor: 10,
        reportedValueBasis: 'already_dilution_corrected' as const,
        rawSignal: 60000,
        signalUnit: 'cps',
        reportedConc: 94.6,
        concUnit: 'ppm',
        qualityStatus: 'valid' as const,
        measurementDate: '2026-04-12',
        provenance: 'measured_experimental' as const,
        notes: 'Already corrected by instrument software',
      },
    ],
    dilutionRecords: [
      ...icp.dilutionRecords,
      {
        id: 'dil-conflict-1',
        sampleMeasurementId: 'im-precorrected',
        sampleId: 'ICP-PRE-01',
        stage: 'Final' as const,
        dilutionFactor: 5, // conflicts with sample dilutionFactor 10 and source/final volume ratio 10/1=10
        sourceVolumeMl: 1,
        finalVolumeMl: 10,
        concUnit: 'ppm',
        reportedValueBasis: 'as_measured_diluted' as const, // conflicts with sample already_dilution_corrected
        preparationReference: 'DIL-TEST-01',
        matrixDescription: '2% HNO3',
        analyst: 'Dr. Test',
        date: '2026-04-12',
        verificationStatus: 'unverified' as const,
        provenance: 'measured_experimental' as const,
        notes: '',
      },
    ],
  };

  const diagnostics = evaluateDilutionConsistency(testSession);
  assert.ok(diagnostics.some((d) => d.kind === 'volume_ratio_conflict'));
  assert.ok(diagnostics.some((d) => d.kind === 'sample_factor_mismatch'));
  assert.ok(diagnostics.some((d) => d.kind === 'duplicate_correction_risk'));

  // Verify resolveSurveyAnalyticalLinks NEVER double-multiplies when reportedValueBasis === 'already_dilution_corrected'
  const surveyRow: SurveyMeasurement = {
    ...exp.surveyMeasurements[0],
    id: 'sm-pre-test',
    finalConcPpm: 94.6,
    linkedFinalMeasurementId: 'im-precorrected',
  };
  const links = resolveSurveyAnalyticalLinks(
    [surveyRow],
    testSession.sampleMeasurements
  );
  // Should be 94.6 ppm (NOT 946 ppm!)
  assert.ok(
    Math.abs((links['sm-pre-test'].final.linkedEffectiveConcPpm ?? 0) - 94.6) <
      1e-9
  );
  assert.equal(links['sm-pre-test'].final.hasDiscrepancy, false);
});

test('31. Phase 4 quality review engine detects issues across categories and tracks non-destructive overview metrics', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const icp = exp.analyticalSessions[0];

  const issues = detectAnalyticalQualityIssues(exp, icp);
  assert.ok(issues.length >= 2);
  // Demo ICP session has user-excluded CAL-05 and flagged / missing sample records
  assert.ok(issues.some((i) => i.category === 'user_excluded_record'));

  const overview = evaluateAnalyticalSessionOverview(exp, icp);
  assert.equal(overview.totalAnalytes, 2);
  assert.equal(overview.totalSampleMeasurements, icp.sampleMeasurements.length);
  assert.equal(
    overview.totalCalibrationDatasets,
    icp.calibrationDatasets.length
  );
  assert.equal(overview.statusDistinction.hasMathematicallyAnalyzableCalibration, true);
  assert.equal(overview.statusDistinction.isIndependentlyValidatedMethod, false);
});

test('32. Phase 4 survey-analytical matching suggests candidate links and supports multi-session comparative analysis with unit guardrails', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const icp = exp.analyticalSessions[0];
  const aas = exp.analyticalSessions[1];

  // Suggestions for linking analytical samples to survey rows
  const suggestions = suggestSurveyAnalyticalMatches(exp, icp);
  assert.ok(Array.isArray(suggestions));

  // Cross-session comparison: ICP-OES vs Flame AAS (different techniques -> must report warning!)
  const comp = buildAnalyticalSessionComparison(exp, [icp, aas]);
  assert.equal(comp.hasIncompatibleUnits, false);
  assert.equal(comp.entries.length, 2);
  assert.ok(
    comp.warnings.some((d) => d.toLowerCase().includes('technique'))
  );

  // Incompatible units (ppm vs pH) must be flagged cleanly
  const badUnitSession = {
    ...aas,
    id: 'bad-unit-sess',
    sessionId: 'ANA-BAD-U',
    sampleMeasurements: aas.sampleMeasurements.map((m) => ({
      ...m,
      concUnit: 'pH',
    })),
  };
  const badComp = buildAnalyticalSessionComparison(exp, [icp, badUnitSession]);
  assert.equal(badComp.hasIncompatibleUnits, true);
});

test('33. Phase 4 traceable CSV and JSON exports preserve UUIDs, units, provenance, exclusion reasons, and exploratory notices', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const icp = exp.analyticalSessions[0];
  const ptCal = icp.calibrationDatasets[0];
  const calAnalysis = analyzeCalibrationDataset(ptCal)!;
  const issues = detectAnalyticalQualityIssues(exp, icp);
  const repGroups = computeAnalyticalReplicateGroups(icp.sampleMeasurements);

  const samplesCsv = exportAnalyticalSessionSamplesCsv(exp, icp);
  assert.ok(samplesCsv.includes('Measurement_UUID'));
  assert.ok(samplesCsv.includes('Reported_Value_Basis'));
  assert.ok(samplesCsv.includes('ANA-ICP-01'));

  const calCsv = exportCalibrationDatasetCsv(exp, icp, ptCal);
  assert.ok(calCsv.includes('Exclusion_Reason'));
  assert.ok(calCsv.includes('CAL-05'));

  const regCsv = exportExploratoryRegressionSummaryCsv(
    exp.experimentId,
    icp,
    ptCal,
    calAnalysis
  );
  assert.ok(regCsv.includes('Not Analytical Method Validation'));
  assert.ok(regCsv.includes('R_Squared'));
  assert.ok(regCsv.includes(String(calAnalysis.regression.value.slope)));

  const resCsv = exportRegressionResidualsCsv(
    exp.experimentId,
    icp,
    ptCal,
    calAnalysis
  );
  assert.ok(resCsv.includes('Residual'));
  assert.ok(resCsv.includes('CAL-00'));

  const repCsv = exportAnalyticalReplicateStatsCsv(
    exp.experimentId,
    icp,
    repGroups
  );
  assert.ok(repCsv.includes('Sample_SD_Conc'));

  const dilCsv = exportDilutionRecordsCsv(exp.experimentId, icp);
  assert.ok(dilCsv.includes('Source_Volume (mL)'));

  const qualCsv = exportQualityReviewCsv(exp.experimentId, icp, issues);
  assert.ok(qualCsv.includes('Category'));

  const linkCsv = exportMeasurementLinkageCsv(exp);
  assert.ok(linkCsv.includes('Survey_Sample_ID'));
  assert.ok(linkCsv.includes('UPT-04'));

  const sessJson = serializeAnalyticalSessionJson(exp, icp);
  const parsed = JSON.parse(sessJson);
  assert.equal(parsed.format, 'sea-workbench-analytical-session');
  assert.equal(parsed.session.sessionId, 'ANA-ICP-01');
  assert.equal(
    parsed.session.sampleMeasurements.length,
    icp.sampleMeasurements.length
  );
});

test('34. Phase 3 (v3.0.0) workspace deterministically migrates to v4.0.0 synthesizing analyticalSessions[0] without data loss', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];

  // Build realistic v3.0.0 workspace (has surveyDatasets, lacks analyticalSessions)
  const v3Exp = { ...exp } as Record<string, unknown>;
  delete v3Exp.analyticalSessions;
  delete v3Exp.activeAnalyticalSessionId;
  delete v3Exp.analyticalComparison;
  v3Exp.dataVersion = '3.0.0';

  const v3Workspace = {
    ...demo,
    schemaVersion: '3.0.0',
    appVersion: '0.3.0',
    experiments: [v3Exp],
  };
  delete (v3Workspace as Record<string, unknown>).importMappingTemplates;

  const migrated = migrateWorkspaceToCurrentSchema(v3Workspace);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.fromVersion, '3.0.0');
  assert.ok(migrated.data);
  assert.equal(migrated.data.schemaVersion, WORKSPACE_SCHEMA_VERSION);
  assert.ok((migrated.data.importMappingTemplates?.length ?? 0) >= 2);

  const mExp = migrated.data.experiments[0];
  assert.equal(mExp.analyticalSessions.length, 1);
  assert.equal(mExp.activeAnalyticalSessionId, mExp.analyticalSessions[0].id);
  assert.equal(
    mExp.analyticalSessions[0].sampleMeasurements.length,
    exp.instrumentMeasurements.length
  );
  // Preserves all existing measurement UUIDs & calibration standards
  assert.ok(
    mExp.analyticalSessions[0].sampleMeasurements.some(
      (m) => m.id === 'im-demo-1'
    )
  );
  assert.ok(
    mExp.analyticalSessions[0].calibrationDatasets[0].standards.length >= 4
  );
});

test('35. Phase 4 synthetic session loader creates isolated ICP-OES and Flame AAS fixtures with distinct IDs', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];

  const extraIcp = createSyntheticAnalyticalSession({
    experimentUuid: exp.uuid,
    technique: 'ICP-OES',
    existingSessions: exp.analyticalSessions,
    analyst: 'Dr. Demo',
  });
  const extraAas = createSyntheticAnalyticalSession({
    experimentUuid: exp.uuid,
    technique: 'Flame AAS',
    existingSessions: [...exp.analyticalSessions, extraIcp],
    analyst: 'Dr. Demo',
  });
  assert.equal(extraIcp.isDemonstration, true);
  assert.equal(extraAas.isDemonstration, true);
  assert.notEqual(extraIcp.sessionId, extraAas.sessionId);
  assert.ok(extraIcp.sampleMeasurements.length > 0);
  assert.ok(extraAas.sampleMeasurements.length > 0);
});

test('36. Phase 4 performance benchmark on 100, 500, 1,000, and 5,000 analytical rows completes within responsive bounds', () => {
  const sizes = [100, 500, 1000, 5000] as const;
  const results: Array<{
    rows: number;
    parseAndImportMs: number;
    filterSortMs: number;
    replicateStatsMs: number;
    calibrationOlsMs: number;
    qualityDiagnosticsMs: number;
    surveyLinkageMs: number;
  }> = [];

  const demo = createInitialDemoWorkspace();
  const baseExp = demo.experiments[0];
  let idSeq = 0;
  const idGen = (prefix: string) => `${prefix}-b-${++idSeq}`;

  for (const n of sizes) {
    // 1. Build realistic n-row instrument CSV
    const csvLines = [
      'Sample_ID,Analyte,Stage,Replicate,Dilution_Factor,Raw_Signal,Reported_Conc,Conc_Unit,Notes',
    ];
    for (let i = 0; i < n; i += 1) {
      const stage = i % 2 === 0 ? 'Initial' : 'Final';
      const conc = (5 + (i % 200) * 0.125).toFixed(3);
      const sig = (Number(conc) * 6420 + 18).toFixed(1);
      csvLines.push(
        `ANA-${Math.floor(i / 2) + 1},Pt,${stage},R${(i % 2) + 1},10,${sig},${conc},ppm,Bench row`
      );
    }
    const rawCsv = csvLines.join('\n');

    const t0 = performance.now();
    const parsed = parseDelimitedText(rawCsv);
    const mapping = suggestInstrumentColumnMapping(parsed.headers);
    const imported = validateAndBuildInstrumentImport({
      headers: parsed.headers,
      rawRows: parsed.rows,
      mapping,
      sessionId: `bench-${n}`,
      filename: `bench_${n}.csv`,
      format: 'csv',
      defaultAnalyte: baseExp.analyticalSessions[0].analytes[0],
      defaultCalibrationDatasetId: null,
      defaultConcUnit: 'ppm',
      defaultSignalUnit: 'cps',
      defaultDate: '2026-04-12',
      defaultProvenance: 'measured_experimental',
      defaultValueBasis: 'as_measured_diluted',
      existingMeasurements: [],
      knownSurveySampleIds: [],
      idGenerator: idGen,
    });
    const t1 = performance.now();
    assert.equal(imported.acceptedRecords.length, n);

    // 2. Filtering + sorting
    const t2 = performance.now();
    const filteredSorted = imported.acceptedRecords
      .filter((r) => r.stage === 'Final' && (r.reportedConc ?? 0) > 10)
      .sort((a, b) => (b.reportedConc ?? 0) - (a.reportedConc ?? 0));
    const t3 = performance.now();
    assert.ok(filteredSorted.length > 0);

    // 3. Replicate statistics
    const t4 = performance.now();
    const repGroups = computeAnalyticalReplicateGroups(imported.acceptedRecords);
    const t5 = performance.now();
    assert.ok(repGroups.length > 0);

    // 4. Calibration regression
    const session = createBlankAnalyticalSession({
      experimentUuid: baseExp.uuid,
      sessionId: `BENCH-${n}`,
      title: `Benchmark ${n}`,
      technique: 'ICP-OES',
      analyst: 'Benchmark',
    });
    session.sampleMeasurements = imported.acceptedRecords;
    session.calibrationDatasets[0].standards =
      baseExp.analyticalSessions[0].calibrationDatasets[0].standards;

    const t6 = performance.now();
    const calAnalysis = analyzeCalibrationDataset(
      session.calibrationDatasets[0]
    )!;
    const t7 = performance.now();
    assert.equal(calAnalysis.regression.status, 'available');

    // 5. Quality diagnostics
    const t8 = performance.now();
    const qIssues = detectAnalyticalQualityIssues(baseExp, session);
    const t9 = performance.now();
    assert.ok(Array.isArray(qIssues));

    // 6. Survey linkage resolution against all n analytical rows
    const t10 = performance.now();
    const links = resolveSurveyAnalyticalLinks(
      baseExp.surveyMeasurements,
      imported.acceptedRecords
    );
    const t11 = performance.now();
    assert.ok(Object.keys(links).length === baseExp.surveyMeasurements.length);

    results.push({
      rows: n,
      parseAndImportMs: Number((t1 - t0).toFixed(2)),
      filterSortMs: Number((t3 - t2).toFixed(2)),
      replicateStatsMs: Number((t5 - t4).toFixed(2)),
      calibrationOlsMs: Number((t7 - t6).toFixed(2)),
      qualityDiagnosticsMs: Number((t9 - t8).toFixed(2)),
      surveyLinkageMs: Number((t11 - t10).toFixed(2)),
    });
  }

  console.log('PHASE4_BENCHMARK_RESULTS:', JSON.stringify(results));
  const r5000 = results[results.length - 1];
  assert.ok(
    r5000.parseAndImportMs < 2500,
    `5,000-row import took ${r5000.parseAndImportMs}ms`
  );
  assert.ok(
    r5000.replicateStatsMs < 1500,
    `5,000-row replicate stats took ${r5000.replicateStatsMs}ms`
  );
  assert.ok(
    r5000.qualityDiagnosticsMs < 1500,
    `5,000-row quality diagnostics took ${r5000.qualityDiagnosticsMs}ms`
  );
});

// ===========================================================================
// Phase 5 Tests (Tests 37–48)
// ===========================================================================

test('37. Phase 5 measurement value qualifiers preserve censored, missing, and valid-zero tokens without silent coercion to zero', () => {
  const cZero = classifyMeasurementToken('0');
  assert.equal(cZero.qualifier, 'valid_zero');
  assert.equal(cZero.numericValue, 0);

  const cBelowLod = classifyMeasurementToken('<0.02');
  assert.equal(cBelowLod.qualifier, 'below_lod');
  assert.equal(cBelowLod.numericValue, null);
  assert.equal(cBelowLod.suppliedLimitValue, 0.02);
  assert.equal(cBelowLod.originalToken, '<0.02');

  const cBdl = classifyMeasurementToken('BDL');
  assert.equal(cBdl.qualifier, 'below_lod');
  assert.equal(cBdl.numericValue, null);

  const cLoq = classifyMeasurementToken('<LOQ');
  assert.equal(cLoq.qualifier, 'below_loq');
  assert.equal(cLoq.numericValue, null);

  const cNd = classifyMeasurementToken('ND');
  assert.equal(cNd.qualifier, 'not_detected');
  assert.equal(cNd.numericValue, null);

  const cNm = classifyMeasurementToken('NM');
  assert.equal(cNm.qualifier, 'not_measured');
  assert.equal(cNm.numericValue, null);

  const cErr = classifyMeasurementToken('ERR');
  assert.equal(cErr.qualifier, 'instrument_invalid');
  assert.equal(cErr.numericValue, null);

  const cBlank = classifyMeasurementToken('');
  assert.equal(cBlank.qualifier, 'missing');
  assert.equal(cBlank.numericValue, null);

  const csv = [
    'Sample_ID,Analyte,Stage,Replicate,Dilution_Factor,Raw_Signal,Reported_Conc,Conc_Unit',
    'BLK-01,Pt,Final,R1,1,12,<0.02,ppm',
    'ZERO-01,Pt,Final,R1,1,0,0,ppm',
    'ND-01,Pt,Final,R1,1,5,ND,ppm',
    'NM-01,Pt,Final,R1,1,,NM,ppm',
  ].join('\n');
  const parsed = parseDelimitedText(csv);
  const mapping = suggestInstrumentColumnMapping(parsed.headers);
  let seq = 0;
  const imp = validateAndBuildInstrumentImport({
    headers: parsed.headers,
    rawRows: parsed.rows,
    mapping,
    sessionId: 'sess-qual-test',
    filename: 'qualifiers.csv',
    format: 'csv',
    defaultAnalyte: {
      id: 'an-pt',
      name: 'Platinum',
      symbol: 'Pt',
      wavelengthNm: 214.423,
      measurementUnit: 'ppm',
      methodReference: 'ICP-OES 214.423 nm',
      calibrationDatasetId: null,
      notes: '',
    },
    defaultCalibrationDatasetId: null,
    defaultConcUnit: 'ppm',
    defaultSignalUnit: 'cps',
    defaultDate: '2026-04-12',
    defaultProvenance: 'measured_experimental',
    defaultValueBasis: 'already_dilution_corrected',
    existingMeasurements: [],
    knownSurveySampleIds: [],
    idGenerator: (p) => `${p}-q-${++seq}`,
  });

  assert.equal(imp.acceptedRecords.length, 4);
  const blk = imp.acceptedRecords.find((r) => r.sampleId === 'BLK-01')!;
  assert.equal(blk.reportedConc, null);
  assert.equal(blk.valueQualifier, 'below_lod');
  assert.equal(blk.suppliedLimitValue, 0.02);
  assert.ok(formatQualifiedMeasurementValue(blk).includes('<0.02'));

  const z = imp.acceptedRecords.find((r) => r.sampleId === 'ZERO-01')!;
  assert.equal(z.reportedConc, 0);
  assert.equal(z.valueQualifier, 'valid_zero');

  const nd = imp.acceptedRecords.find((r) => r.sampleId === 'ND-01')!;
  assert.equal(nd.reportedConc, null);
  assert.equal(nd.valueQualifier, 'not_detected');

  const repStats = computeAnalyticalReplicateGroups(imp.acceptedRecords);
  const blkGroup = repStats.find((g) => g.sampleId === 'BLK-01')!;
  assert.equal(blkGroup.concStats.value.validCount, 0);
  assert.equal(blkGroup.concStats.value.mean, null);

  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const session = exp.analyticalSessions[0];
  const exported = exportAnalyticalSessionSamplesCsv(exp, session);
  assert.ok(exported.includes('Value_Qualifier'));
  assert.ok(exported.includes('below_lod'));
  assert.ok(exported.includes('<0.02'));
});

test('38. Authoritative data-source synchronization keeps legacy compatibility mirrors consistent', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const sync = verifyAuthoritativeSync(exp);
  assert.equal(sync.synchronized, true);
  assert.equal(sync.mismatches.length, 0);

  const drifted = {
    ...exp,
    benchChecklist: [],
  };
  assert.equal(verifyAuthoritativeSync(drifted).synchronized, false);
  const repaired = projectExperimentCompatibilityMirrors(drifted);
  assert.equal(verifyAuthoritativeSync(repaired).synchronized, true);
  assert.equal(repaired.benchChecklist.length, (repaired.milestones ?? []).length);
});

test('39. Extended 8-state experiment lifecycle records history and preserves snapshots on reopen', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];

  assert.ok((exp.lifecycleHistory ?? []).length >= 2);
  assert.ok((exp.snapshots ?? []).length >= 2);

  const completedSnapCount = (exp.snapshots ?? []).length;
  const reopened = {
    ...exp,
    status: 'Analysis in Progress' as const,
    lifecycleHistory: [
      ...(exp.lifecycleHistory ?? []),
      {
        id: 'lc-reopen-test',
        fromStatus: 'Completed' as const,
        toStatus: 'Analysis in Progress' as const,
        timestamp: new Date().toISOString(),
        researcher: exp.researcher,
        explanation: 'Reopened to inspect ICP-BLK-02 below-LOD qualifier.',
      },
    ],
  };
  assert.equal(reopened.status, 'Analysis in Progress');
  assert.equal((reopened.snapshots ?? []).length, completedSnapCount);
  assert.equal(
    reopened.lifecycleHistory[reopened.lifecycleHistory.length - 1].fromStatus,
    'Completed'
  );
});

test('40. Research planning metadata, deviations, and documentation-only templates preserve scientific boundaries', () => {
  const demo = createInitialDemoWorkspace();
  assert.ok(demo.experiments.length >= 2);
  assert.ok((demo.experimentTemplates ?? []).length >= 2);

  const plannedExp = demo.experiments.find(
    (e) => e.experimentId === 'SEA-DEMO-002'
  );
  assert.ok(plannedExp);
  assert.equal(plannedExp.status, 'Planned');
  assert.ok((plannedExp.researchPlan?.researchQuestions ?? []).length >= 1);
  assert.ok((plannedExp.researchPlan?.plannedSampleIds ?? []).length >= 1);

  const tpl = (demo.experimentTemplates ?? [])[0];
  assert.ok(tpl);
  assert.ok(tpl.defaultMilestones.length >= 1);
  assert.equal(
    'stoichiometricModel' in (tpl as unknown as Record<string, unknown>),
    false
  );
});

test('41. Multiple independent named timers perform accurate wall-clock recovery across reload', () => {
  const baseTime = Date.parse('2026-04-12T10:00:00.000Z');
  const elapsedTimer: ResearchTimer = {
    id: 'rt-1',
    name: 'Equilibration A',
    mode: 'elapsed',
    status: 'running',
    configuredDurationSec: 3600,
    activeDurationSec: 3600,
    elapsedMs: 120_000,
    remainingMs: 0,
    startedAt: '2026-04-12T09:58:00.000Z',
    lastTickAt: '2026-04-12T10:00:00.000Z',
    completedAt: null,
    linkedMilestoneId: null,
    history: [],
  };
  const recoveredElapsed = recoverResearchTimer(elapsedTimer, baseTime + 45_000);
  assert.equal(recoveredElapsed.elapsedMs, 165_000);
  assert.equal(recoveredElapsed.status, 'running');
  assert.equal(recoveredElapsed.completedWhileAway, false);

  const countdownTimer: ResearchTimer = {
    id: 'rt-2',
    name: 'Centrifuge Hold',
    mode: 'countdown',
    status: 'running',
    configuredDurationSec: 600,
    activeDurationSec: 600,
    elapsedMs: 540_000,
    remainingMs: 60_000,
    startedAt: '2026-04-12T09:51:00.000Z',
    lastTickAt: '2026-04-12T10:00:00.000Z',
    completedAt: null,
    linkedMilestoneId: null,
    history: [],
  };
  const recoveredCountdown = recoverResearchTimer(
    countdownTimer,
    baseTime + 90_000
  );
  assert.equal(recoveredCountdown.remainingMs, 0);
  assert.equal(recoveredCountdown.status, 'completed');
  assert.equal(recoveredCountdown.completedWhileAway, true);
});

test('42. Unified Sample Registry tracks samples by stable IDs and warns on duplicate labels without silently merging', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const registry = buildUnifiedSampleRegistry(exp);

  assert.ok(registry.entries.length >= 6);
  const upt04 = registry.entries.find((e) => e.sampleId === 'UPT-04');
  assert.ok(upt04);
  assert.ok(upt04.surveyMeasurement !== null);
  assert.ok(upt04.analyticalLinks.length >= 1);

  const dupExp = structuredClone(exp);
  const dupDs = createBlankSurveyDataset({
    datasetId: 'SRV-DUP-01',
    title: 'Duplicate Label Test',
    mode: 'uptake',
    researcher: 'Dr. Test',
  });
  dupDs.measurements.push({
    ...exp.surveyDatasets[0].measurements[0],
    id: 'sm-dup-collision',
    sampleId: 'UPT-04',
  });
  dupExp.surveyDatasets.push(dupDs);
  const dupRegistry = buildUnifiedSampleRegistry(dupExp);
  assert.ok(
    dupRegistry.duplicateLabelWarnings.some(
      (w) => w.normalizedLabel === 'upt-04'
    )
  );
});

test('43. Chronological Research Timeline orders multi-module events and preserves references when a source record is deleted', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const timeline = buildExperimentTimeline(exp);
  assert.ok(timeline.length >= 5);

  for (let i = 1; i < timeline.length; i += 1) {
    assert.ok(
      timeline[i - 1].timestamp >= timeline[i].timestamp,
      'Timeline must remain sorted newest-first'
    );
  }

  const mutated = structuredClone(exp);
  mutated.activityEvents = [
    ...(mutated.activityEvents ?? []),
    {
      id: 'act-deleted-ref',
      eventType: 'survey_dataset_event',
      module: 'uptake-survey',
      timestamp: '2026-04-15T12:00:00.000Z',
      experimentUuid: mutated.uuid,
      sourceKind: 'survey_dataset',
      sourceId: 'nonexistent-dataset-uuid',
      sourceLabel: 'SRV-REMOVED',
      author: 'Dr. Test',
      description: 'Archived dataset event whose source was later removed.',
    },
  ];
  const afterTimeline = buildExperimentTimeline(mutated);
  const deletedEvt = afterTimeline.find((e) => e.id === 'act-deleted-ref');
  assert.ok(deletedEvt);
  assert.equal(deletedEvt.sourceAvailable, false);
});

test('44. Consolidated Review Center aggregates cross-module findings across categories without duplicate keys', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const reviewItems = buildConsolidatedReviewItems(exp);

  assert.ok(reviewItems.length >= 3);
  const keys = new Set(reviewItems.map((i) => i.issueKey));
  assert.equal(keys.size, reviewItems.length);

  assert.ok(
    reviewItems.some(
      (i) =>
        i.group === 'analytical_records' ||
        i.group === 'analytical_discrepancies' ||
        i.group === 'survey_records'
    )
  );
  for (const item of reviewItems) {
    assert.ok(item.navContext.module.length > 0);
  }
});

test('45. Immutable snapshots support side-by-side comparison, independent restoration, and finalized report immunity to live edits', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];

  const snap1 = createExperimentSnapshotRecord(exp, {
    snapshotId: 'SNAP-TEST-01',
    name: 'Baseline Snapshot',
    description: 'Captured prior to live edit.',
    researcher: exp.researcher,
  });

  const edited = structuredClone(exp);
  edited.title = 'Mutated Live Experiment Title';
  edited.surveyDatasets[0].measurements[0].recordedUptakeUmolM2 = 9.99;

  assert.notEqual(snap1.payload.title, edited.title);
  assert.notEqual(
    snap1.payload.surveyDatasets[0].measurements[0].recordedUptakeUmolM2,
    9.99
  );
  assert.equal(hasExperimentChangedSinceSnapshot(edited, snap1), true);

  const snap2 = createExperimentSnapshotRecord(edited, {
    snapshotId: 'SNAP-TEST-02',
    name: 'Post-Edit Snapshot',
    description: 'After uptake adjustment.',
    researcher: edited.researcher,
  });

  const diff = compareExperimentSnapshots(snap1.payload, snap2.payload);
  assert.ok(diff.changedCount >= 1);
  assert.ok(diff.fields.some((f) => f.label === 'Title' && f.changed));

  let rSeq = 0;
  const restored = restoreSnapshotAsIndependentExperiment(
    snap1,
    demo.experiments,
    (prefix) => `${prefix}-restored-${++rSeq}`,
    generateUniqueExperimentId
  );
  assert.notEqual(restored.uuid, exp.uuid);
  assert.notEqual(restored.experimentId, exp.experimentId);
  assert.ok(restored.title.includes(snap1.payload.title));
  assert.equal((restored.snapshots ?? []).length, 0);
});

test('46. Figure reproducibility provenance detects current vs requires_regeneration vs source_unavailable states', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const ds = exp.surveyDatasets[0];
  const fig = ds.savedFigures[0];
  assert.ok(fig);

  const analysisProvenance = buildSurveyAnalysisProvenance(exp, ds);
  const figWithProv = { ...fig, analysisProvenance };
  assert.equal(
    evaluateFigureReproducibility(exp, 'survey', figWithProv, ds.id).status,
    'saved_current'
  );

  const modified = structuredClone(exp);
  modified.surveyDatasets[0].measurements[0].recordedUptakeUmolM2 = 4.56;
  assert.equal(
    evaluateFigureReproducibility(modified, 'survey', figWithProv, ds.id).status,
    'requires_regeneration'
  );

  const deletedSource = structuredClone(exp);
  deletedSource.surveyDatasets = [];
  assert.equal(
    evaluateFigureReproducibility(deletedSource, 'survey', figWithProv, ds.id)
      .status,
    'source_unavailable'
  );

  const sess = exp.analyticalSessions[0];
  const aFig = sess.savedFigures[0];
  if (aFig) {
    const aProv = buildAnalyticalAnalysisProvenance(exp, sess);
    assert.equal(
      evaluateFigureReproducibility(
        exp,
        'analytical',
        { ...aFig, analysisProvenance: aProv },
        sess.id
      ).status,
      'saved_current'
    );
  }
});

test('47. ZIP Research Export Package generates valid PKZIP archive with manifest, README, CSVs preserving qualifiers, and metadata JSON', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];
  const pkg = buildResearchExportPackage(exp, {
    snapshot: (exp.snapshots ?? [])[0],
  });

  assert.equal(pkg.zipBytes[0], 0x50);
  assert.equal(pkg.zipBytes[1], 0x4b);
  assert.equal(pkg.zipBytes[2], 0x03);
  assert.equal(pkg.zipBytes[3], 0x04);

  const parsedEntries = listZipEntries(pkg.zipBytes);
  const paths = parsedEntries.map((e) => e.path);
  assert.ok(paths.includes('manifest.json'));
  assert.ok(paths.includes('README.md'));
  assert.ok(paths.includes('experiment_metadata.json'));
  assert.ok(paths.includes('sample_registry.json'));
  assert.ok(
    paths.some((e) => e.startsWith('survey/') && e.endsWith('.csv'))
  );
  assert.ok(
    paths.some((e) => e.startsWith('analytical/') && e.endsWith('.csv'))
  );
  assert.ok(paths.some((e) => e.startsWith('figures/')));
  assert.equal(parsedEntries.length, pkg.entries.length);

  const archiveText = new TextDecoder().decode(pkg.zipBytes);
  assert.ok(archiveText.includes('below_lod'));
  assert.ok(archiveText.includes('<0.02'));
  assert.ok(archiveText.includes('SEA Workbench'));
});

test('48. Phase 4 (v4.0.0) workspace migrates cleanly to v5.0.0, computes UTF-8 storage diagnostics, and preserves last-known-good state on write failure', () => {
  const demo = createInitialDemoWorkspace();
  const exp = demo.experiments[0];

  const v4Exp = { ...exp } as Record<string, unknown>;
  delete v4Exp.researchPlan;
  delete v4Exp.lifecycleHistory;
  delete v4Exp.milestones;
  delete v4Exp.timers;
  delete v4Exp.sampleRegistryNotes;
  delete v4Exp.snapshots;
  delete v4Exp.finalizedReports;
  delete v4Exp.activityEvents;
  v4Exp.dataVersion = '4.0.0';

  const v4Workspace = {
    ...demo,
    schemaVersion: '4.0.0',
    appVersion: '0.4.0',
    experiments: [v4Exp],
  };
  delete (v4Workspace as Record<string, unknown>).experimentTemplates;

  const migrated = migrateWorkspaceToCurrentSchema(v4Workspace);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.fromVersion, '4.0.0');
  assert.ok(migrated.data);
  assert.equal(migrated.data.schemaVersion, WORKSPACE_SCHEMA_VERSION);
  assert.equal(migrated.data.appVersion, APP_VERSION);
  assert.ok((migrated.data.experiments[0].milestones ?? []).length > 0);
  assert.ok((migrated.data.experiments[0].lifecycleHistory ?? []).length >= 1);
  assert.equal(
    verifyAuthoritativeSync(migrated.data.experiments[0]).synchronized,
    true
  );

  const diag = computeStorageDiagnostics(migrated.data);
  assert.ok(diag.totalBytes > 0);
  assert.ok(diag.experimentsBytes > 0);
  assert.ok(diag.budgetBytes > 0);
  assert.ok(diag.usageRatio >= 0);

  const storage = new MemoryStorage();
  const initialSave = saveWorkspaceToStorage(migrated.data, storage);
  assert.equal(initialSave.ok, true);

  const failingStorage: StorageLike = {
    getItem: (k) => storage.getItem(k),
    setItem: () => {
      throw new Error('QuotaExceededError: simulated browser storage full');
    },
    removeItem: (k) => storage.removeItem(k),
  };

  const failedSave = saveWorkspaceToStorage(demo, failingStorage);
  assert.equal(failedSave.ok, false);
  assert.ok(failedSave.error?.includes('QuotaExceededError'));

  const reloaded = loadWorkspaceFromStorage(storage);
  assert.equal(reloaded.status, 'loaded');
  assert.equal(reloaded.data?.experiments.length, 1);
});





