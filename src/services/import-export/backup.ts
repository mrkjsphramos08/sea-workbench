import {
  APP_VERSION,
  CalibrationStandard,
  Experiment,
  ExperimentSnapshot,
  InstrumentMeasurement,
  SurveyDataset,
  SurveyMeasurement,
  WORKSPACE_SCHEMA_VERSION,
  WorkspaceBackupEnvelope,
  WorkspaceStateData,
} from '../../domain/models/types';
import {
  DatasetComparisonSummary,
  MEASUREMENT_QUALIFIER_LABELS,
  SurveyDatasetAnalysis,
  resolveEffectiveMeasurementQualifier,
} from '../../domain/calculations/seaMath';
import {
  ValidationResult,
  validateBackupEnvelope,
} from '../../domain/validation/validators';

export function serializeWorkspaceBackup(
  workspace: WorkspaceStateData
): string {
  const envelope: WorkspaceBackupEnvelope = {
    format: 'sea-workbench-backup',
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    workspace: {
      ...workspace,
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      appVersion: APP_VERSION,
    },
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseWorkspaceBackup(
  rawJson: string
): ValidationResult<WorkspaceBackupEnvelope> {
  return validateBackupEnvelope(rawJson);
}

export function serializeSurveyDatasetJson(
  experiment: Pick<Experiment, 'uuid' | 'experimentId' | 'title'>,
  dataset: SurveyDataset
): string {
  return JSON.stringify(
    {
      format: 'sea-workbench-survey-dataset',
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      experiment: {
        uuid: experiment.uuid,
        experimentId: experiment.experimentId,
        title: experiment.title,
      },
      dataset,
    },
    null,
    2
  );
}

export function serializeExperimentSnapshotJson(
  snapshot: ExperimentSnapshot
): string {
  return JSON.stringify(
    {
      format: 'sea-workbench-experiment-snapshot',
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      snapshot,
    },
    null,
    2
  );
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return lines.join('\r\n');
}

export function exportSurveyMeasurementsCsv(
  experiment: Pick<Experiment, 'experimentId' | 'surveyConfig'>,
  rows: SurveyMeasurement[],
  datasetMeta?: Pick<SurveyDataset, 'datasetId' | 'title' | 'mode'>
): string {
  const mode = datasetMeta?.mode ?? experiment.surveyConfig.mode;
  const headers = [
    'Experiment_ID',
    ...(datasetMeta ? ['Dataset_ID', 'Dataset_Title'] : []),
    'Measurement_UUID',
    'Survey_Mode',
    'Sample_Group_ID',
    'Sample_ID',
    'Replicate_ID',
    'Target_Initial_pH (pH)',
    'Measured_Initial_pH (pH)',
    'Measured_Final_pH (pH)',
    'Initial_Concentration (ppm)',
    'Final_Concentration (ppm)',
    'Support_Mass (mg)',
    'Solution_Volume (mL)',
    'Recorded_Uptake (umol/m2)',
    'Quality_Status',
    'Exclusion_Reason',
    'Data_Provenance',
    'Linked_Initial_Analytical_UUID',
    'Linked_Final_Analytical_UUID',
    'Measurement_Date',
    'Notes',
  ];

  const dataRows = rows.map((r) => [
    experiment.experimentId,
    ...(datasetMeta ? [datasetMeta.datasetId, datasetMeta.title] : []),
    r.id,
    mode === 'pzc' ? 'PZC / pH Shift' : 'Uptake',
    r.sampleGroupId,
    r.sampleId,
    r.replicateId,
    r.targetInitialPh,
    r.measuredInitialPh,
    r.measuredFinalPh,
    r.initialConcPpm,
    r.finalConcPpm,
    r.supportMassMg,
    r.solutionVolumeMl,
    r.recordedUptakeUmolM2,
    r.qualityStatus,
    r.exclusionReason ?? '',
    r.provenance,
    r.linkedInitialMeasurementId,
    r.linkedFinalMeasurementId,
    r.measurementDate,
    r.notes,
  ]);

  return buildCsv(headers, dataRows);
}

export function exportReplicateSummaryCsv(
  experimentId: string,
  dataset: Pick<SurveyDataset, 'datasetId' | 'title' | 'mode' | 'provenance'>,
  analysis: SurveyDatasetAnalysis
): string {
  const headers = [
    'Experiment_ID',
    'Dataset_ID',
    'Dataset_Title',
    'Sample_Group_ID',
    'Total_Rows',
    'Valid_Uptake_n',
    'Missing_Uptake_n',
    'Flagged_n',
    'Excluded_n',
    'Mean_Initial_pH (pH)',
    'SD_Initial_pH (pH)',
    'Mean_Final_pH (pH)',
    'SD_Final_pH (pH)',
    'Mean_Delta_pH (pH)',
    'SD_Delta_pH (pH)',
    'Mean_Uptake (umol/m2)',
    'Median_Uptake (umol/m2)',
    'Sample_SD_Uptake (umol/m2)',
    'SEM_Uptake (umol/m2)',
    'RSD_Percent (%)',
    'Min_Uptake (umol/m2)',
    'Max_Uptake (umol/m2)',
    'Contains_Synthetic_Data',
    'Engine_Version',
  ];

  const dataRows = analysis.replicateGroups.map((g) => [
    experimentId,
    dataset.datasetId,
    dataset.title,
    g.sampleGroupId,
    g.totalRowCount,
    g.uptakeStats.value.validCount,
    g.uptakeStats.value.missingCount,
    g.flaggedCount,
    g.excludedCount,
    g.initialPhStats.value.mean,
    g.initialPhStats.value.sampleStdDev,
    g.finalPhStats.value.mean,
    g.finalPhStats.value.sampleStdDev,
    g.deltaPhStats.value.mean,
    g.deltaPhStats.value.sampleStdDev,
    g.uptakeStats.value.mean,
    g.uptakeStats.value.median,
    g.uptakeStats.value.sampleStdDev,
    g.uptakeStats.value.sem,
    g.uptakeStats.value.rsdPercent,
    g.uptakeStats.value.min,
    g.uptakeStats.value.max,
    g.containsSynthetic ? 'Yes' : 'No',
    analysis.engineVersion,
  ]);

  return buildCsv(headers, dataRows);
}

export function exportStatisticalAnalysisCsv(
  experimentId: string,
  dataset: Pick<
    SurveyDataset,
    'datasetId' | 'title' | 'mode' | 'provenance' | 'scientificReviewStatus'
  >,
  analysis: SurveyDatasetAnalysis
): string {
  const headers = [
    'Experiment_ID',
    'Dataset_ID',
    'Dataset_Title',
    'Quantity',
    'Unit',
    'Valid_n',
    'Missing_n',
    'Invalid_n',
    'Excluded_By_User_n',
    'Flagged_n',
    'Flagged_Excluded_In_Calc',
    'Mean',
    'Median',
    'Sample_SD',
    'SEM',
    'RSD_Percent (%)',
    'Min',
    'Max',
    'Range',
    'Provenance',
    'Review_Status',
    'Engine_Version',
  ];

  const rows = [
    { label: 'Measured Initial pH', stat: analysis.initialPhStats },
    { label: 'Measured Final pH', stat: analysis.finalPhStats },
    { label: 'Recorded Delta pH (pHf - pHi)', stat: analysis.deltaPhStats },
    { label: 'Recorded Metal Uptake', stat: analysis.uptakeStats },
  ];

  const dataRows = rows.map(({ label, stat }) => [
    experimentId,
    dataset.datasetId,
    dataset.title,
    label,
    stat.unit,
    stat.value.validCount,
    stat.value.missingCount,
    stat.value.invalidCount,
    analysis.excludedByUserCount,
    analysis.flaggedCount,
    analysis.excludeFlaggedApplied ? 'Yes' : 'No',
    stat.value.mean,
    stat.value.median,
    stat.value.sampleStdDev,
    stat.value.sem,
    stat.value.rsdPercent,
    stat.value.min,
    stat.value.max,
    stat.value.range,
    stat.provenance,
    dataset.scientificReviewStatus,
    analysis.engineVersion,
  ]);

  return buildCsv(headers, dataRows);
}

export function exportComparativeDatasetsCsv(
  comparison: DatasetComparisonSummary
): string {
  const headers = [
    'Experiment_ID',
    'Dataset_ID',
    'Dataset_Title',
    'Survey_Type',
    'Support_Material',
    'Metal_Precursor',
    'Target_SL (m2/L)',
    'Equilibration (min)',
    'Temperature (C)',
    'Electrolyte',
    'Total_Samples',
    'Included_Samples',
    'Replicate_Groups',
    'Mean_Final_pH (pH)',
    'Mean_Delta_pH (pH)',
    'Mean_Uptake',
    'Uptake_Unit',
    'SD_Uptake',
    'Min_Uptake',
    'Max_Uptake',
    'Data_Provenance',
    'Review_Status',
  ];

  const dataRows = comparison.entries.map((entry) => [
    entry.experimentId,
    entry.dataset.datasetId,
    entry.dataset.title,
    entry.dataset.mode === 'pzc' ? 'PZC / pH Shift Survey' : 'Uptake Survey',
    entry.supportName,
    entry.precursorName,
    entry.dataset.config.targetSurfaceLoadingM2L,
    entry.dataset.config.equilibrationTimeMin,
    entry.dataset.config.temperatureC,
    entry.dataset.config.backgroundElectrolyte,
    entry.analysis.totalRows,
    entry.analysis.includedRows,
    entry.analysis.replicateGroups.length,
    entry.analysis.finalPhStats.value.mean,
    entry.analysis.deltaPhStats.value.mean,
    entry.analysis.uptakeStats.value.mean,
    entry.uptakeUnit,
    entry.analysis.uptakeStats.value.sampleStdDev,
    entry.analysis.uptakeStats.value.min,
    entry.analysis.uptakeStats.value.max,
    entry.dataset.provenance,
    entry.dataset.scientificReviewStatus,
  ]);

  return buildCsv(headers, dataRows);
}

export function exportCalibrationStandardsCsv(
  experiment: Pick<Experiment, 'experimentId' | 'analyticalConfig'>,
  standards: CalibrationStandard[]
): string {
  const headers = [
    'Experiment_ID',
    'Standard_UUID',
    'Instrument_Type',
    'Analyte',
    'Wavelength (nm)',
    'Standard_ID',
    'Replicate',
    'Nominal_Concentration',
    'Concentration_Unit',
    'Instrument_Response',
    'Response_Unit',
    'Quality_Status',
    'Data_Provenance',
    'Notes',
  ];

  const dataRows = standards.map((s) => [
    experiment.experimentId,
    s.id,
    experiment.analyticalConfig.instrumentType,
    experiment.analyticalConfig.analyteElement,
    experiment.analyticalConfig.wavelengthNm,
    s.standardId,
    s.replicateNumber,
    s.nominalConc,
    s.unit,
    s.instrumentResponse,
    s.responseUnit,
    s.qualityStatus,
    s.provenance,
    s.notes,
  ]);

  return buildCsv(headers, dataRows);
}

export function exportInstrumentMeasurementsCsv(
  experiment: Pick<Experiment, 'experimentId' | 'analyticalConfig'>,
  measurements: InstrumentMeasurement[]
): string {
  const headers = [
    'Experiment_ID',
    'Measurement_UUID',
    'Instrument_Type',
    'Analyte',
    'Sample_ID',
    'Linked_Survey_Sample_ID',
    'Stage',
    'Replicate_ID',
    'Dilution_Factor',
    'Raw_Signal',
    'Signal_Unit',
    'Reported_Concentration',
    'Concentration_Unit',
    'Quality_Status',
    'Data_Provenance',
    'Measurement_Date',
    'Notes',
  ];

  const dataRows = measurements.map((m) => [
    experiment.experimentId,
    m.id,
    experiment.analyticalConfig.instrumentType,
    m.analyte || experiment.analyticalConfig.analyteElement,
    m.sampleId,
    m.linkedSurveySampleId,
    m.stage,
    m.replicateId,
    m.dilutionFactor,
    m.rawSignal,
    m.signalUnit,
    m.reportedConc,
    m.concUnit,
    m.qualityStatus,
    m.provenance,
    m.measurementDate,
    m.notes,
  ]);

  return buildCsv(headers, dataRows);
}

/* ============================================================================
 * PHASE 4 ANALYTICAL CHEMISTRY & INSTRUMENT DATA EXPORTS
 * ============================================================================ */

export function serializeAnalyticalSessionJson(
  experiment: Pick<Experiment, 'uuid' | 'experimentId' | 'title'>,
  session: import('../../domain/models/types').AnalyticalSession
): string {
  return JSON.stringify(
    {
      format: 'sea-workbench-analytical-session',
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      experiment: {
        uuid: experiment.uuid,
        experimentId: experiment.experimentId,
        title: experiment.title,
      },
      session,
    },
    null,
    2
  );
}

export function exportAnalyticalSessionSamplesCsv(
  experiment: Pick<Experiment, 'experimentId'>,
  session: import('../../domain/models/types').AnalyticalSession
): string {
  const headers = [
    'Experiment_ID',
    'Session_ID',
    'Session_Title',
    'Technique',
    'Instrument_Model',
    'Method_Reference',
    'Measurement_UUID',
    'Sample_ID',
    'Analyte',
    'Stage',
    'Classification_Label',
    'Replicate_ID',
    'Dilution_Factor',
    'Reported_Value_Basis',
    'Raw_Signal',
    'Signal_Unit',
    'Reported_Concentration',
    'Concentration_Unit',
    'Value_Qualifier',
    'Value_Qualifier_Label',
    'Original_Value_Token',
    'Supplied_Limit_Type',
    'Supplied_Limit_Value',
    'Supplied_Limit_Unit',
    'Original_Imported_Conc',
    'Original_Imported_Unit',
    'Calibration_Dataset_ID',
    'Linked_Survey_Sample_ID',
    'Linked_Survey_Measurement_UUID',
    'Instrument_Flag',
    'Quality_Status',
    'Exclusion_Reason',
    'Data_Provenance',
    'Is_Synthetic_Demo',
    'Review_Status',
    'Measurement_Date',
    'Notes',
  ];

  const dataRows = (session.sampleMeasurements ?? []).map((m) => {
    const qualifier = resolveEffectiveMeasurementQualifier(m);
    return [
      experiment.experimentId,
      session.sessionId,
      session.title,
      session.technique === 'Other' && session.customTechniqueName
        ? session.customTechniqueName
        : session.technique,
      [session.instrumentManufacturer, session.instrumentModel].filter(Boolean).join(' '),
      session.methodReference,
      m.id,
      m.sampleId,
      m.analyte,
      m.stage,
      m.classificationLabel ?? '',
      m.replicateId,
      m.dilutionFactor,
      m.reportedValueBasis ?? 'unspecified',
      m.rawSignal,
      m.signalUnit,
      m.reportedConc,
      m.concUnit,
      qualifier,
      MEASUREMENT_QUALIFIER_LABELS[qualifier],
      m.originalValueToken ?? m.originalReportedConc ?? '',
      m.suppliedLimitType ?? '',
      m.suppliedLimitValue ?? null,
      m.suppliedLimitUnit ?? '',
      m.originalReportedConc ?? '',
      m.originalConcUnit ?? '',
      m.calibrationDatasetId ?? '',
      m.linkedSurveySampleId,
      m.linkedSurveyMeasurementId ?? '',
      m.instrumentFlag ?? '',
      m.qualityStatus,
      m.exclusionReason ?? '',
      m.provenance,
      session.isDemonstration || m.provenance === 'synthetic_demo' ? 'Yes' : 'No',
      session.scientificReviewStatus,
      m.measurementDate,
      m.notes,
    ];
  });

  return buildCsv(headers, dataRows);
}

export function exportCalibrationDatasetCsv(
  experiment: Pick<Experiment, 'experimentId'>,
  session: import('../../domain/models/types').AnalyticalSession,
  calDataset: import('../../domain/models/types').CalibrationDataset
): string {
  const analyte = session.analytes.find((a) => a.id === calDataset.analyteId);
  const headers = [
    'Experiment_ID',
    'Session_ID',
    'Calibration_ID',
    'Calibration_Title',
    'Technique',
    'Analyte',
    'Wavelength_nm',
    'Standard_UUID',
    'Standard_ID',
    'Is_Blank',
    'Replicate_Number',
    'Nominal_Concentration',
    'Concentration_Unit',
    'Instrument_Response',
    'Response_Unit',
    'Quality_Status',
    'Exclusion_Reason',
    'Data_Provenance',
    'Is_Synthetic_Demo',
    'Notes',
  ];

  const dataRows = calDataset.standards.map((s) => [
    experiment.experimentId,
    session.sessionId,
    calDataset.calibrationId,
    calDataset.title,
    session.technique,
    analyte?.symbol ?? '',
    analyte?.wavelengthNm ?? null,
    s.id,
    s.standardId,
    s.isBlank || s.nominalConc === 0 ? 'Yes' : 'No',
    s.replicateNumber,
    s.nominalConc,
    s.unit,
    s.instrumentResponse,
    s.responseUnit,
    s.qualityStatus,
    s.exclusionReason ?? '',
    s.provenance,
    session.isDemonstration || s.provenance === 'synthetic_demo' ? 'Yes' : 'No',
    s.notes,
  ]);

  return buildCsv(headers, dataRows);
}

export function exportExploratoryRegressionSummaryCsv(
  experimentId: string,
  session: import('../../domain/models/types').AnalyticalSession,
  calDataset: import('../../domain/models/types').CalibrationDataset,
  analysis: import('../../domain/calculations/analyticalAnalysis').CalibrationDatasetAnalysis
): string {
  const reg = analysis.regression;
  const d = reg.value;
  const headers = [
    'Experiment_ID',
    'Session_ID',
    'Calibration_ID',
    'Analysis_Disclaimer',
    'Regression_Status',
    'Included_Points_n',
    'Excluded_Points_n',
    'Missing_Points_n',
    'Slope',
    'Intercept',
    'R_Squared',
    'RSS',
    'SEE',
    'X_Unit',
    'Y_Unit',
    'Contains_Synthetic_Data',
    'Review_Status',
    'Engine_Version',
  ];

  return buildCsv(headers, [
    [
      experimentId,
      session.sessionId,
      calDataset.calibrationId,
      'Exploratory Numerical Analysis — Not Analytical Method Validation',
      reg.status,
      analysis.includedCount,
      analysis.excludedCount,
      analysis.missingCount,
      d?.slope ?? null,
      d?.intercept ?? null,
      d?.rSquared ?? null,
      d?.rss ?? null,
      d?.standardErrorOfEstimate ?? null,
      calDataset.concUnit,
      calDataset.responseUnit,
      analysis.containsSynthetic ? 'Yes' : 'No',
      session.scientificReviewStatus,
      analysis.engineVersion,
    ],
  ]);
}

export function exportRegressionResidualsCsv(
  experimentId: string,
  session: import('../../domain/models/types').AnalyticalSession,
  calDataset: import('../../domain/models/types').CalibrationDataset,
  analysis: import('../../domain/calculations/analyticalAnalysis').CalibrationDatasetAnalysis
): string {
  const headers = [
    'Experiment_ID',
    'Session_ID',
    'Calibration_ID',
    'Standard_UUID',
    'Standard_ID',
    'Nominal_Concentration',
    'Concentration_Unit',
    'Observed_Response',
    'Fitted_Response',
    'Residual (y - yHat)',
    'Response_Unit',
    'Quality_Status',
    'Data_Provenance',
    'Analysis_Disclaimer',
    'Engine_Version',
  ];

  const dataRows = analysis.diagnosticPoints.map((pt) => [
    experimentId,
    session.sessionId,
    calDataset.calibrationId,
    pt.id,
    pt.standardId,
    pt.nominalConc,
    calDataset.concUnit,
    pt.observedResponse,
    pt.fittedResponse,
    pt.residual,
    calDataset.responseUnit,
    pt.qualityStatus,
    pt.provenance,
    'Exploratory Numerical Analysis — Not Analytical Method Validation',
    analysis.engineVersion,
  ]);

  return buildCsv(headers, dataRows);
}

export function exportAnalyticalReplicateStatsCsv(
  experimentId: string,
  session: import('../../domain/models/types').AnalyticalSession,
  groups: ReturnType<
    typeof import('../../domain/calculations/analyticalAnalysis').computeAnalyticalReplicateGroups
  >
): string {
  const headers = [
    'Experiment_ID',
    'Session_ID',
    'Sample_ID',
    'Analyte',
    'Stage',
    'Unit',
    'Total_n',
    'Included_n',
    'Excluded_n',
    'Mean_Conc',
    'Median_Conc',
    'Sample_SD_Conc',
    'SEM_Conc',
    'RSD_Percent (%)',
    'Min_Conc',
    'Max_Conc',
    'Is_Synthetic_Demo',
  ];

  const dataRows = groups.map((g) => [
    experimentId,
    session.sessionId,
    g.sampleId,
    g.analyte,
    g.stage,
    g.unit,
    g.totalCount,
    g.includedCount,
    g.excludedCount,
    g.concStats.value.mean,
    g.concStats.value.median,
    g.concStats.value.sampleStdDev,
    g.concStats.value.sem,
    g.concStats.value.rsdPercent,
    g.concStats.value.min,
    g.concStats.value.max,
    session.isDemonstration ? 'Yes' : 'No',
  ]);

  return buildCsv(headers, dataRows);
}

export function exportDilutionRecordsCsv(
  experimentId: string,
  session: import('../../domain/models/types').AnalyticalSession
): string {
  const headers = [
    'Experiment_ID',
    'Session_ID',
    'Dilution_Record_UUID',
    'Sample_Measurement_UUID',
    'Sample_ID',
    'Stage',
    'Recorded_Dilution_Factor',
    'Source_Volume (mL)',
    'Final_Volume (mL)',
    'Concentration_Unit',
    'Reported_Value_Basis',
    'Preparation_Reference',
    'Matrix_Description',
    'Analyst',
    'Date',
    'Verification_Status',
    'Data_Provenance',
    'Notes',
  ];

  const dataRows = (session.dilutionRecords ?? []).map((d) => [
    experimentId,
    session.sessionId,
    d.id,
    d.sampleMeasurementId ?? '',
    d.sampleId,
    d.stage,
    d.dilutionFactor,
    d.sourceVolumeMl,
    d.finalVolumeMl,
    d.concUnit,
    d.reportedValueBasis,
    d.preparationReference,
    d.matrixDescription,
    d.analyst,
    d.date,
    d.verificationStatus,
    d.provenance,
    d.notes,
  ]);

  return buildCsv(headers, dataRows);
}

export function exportQualityReviewCsv(
  experimentId: string,
  session: import('../../domain/models/types').AnalyticalSession,
  issues: import('../../domain/calculations/analyticalAnalysis').DetectedAnalyticalIssue[]
): string {
  const headers = [
    'Experiment_ID',
    'Session_ID',
    'Issue_Key',
    'Category',
    'Record_UUID',
    'Record_Label',
    'Review_Status',
    'Description',
    'Data_Provenance',
    'Researcher_Notes',
    'History_Entries',
  ];

  const dataRows = issues.map((issue) => [
    experimentId,
    session.sessionId,
    issue.issueKey,
    issue.category,
    issue.recordId,
    issue.recordLabel,
    issue.effectiveStatus,
    issue.description,
    issue.provenance,
    issue.persistedReview?.researcherNotes ?? '',
    issue.persistedReview?.history.length ?? 0,
  ]);

  return buildCsv(headers, dataRows);
}

export function exportMeasurementLinkageCsv(
  experiment: Experiment
): string {
  const headers = [
    'Experiment_ID',
    'Survey_Dataset_ID',
    'Survey_Measurement_UUID',
    'Survey_Sample_ID',
    'Stage',
    'Survey_Recorded_Conc (ppm)',
    'Linked_Analytical_UUID',
    'Analytical_Sample_ID',
    'Analytical_Reported_Conc',
    'Analytical_Unit',
    'Analytical_Dilution_Factor',
    'Reported_Value_Basis',
    'Status',
  ];

  const allInstrument = experiment.instrumentMeasurements ?? [];
  const instById = new Map(allInstrument.map((i) => [i.id, i]));
  const rows: Array<Array<string | number | null | undefined>> = [];

  for (const ds of experiment.surveyDatasets ?? []) {
    for (const sm of ds.measurements ?? []) {
      const pairs: Array<{
        stage: 'Initial' | 'Final';
        surveyConc: number | null;
        linkedId: string | null;
      }> = [
        {
          stage: 'Initial',
          surveyConc: sm.initialConcPpm,
          linkedId: sm.linkedInitialMeasurementId,
        },
        {
          stage: 'Final',
          surveyConc: sm.finalConcPpm,
          linkedId: sm.linkedFinalMeasurementId,
        },
      ];
      for (const p of pairs) {
        if (!p.linkedId) continue;
        const inst = instById.get(p.linkedId);
        rows.push([
          experiment.experimentId,
          ds.datasetId,
          sm.id,
          sm.sampleId,
          p.stage,
          p.surveyConc,
          p.linkedId,
          inst?.sampleId ?? '',
          inst?.reportedConc ?? null,
          inst?.concUnit ?? '',
          inst?.dilutionFactor ?? null,
          inst?.reportedValueBasis ?? 'unspecified',
          inst ? 'Linked' : 'Source Unavailable',
        ]);
      }
    }
  }

  return buildCsv(headers, rows);
}

export function triggerFileDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface FigureExportOptions {
  title?: string;
  subtitle?: string;
  syntheticNotice?: boolean;
  widthPx?: number;
  heightPx?: number;
  scale?: 1 | 2 | 3;
}

/**
 * Builds a clean standalone SVG string from the rendered chart surface without
 * capturing surrounding UI buttons, tooltips, or navigation chrome.
 */
export function buildStandaloneChartSvgString(
  container: HTMLElement | null,
  options: FigureExportOptions = {}
): { svgString: string; width: number; height: number } | null {
  if (!container || typeof window === 'undefined') return null;
  const svg =
    container.querySelector('svg.recharts-surface') ||
    container.querySelector('svg[data-figure-canvas="true"]');
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  const plotW = Math.max(Math.round(rect.width), 640);
  const plotH = Math.max(Math.round(rect.height), 320);

  const headerH = options.title ? 46 : 16;
  const footerH = options.syntheticNotice ? 26 : 12;
  const totalW = options.widthPx && options.widthPx >= 480 ? options.widthPx : plotW;
  const totalH =
    options.heightPx && options.heightPx >= 300
      ? options.heightPx
      : plotH + headerH + footerH;

  const outer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  outer.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  outer.setAttribute('width', String(totalW));
  outer.setAttribute('height', String(totalH));
  outer.setAttribute('viewBox', `0 0 ${plotW} ${plotH + headerH + footerH}`);

  // White publication background
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(plotW));
  bg.setAttribute('height', String(plotH + headerH + footerH));
  bg.setAttribute('fill', '#FFFFFF');
  outer.appendChild(bg);

  if (options.title) {
    const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleEl.textContent = options.title;
    outer.appendChild(titleEl);

    const heading = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    heading.setAttribute('x', '20');
    heading.setAttribute('y', '24');
    heading.setAttribute('fill', '#111827');
    heading.setAttribute('font-size', '14');
    heading.setAttribute('font-weight', '600');
    heading.setAttribute('font-family', 'IBM Plex Sans, system-ui, sans-serif');
    heading.textContent = options.title;
    outer.appendChild(heading);

    if (options.subtitle) {
      const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      sub.setAttribute('x', '20');
      sub.setAttribute('y', '40');
      sub.setAttribute('fill', '#6B7280');
      sub.setAttribute('font-size', '11');
      sub.setAttribute('font-family', 'IBM Plex Sans, system-ui, sans-serif');
      sub.textContent = options.subtitle;
      outer.appendChild(sub);
    }
  }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('x', '0');
  clone.setAttribute('y', String(headerH));
  clone.setAttribute('width', String(plotW));
  clone.setAttribute('height', String(plotH));
  outer.appendChild(clone);

  if (options.syntheticNotice) {
    const notice = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    notice.setAttribute('x', '20');
    notice.setAttribute('y', String(headerH + plotH + 16));
    notice.setAttribute('fill', '#92400E');
    notice.setAttribute('font-size', '10.5');
    notice.setAttribute('font-family', 'IBM Plex Mono, monospace');
    notice.textContent =
      'SYNTHETIC DEMONSTRATION DATA — Exploratory numerical visualization only; not validated experimental evidence.';
    outer.appendChild(notice);
  }

  const serializer = new XMLSerializer();
  const svgString = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(outer)}`;
  return { svgString, width: totalW, height: totalH };
}

/**
 * Exports a rendered figure inside a container element as a standalone publication-ready SVG.
 */
export function exportChartContainerToSvg(
  container: HTMLElement | null,
  filename: string,
  titleOrOptions?: string | FigureExportOptions
): boolean {
  const options: FigureExportOptions =
    typeof titleOrOptions === 'string'
      ? { title: titleOrOptions }
      : titleOrOptions ?? {};
  const built = buildStandaloneChartSvgString(container, options);
  if (!built) return false;
  triggerFileDownload(built.svgString, filename, 'image/svg+xml;charset=utf-8');
  return true;
}

/**
 * Exports a rendered figure as a high-resolution raster PNG using an offscreen Canvas
 * at configurable pixel dimensions and resolution scale (1x, 2x, 3x).
 */
export async function exportChartContainerToPng(
  container: HTMLElement | null,
  filename: string,
  options: FigureExportOptions = {}
): Promise<boolean> {
  const built = buildStandaloneChartSvgString(container, options);
  if (!built || typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const scale = options.scale ?? 2;
  const svgBlob = new Blob([built.svgString], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(svgBlob);

  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(built.width * scale);
        canvas.height = Math.round(built.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(false);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            resolve(false);
            return;
          }
          const pngUrl = URL.createObjectURL(pngBlob);
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
          resolve(true);
        }, 'image/png');
      } catch {
        URL.revokeObjectURL(url);
        resolve(false);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.src = url;
  });
}
