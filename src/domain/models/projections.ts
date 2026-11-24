/**
 * SEA Workbench — Authoritative Data Model Projection Layer (Phase 4)
 *
 * Establishes `surveyDatasets[]` (+ `activeSurveyDatasetId`) as the single authoritative
 * source of truth for Uptake & PZC survey records, and `analyticalSessions[]` (+ `activeAnalyticalSessionId`)
 * as the single authoritative source of truth for Analytical Chemistry records.
 *
 * Legacy compatibility fields (`surveyConfig`, `surveyMeasurements`, `analyticalConfig`,
 * `calibrationStandards`, `instrumentMeasurements`) are deterministic read-only projections
 * derived from these authoritative collections.
 */

import {
  AnalyticalAnalyte,
  AnalyticalConfiguration,
  AnalyticalSession,
  CalibrationDataset,
  CalibrationStandard,
  Experiment,
  InstrumentMeasurement,
  SurveyConfiguration,
  SurveyDataset,
  SurveyMeasurement,
} from './types';

export function getActiveSurveyDataset(exp: Experiment): SurveyDataset | null {
  if (!exp.surveyDatasets || exp.surveyDatasets.length === 0) return null;
  if (exp.activeSurveyDatasetId) {
    const found = exp.surveyDatasets.find(
      (d) => d.id === exp.activeSurveyDatasetId
    );
    if (found) return found;
  }
  return exp.surveyDatasets[0] ?? null;
}

export function getAllExperimentSurveyMeasurements(
  exp: Experiment
): Array<{ datasetId: string; datasetCode: string; datasetTitle: string; measurement: SurveyMeasurement }> {
  const out: Array<{
    datasetId: string;
    datasetCode: string;
    datasetTitle: string;
    measurement: SurveyMeasurement;
  }> = [];
  for (const ds of exp.surveyDatasets ?? []) {
    for (const m of ds.measurements ?? []) {
      out.push({
        datasetId: ds.id,
        datasetCode: ds.datasetId,
        datasetTitle: ds.title,
        measurement: m,
      });
    }
  }
  return out;
}

export function getActiveAnalyticalSession(
  exp: Experiment
): AnalyticalSession | null {
  if (!exp.analyticalSessions || exp.analyticalSessions.length === 0) {
    return null;
  }
  if (exp.activeAnalyticalSessionId) {
    const found = exp.analyticalSessions.find(
      (s) => s.id === exp.activeAnalyticalSessionId
    );
    if (found) return found;
  }
  return exp.analyticalSessions[0] ?? null;
}

export function getActiveAnalyte(
  session: AnalyticalSession | null
): AnalyticalAnalyte | null {
  if (!session || !session.analytes || session.analytes.length === 0) {
    return null;
  }
  if (session.activeAnalyteId) {
    const found = session.analytes.find((a) => a.id === session.activeAnalyteId);
    if (found) return found;
  }
  return session.analytes[0] ?? null;
}

export function getActiveCalibrationDataset(
  session: AnalyticalSession | null
): CalibrationDataset | null {
  if (
    !session ||
    !session.calibrationDatasets ||
    session.calibrationDatasets.length === 0
  ) {
    return null;
  }
  if (session.activeCalibrationDatasetId) {
    const found = session.calibrationDatasets.find(
      (c) => c.id === session.activeCalibrationDatasetId
    );
    if (found) return found;
  }
  const activeAnalyte = getActiveAnalyte(session);
  if (activeAnalyte?.calibrationDatasetId) {
    const byAnalyte = session.calibrationDatasets.find(
      (c) => c.id === activeAnalyte.calibrationDatasetId
    );
    if (byAnalyte) return byAnalyte;
  }
  return session.calibrationDatasets[0] ?? null;
}

/**
 * Returns all instrument measurements across all analytical sessions of an experiment,
 * prioritizing the active session first and deduplicating by stable internal UUID.
 * This ensures Survey-to-Analytical linkage stays intact even when switching sessions.
 */
export function getAllExperimentInstrumentMeasurements(
  exp: Experiment
): InstrumentMeasurement[] {
  const sessions = exp.analyticalSessions ?? [];
  if (sessions.length === 0) {
    return exp.instrumentMeasurements ?? [];
  }

  const activeId = exp.activeAnalyticalSessionId ?? sessions[0]?.id ?? null;
  const ordered = [
    ...sessions.filter((s) => s.id === activeId),
    ...sessions.filter((s) => s.id !== activeId),
  ];

  const seen = new Set<string>();
  const all: InstrumentMeasurement[] = [];
  for (const session of ordered) {
    for (const row of session.sampleMeasurements ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      all.push(row);
    }
  }
  return all;
}

/**
 * Projects a legacy AnalyticalConfiguration snapshot from the active AnalyticalSession.
 */
export function projectAnalyticalConfigFromSession(
  session: AnalyticalSession | null,
  fallback: AnalyticalConfiguration
): AnalyticalConfiguration {
  if (!session) return fallback;
  const activeAnalyte = getActiveAnalyte(session);
  const activeCal = getActiveCalibrationDataset(session);

  return {
    instrumentType: session.technique,
    instrumentModel: [session.instrumentManufacturer, session.instrumentModel]
      .filter(Boolean)
      .join(' ')
      .trim() || fallback.instrumentModel,
    analyteElement: activeAnalyte
      ? activeAnalyte.symbol || activeAnalyte.name
      : fallback.analyteElement,
    wavelengthNm: activeAnalyte ? activeAnalyte.wavelengthNm : fallback.wavelengthNm,
    matrixDescription: session.matrixDescription,
    calibrationUnits:
      activeCal?.concUnit ||
      activeAnalyte?.measurementUnit ||
      fallback.calibrationUnits,
    analystName: session.analyst,
    analysisDate: session.analysisDate,
    notes: session.notes,
    dataProvenance: session.provenance,
  };
}

/**
 * Synchronizes all compatibility mirror fields on an Experiment strictly from the
 * authoritative `surveyDatasets[]` and `analyticalSessions[]` collections.
 */
export function projectExperimentCompatibilityMirrors(
  exp: Experiment
): Experiment {
  const activeSurvey = getActiveSurveyDataset(exp);
  const activeSession = getActiveAnalyticalSession(exp);
  const activeCal = getActiveCalibrationDataset(activeSession);

  const projectedSurveyConfig: SurveyConfiguration = activeSurvey
    ? activeSurvey.config
    : exp.surveyConfig;
  const projectedSurveyMeasurements: SurveyMeasurement[] = activeSurvey
    ? activeSurvey.measurements
    : [];

  const projectedAnalyticalConfig: AnalyticalConfiguration =
    projectAnalyticalConfigFromSession(activeSession, exp.analyticalConfig);

  const projectedCalibrationStandards: CalibrationStandard[] = activeCal
    ? activeCal.standards
    : [];

  const projectedInstrumentMeasurements: InstrumentMeasurement[] =
    getAllExperimentInstrumentMeasurements(exp);

  const projectedChecklist =
    Array.isArray(exp.milestones) && exp.milestones.length > 0
      ? exp.milestones
          .filter((m) => m.status !== 'archived')
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((m) => ({
            id: m.id,
            label: m.title,
            completed: m.status === 'completed',
            plannedTime: m.plannedDateTime,
            actualCompletedAt: m.actualCompletedAt,
            notes: m.notes,
          }))
      : exp.benchChecklist;

  return {
    ...exp,
    activeSurveyDatasetId: activeSurvey?.id ?? null,
    surveyConfig: projectedSurveyConfig,
    surveyMeasurements: projectedSurveyMeasurements,
    activeAnalyticalSessionId: activeSession?.id ?? null,
    analyticalConfig: projectedAnalyticalConfig,
    calibrationStandards: projectedCalibrationStandards,
    instrumentMeasurements: projectedInstrumentMeasurements,
    benchChecklist: projectedChecklist,
  };
}
