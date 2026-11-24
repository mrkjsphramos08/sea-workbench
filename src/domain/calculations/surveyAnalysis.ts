/**
 * SEA Workbench — Phase 3 Survey Analysis, Completeness, Comparison & Figure Helpers
 *
 * Strictly reuses Phase 2 numerical functions (`analyzeSurveyDataset`, `computeDescriptiveStatistics`,
 * `resolveSurveyAnalyticalLinks`, `areUnitsCompatible`) without duplicating statistical math.
 */

import {
  CALC_ENGINE_VERSION,
  DataProvenance,
  Experiment,
  FigureConfiguration,
  InstrumentMeasurement,
  SurveyDataset,
  SurveyMode,
} from '../models/types';
import {
  SurveyDatasetAnalysis,
  analyzeSurveyDataset,
  areUnitsCompatible,
  resolveSurveyAnalyticalLinks,
} from './seaMath';

export interface SurveyCompletenessReport {
  totalSamples: number;
  replicateGroupCount: number;
  completeMeasurementRows: number;
  incompleteMeasurementRows: number;
  missingInitialPhCount: number;
  missingFinalPhCount: number;
  missingUptakeCount: number;
  missingConcCount: number;
  flaggedCount: number;
  excludedCount: number;
  pendingCount: number;
  unresolvedDiscrepancyCount: number;
  unavailableAnalyticalSourceCount: number;
  incompleteMetadataFields: string[];
  provenanceBreakdown: Record<DataProvenance, number>;
  containsSynthetic: boolean;
  /** Explicit non-validity notice to prevent conflating completeness with scientific validity */
  completenessDisclaimer: string;
}

export function evaluateSurveyCompleteness(
  dataset: SurveyDataset,
  instrumentMeasurements: InstrumentMeasurement[]
): SurveyCompletenessReport {
  const rows = dataset.measurements;
  const links = resolveSurveyAnalyticalLinks(
    rows,
    instrumentMeasurements,
    dataset.analysisConfig.discrepancyTolerancePpm
  );

  const uniqueGroups = new Set<string>();
  let completeMeasurementRows = 0;
  let missingInitialPhCount = 0;
  let missingFinalPhCount = 0;
  let missingUptakeCount = 0;
  let missingConcCount = 0;
  let flaggedCount = 0;
  let excludedCount = 0;
  let pendingCount = 0;
  let unresolvedDiscrepancyCount = 0;
  let unavailableAnalyticalSourceCount = 0;

  const provenanceBreakdown: Record<DataProvenance, number> = {
    user_entered: 0,
    literature_reference: 0,
    manufacturer_spec: 0,
    measured_experimental: 0,
    theoretical_estimate: 0,
    derived_calculated: 0,
    synthetic_demo: 0,
    unavailable: 0,
  };

  for (const row of rows) {
    const gk = row.sampleGroupId.trim() || `UNG-${row.sampleId || row.id}`;
    uniqueGroups.add(gk);
    provenanceBreakdown[row.provenance] =
      (provenanceBreakdown[row.provenance] ?? 0) + 1;

    if (row.qualityStatus === 'flagged') flaggedCount += 1;
    if (row.qualityStatus === 'excluded_by_user') excludedCount += 1;
    if (row.qualityStatus === 'pending') pendingCount += 1;

    if (row.measuredInitialPh === null) missingInitialPhCount += 1;
    if (row.measuredFinalPh === null) missingFinalPhCount += 1;
    if (row.recordedUptakeUmolM2 === null) missingUptakeCount += 1;
    if (row.initialConcPpm === null || row.finalConcPpm === null) {
      missingConcCount += 1;
    }

    const isComplete =
      dataset.mode === 'pzc'
        ? row.measuredInitialPh !== null && row.measuredFinalPh !== null
        : row.measuredInitialPh !== null &&
          row.measuredFinalPh !== null &&
          row.recordedUptakeUmolM2 !== null;
    if (isComplete) completeMeasurementRows += 1;

    const link = links[row.id];
    if (link) {
      if (link.initial.hasDiscrepancy) unresolvedDiscrepancyCount += 1;
      if (link.final.hasDiscrepancy) unresolvedDiscrepancyCount += 1;
      if (link.initial.sourceUnavailable) unavailableAnalyticalSourceCount += 1;
      if (link.final.sourceUnavailable) unavailableAnalyticalSourceCount += 1;
    }
  }

  const incompleteMetadataFields: string[] = [];
  if (!dataset.objective.trim()) incompleteMetadataFields.push('Research objective');
  if (!dataset.researcher.trim()) incompleteMetadataFields.push('Researcher attribution');
  if (!dataset.supportSnapshot?.supportData) {
    incompleteMetadataFields.push('Support material snapshot');
  }
  if (dataset.mode === 'uptake' && !dataset.precursorSnapshot?.precursorData) {
    incompleteMetadataFields.push('Metal precursor snapshot');
  }
  if (dataset.config.targetSurfaceLoadingM2L === null) {
    incompleteMetadataFields.push('Target surface loading (m²/L)');
  }
  if (dataset.config.equilibrationTimeMin === null) {
    incompleteMetadataFields.push('Equilibration time (min)');
  }
  if (dataset.config.temperatureC === null) {
    incompleteMetadataFields.push('Temperature (°C)');
  }
  if (!dataset.config.backgroundElectrolyte.trim()) {
    incompleteMetadataFields.push('Background electrolyte');
  }

  return {
    totalSamples: rows.length,
    replicateGroupCount: uniqueGroups.size,
    completeMeasurementRows,
    incompleteMeasurementRows: rows.length - completeMeasurementRows,
    missingInitialPhCount,
    missingFinalPhCount,
    missingUptakeCount,
    missingConcCount,
    flaggedCount,
    excludedCount,
    pendingCount,
    unresolvedDiscrepancyCount,
    unavailableAnalyticalSourceCount,
    incompleteMetadataFields,
    provenanceBreakdown,
    containsSynthetic:
      dataset.isDemonstration ||
      dataset.provenance === 'synthetic_demo' ||
      rows.some((r) => r.provenance === 'synthetic_demo'),
    completenessDisclaimer:
      'Completeness tracks populated fields and resolved record links only; complete records do not imply experimental or scientific validity.',
  };
}

export interface ComparativeDatasetEntry {
  experimentUuid: string;
  experimentId: string;
  experimentTitle: string;
  dataset: SurveyDataset;
  analysis: SurveyDatasetAnalysis;
  uptakeUnit: string;
  supportName: string;
  precursorName: string;
}

export interface DatasetComparisonSummary {
  engineVersion: string;
  entries: ComparativeDatasetEntry[];
  unitsCompatible: boolean;
  unitIncompatibilityReason: string | null;
  conditionDifferences: string[];
  containsSynthetic: boolean;
}

/**
 * Builds a descriptive, identity-preserving comparison across multiple survey datasets.
 * Checks unit compatibility and surfaces metadata/condition differences without merging
 * incompatible quantities or ranking chemical systems.
 */
export function buildDatasetComparison(
  selectedItems: Array<{ experiment: Experiment; dataset: SurveyDataset }>
): DatasetComparisonSummary {
  const entries: ComparativeDatasetEntry[] = selectedItems.map(
    ({ experiment, dataset }) => {
      const analysis = analyzeSurveyDataset(dataset.measurements, {
        excludeFlagged: dataset.analysisConfig.excludeFlaggedInStats,
      });
      const firstUnit =
        dataset.measurements.find((m) => m.uptakeUnit)?.uptakeUnit || 'µmol/m²';
      const supportName =
        dataset.supportSnapshot?.supportData?.name ||
        experiment.batch.supportSnapshot?.supportData?.name ||
        'Unassigned';
      const precursorName =
        dataset.precursorSnapshot?.precursorData?.name ||
        experiment.batch.precursorSnapshot?.precursorData?.name ||
        'Unassigned';

      return {
        experimentUuid: experiment.uuid,
        experimentId: experiment.experimentId,
        experimentTitle: experiment.title,
        dataset,
        analysis,
        uptakeUnit: firstUnit,
        supportName,
        precursorName,
      };
    }
  );

  let unitsCompatible = true;
  let unitIncompatibilityReason: string | null = null;
  const conditionDifferences: string[] = [];

  if (entries.length >= 2) {
    const baseUnit = entries[0].uptakeUnit;
    for (let i = 1; i < entries.length; i += 1) {
      const nextUnit = entries[i].uptakeUnit;
      if (baseUnit !== nextUnit && !areUnitsCompatible(baseUnit, nextUnit)) {
        unitsCompatible = false;
        unitIncompatibilityReason = `Incompatible uptake units detected: "${baseUnit}" (${entries[0].dataset.datasetId}) vs. "${nextUnit}" (${entries[i].dataset.datasetId}). Incompatible quantities cannot be merged.`;
        break;
      }
    }

    const modes = new Set(entries.map((e) => e.dataset.mode));
    if (modes.size > 1) {
      conditionDifferences.push(
        'Selected datasets include both Uptake Survey and PZC / pH Shift Survey types.'
      );
    }

    const supports = new Set(entries.map((e) => e.supportName));
    if (supports.size > 1) {
      conditionDifferences.push(
        `Different support materials across series (${Array.from(supports).join(' vs. ')}).`
      );
    }

    const precursors = new Set(entries.map((e) => e.precursorName));
    if (precursors.size > 1) {
      conditionDifferences.push(
        `Different metal precursors across series (${Array.from(precursors).join(' vs. ')}).`
      );
    }

    const surfaceLoadings = new Set(
      entries.map((e) =>
        e.dataset.config.targetSurfaceLoadingM2L !== null
          ? `${e.dataset.config.targetSurfaceLoadingM2L} m²/L`
          : 'Unrecorded'
      )
    );
    if (surfaceLoadings.size > 1) {
      conditionDifferences.push(
        `Target surface loading differs across compared datasets (${Array.from(surfaceLoadings).join(' vs. ')}).`
      );
    }

    const eqTimes = new Set(
      entries.map((e) =>
        e.dataset.config.equilibrationTimeMin !== null
          ? `${e.dataset.config.equilibrationTimeMin} min`
          : 'Unrecorded'
      )
    );
    if (eqTimes.size > 1) {
      conditionDifferences.push(
        `Equilibration duration differs (${Array.from(eqTimes).join(' vs. ')}).`
      );
    }

    const temps = new Set(
      entries.map((e) =>
        e.dataset.config.temperatureC !== null
          ? `${e.dataset.config.temperatureC} °C`
          : 'Unrecorded'
      )
    );
    if (temps.size > 1) {
      conditionDifferences.push(
        `Recorded temperature differs (${Array.from(temps).join(' vs. ')}).`
      );
    }

    const electrolytes = new Set(
      entries.map(
        (e) => e.dataset.config.backgroundElectrolyte.trim() || 'Unrecorded'
      )
    );
    if (electrolytes.size > 1) {
      conditionDifferences.push(
        `Background electrolyte differs (${Array.from(electrolytes).join(' vs. ')}).`
      );
    }

    const provenances = new Set(entries.map((e) => e.dataset.provenance));
    if (provenances.size > 1) {
      conditionDifferences.push(
        'Compared datasets have different data provenance classifications.'
      );
    }
  }

  return {
    engineVersion: CALC_ENGINE_VERSION,
    entries,
    unitsCompatible,
    unitIncompatibilityReason,
    conditionDifferences,
    containsSynthetic: entries.some(
      (e) => e.dataset.isDemonstration || e.analysis.containsSynthetic
    ),
  };
}

export interface DistributionBin {
  binLabel: string;
  binStart: number;
  binEnd: number;
  midpoint: number;
  count: number;
}

/**
 * Computes descriptive histogram bins over finite numeric observations without
 * fabricating counts or treating null values as zero.
 */
export function computeDistributionBins(
  values: Array<number | null | undefined>,
  requestedBins = 6,
  precision = 2
): DistributionBin[] {
  const finite = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  if (finite.length === 0) return [];

  const minVal = Math.min(...finite);
  const maxVal = Math.max(...finite);

  if (maxVal === minVal) {
    return [
      {
        binLabel: minVal.toFixed(precision),
        binStart: minVal,
        binEnd: maxVal,
        midpoint: minVal,
        count: finite.length,
      },
    ];
  }

  const binCount = Math.max(2, Math.min(12, requestedBins));
  const step = (maxVal - minVal) / binCount;
  const bins: DistributionBin[] = [];

  for (let i = 0; i < binCount; i += 1) {
    const start = minVal + i * step;
    const end = i === binCount - 1 ? maxVal : minVal + (i + 1) * step;
    bins.push({
      binLabel: `${start.toFixed(precision)}–${end.toFixed(precision)}`,
      binStart: start,
      binEnd: end,
      midpoint: (start + end) / 2,
      count: 0,
    });
  }

  for (const v of finite) {
    const rawIdx = Math.floor((v - minVal) / step);
    const idx = Math.min(binCount - 1, Math.max(0, rawIdx));
    bins[idx].count += 1;
  }

  return bins;
}

export function createDefaultFigureConfig(
  mode: SurveyMode,
  title?: string,
  id = 'fig-default'
): FigureConfiguration {
  const isPzc = mode === 'pzc';
  return {
    id,
    name: isPzc ? 'Default pH Shift Figure' : 'Default Uptake Figure',
    plotType: isPzc ? 'pzc_final_vs_initial' : 'error_bar',
    title:
      title ||
      (isPzc
        ? 'Recorded pH Shift (Final pH vs. Initial pH)'
        : 'Recorded Metal Uptake vs. Final Equilibrium pH'),
    xAxisTitle: isPzc ? 'Measured Initial pH' : 'Final Equilibrium pH',
    xAxisUnit: 'pH',
    yAxisTitle: isPzc ? 'Measured Final pH' : 'Recorded Metal Uptake',
    yAxisUnit: isPzc ? 'pH' : 'µmol/m²',
    xMin: 0,
    xMax: 14,
    yMin: isPzc ? 0 : null,
    yMax: isPzc ? 14 : null,
    tickDensity: 'standard',
    numericPrecision: isPzc ? 1 : 2,
    markerShape: 'circle',
    markerSize: 6,
    showLines: false,
    lineStyle: 'solid',
    primaryColor: '#0F52BA',
    grayscaleMode: false,
    legendPosition: 'top',
    showGridlines: true,
    showReferenceLine: true,
    showIdentityLine: isPzc,
    displayMode: 'both',
    errorBarMode: 'sd',
    exportWidthPx: 960,
    exportHeightPx: 540,
    exportScale: 2,
    savedAt: new Date().toISOString(),
  };
}
