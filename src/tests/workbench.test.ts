import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSurveyDataset,
  areUnitsCompatible,
  buildDatasetComparison,
  buildSurveyChartSeries,
  computeDescriptiveStatistics,
  computeDistributionBins,
  computeLinearRegression,
  computeSurveyReplicateGroups,
  convertUnit,
  evaluateAnalyticalBoundary,
  evaluateBatchSynthesisBoundary,
  evaluateSurveyCompleteness,
  formatScientificNumber,
  formatWithScientificNotation,
  parseOptionalNumber,
  resolveSurveyAnalyticalLinks,
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
  StorageLike,
  WORKSPACE_STORAGE_KEY,
  loadWorkspaceFromStorage,
  saveWorkspaceToStorage,
} from '../services/persistence/storage';
import { migrateWorkspaceToCurrentSchema } from '../services/persistence/migration';
import {
  exportCalibrationStandardsCsv,
  exportComparativeDatasetsCsv,
  exportInstrumentMeasurementsCsv,
  exportReplicateSummaryCsv,
  exportStatisticalAnalysisCsv,
  exportSurveyMeasurementsCsv,
  parseWorkspaceBackup,
  serializeSurveyDatasetJson,
  serializeWorkspaceBackup,
} from '../services/import-export/backup';
import {
  parseDelimitedText,
  suggestCsvColumnMappings,
  validateAndBuildCsvImport,
} from '../services/import-export/surveyCsvImport';
import {
  InstrumentMeasurement,
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
  assert.equal(analyticalBoundary.validCalibrationPoints, 4);
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
  assert.equal(parsed.data?.workspace.experiments.length, 2);
  assert.equal(parsed.data?.workspace.precursors.length, demo.precursors.length);
  assert.equal(parsed.data?.workspace.supports.length, demo.supports.length);

  assert.equal(validateBackupEnvelope('not json').valid, false);
  assert.equal(
    validateBackupEnvelope(JSON.stringify({ format: 'other-app', workspace: {} })).valid,
    false
  );

  // Unsupported future major schema version (4.0.0)
  const badSchema = JSON.parse(exportedJson);
  badSchema.workspace.schemaVersion = '4.0.0';
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
  assert.equal(migrated.data.schemaVersion, '3.0.0');

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

