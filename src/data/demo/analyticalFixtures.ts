/**
 * SEA Workbench — Phase 4 Analytical Session Factories & Synthetic Demonstration Fixtures
 *
 * All demonstration records are explicitly flagged (`isDemonstration: true`,
 * `provenance: 'synthetic_demo'`, `scientificReviewStatus: 'Demonstration Fixture'`).
 * Never represents synthetic data as validated experimental evidence.
 */

import {
  AnalyticalAnalyte,
  AnalyticalFigureConfiguration,
  AnalyticalSession,
  CalibrationDataset,
  CalibrationStandard,
  DilutionRecord,
  ImportMappingTemplate,
  InstrumentMeasurement,
  InstrumentType,
} from '../../domain/models/types';
import { createDefaultAnalyticalFigureConfig } from '../../domain/calculations/analyticalAnalysis';

function makeUuid(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}-${time}-${rand}`;
}

export function generateUniqueSessionId(
  existingSessions: AnalyticalSession[],
  technique: InstrumentType = 'ICP-OES'
): string {
  const tag =
    technique === 'ICP-OES'
      ? 'ICP'
      : technique === 'Flame AAS' || technique === 'AAS'
        ? 'AAS'
        : technique === 'Graphite Furnace AAS'
          ? 'GFAAS'
          : 'ANA';
  const existing = new Set(
    existingSessions.map((s) => s.sessionId.trim().toLowerCase())
  );
  let seq = existingSessions.length + 1;
  while (seq < 1000) {
    const candidate = `ANA-${tag}-${String(seq).padStart(2, '0')}`;
    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
    seq += 1;
  }
  return `ANA-${tag}-${Date.now().toString().slice(-4)}`;
}

export function createBlankAnalyticalSession(params: {
  experimentUuid: string;
  sessionId: string;
  title: string;
  technique: InstrumentType;
  customTechniqueName?: string;
  analyst: string;
  analysisDate?: string;
}): AnalyticalSession {
  const now = new Date().toISOString();
  const today = params.analysisDate || now.slice(0, 10);
  const id = makeUuid('as');
  const analyteId = makeUuid('an');
  const calId = makeUuid('calds');

  const defaultAnalyte: AnalyticalAnalyte = {
    id: analyteId,
    name: 'Primary Analyte',
    symbol: '',
    wavelengthNm: null,
    measurementUnit: 'ppm',
    methodReference: '',
    calibrationDatasetId: calId,
    notes: '',
  };

  const defaultCal: CalibrationDataset = {
    id: calId,
    calibrationId: 'CAL-01',
    title: 'Primary Calibration Series',
    sessionId: id,
    analyteId,
    referenceMethod: '',
    concUnit: 'ppm',
    responseUnit: params.technique.includes('AAS') ? 'Abs' : 'cps',
    analyst: params.analyst.trim(),
    analysisDate: today,
    provenance: 'user_entered',
    standards: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };

  return {
    id,
    sessionId: params.sessionId.trim(),
    title: params.title.trim() || `${params.technique} Analytical Session`,
    experimentUuid: params.experimentUuid,
    status: 'Active',
    technique: params.technique,
    customTechniqueName: params.customTechniqueName?.trim() ?? '',
    instrumentManufacturer: '',
    instrumentModel: '',
    instrumentIdentifier: '',
    methodReference: '',
    analyst: params.analyst.trim(),
    analysisDate: today,
    matrixDescription: '',
    conditionsNote: '',
    analytes: [defaultAnalyte],
    activeAnalyteId: analyteId,
    calibrationDatasets: [defaultCal],
    activeCalibrationDatasetId: calId,
    sampleMeasurements: [],
    dilutionRecords: [],
    importHistory: [],
    reviewRecords: [],
    figureConfig: createDefaultAnalyticalFigureConfig(
      'calibration_regression',
      `${params.title.trim() || params.sessionId} — Exploratory Calibration Fit`,
      makeUuid('afig')
    ),
    savedFigures: [],
    observations: '',
    provenance: 'user_entered',
    scientificReviewStatus: 'Unreviewed',
    isDemonstration: false,
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateAnalyticalSessionRecord(
  source: AnalyticalSession,
  existingSessions: AnalyticalSession[],
  targetExperimentUuid?: string
): {
  session: AnalyticalSession;
  sampleIdMap: Map<string, string>;
} {
  const clone = structuredClone(source);
  const now = new Date().toISOString();
  const newId = makeUuid('as');
  const newCode = generateUniqueSessionId(existingSessions, source.technique);

  const analyteIdMap = new Map<string, string>();
  const calIdMap = new Map<string, string>();
  const sampleIdMap = new Map<string, string>();

  clone.calibrationDatasets = clone.calibrationDatasets.map((c) => {
    const nextCalId = makeUuid('calds');
    calIdMap.set(c.id, nextCalId);
    return {
      ...c,
      id: nextCalId,
      sessionId: newId,
      standards: c.standards.map((s) => ({
        ...s,
        id: makeUuid('cal'),
      })),
      createdAt: now,
      updatedAt: now,
    };
  });

  clone.analytes = clone.analytes.map((a) => {
    const nextAnId = makeUuid('an');
    analyteIdMap.set(a.id, nextAnId);
    return {
      ...a,
      id: nextAnId,
      calibrationDatasetId: a.calibrationDatasetId
        ? calIdMap.get(a.calibrationDatasetId) ?? null
        : null,
    };
  });

  clone.calibrationDatasets = clone.calibrationDatasets.map((c) => ({
    ...c,
    analyteId: c.analyteId ? analyteIdMap.get(c.analyteId) ?? null : null,
    standards: c.standards.map((s) => ({
      ...s,
      analyteId: s.analyteId ? analyteIdMap.get(s.analyteId) ?? null : null,
    })),
  }));

  clone.sampleMeasurements = clone.sampleMeasurements.map((m) => {
    const nextSampleId = makeUuid('im');
    sampleIdMap.set(m.id, nextSampleId);
    return {
      ...m,
      id: nextSampleId,
      sessionId: newId,
      analyteId: m.analyteId ? analyteIdMap.get(m.analyteId) ?? null : null,
      calibrationDatasetId: m.calibrationDatasetId
        ? calIdMap.get(m.calibrationDatasetId) ?? null
        : null,
      // Clear survey links on standalone session duplicate so original links are untouched
      linkedSurveyDatasetId: targetExperimentUuid ? m.linkedSurveyDatasetId : null,
      linkedSurveyMeasurementId: targetExperimentUuid
        ? m.linkedSurveyMeasurementId
        : null,
    };
  });

  clone.dilutionRecords = clone.dilutionRecords.map((d) => ({
    ...d,
    id: makeUuid('dil'),
    sampleMeasurementId: d.sampleMeasurementId
      ? sampleIdMap.get(d.sampleMeasurementId) ?? null
      : null,
  }));

  clone.reviewRecords = clone.reviewRecords.map((r) => ({
    ...r,
    id: makeUuid('rev'),
    sessionId: newId,
    recordId: sampleIdMap.get(r.recordId) ?? r.recordId,
  }));

  clone.figureConfig = {
    ...clone.figureConfig,
    id: makeUuid('afig'),
    savedAt: now,
  };
  clone.savedFigures = clone.savedFigures.map((f) => ({
    ...f,
    id: makeUuid('afig'),
  }));

  clone.id = newId;
  clone.sessionId = targetExperimentUuid ? source.sessionId : newCode;
  clone.title = targetExperimentUuid ? source.title : `${source.title} (Copy)`;
  clone.experimentUuid = targetExperimentUuid ?? source.experimentUuid;
  clone.activeAnalyteId =
    (source.activeAnalyteId && analyteIdMap.get(source.activeAnalyteId)) ||
    clone.analytes[0]?.id ||
    null;
  clone.activeCalibrationDatasetId =
    (source.activeCalibrationDatasetId &&
      calIdMap.get(source.activeCalibrationDatasetId)) ||
    clone.calibrationDatasets[0]?.id ||
    null;
  clone.status = 'Active';
  clone.isDemonstration = false;
  clone.scientificReviewStatus = 'Unreviewed';
  clone.createdAt = now;
  clone.updatedAt = now;

  return { session: clone, sampleIdMap };
}

export function createSyntheticAnalyticalSession(params: {
  experimentUuid: string;
  technique: 'ICP-OES' | 'Flame AAS';
  existingSessions: AnalyticalSession[];
  analyst: string;
}): AnalyticalSession {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const code = generateUniqueSessionId(params.existingSessions, params.technique);
  const id = makeUuid('as');
  const analyteId = makeUuid('an');
  const calId = makeUuid('calds');
  const isAas = params.technique === 'Flame AAS';

  const standards: CalibrationStandard[] = isAas
    ? [
        {
          id: makeUuid('cal'),
          standardId: 'AAS-BLK',
          analyteId,
          isBlank: true,
          nominalConc: 0,
          unit: 'ppm',
          instrumentResponse: 0.002,
          responseUnit: 'Abs',
          replicateNumber: 1,
          provenance: 'synthetic_demo',
          qualityStatus: 'valid',
          notes: 'Synthetic reagent blank.',
        },
        {
          id: makeUuid('cal'),
          standardId: 'AAS-10',
          analyteId,
          isBlank: false,
          nominalConc: 10,
          unit: 'ppm',
          instrumentResponse: 0.084,
          responseUnit: 'Abs',
          replicateNumber: 1,
          provenance: 'synthetic_demo',
          qualityStatus: 'valid',
          notes: 'Synthetic standard.',
        },
        {
          id: makeUuid('cal'),
          standardId: 'AAS-25',
          analyteId,
          isBlank: false,
          nominalConc: 25,
          unit: 'ppm',
          instrumentResponse: 0.207,
          responseUnit: 'Abs',
          replicateNumber: 1,
          provenance: 'synthetic_demo',
          qualityStatus: 'valid',
          notes: 'Synthetic standard.',
        },
        {
          id: makeUuid('cal'),
          standardId: 'AAS-50',
          analyteId,
          isBlank: false,
          nominalConc: 50,
          unit: 'ppm',
          instrumentResponse: 0.412,
          responseUnit: 'Abs',
          replicateNumber: 1,
          provenance: 'synthetic_demo',
          qualityStatus: 'valid',
          notes: 'Synthetic standard.',
        },
      ]
    : [
        {
          id: makeUuid('cal'),
          standardId: 'STD-00',
          analyteId,
          isBlank: true,
          nominalConc: 0,
          unit: 'ppm',
          instrumentResponse: 98.5,
          responseUnit: 'cps',
          replicateNumber: 1,
          provenance: 'synthetic_demo',
          qualityStatus: 'valid',
          notes: 'Synthetic blank.',
        },
        {
          id: makeUuid('cal'),
          standardId: 'STD-05',
          analyteId,
          isBlank: false,
          nominalConc: 5,
          unit: 'ppm',
          instrumentResponse: 18310,
          responseUnit: 'cps',
          replicateNumber: 1,
          provenance: 'synthetic_demo',
          qualityStatus: 'valid',
          notes: 'Synthetic standard.',
        },
        {
          id: makeUuid('cal'),
          standardId: 'STD-25',
          analyteId,
          isBlank: false,
          nominalConc: 25,
          unit: 'ppm',
          instrumentResponse: 91250,
          responseUnit: 'cps',
          replicateNumber: 1,
          provenance: 'synthetic_demo',
          qualityStatus: 'valid',
          notes: 'Synthetic standard.',
        },
        {
          id: makeUuid('cal'),
          standardId: 'STD-50',
          analyteId,
          isBlank: false,
          nominalConc: 50,
          unit: 'ppm',
          instrumentResponse: 182400,
          responseUnit: 'cps',
          replicateNumber: 1,
          provenance: 'synthetic_demo',
          qualityStatus: 'valid',
          notes: 'Synthetic standard.',
        },
      ];

  const sample1Id = makeUuid('im');
  const sample2Id = makeUuid('im');

  return {
    id,
    sessionId: code,
    title: isAas
      ? 'Synthetic Flame AAS Pt Comparison Session (Demo)'
      : 'Synthetic ICP-OES Pt Screening Session (Demo)',
    experimentUuid: params.experimentUuid,
    status: 'Active',
    technique: params.technique,
    customTechniqueName: '',
    instrumentManufacturer: isAas ? 'DemoSpectra' : 'OptiLab Demo',
    instrumentModel: isAas
      ? 'Flame AAS-240 (Synthetic Fixture)'
      : 'ICP-OES 5800 Axial/Radial (Synthetic Fixture)',
    instrumentIdentifier: isAas ? 'INST-AAS-DEMO' : 'INST-ICP-DEMO',
    methodReference: isAas
      ? 'SOP-AAS-Pt-265.9 (Synthetic Placeholder)'
      : 'SOP-ICP-Pt-214.4 (Synthetic Placeholder)',
    analyst: params.analyst || 'Demo Analyst',
    analysisDate: today,
    matrixDescription: 'Diluted aqueous matrix (synthetic demonstration fixture)',
    conditionsNote: 'Synthetic fixture only — not operational instrument parameters.',
    analytes: [
      {
        id: analyteId,
        name: 'Platinum',
        symbol: 'Pt',
        wavelengthNm: isAas ? 265.945 : 214.423,
        measurementUnit: 'ppm',
        methodReference: isAas ? 'Pt 265.945 nm (Demo)' : 'Pt 214.423 nm (Demo)',
        calibrationDatasetId: calId,
        notes: 'Synthetic demonstration analyte record.',
      },
    ],
    activeAnalyteId: analyteId,
    calibrationDatasets: [
      {
        id: calId,
        calibrationId: isAas ? 'CAL-AAS-01' : 'CAL-ICP-01',
        title: isAas
          ? 'Pt 265.945 nm Synthetic Flame AAS Calibration'
          : 'Pt 214.423 nm Synthetic ICP-OES Calibration',
        sessionId: id,
        analyteId,
        referenceMethod: 'Synthetic external standards fixture',
        concUnit: 'ppm',
        responseUnit: isAas ? 'Abs' : 'cps',
        analyst: params.analyst || 'Demo Analyst',
        analysisDate: today,
        provenance: 'synthetic_demo',
        standards,
        notes: 'Synthetic calibration fixture.',
        createdAt: now,
        updatedAt: now,
      },
    ],
    activeCalibrationDatasetId: calId,
    sampleMeasurements: [
      {
        id: sample1Id,
        sampleId: isAas ? 'AAS-S01-INIT' : 'ICP-S01-INIT',
        sessionId: id,
        analyteId,
        calibrationDatasetId: calId,
        linkedSurveyDatasetId: null,
        linkedSurveyMeasurementId: null,
        linkedSurveySampleId: '',
        analyte: 'Pt',
        stage: 'Initial',
        replicateId: 'R1',
        dilutionFactor: 10,
        reportedValueBasis: 'as_measured_diluted',
        rawSignal: isAas ? 0.165 : 73100,
        signalUnit: isAas ? 'Abs' : 'cps',
        reportedConc: isAas ? 19.8 : 19.95,
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        measurementDate: today,
        notes: 'Synthetic demonstration sample.',
      },
      {
        id: sample2Id,
        sampleId: isAas ? 'AAS-S01-FIN' : 'ICP-S01-FIN',
        sessionId: id,
        analyteId,
        calibrationDatasetId: calId,
        linkedSurveyDatasetId: null,
        linkedSurveyMeasurementId: null,
        linkedSurveySampleId: '',
        analyte: 'Pt',
        stage: 'Final',
        replicateId: 'R1',
        dilutionFactor: 10,
        reportedValueBasis: 'as_measured_diluted',
        rawSignal: isAas ? 0.081 : 34950,
        signalUnit: isAas ? 'Abs' : 'cps',
        reportedConc: isAas ? 9.64 : 9.52,
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        measurementDate: today,
        notes: 'Synthetic demonstration sample.',
      },
    ],
    dilutionRecords: [
      {
        id: makeUuid('dil'),
        sampleMeasurementId: sample1Id,
        sampleId: isAas ? 'AAS-S01-INIT' : 'ICP-S01-INIT',
        stage: 'Initial',
        dilutionFactor: 10,
        sourceVolumeMl: 1.0,
        finalVolumeMl: 10.0,
        concUnit: 'ppm',
        reportedValueBasis: 'as_measured_diluted',
        preparationReference: 'DEMO-PREP-01',
        matrixDescription: 'Diluted aqueous matrix (demo)',
        analyst: params.analyst || 'Demo Analyst',
        date: today,
        verificationStatus: 'synthetic_fixture',
        provenance: 'synthetic_demo',
        notes: 'Synthetic dilution metadata record.',
      },
    ],
    importHistory: [],
    reviewRecords: [],
    figureConfig: createDefaultAnalyticalFigureConfig(
      'calibration_regression',
      isAas
        ? 'Synthetic Flame AAS Pt Calibration (Exploratory)'
        : 'Synthetic ICP-OES Pt Calibration (Exploratory)',
      makeUuid('afig')
    ),
    savedFigures: [],
    observations: 'Loaded clearly labeled synthetic demonstration session.',
    provenance: 'synthetic_demo',
    scientificReviewStatus: 'Demonstration Fixture',
    isDemonstration: true,
    notes: 'Synthetic demonstration fixture.',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Builds the 2 rich synthetic demonstration AnalyticalSession records for `SEA-DEMO-001`,
 * strictly preserving existing `im-demo-1`, `im-demo-2`, `im-demo-3` IDs so all Phase 2/3
 * survey-to-analytical links and automated tests remain 100% intact.
 */
export function buildDemoExperimentAnalyticalSessions(
  experimentUuid: string,
  demoCreatedAt: string,
  demoUpdatedAt: string
): AnalyticalSession[] {
  const icpSessionId = 'as-demo-icp-01';
  const aasSessionId = 'as-demo-aas-02';

  const ptAnalyteId = 'an-demo-icp-pt';
  const siAnalyteId = 'an-demo-icp-si';
  const calPtId = 'calds-demo-icp-pt';
  const calSiId = 'calds-demo-icp-si';

  const aasPtAnalyteId = 'an-demo-aas-pt';
  const calAasPtId = 'calds-demo-aas-pt';

  const icpPtStandards: CalibrationStandard[] = [
    {
      id: 'cal-demo-1',
      standardId: 'CAL-00',
      analyteId: ptAnalyteId,
      isBlank: true,
      replicateGroupId: 'LVL-00',
      nominalConc: 0.0,
      unit: 'ppm',
      instrumentResponse: 112.4,
      responseUnit: 'cps',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Matrix blank R1 (synthetic).',
    },
    {
      id: 'cal-demo-1b',
      standardId: 'CAL-00B',
      analyteId: ptAnalyteId,
      isBlank: true,
      replicateGroupId: 'LVL-00',
      nominalConc: 0.0,
      unit: 'ppm',
      instrumentResponse: 124.8,
      responseUnit: 'cps',
      replicateNumber: 2,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Matrix blank R2 (synthetic replicate).',
    },
    {
      id: 'cal-demo-2',
      standardId: 'CAL-05',
      analyteId: ptAnalyteId,
      isBlank: false,
      replicateGroupId: 'LVL-05',
      nominalConc: 5.0,
      unit: 'ppm',
      instrumentResponse: 18420.0,
      responseUnit: 'cps',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Synthetic calibration point R1.',
    },
    {
      id: 'cal-demo-2b',
      standardId: 'CAL-05B',
      analyteId: ptAnalyteId,
      isBlank: false,
      replicateGroupId: 'LVL-05',
      nominalConc: 5.0,
      unit: 'ppm',
      instrumentResponse: 18610.0,
      responseUnit: 'cps',
      replicateNumber: 2,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Synthetic calibration point R2.',
    },
    {
      id: 'cal-demo-3',
      standardId: 'CAL-25',
      analyteId: ptAnalyteId,
      isBlank: false,
      replicateGroupId: 'LVL-25',
      nominalConc: 25.0,
      unit: 'ppm',
      instrumentResponse: 91640.0,
      responseUnit: 'cps',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Synthetic calibration point R1.',
    },
    {
      id: 'cal-demo-3b',
      standardId: 'CAL-25B',
      analyteId: ptAnalyteId,
      isBlank: false,
      replicateGroupId: 'LVL-25',
      nominalConc: 25.0,
      unit: 'ppm',
      instrumentResponse: 92080.0,
      responseUnit: 'cps',
      replicateNumber: 2,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Synthetic calibration point R2.',
    },
    {
      id: 'cal-demo-4',
      standardId: 'CAL-50',
      analyteId: ptAnalyteId,
      isBlank: false,
      replicateGroupId: 'LVL-50',
      nominalConc: 50.0,
      unit: 'ppm',
      instrumentResponse: 182910.0,
      responseUnit: 'cps',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Synthetic calibration point.',
    },
    {
      id: 'cal-demo-5x',
      standardId: 'CAL-100X',
      analyteId: ptAnalyteId,
      isBlank: false,
      replicateGroupId: 'LVL-100',
      nominalConc: 100.0,
      unit: 'ppm',
      instrumentResponse: 312400.0,
      responseUnit: 'cps',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'excluded_by_user',
      exclusionReason:
        'Synthetic demonstration of documented upper-range detector roll-off exclusion.',
      notes: 'Excluded by researcher from exploratory linear regression.',
    },
  ];

  const icpSiStandards: CalibrationStandard[] = [
    {
      id: 'cal-si-1',
      standardId: 'SI-00',
      analyteId: siAnalyteId,
      isBlank: true,
      nominalConc: 0.0,
      unit: 'ppm',
      instrumentResponse: 245.0,
      responseUnit: 'cps',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Si matrix blank (synthetic).',
    },
    {
      id: 'cal-si-2',
      standardId: 'SI-02',
      analyteId: siAnalyteId,
      isBlank: false,
      nominalConc: 2.0,
      unit: 'ppm',
      instrumentResponse: 12840.0,
      responseUnit: 'cps',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Synthetic Si standard.',
    },
    {
      id: 'cal-si-3',
      standardId: 'SI-10',
      analyteId: siAnalyteId,
      isBlank: false,
      nominalConc: 10.0,
      unit: 'ppm',
      instrumentResponse: 63910.0,
      responseUnit: 'cps',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Synthetic Si standard.',
    },
    {
      id: 'cal-si-4',
      standardId: 'SI-25',
      analyteId: siAnalyteId,
      isBlank: false,
      nominalConc: 25.0,
      unit: 'ppm',
      instrumentResponse: 159400.0,
      responseUnit: 'cps',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Synthetic Si standard.',
    },
  ];

  const icpSamples: InstrumentMeasurement[] = [
    {
      id: 'im-demo-1',
      sampleId: 'ICP-UPT04-INIT',
      sessionId: icpSessionId,
      analyteId: ptAnalyteId,
      calibrationDatasetId: calPtId,
      linkedSurveyDatasetId: 'ds-demo-upt-1',
      linkedSurveyMeasurementId: 'sm-demo-4',
      linkedSurveySampleId: 'UPT-04',
      analyte: 'Pt',
      stage: 'Initial',
      replicateId: 'R1',
      dilutionFactor: 10,
      reportedValueBasis: 'as_measured_diluted',
      rawSignal: 73410.0,
      signalUnit: 'cps',
      reportedConc: 20.02,
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      measurementDate: '2026-11-21',
      notes: 'Initial aliquot record (10× dilution → 200.2 ppm effective, synthetic).',
    },
    {
      id: 'im-demo-2',
      sampleId: 'ICP-UPT04-FIN',
      sessionId: icpSessionId,
      analyteId: ptAnalyteId,
      calibrationDatasetId: calPtId,
      linkedSurveyDatasetId: 'ds-demo-upt-1',
      linkedSurveyMeasurementId: 'sm-demo-4',
      linkedSurveySampleId: 'UPT-04',
      analyte: 'Pt',
      stage: 'Final',
      replicateId: 'R1',
      dilutionFactor: 10,
      reportedValueBasis: 'as_measured_diluted',
      rawSignal: 34820.0,
      signalUnit: 'cps',
      reportedConc: 9.46,
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      measurementDate: '2026-11-21',
      notes: 'Final supernatant aliquot record (10× dilution → 94.6 ppm effective, synthetic).',
    },
    {
      id: 'im-demo-3',
      sampleId: 'ICP-UPT06-FIN',
      sessionId: icpSessionId,
      analyteId: ptAnalyteId,
      calibrationDatasetId: calPtId,
      linkedSurveyDatasetId: 'ds-demo-upt-1',
      linkedSurveyMeasurementId: 'sm-demo-6',
      linkedSurveySampleId: 'UPT-06',
      analyte: 'Pt',
      stage: 'Final',
      replicateId: 'R2',
      dilutionFactor: 10,
      reportedValueBasis: 'as_measured_diluted',
      rawSignal: null,
      signalUnit: 'cps',
      reportedConc: null,
      concUnit: 'ppm',
      valueQualifier: 'not_measured',
      originalValueToken: '',
      provenance: 'unavailable',
      qualityStatus: 'pending',
      measurementDate: '2026-11-21',
      notes: 'Queued for measurement — intentionally blank to test missing-value preservation.',
    },
    {
      id: 'im-demo-4',
      sampleId: 'ICP-UPT04B-FIN',
      sessionId: icpSessionId,
      analyteId: ptAnalyteId,
      calibrationDatasetId: calPtId,
      linkedSurveyDatasetId: null,
      linkedSurveyMeasurementId: null,
      linkedSurveySampleId: 'UPT-04B',
      analyte: 'Pt',
      stage: 'Final',
      replicateId: 'R2',
      dilutionFactor: 10,
      reportedValueBasis: 'as_measured_diluted',
      rawSignal: 35890.0,
      signalUnit: 'cps',
      reportedConc: 9.74,
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      measurementDate: '2026-11-21',
      notes: 'Unconfirmed survey link candidate matching UPT-04B (synthetic).',
    },
    {
      id: 'im-demo-5',
      sampleId: 'ICP-UPT05-FIN',
      sessionId: icpSessionId,
      analyteId: ptAnalyteId,
      calibrationDatasetId: calPtId,
      linkedSurveyDatasetId: null,
      linkedSurveyMeasurementId: null,
      linkedSurveySampleId: 'UPT-05',
      analyte: 'Pt',
      stage: 'Final',
      replicateId: 'R1',
      dilutionFactor: 10,
      reportedValueBasis: 'already_dilution_corrected',
      rawSignal: 32510.0,
      signalUnit: 'cps',
      reportedConc: 88.2,
      concUnit: 'ppm',
      instrumentFlag: 'NEB_PRESSURE_DRIFT (+4.2%)',
      provenance: 'synthetic_demo',
      qualityStatus: 'flagged',
      measurementDate: '2026-11-21',
      notes: 'Synthetic example of instrument flag + already dilution-corrected output.',
    },
    {
      id: 'im-demo-6',
      sampleId: 'ICP-UPT03X-FIN',
      sessionId: icpSessionId,
      analyteId: ptAnalyteId,
      calibrationDatasetId: calPtId,
      linkedSurveyDatasetId: null,
      linkedSurveyMeasurementId: null,
      linkedSurveySampleId: '',
      analyte: 'Pt',
      stage: 'Final',
      replicateId: 'R2',
      dilutionFactor: 10,
      reportedValueBasis: 'as_measured_diluted',
      rawSignal: 61800.0,
      signalUnit: 'cps',
      reportedConc: 16.8,
      concUnit: 'ppm',
      exclusionReason:
        'Synthetic researcher exclusion: turbid aliquot noted prior to aspiration.',
      provenance: 'synthetic_demo',
      qualityStatus: 'excluded_by_user',
      measurementDate: '2026-11-21',
      notes: 'Excluded by researcher with documented reason.',
    },
    {
      id: 'im-demo-7',
      sampleId: 'ICP-BLK-01',
      sessionId: icpSessionId,
      analyteId: ptAnalyteId,
      calibrationDatasetId: calPtId,
      linkedSurveyDatasetId: null,
      linkedSurveyMeasurementId: null,
      linkedSurveySampleId: '',
      analyte: 'Pt',
      stage: 'Blank',
      replicateId: 'R1',
      dilutionFactor: 1,
      reportedValueBasis: 'as_measured_diluted',
      rawSignal: 118.2,
      signalUnit: 'cps',
      reportedConc: 0.01,
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      measurementDate: '2026-11-21',
      notes: 'Procedural matrix blank check (synthetic).',
    },
    {
      id: 'im-demo-8',
      sampleId: 'ICP-SI-UPT07',
      sessionId: icpSessionId,
      analyteId: siAnalyteId,
      calibrationDatasetId: calSiId,
      linkedSurveyDatasetId: null,
      linkedSurveyMeasurementId: null,
      linkedSurveySampleId: 'UPT-07',
      analyte: 'Si',
      stage: 'Control',
      replicateId: 'R1',
      dilutionFactor: 5,
      reportedValueBasis: 'as_measured_diluted',
      rawSignal: 39640.0,
      signalUnit: 'cps',
      reportedConc: 6.21,
      concUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      measurementDate: '2026-11-21',
      notes: 'Multi-analyte Si support-dissolution check at high pH (synthetic).',
    },
    {
      id: 'im-demo-9',
      sampleId: 'ICP-BLK-02',
      sessionId: icpSessionId,
      analyteId: ptAnalyteId,
      calibrationDatasetId: calPtId,
      linkedSurveyDatasetId: null,
      linkedSurveyMeasurementId: null,
      linkedSurveySampleId: '',
      analyte: 'Pt',
      stage: 'Blank',
      replicateId: 'R2',
      dilutionFactor: 1,
      reportedValueBasis: 'as_measured_diluted',
      rawSignal: 102.4,
      signalUnit: 'cps',
      reportedConc: null,
      concUnit: 'ppm',
      valueQualifier: 'below_lod',
      originalValueToken: '<0.02',
      suppliedLimitType: 'LOD',
      suppliedLimitValue: 0.02,
      suppliedLimitUnit: 'ppm',
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      measurementDate: '2026-11-21',
      notes:
        'Synthetic procedural rinse blank reported below externally supplied LOD (<0.02 ppm). Stored as null + qualifier; never coerced to zero.',
    },
  ];

  const icpDilutions: DilutionRecord[] = [
    {
      id: 'dil-demo-1',
      sampleMeasurementId: 'im-demo-1',
      sampleId: 'ICP-UPT04-INIT',
      stage: 'Initial',
      dilutionFactor: 10,
      sourceVolumeMl: 1.0,
      finalVolumeMl: 10.0,
      concUnit: 'ppm',
      reportedValueBasis: 'as_measured_diluted',
      preparationReference: 'PREP-2026-1121-A',
      matrixDescription: 'Diluted aqueous matrix (demo)',
      analyst: 'Dr. E. Lindqvist (Demo)',
      date: '2026-11-21',
      verificationStatus: 'synthetic_fixture',
      provenance: 'synthetic_demo',
      notes: 'Consistent 1.0 mL → 10.0 mL (10×) dilution metadata.',
    },
    {
      id: 'dil-demo-2',
      sampleMeasurementId: 'im-demo-2',
      sampleId: 'ICP-UPT04-FIN',
      stage: 'Final',
      dilutionFactor: 10,
      sourceVolumeMl: 1.0,
      finalVolumeMl: 10.0,
      concUnit: 'ppm',
      reportedValueBasis: 'as_measured_diluted',
      preparationReference: 'PREP-2026-1121-B',
      matrixDescription: 'Diluted aqueous matrix (demo)',
      analyst: 'Dr. E. Lindqvist (Demo)',
      date: '2026-11-21',
      verificationStatus: 'synthetic_fixture',
      provenance: 'synthetic_demo',
      notes: 'Consistent 10× final aliquot record.',
    },
    {
      id: 'dil-demo-3',
      sampleMeasurementId: 'im-demo-4',
      sampleId: 'ICP-UPT04B-FIN',
      stage: 'Final',
      dilutionFactor: 10,
      sourceVolumeMl: 1.0,
      finalVolumeMl: 12.0,
      concUnit: 'ppm',
      reportedValueBasis: 'as_measured_diluted',
      preparationReference: 'PREP-2026-1121-C',
      matrixDescription: 'Diluted aqueous matrix (demo)',
      analyst: 'Dr. E. Lindqvist (Demo)',
      date: '2026-11-21',
      verificationStatus: 'unverified',
      provenance: 'synthetic_demo',
      notes: 'Intentional synthetic conflict (12/1 = 12× vs. recorded 10×) to demonstrate dilution diagnostic flagging.',
    },
    {
      id: 'dil-demo-4',
      sampleMeasurementId: 'im-demo-5',
      sampleId: 'ICP-UPT05-FIN',
      stage: 'Final',
      dilutionFactor: 10,
      sourceVolumeMl: 1.0,
      finalVolumeMl: 10.0,
      concUnit: 'ppm',
      reportedValueBasis: 'already_dilution_corrected',
      preparationReference: 'PREP-2026-1121-D',
      matrixDescription: 'Diluted aqueous matrix (demo)',
      analyst: 'Dr. E. Lindqvist (Demo)',
      date: '2026-11-21',
      verificationStatus: 'synthetic_fixture',
      provenance: 'synthetic_demo',
      notes: 'Marked already dilution-corrected by instrument software to demonstrate duplicate-correction guardrail.',
    },
  ];

  const icpFigCal: AnalyticalFigureConfiguration = {
    ...createDefaultAnalyticalFigureConfig(
      'calibration_regression',
      'Synthetic ICP-OES Pt 214.423 nm — Exploratory Calibration Fit',
      'afig-demo-icp-cal'
    ),
    name: 'Pt 214.423 nm Exploratory Regression',
    savedAt: demoUpdatedAt,
  };

  const icpFigRes: AnalyticalFigureConfiguration = {
    ...createDefaultAnalyticalFigureConfig(
      'residuals_vs_conc',
      'Synthetic ICP-OES Pt 214.423 nm — Regression Residuals vs. Concentration',
      'afig-demo-icp-res'
    ),
    name: 'Pt 214.423 nm Residual Diagnostics',
    savedAt: demoUpdatedAt,
  };

  const icpSession: AnalyticalSession = {
    id: icpSessionId,
    sessionId: 'ANA-ICP-01',
    title: 'ICP-OES Multi-Analyte Pt & Si Assay (Synthetic Demo)',
    experimentUuid,
    status: 'Active',
    technique: 'ICP-OES',
    customTechniqueName: '',
    instrumentManufacturer: 'OptiLab (Demo)',
    instrumentModel: 'Radial/Axial Optical Spectrometer 5800 (Demo Fixture)',
    instrumentIdentifier: 'LAB-ICP-02-DEMO',
    methodReference: 'REF-ICP-Pt-Si-2026 (Synthetic Placeholder)',
    analyst: 'Dr. E. Lindqvist (Demo)',
    analysisDate: '2026-11-21',
    matrixDescription: 'Diluted aqueous matrix (demo fixture)',
    conditionsNote:
      'Synthetic fixture illustrating multi-analyte tracking, calibration replicates, documented exclusions, dilution diagnostics, and survey linkage.',
    analytes: [
      {
        id: ptAnalyteId,
        name: 'Platinum',
        symbol: 'Pt',
        wavelengthNm: 214.423,
        measurementUnit: 'ppm',
        methodReference: 'Axial Pt 214.423 nm (Demo)',
        calibrationDatasetId: calPtId,
        notes: 'Primary catalytic metal analyte.',
      },
      {
        id: siAnalyteId,
        name: 'Silicon',
        symbol: 'Si',
        wavelengthNm: 251.611,
        measurementUnit: 'ppm',
        methodReference: 'Radial Si 251.611 nm (Demo)',
        calibrationDatasetId: calSiId,
        notes: 'Support dissolution monitoring analyte at elevated pH.',
      },
    ],
    activeAnalyteId: ptAnalyteId,
    calibrationDatasets: [
      {
        id: calPtId,
        calibrationId: 'CAL-PT-01',
        title: 'Pt 214.423 nm External Standards (0–50 ppm + Excluded 100 ppm)',
        sessionId: icpSessionId,
        analyteId: ptAnalyteId,
        referenceMethod: 'Synthetic multi-point calibration fixture',
        concUnit: 'ppm',
        responseUnit: 'cps',
        analyst: 'Dr. E. Lindqvist (Demo)',
        analysisDate: '2026-11-21',
        provenance: 'synthetic_demo',
        standards: icpPtStandards,
        notes: 'Includes replicate levels (n=2) and 1 researcher-excluded upper-range point.',
        createdAt: demoCreatedAt,
        updatedAt: demoUpdatedAt,
      },
      {
        id: calSiId,
        calibrationId: 'CAL-SI-01',
        title: 'Si 251.611 nm External Standards (0–25 ppm)',
        sessionId: icpSessionId,
        analyteId: siAnalyteId,
        referenceMethod: 'Synthetic Si leach check calibration',
        concUnit: 'ppm',
        responseUnit: 'cps',
        analyst: 'Dr. E. Lindqvist (Demo)',
        analysisDate: '2026-11-21',
        provenance: 'synthetic_demo',
        standards: icpSiStandards,
        notes: 'Secondary analyte calibration dataset.',
        createdAt: demoCreatedAt,
        updatedAt: demoUpdatedAt,
      },
    ],
    activeCalibrationDatasetId: calPtId,
    sampleMeasurements: icpSamples,
    dilutionRecords: icpDilutions,
    importHistory: [],
    reviewRecords: [
      {
        id: 'rev-demo-1',
        issueKey: 'inst-warn:im-demo-5',
        category: 'instrument_warning',
        sessionId: icpSessionId,
        recordId: 'im-demo-5',
        recordLabel: 'ICP-UPT05-FIN',
        description:
          'Instrument-reported flag on ICP-UPT05-FIN: "NEB_PRESSURE_DRIFT (+4.2%)".',
        provenance: 'synthetic_demo',
        identifiedAt: demoUpdatedAt,
        status: 'Under Review',
        researcherNotes:
          'Cross-checking against Flame AAS comparative session ANA-AAS-02 before deciding whether to retain or re-run.',
        history: [
          {
            timestamp: demoUpdatedAt,
            status: 'Under Review',
            author: 'Dr. E. Lindqvist (Demo)',
            note: 'Flagged for cross-technique comparison.',
          },
        ],
      },
    ],
    figureConfig: icpFigCal,
    savedFigures: [icpFigCal, icpFigRes],
    observations:
      'Synthetic ICP-OES analytical session illustrating exploratory linear calibration, residual diagnostics, multi-analyte Si leach check, dilution conflict detection, and survey-to-analytical linkage.',
    provenance: 'synthetic_demo',
    scientificReviewStatus: 'Demonstration Fixture',
    isDemonstration: true,
    notes: 'Synthetic analytical records for numerical analysis demonstration.',
    createdAt: demoCreatedAt,
    updatedAt: demoUpdatedAt,
  };

  // Second comparative session: Flame AAS Pt 265.945 nm
  const aasStandards: CalibrationStandard[] = [
    {
      id: 'cal-aas-1',
      standardId: 'AAS-00',
      analyteId: aasPtAnalyteId,
      isBlank: true,
      nominalConc: 0.0,
      unit: 'ppm',
      instrumentResponse: 0.001,
      responseUnit: 'Abs',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Flame AAS blank (synthetic).',
    },
    {
      id: 'cal-aas-2',
      standardId: 'AAS-10',
      analyteId: aasPtAnalyteId,
      isBlank: false,
      nominalConc: 10.0,
      unit: 'ppm',
      instrumentResponse: 0.083,
      responseUnit: 'Abs',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Synthetic Flame AAS standard.',
    },
    {
      id: 'cal-aas-3',
      standardId: 'AAS-25',
      analyteId: aasPtAnalyteId,
      isBlank: false,
      nominalConc: 25.0,
      unit: 'ppm',
      instrumentResponse: 0.206,
      responseUnit: 'Abs',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Synthetic Flame AAS standard.',
    },
    {
      id: 'cal-aas-4',
      standardId: 'AAS-50',
      analyteId: aasPtAnalyteId,
      isBlank: false,
      nominalConc: 50.0,
      unit: 'ppm',
      instrumentResponse: 0.409,
      responseUnit: 'Abs',
      replicateNumber: 1,
      provenance: 'synthetic_demo',
      qualityStatus: 'valid',
      notes: 'Synthetic Flame AAS standard.',
    },
  ];

  const aasSession: AnalyticalSession = {
    id: aasSessionId,
    sessionId: 'ANA-AAS-02',
    title: 'Flame AAS Pt Cross-Check Session (Synthetic Demo)',
    experimentUuid,
    status: 'Active',
    technique: 'Flame AAS',
    customTechniqueName: '',
    instrumentManufacturer: 'DemoSpectra',
    instrumentModel: 'Flame AAS-240FS (Demo Fixture)',
    instrumentIdentifier: 'LAB-AAS-01-DEMO',
    methodReference: 'REF-AAS-Pt-265.9 (Synthetic Placeholder)',
    analyst: 'Dr. E. Lindqvist (Demo)',
    analysisDate: '2026-11-22',
    matrixDescription: 'Diluted aqueous matrix (demo fixture)',
    conditionsNote:
      'Synthetic secondary Flame AAS session for demonstrating cross-session comparative analysis and technique-difference warnings.',
    analytes: [
      {
        id: aasPtAnalyteId,
        name: 'Platinum',
        symbol: 'Pt',
        wavelengthNm: 265.945,
        measurementUnit: 'ppm',
        methodReference: 'Pt 265.945 nm Air-Acetylene (Demo)',
        calibrationDatasetId: calAasPtId,
        notes: 'Comparative Flame AAS wavelength.',
      },
    ],
    activeAnalyteId: aasPtAnalyteId,
    calibrationDatasets: [
      {
        id: calAasPtId,
        calibrationId: 'CAL-AAS-PT-01',
        title: 'Pt 265.945 nm Flame AAS Absorbance Calibration',
        sessionId: aasSessionId,
        analyteId: aasPtAnalyteId,
        referenceMethod: 'Synthetic external standards fixture',
        concUnit: 'ppm',
        responseUnit: 'Abs',
        analyst: 'Dr. E. Lindqvist (Demo)',
        analysisDate: '2026-11-22',
        provenance: 'synthetic_demo',
        standards: aasStandards,
        notes: 'Synthetic absorbance calibration.',
        createdAt: demoUpdatedAt,
        updatedAt: demoUpdatedAt,
      },
    ],
    activeCalibrationDatasetId: calAasPtId,
    sampleMeasurements: [
      {
        id: 'im-aas-1',
        sampleId: 'AAS-UPT04-INIT',
        sessionId: aasSessionId,
        analyteId: aasPtAnalyteId,
        calibrationDatasetId: calAasPtId,
        linkedSurveyDatasetId: null,
        linkedSurveyMeasurementId: null,
        linkedSurveySampleId: 'UPT-04',
        analyte: 'Pt',
        stage: 'Initial',
        replicateId: 'R1',
        dilutionFactor: 10,
        reportedValueBasis: 'as_measured_diluted',
        rawSignal: 0.164,
        signalUnit: 'Abs',
        reportedConc: 19.76,
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        measurementDate: '2026-11-22',
        notes: 'Flame AAS comparison measurement (synthetic).',
      },
      {
        id: 'im-aas-2',
        sampleId: 'AAS-UPT04-FIN',
        sessionId: aasSessionId,
        analyteId: aasPtAnalyteId,
        calibrationDatasetId: calAasPtId,
        linkedSurveyDatasetId: null,
        linkedSurveyMeasurementId: null,
        linkedSurveySampleId: 'UPT-04',
        analyte: 'Pt',
        stage: 'Final',
        replicateId: 'R1',
        dilutionFactor: 10,
        reportedValueBasis: 'as_measured_diluted',
        rawSignal: 0.080,
        signalUnit: 'Abs',
        reportedConc: 9.61,
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        measurementDate: '2026-11-22',
        notes: 'Flame AAS comparison measurement (synthetic).',
      },
      {
        id: 'im-aas-3',
        sampleId: 'AAS-UPT05-FIN',
        sessionId: aasSessionId,
        analyteId: aasPtAnalyteId,
        calibrationDatasetId: calAasPtId,
        linkedSurveyDatasetId: null,
        linkedSurveyMeasurementId: null,
        linkedSurveySampleId: 'UPT-05',
        analyte: 'Pt',
        stage: 'Final',
        replicateId: 'R1',
        dilutionFactor: 10,
        reportedValueBasis: 'as_measured_diluted',
        rawSignal: 0.074,
        signalUnit: 'Abs',
        reportedConc: 8.95,
        concUnit: 'ppm',
        provenance: 'synthetic_demo',
        qualityStatus: 'valid',
        measurementDate: '2026-11-22',
        notes: 'Flame AAS cross-check for UPT-05 (synthetic).',
      },
    ],
    dilutionRecords: [
      {
        id: 'dil-aas-1',
        sampleMeasurementId: 'im-aas-1',
        sampleId: 'AAS-UPT04-INIT',
        stage: 'Initial',
        dilutionFactor: 10,
        sourceVolumeMl: 1.0,
        finalVolumeMl: 10.0,
        concUnit: 'ppm',
        reportedValueBasis: 'as_measured_diluted',
        preparationReference: 'PREP-AAS-2026-01',
        matrixDescription: 'Diluted aqueous matrix (demo)',
        analyst: 'Dr. E. Lindqvist (Demo)',
        date: '2026-11-22',
        verificationStatus: 'synthetic_fixture',
        provenance: 'synthetic_demo',
        notes: 'Consistent 10× Flame AAS dilution record.',
      },
    ],
    importHistory: [],
    reviewRecords: [],
    figureConfig: createDefaultAnalyticalFigureConfig(
      'calibration_regression',
      'Synthetic Flame AAS Pt 265.945 nm — Exploratory Calibration Fit',
      'afig-demo-aas-cal'
    ),
    savedFigures: [],
    observations:
      'Comparative Flame AAS session illustrating cross-technique differences without claiming method equivalence.',
    provenance: 'synthetic_demo',
    scientificReviewStatus: 'Demonstration Fixture',
    isDemonstration: true,
    notes: 'Synthetic Flame AAS comparison session.',
    createdAt: demoUpdatedAt,
    updatedAt: demoUpdatedAt,
  };

  return [icpSession, aasSession];
}

export function createDefaultImportMappingTemplates(): ImportMappingTemplate[] {
  return [
    {
      id: 'tmpl-icp-standard',
      name: 'Standard ICP-OES CSV Export',
      technique: 'ICP-OES',
      mappings: {
        sampleId: 'Sample_ID',
        analyte: 'Analyte',
        stage: 'Stage',
        replicateId: 'Replicate',
        reportedConc: 'Conc',
        concUnit: 'Unit',
        rawSignal: 'Intensity_cps',
        dilutionFactor: 'Dilution_Factor',
        instrumentFlag: 'QC_Flag',
        notes: 'Notes',
      },
      createdAt: '2026-11-20T09:00:00.000Z',
    },
    {
      id: 'tmpl-aas-standard',
      name: 'Standard Flame AAS Tabular Export',
      technique: 'Flame AAS',
      mappings: {
        sampleId: 'Sample',
        analyte: 'Element',
        stage: 'Type',
        replicateId: 'Rep',
        reportedConc: 'Result_ppm',
        rawSignal: 'Absorbance',
        dilutionFactor: 'DF',
        instrumentFlag: 'Flag',
      },
      createdAt: '2026-11-20T09:00:00.000Z',
    },
  ];
}
