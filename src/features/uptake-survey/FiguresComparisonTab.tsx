'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Download,
  GitCompare,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  ChartDisplayMode,
  DatasetComparisonConfig,
  DatasetComparisonRef,
  ErrorBarMode,
  Experiment,
  FigureConfiguration,
  FigurePlotType,
  LegendPosition,
  LineStyle,
  MarkerShape,
  SurveyDataset,
  TickDensity,
} from '../../domain/models/types';
import {
  buildDatasetComparison,
  evaluateFigureReproducibility,
  formatScientificNumber,
} from '../../domain/calculations/seaMath';
import {
  exportComparativeDatasetsCsv,
  serializeSurveyDatasetJson,
  triggerFileDownload,
} from '../../services/import-export/backup';
import {
  InspectedObservation,
  ScientificFigureCanvas,
} from '../../components/charts/ScientificFigureCanvas';
import {
  Button,
  FieldLabel,
  NumericInput,
  PROVENANCE_LABELS,
  Panel,
  PanelHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';

const PLOT_TYPE_OPTIONS: { value: FigurePlotType; label: string }[] = [
  { value: 'error_bar', label: 'Uptake vs. pHf (Means + Error Bars)' },
  { value: 'scatter', label: 'Scatter (Discrete Observations)' },
  { value: 'scatter_line', label: 'Scatter + Connecting Line (Sorted X)' },
  { value: 'replicate_means', label: 'Explicit Replicate Group Means' },
  { value: 'pzc_final_vs_initial', label: 'PZC: Final pH vs. Initial pH (1:1)' },
  { value: 'pzc_delta_vs_initial', label: 'PZC: ΔpH vs. Initial pH (ΔpH=0)' },
  { value: 'distribution', label: 'Descriptive Distribution (Bins)' },
  { value: 'box_plot', label: 'Box Plot & Quartile Summary (Q1/Median/Q3/1.5×IQR)' },
  { value: 'comparative', label: 'Comparative Multi-Dataset Overlay' },
];

const MARKER_SHAPES: MarkerShape[] = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'cross',
];

const COLOR_SWATCHES = [
  { label: 'Cobalt', hex: '#0F52BA' },
  { label: 'Ink', hex: '#111827' },
  { label: 'Emerald', hex: '#065F46' },
  { label: 'Amber', hex: '#B45309' },
  { label: 'Indigo', hex: '#4338CA' },
];

export function FiguresComparisonTab({
  experiment,
  allExperiments,
  dataset,
  onUpdateFigureConfig,
  onSaveFigurePreset,
  onLoadFigurePreset,
  onDeleteFigurePreset,
  onUpdateComparison,
}: {
  experiment: Experiment;
  allExperiments: Experiment[];
  dataset: SurveyDataset;
  onUpdateFigureConfig: (patch: Partial<FigureConfiguration>) => void;
  onSaveFigurePreset: (name?: string) => void;
  onLoadFigurePreset: (figureId: string) => void;
  onDeleteFigurePreset: (figureId: string) => void;
  onUpdateComparison: (patch: Partial<DatasetComparisonConfig>) => void;
}) {
  const { figureConfig } = dataset;
  const { datasetComparison } = experiment;

  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [inspectedObs, setInspectedObs] = useState<InspectedObservation | null>(
    null
  );

  // Flatten all selectable datasets across the entire workspace (active experiment first)
  const selectableDatasets = useMemo(() => {
    const orderedExps = [
      experiment,
      ...allExperiments.filter((e) => e.uuid !== experiment.uuid),
    ];
    const items: Array<{
      experiment: Experiment;
      dataset: SurveyDataset;
      refKey: string;
    }> = [];
    for (const exp of orderedExps) {
      for (const ds of exp.surveyDatasets) {
        if (ds.status === 'Archived') continue;
        items.push({
          experiment: exp,
          dataset: ds,
          refKey: `${exp.uuid}:${ds.id}`,
        });
      }
    }
    return items;
  }, [experiment, allExperiments]);

  // Resolve selected comparison refs (fallback to first 2 datasets in active experiment if empty)
  const effectiveComparisonRefs: DatasetComparisonRef[] = useMemo(() => {
    const valid = datasetComparison.selectedRefs.filter((ref) =>
      selectableDatasets.some(
        (item) =>
          item.experiment.uuid === ref.experimentUuid &&
          item.dataset.id === ref.datasetId
      )
    );
    if (valid.length > 0) return valid;
    return selectableDatasets
      .filter((item) => item.experiment.uuid === experiment.uuid)
      .slice(0, 2)
      .map((item) => ({
        experimentUuid: item.experiment.uuid,
        datasetId: item.dataset.id,
      }));
  }, [datasetComparison.selectedRefs, selectableDatasets, experiment.uuid]);

  const comparisonSummary = useMemo(() => {
    const resolved = effectiveComparisonRefs
      .map((ref) =>
        selectableDatasets.find(
          (item) =>
            item.experiment.uuid === ref.experimentUuid &&
            item.dataset.id === ref.datasetId
        )
      )
      .filter(
        (
          item
        ): item is {
          experiment: Experiment;
          dataset: SurveyDataset;
          refKey: string;
        } => Boolean(item)
      );
    return buildDatasetComparison(resolved);
  }, [effectiveComparisonRefs, selectableDatasets]);

  const toggleComparisonRef = (ref: DatasetComparisonRef) => {
    const exists = effectiveComparisonRefs.some(
      (r) =>
        r.experimentUuid === ref.experimentUuid && r.datasetId === ref.datasetId
    );
    const next = exists
      ? effectiveComparisonRefs.filter(
          (r) =>
            !(
              r.experimentUuid === ref.experimentUuid &&
              r.datasetId === ref.datasetId
            )
        )
      : [...effectiveComparisonRefs, ref];
    onUpdateComparison({ selectedRefs: next });
  };

  const handleExportDatasetJson = () => {
    const json = serializeSurveyDatasetJson(experiment, dataset);
    triggerFileDownload(
      json,
      `${experiment.experimentId}-${dataset.datasetId}-survey.json`,
      'application/json;charset=utf-8'
    );
  };

  const handleExportComparativeCsv = () => {
    const csv = exportComparativeDatasetsCsv(comparisonSummary);
    triggerFileDownload(
      csv,
      `${experiment.experimentId}-comparative-datasets.csv`,
      'text/csv;charset=utf-8'
    );
  };

  const comparativeOverlayFigureConfig = useMemo<FigureConfiguration>(
    () => ({
      ...figureConfig,
      plotType: 'comparative',
      title:
        datasetComparison.comparePlotMode === 'uptake_vs_phf'
          ? 'Comparative Uptake Overlay vs. Final Equilibrium pH'
          : datasetComparison.comparePlotMode === 'phf_vs_phi'
            ? 'Comparative pH Shift (Final pH vs. Initial pH)'
            : 'Comparative ΔpH Overlay vs. Initial pH',
      errorBarMode: datasetComparison.errorBarMode,
      showIdentityLine: datasetComparison.comparePlotMode === 'phf_vs_phi',
      showReferenceLine: datasetComparison.comparePlotMode === 'delta_ph_vs_phi',
    }),
    [figureConfig, datasetComparison]
  );

  return (
    <div className="space-y-6">
      {/* SECTION 1: SCIENTIFIC FIGURE STUDIO */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Compact Left Controls Panel */}
        <Panel className="xl:col-span-4">
          <PanelHeader
            title="Scientific Figure Studio"
            subtitle="Customize plot geometry, axes, markers, grayscale styling, and export specs."
          />
          <div className="p-3.5 space-y-3.5 text-[12px] max-h-[680px] overflow-y-auto">
            <div>
              <FieldLabel htmlFor="fig-plot-type">Plot Type</FieldLabel>
              <select
                id="fig-plot-type"
                value={figureConfig.plotType}
                onChange={(e) => {
                  const nextType = e.target.value as FigurePlotType;
                  const patch: Partial<FigureConfiguration> = {
                    plotType: nextType,
                  };
                  if (nextType === 'pzc_final_vs_initial') {
                    patch.xAxisTitle = 'Measured Initial pH';
                    patch.xAxisUnit = 'pH';
                    patch.yAxisTitle = 'Measured Final pH';
                    patch.yAxisUnit = 'pH';
                    patch.showIdentityLine = true;
                  } else if (nextType === 'pzc_delta_vs_initial') {
                    patch.xAxisTitle = 'Measured Initial pH';
                    patch.xAxisUnit = 'pH';
                    patch.yAxisTitle = 'Recorded ΔpH (pHf − pHi)';
                    patch.yAxisUnit = 'pH';
                    patch.yMin = null;
                    patch.yMax = null;
                    patch.showReferenceLine = true;
                  } else if (
                    nextType === 'scatter' ||
                    nextType === 'scatter_line' ||
                    nextType === 'replicate_means' ||
                    nextType === 'error_bar'
                  ) {
                    patch.xAxisTitle = 'Final Equilibrium pH';
                    patch.xAxisUnit = 'pH';
                    patch.yAxisTitle = 'Recorded Metal Uptake';
                    patch.yAxisUnit = 'µmol/m²';
                    patch.yMin = null;
                    patch.yMax = null;
                  }
                  onUpdateFigureConfig(patch);
                }}
                className={inputBaseClass}
              >
                {PLOT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel htmlFor="fig-title">Figure Title</FieldLabel>
              <input
                id="fig-title"
                type="text"
                value={figureConfig.title}
                onChange={(e) =>
                  onUpdateFigureConfig({ title: e.target.value })
                }
                className={inputBaseClass}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <FieldLabel htmlFor="fig-x-title">X-Axis Title</FieldLabel>
                <input
                  id="fig-x-title"
                  type="text"
                  value={figureConfig.xAxisTitle}
                  onChange={(e) =>
                    onUpdateFigureConfig({ xAxisTitle: e.target.value })
                  }
                  className={inputBaseClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="fig-x-unit">Unit</FieldLabel>
                <input
                  id="fig-x-unit"
                  type="text"
                  value={figureConfig.xAxisUnit}
                  onChange={(e) =>
                    onUpdateFigureConfig({ xAxisUnit: e.target.value })
                  }
                  className={`${inputBaseClass} font-mono`}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <FieldLabel htmlFor="fig-y-title">Y-Axis Title</FieldLabel>
                <input
                  id="fig-y-title"
                  type="text"
                  value={figureConfig.yAxisTitle}
                  onChange={(e) =>
                    onUpdateFigureConfig({ yAxisTitle: e.target.value })
                  }
                  className={inputBaseClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="fig-y-unit">Unit</FieldLabel>
                <input
                  id="fig-y-unit"
                  type="text"
                  value={figureConfig.yAxisUnit}
                  onChange={(e) =>
                    onUpdateFigureConfig({ yAxisUnit: e.target.value })
                  }
                  className={`${inputBaseClass} font-mono`}
                />
              </div>
            </div>

            {/* Axis Limits */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel htmlFor="fig-xmin">X Min (Auto if blank)</FieldLabel>
                <NumericInput
                  id="fig-xmin"
                  value={figureConfig.xMin}
                  onChange={(v) => onUpdateFigureConfig({ xMin: v })}
                />
              </div>
              <div>
                <FieldLabel htmlFor="fig-xmax">X Max</FieldLabel>
                <NumericInput
                  id="fig-xmax"
                  value={figureConfig.xMax}
                  onChange={(v) => onUpdateFigureConfig({ xMax: v })}
                />
              </div>
              <div>
                <FieldLabel htmlFor="fig-ymin">Y Min (Auto if blank)</FieldLabel>
                <NumericInput
                  id="fig-ymin"
                  value={figureConfig.yMin}
                  onChange={(v) => onUpdateFigureConfig({ yMin: v })}
                />
              </div>
              <div>
                <FieldLabel htmlFor="fig-ymax">Y Max</FieldLabel>
                <NumericInput
                  id="fig-ymax"
                  value={figureConfig.yMax}
                  onChange={(v) => onUpdateFigureConfig({ yMax: v })}
                />
              </div>
            </div>

            {/* Ticks, Precision, Legend */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <FieldLabel htmlFor="fig-ticks">Tick Density</FieldLabel>
                <select
                  id="fig-ticks"
                  value={figureConfig.tickDensity}
                  onChange={(e) =>
                    onUpdateFigureConfig({
                      tickDensity: e.target.value as TickDensity,
                    })
                  }
                  className={inputBaseClass}
                >
                  <option value="compact">Compact</option>
                  <option value="standard">Standard</option>
                  <option value="dense">Dense</option>
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="fig-prec">Decimals</FieldLabel>
                <select
                  id="fig-prec"
                  value={figureConfig.numericPrecision}
                  onChange={(e) =>
                    onUpdateFigureConfig({
                      numericPrecision: Number(e.target.value),
                    })
                  }
                  className={`${inputBaseClass} font-mono`}
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="fig-legend">Legend</FieldLabel>
                <select
                  id="fig-legend"
                  value={figureConfig.legendPosition}
                  onChange={(e) =>
                    onUpdateFigureConfig({
                      legendPosition: e.target.value as LegendPosition,
                    })
                  }
                  className={inputBaseClass}
                >
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="none">Hidden</option>
                </select>
              </div>
            </div>

            {/* Display Mode & Error Bars */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel htmlFor="fig-disp-mode">Series Display</FieldLabel>
                <select
                  id="fig-disp-mode"
                  value={figureConfig.displayMode}
                  onChange={(e) =>
                    onUpdateFigureConfig({
                      displayMode: e.target.value as ChartDisplayMode,
                    })
                  }
                  className={inputBaseClass}
                >
                  <option value="both">Individual + Means</option>
                  <option value="individual">Individual Only</option>
                  <option value="means">Replicate Means Only</option>
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="fig-err-mode">Error Bars (n≥2)</FieldLabel>
                <select
                  id="fig-err-mode"
                  value={figureConfig.errorBarMode}
                  onChange={(e) =>
                    onUpdateFigureConfig({
                      errorBarMode: e.target.value as ErrorBarMode,
                    })
                  }
                  className={inputBaseClass}
                >
                  <option value="none">None</option>
                  <option value="sd">± Sample SD</option>
                  <option value="sem">± SEM</option>
                </select>
              </div>
            </div>

            {/* Marker Shape, Size, Line Style */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <FieldLabel htmlFor="fig-shape">Marker</FieldLabel>
                <select
                  id="fig-shape"
                  value={figureConfig.markerShape}
                  onChange={(e) =>
                    onUpdateFigureConfig({
                      markerShape: e.target.value as MarkerShape,
                    })
                  }
                  className={inputBaseClass}
                >
                  {MARKER_SHAPES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="fig-size">Size (px)</FieldLabel>
                <NumericInput
                  id="fig-size"
                  value={figureConfig.markerSize}
                  onChange={(v) =>
                    onUpdateFigureConfig({
                      markerSize: v !== null ? Math.max(3, Math.min(10, v)) : 6,
                    })
                  }
                  min={3}
                  max={10}
                />
              </div>
              <div>
                <FieldLabel htmlFor="fig-line-style">Line Style</FieldLabel>
                <select
                  id="fig-line-style"
                  value={figureConfig.lineStyle}
                  onChange={(e) =>
                    onUpdateFigureConfig({
                      lineStyle: e.target.value as LineStyle,
                    })
                  }
                  className={inputBaseClass}
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
            </div>

            {/* Color Palette & Toggles */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.05em] font-medium text-[#4B5563]">
                  Series Color
                </span>
                <label className="inline-flex items-center gap-1.5 text-[11.5px] text-[#374151] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={figureConfig.grayscaleMode}
                    onChange={(e) =>
                      onUpdateFigureConfig({ grayscaleMode: e.target.checked })
                    }
                    className="accent-[#0F52BA]"
                  />
                  <span>Grayscale Publication Mode</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                {COLOR_SWATCHES.map((sw) => (
                  <button
                    key={sw.hex}
                    type="button"
                    disabled={figureConfig.grayscaleMode}
                    onClick={() =>
                      onUpdateFigureConfig({ primaryColor: sw.hex })
                    }
                    title={sw.label}
                    aria-label={`Set color to ${sw.label}`}
                    className={`w-6 h-6 rounded-[4px] border cursor-pointer disabled:opacity-40 ${
                      figureConfig.primaryColor === sw.hex &&
                      !figureConfig.grayscaleMode
                        ? 'ring-2 ring-offset-1 ring-[#0F52BA] border-[#111827]'
                        : 'border-[#D1D5DB]'
                    }`}
                    style={{ backgroundColor: sw.hex }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11.5px] text-[#374151]">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={figureConfig.showGridlines}
                  onChange={(e) =>
                    onUpdateFigureConfig({ showGridlines: e.target.checked })
                  }
                  className="accent-[#0F52BA]"
                />
                <span>Gridlines</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={figureConfig.showLines}
                  onChange={(e) =>
                    onUpdateFigureConfig({ showLines: e.target.checked })
                  }
                  className="accent-[#0F52BA]"
                />
                <span>Connect Line</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={figureConfig.showReferenceLine}
                  onChange={(e) =>
                    onUpdateFigureConfig({
                      showReferenceLine: e.target.checked,
                    })
                  }
                  className="accent-[#0F52BA]"
                />
                <span>Ref / PZC Lines</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={figureConfig.showIdentityLine}
                  onChange={(e) =>
                    onUpdateFigureConfig({ showIdentityLine: e.target.checked })
                  }
                  className="accent-[#0F52BA]"
                />
                <span>1:1 Identity Line</span>
              </label>
            </div>

            {/* Export Dimensions */}
            <div className="pt-2 border-t border-[#E5E7EB] grid grid-cols-3 gap-2">
              <div>
                <FieldLabel htmlFor="fig-exp-w">Width (px)</FieldLabel>
                <NumericInput
                  id="fig-exp-w"
                  value={figureConfig.exportWidthPx}
                  onChange={(v) =>
                    onUpdateFigureConfig({
                      exportWidthPx: v !== null && v >= 480 ? v : 960,
                    })
                  }
                  min={480}
                />
              </div>
              <div>
                <FieldLabel htmlFor="fig-exp-h">Height (px)</FieldLabel>
                <NumericInput
                  id="fig-exp-h"
                  value={figureConfig.exportHeightPx}
                  onChange={(v) =>
                    onUpdateFigureConfig({
                      exportHeightPx: v !== null && v >= 300 ? v : 540,
                    })
                  }
                  min={300}
                />
              </div>
              <div>
                <FieldLabel htmlFor="fig-exp-scale">PNG Scale</FieldLabel>
                <select
                  id="fig-exp-scale"
                  value={figureConfig.exportScale}
                  onChange={(e) =>
                    onUpdateFigureConfig({
                      exportScale: Number(e.target.value) as 1 | 2 | 3,
                    })
                  }
                  className={`${inputBaseClass} font-mono`}
                >
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={3}>3×</option>
                </select>
              </div>
            </div>

            {/* Save Preset */}
            <div className="pt-2 border-t border-[#E5E7EB] space-y-2">
              <FieldLabel htmlFor="fig-preset-name">
                Save Named Figure Configuration
              </FieldLabel>
              <div className="flex items-center gap-1.5">
                <input
                  id="fig-preset-name"
                  type="text"
                  value={presetNameDraft}
                  onChange={(e) => setPresetNameDraft(e.target.value)}
                  placeholder="Preset name (e.g., Grayscale Manuscript Fig 1)"
                  className={inputBaseClass}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onSaveFigurePreset(presetNameDraft.trim() || undefined);
                    setPresetNameDraft('');
                  }}
                >
                  <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Save
                </Button>
              </div>
            </div>
          </div>
        </Panel>

        {/* Right: Live Figure Canvas + Inspector + Saved Presets */}
        <div className="xl:col-span-8 space-y-4">
          <ScientificFigureCanvas
            dataset={dataset}
            figureConfig={figureConfig}
            experimentId={experiment.experimentId}
            referencePzcMarkers={dataset.referencePzcMarkers}
            comparison={
              figureConfig.plotType === 'comparative' ? comparisonSummary : null
            }
            comparePlotMode={datasetComparison.comparePlotMode}
            compareShowGroupMeans={datasetComparison.showGroupMeans}
            height={380}
            onInspectObservation={setInspectedObs}
          />

          {/* Interactive Point Inspector */}
          {inspectedObs && (
            <div className="bg-white border border-[#BFDBFE] rounded-[8px] p-3.5 text-[12px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.05em] font-semibold text-[#0F52BA]">
                    Selected Observation Inspector
                  </div>
                  <div className="font-mono font-semibold text-[#111827] mt-0.5">
                    {inspectedObs.sampleId} · {inspectedObs.datasetId} (
                    {inspectedObs.datasetTitle})
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close observation inspector"
                  onClick={() => setInspectedObs(null)}
                  className="p-1 text-[#6B7280] hover:text-[#111827] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2.5 pt-2.5 border-t border-[#E5E7EB] font-mono text-[11.5px]">
                <div>
                  <div className="font-sans text-[10.5px] text-[#6B7280]">
                    Group / Rep
                  </div>
                  <div>
                    {inspectedObs.sampleGroupId}
                    {inspectedObs.replicateId
                      ? ` / ${inspectedObs.replicateId}`
                      : ''}
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[10.5px] text-[#6B7280]">
                    Coordinates (X, Y)
                  </div>
                  <div>
                    ({formatScientificNumber(inspectedObs.xValue, 2)},{' '}
                    {formatScientificNumber(inspectedObs.yValue, 3)})
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[10.5px] text-[#6B7280]">
                    Provenance / Status
                  </div>
                  <div className="font-sans">
                    {PROVENANCE_LABELS[inspectedObs.provenance]}
                    {inspectedObs.qualityStatus
                      ? ` · ${inspectedObs.qualityStatus}`
                      : ''}
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[10.5px] text-[#6B7280]">
                    Analytical Links
                  </div>
                  <div>
                    {inspectedObs.linkedInitialMeasurementId ||
                    inspectedObs.linkedFinalMeasurementId
                      ? 'Linked'
                      : 'Unlinked'}
                  </div>
                </div>
              </div>
              {(inspectedObs.notes || inspectedObs.exclusionReason) && (
                <div className="mt-2 text-[11.5px] text-[#4B5563]">
                  {inspectedObs.notes && <div>Notes: {inspectedObs.notes}</div>}
                  {inspectedObs.exclusionReason && (
                    <div className="text-[#92400E]">
                      Flag/Exclusion Reason: {inspectedObs.exclusionReason}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Saved Figure Presets & Dataset JSON Export */}
          <Panel>
            <PanelHeader
              title={`Saved Figure Presets (${dataset.savedFigures.length})`}
              subtitle="Named figure configurations are persisted with this dataset and selectable in the A4 Lab Report."
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportDatasetJson}
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Export Survey JSON
                </Button>
              }
            />
            <div className="p-3.5">
              {dataset.savedFigures.length === 0 ? (
                <p className="text-[12px] text-[#6B7280]">
                  No saved figure presets yet. Configure the plot above and
                  click Save to reuse it in reports.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {dataset.savedFigures.map((fig) => {
                    const repro = evaluateFigureReproducibility(
                      experiment,
                      'survey',
                      fig,
                      dataset.id
                    );
                    return (
                      <div
                        key={fig.id}
                        className="p-2.5 border border-[#E5E7EB] rounded-[6px] bg-[#F8F9FA] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-[#111827] truncate flex items-center gap-1.5">
                            <Bookmark
                              className="w-3.5 h-3.5 text-[#0F52BA] shrink-0"
                              strokeWidth={1.75}
                            />
                            <span className="truncate">{fig.name}</span>
                          </div>
                          <div className="text-[10.5px] font-mono text-[#6B7280] mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span>
                              {fig.plotType} ·{' '}
                              {fig.grayscaleMode ? 'Grayscale' : 'Color'} ·{' '}
                              {fig.exportScale}× PNG
                            </span>
                            <span
                              title={repro.message}
                              className={`px-1 py-0.25 border text-[9.5px] ${
                                repro.status === 'saved_current'
                                  ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                                  : repro.status === 'legacy_untracked'
                                    ? 'bg-[#F3F4F6] border-[#E5E7EB] text-[#4B5563]'
                                    : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                              }`}
                            >
                              {repro.label}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onLoadFigurePreset(fig.id)}
                          >
                            Load
                          </Button>
                          <button
                            type="button"
                            aria-label={`Delete preset ${fig.name}`}
                            onClick={() => onDeleteFigurePreset(fig.id)}
                            className="p-1 text-[#9CA3AF] hover:text-[#991B1B] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* SECTION 2: COMPARATIVE RESEARCH ANALYSIS */}
      <Panel>
        <PanelHeader
          title="Comparative Research Analysis (Multi-Dataset)"
          subtitle="Compare multiple survey series from this experiment or other workspace experiments while preserving dataset identity and condition boundaries."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Comparative overlay plot mode"
                value={datasetComparison.comparePlotMode}
                onChange={(e) =>
                  onUpdateComparison({
                    comparePlotMode: e.target.value as DatasetComparisonConfig['comparePlotMode'],
                  })
                }
                className="h-8 px-2.5 text-[12px] bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px]"
              >
                <option value="uptake_vs_phf">Uptake vs. Final pH</option>
                <option value="phf_vs_phi">Final pH vs. Initial pH</option>
                <option value="delta_ph_vs_phi">ΔpH vs. Initial pH</option>
              </select>
              <label className="inline-flex items-center gap-1.5 text-[12px] text-[#374151] cursor-pointer">
                <input
                  type="checkbox"
                  checked={datasetComparison.showGroupMeans}
                  onChange={(e) =>
                    onUpdateComparison({ showGroupMeans: e.target.checked })
                  }
                  className="accent-[#0F52BA]"
                />
                <span>Plot Group Means</span>
              </label>
              <Button
                variant="secondary"
                size="sm"
                disabled={comparisonSummary.entries.length === 0}
                onClick={handleExportComparativeCsv}
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                Comparative CSV
              </Button>
            </div>
          }
        />

        <div className="p-4 space-y-4">
          {/* Dataset Selection Checklist */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.05em] font-medium text-[#4B5563] mb-2 flex items-center gap-1.5">
              <GitCompare className="w-3.5 h-3.5 text-[#0F52BA]" strokeWidth={1.75} />
              <span>
                Select Survey Datasets to Compare ({comparisonSummary.entries.length}{' '}
                selected)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {selectableDatasets.map(({ experiment: exp, dataset: ds, refKey }) => {
                const checked = effectiveComparisonRefs.some(
                  (r) =>
                    r.experimentUuid === exp.uuid && r.datasetId === ds.id
                );
                return (
                  <label
                    key={refKey}
                    className={`p-2.5 border rounded-[6px] flex items-start gap-2 cursor-pointer text-[12px] transition-colors ${
                      checked
                        ? 'bg-[#EFF6FF] border-[#BFDBFE]'
                        : 'bg-[#F8F9FA] border-[#E5E7EB] hover:bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        toggleComparisonRef({
                          experimentUuid: exp.uuid,
                          datasetId: ds.id,
                        })
                      }
                      className="mt-0.5 accent-[#0F52BA]"
                    />
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-[#111827] truncate">
                        {exp.experimentId} / {ds.datasetId}
                      </div>
                      <div className="text-[#4B5563] truncate">{ds.title}</div>
                      <div className="text-[10.5px] font-mono text-[#6B7280]">
                        {ds.mode === 'pzc' ? 'PZC' : 'Uptake'} ·{' '}
                        {ds.measurements.length} rows · SL{' '}
                        {ds.config.targetSurfaceLoadingM2L ?? '—'} m²/L
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Condition Differences & Unit Warnings */}
          {!comparisonSummary.unitsCompatible && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[6px] text-[12px] text-[#991B1B] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <strong>Incompatible Units Detected:</strong>{' '}
                {comparisonSummary.unitIncompatibilityReason}
              </div>
            </div>
          )}

          {comparisonSummary.conditionDifferences.length > 0 && (
            <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] text-[12px] text-[#92400E] space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span>Experimental Condition Differences Across Series</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {comparisonSummary.conditionDifferences.map((diff, i) => (
                  <li key={i}>{diff}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Comparative Overlay Plot */}
          {comparisonSummary.entries.length > 0 && (
            <ScientificFigureCanvas
              dataset={dataset}
              figureConfig={comparativeOverlayFigureConfig}
              experimentId={experiment.experimentId}
              comparison={comparisonSummary}
              comparePlotMode={datasetComparison.comparePlotMode}
              compareShowGroupMeans={datasetComparison.showGroupMeans}
              height={320}
              onInspectObservation={setInspectedObs}
            />
          )}

          {/* Side-by-Side Statistical Comparison Table */}
          {comparisonSummary.entries.length > 0 && (
            <div className="overflow-x-auto border border-[#E5E7EB] rounded-[6px]">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[10.5px] uppercase tracking-[0.04em] text-[#4B5563]">
                    <th className="py-2 px-3 font-medium">Dataset</th>
                    <th className="py-2 px-3 font-medium">Material / Conditions</th>
                    <th className="py-2 px-3 font-medium text-right">
                      Included n
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      Mean pHf
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      Mean ΔpH
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      Mean Uptake
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      SD Uptake
                    </th>
                    <th className="py-2 px-3 font-medium">Provenance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {comparisonSummary.entries.map((entry) => (
                    <tr key={`${entry.experimentUuid}:${entry.dataset.id}`}>
                      <td className="py-2 px-3">
                        <div className="font-mono font-semibold text-[#0F52BA]">
                          {entry.experimentId} / {entry.dataset.datasetId}
                        </div>
                        <div className="text-[11.5px] text-[#374151]">
                          {entry.dataset.title}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-[11.5px] text-[#4B5563]">
                        <div>
                          {entry.supportName} / {entry.precursorName}
                        </div>
                        <div className="font-mono text-[10.5px] text-[#6B7280]">
                          SL {entry.dataset.config.targetSurfaceLoadingM2L ?? '—'}{' '}
                          m²/L · {entry.dataset.config.equilibrationTimeMin ?? '—'}{' '}
                          min · {entry.dataset.config.temperatureC ?? '—'} °C
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {entry.analysis.includedRows}/{entry.analysis.totalRows}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatScientificNumber(
                          entry.analysis.finalPhStats.value.mean,
                          2
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatScientificNumber(
                          entry.analysis.deltaPhStats.value.mean,
                          3
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold">
                        {formatScientificNumber(
                          entry.analysis.uptakeStats.value.mean,
                          3
                        )}{' '}
                        <span className="text-[10.5px] font-normal text-[#6B7280]">
                          {entry.uptakeUnit}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatScientificNumber(
                          entry.analysis.uptakeStats.value.sampleStdDev,
                          3
                        )}
                      </td>
                      <td className="py-2 px-3 text-[11.5px] text-[#4B5563]">
                        {PROVENANCE_LABELS[entry.dataset.provenance]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
