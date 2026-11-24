'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  Download,
  FileJson,
  Trash2,
} from 'lucide-react';
import {
  AnalyticalComparisonConfig,
  AnalyticalFigureConfiguration,
  AnalyticalFigurePlotType,
  AnalyticalSession,
  CalibrationDataset,
  Experiment,
  LegendPosition,
  LineStyle,
  TickDensity,
} from '../../domain/models/types';
import {
  CalibrationDatasetAnalysis,
  DetectedAnalyticalIssue,
  buildAnalyticalSessionComparison,
  computeAnalyticalReplicateGroups,
  createDefaultAnalyticalFigureConfig,
  evaluateFigureReproducibility,
} from '../../domain/calculations/seaMath';
import {
  exportAnalyticalReplicateStatsCsv,
  exportAnalyticalSessionSamplesCsv,
  exportCalibrationDatasetCsv,
  exportDilutionRecordsCsv,
  exportExploratoryRegressionSummaryCsv,
  exportMeasurementLinkageCsv,
  exportQualityReviewCsv,
  exportRegressionResidualsCsv,
  serializeAnalyticalSessionJson,
  triggerFileDownload,
} from '../../services/import-export/backup';
import { AnalyticalFigureCanvas } from '../../components/charts/AnalyticalFigureCanvas';
import {
  Button,
  FieldLabel,
  NumericInput,
  Panel,
  PanelHeader,
  ProvenanceIndicator,
  inputBaseClass,
} from '../../components/ui/Primitives';

const PLOT_TYPES: Array<{ value: AnalyticalFigurePlotType; label: string }> = [
  { value: 'calibration_regression', label: 'Calibration + Exploratory OLS Fit' },
  { value: 'calibration_scatter', label: 'Calibration Standards Scatter' },
  { value: 'residuals_vs_conc', label: 'Residuals vs. Concentration' },
  { value: 'residuals_vs_fitted', label: 'Residuals vs. Fitted Response' },
  { value: 'replicate_response', label: 'Calibration Replicate Response (±SD)' },
  { value: 'measurement_distribution', label: 'Sample Concentration Distribution' },
  { value: 'concentration_comparison', label: 'Sample Concentration Comparison' },
  { value: 'multi_session_comparison', label: 'Multi-Session Comparative Plot' },
];

export interface AnalyticalFiguresComparisonTabProps {
  experiment: Experiment;
  session: AnalyticalSession;
  activeCalDataset: CalibrationDataset | null;
  calibrationAnalysis: CalibrationDatasetAnalysis | null;
  qualityIssues: DetectedAnalyticalIssue[];
  onUpdateFigureConfig: (patch: Partial<AnalyticalFigureConfiguration>) => void;
  onSaveFigurePreset: (name?: string) => void;
  onLoadFigurePreset: (figureId: string) => void;
  onDeleteFigurePreset: (figureId: string) => void;
  onUpdateComparison: (patch: Partial<AnalyticalComparisonConfig>) => void;
}

export function AnalyticalFiguresComparisonTab({
  experiment,
  session,
  activeCalDataset,
  calibrationAnalysis,
  qualityIssues,
  onUpdateFigureConfig,
  onSaveFigurePreset,
  onLoadFigurePreset,
  onDeleteFigurePreset,
  onUpdateComparison,
}: AnalyticalFiguresComparisonTabProps) {
  const [presetName, setPresetName] = useState('');

  const selectedComparisonSessions = useMemo(() => {
    const ids = new Set(
      experiment.analyticalComparison?.selectedSessionIds ?? []
    );
    const matches = (experiment.analyticalSessions ?? []).filter((s) =>
      ids.has(s.id)
    );
    return matches.length > 0 ? matches : [session];
  }, [experiment.analyticalSessions, experiment.analyticalComparison, session]);

  const comparison = useMemo(
    () =>
      buildAnalyticalSessionComparison(
        experiment,
        selectedComparisonSessions,
        experiment.analyticalComparison?.compareAnalyteSymbol
      ),
    [experiment, selectedComparisonSessions]
  );

  const replicateGroups = useMemo(
    () => computeAnalyticalReplicateGroups(session.sampleMeasurements),
    [session.sampleMeasurements]
  );

  const toggleSessionInComparison = (sessionId: string) => {
    const current = new Set(
      experiment.analyticalComparison?.selectedSessionIds ?? []
    );
    if (current.has(sessionId)) {
      if (current.size > 1) current.delete(sessionId);
    } else {
      current.add(sessionId);
    }
    onUpdateComparison({ selectedSessionIds: Array.from(current) });
  };

  const handlePlotTypeChange = (nextType: AnalyticalFigurePlotType) => {
    const defaults = createDefaultAnalyticalFigureConfig(nextType, session.figureConfig.title);
    onUpdateFigureConfig({
      plotType: nextType,
      xAxisTitle: defaults.xAxisTitle,
      xAxisUnit:
        activeCalDataset &&
        (nextType === 'calibration_scatter' ||
          nextType === 'calibration_regression' ||
          nextType === 'residuals_vs_conc')
          ? activeCalDataset.concUnit
          : defaults.xAxisUnit,
      yAxisTitle: defaults.yAxisTitle,
      yAxisUnit:
        activeCalDataset &&
        (nextType === 'calibration_scatter' ||
          nextType === 'calibration_regression' ||
          nextType === 'residuals_vs_conc' ||
          nextType === 'residuals_vs_fitted')
          ? activeCalDataset.responseUnit
          : defaults.yAxisUnit,
    });
  };

  const cfg = session.figureConfig;

  return (
    <div className="space-y-4">
      {/* Analytical Figure Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel className="lg:col-span-5">
          <PanelHeader
            title="Analytical Figure Studio"
            subtitle="Publication-grade plot customization with standalone SVG & high-DPI PNG export."
          />
          <div className="p-4 space-y-3">
            <div>
              <FieldLabel>Plot Type</FieldLabel>
              <select
                value={cfg.plotType}
                onChange={(e) =>
                  handlePlotTypeChange(e.target.value as AnalyticalFigurePlotType)
                }
                className={inputBaseClass}
              >
                {PLOT_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel>Figure Title</FieldLabel>
              <input
                type="text"
                value={cfg.title}
                onChange={(e) => onUpdateFigureConfig({ title: e.target.value })}
                className={inputBaseClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>X-Axis Title</FieldLabel>
                <input
                  type="text"
                  value={cfg.xAxisTitle}
                  onChange={(e) =>
                    onUpdateFigureConfig({ xAxisTitle: e.target.value })
                  }
                  className={inputBaseClass}
                />
              </div>
              <div>
                <FieldLabel>X Unit</FieldLabel>
                <input
                  type="text"
                  value={cfg.xAxisUnit}
                  onChange={(e) =>
                    onUpdateFigureConfig({ xAxisUnit: e.target.value })
                  }
                  className={`${inputBaseClass} font-mono`}
                />
              </div>
              <div>
                <FieldLabel>Y-Axis Title</FieldLabel>
                <input
                  type="text"
                  value={cfg.yAxisTitle}
                  onChange={(e) =>
                    onUpdateFigureConfig({ yAxisTitle: e.target.value })
                  }
                  className={inputBaseClass}
                />
              </div>
              <div>
                <FieldLabel>Y Unit</FieldLabel>
                <input
                  type="text"
                  value={cfg.yAxisUnit}
                  onChange={(e) =>
                    onUpdateFigureConfig({ yAxisUnit: e.target.value })
                  }
                  className={`${inputBaseClass} font-mono`}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <FieldLabel>X Min</FieldLabel>
                <NumericInput
                  value={cfg.xMin}
                  onChange={(v) => onUpdateFigureConfig({ xMin: v })}
                  placeholder="Auto"
                />
              </div>
              <div>
                <FieldLabel>X Max</FieldLabel>
                <NumericInput
                  value={cfg.xMax}
                  onChange={(v) => onUpdateFigureConfig({ xMax: v })}
                  placeholder="Auto"
                />
              </div>
              <div>
                <FieldLabel>Y Min</FieldLabel>
                <NumericInput
                  value={cfg.yMin}
                  onChange={(v) => onUpdateFigureConfig({ yMin: v })}
                  placeholder="Auto"
                />
              </div>
              <div>
                <FieldLabel>Y Max</FieldLabel>
                <NumericInput
                  value={cfg.yMax}
                  onChange={(v) => onUpdateFigureConfig({ yMax: v })}
                  placeholder="Auto"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <FieldLabel>Tick Density</FieldLabel>
                <select
                  value={cfg.tickDensity}
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
                <FieldLabel>Line Style</FieldLabel>
                <select
                  value={cfg.lineStyle}
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
              <div>
                <FieldLabel>Legend</FieldLabel>
                <select
                  value={cfg.legendPosition}
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

            <div className="grid grid-cols-3 gap-2">
              <div>
                <FieldLabel>Export Scale</FieldLabel>
                <select
                  value={cfg.exportScale}
                  onChange={(e) =>
                    onUpdateFigureConfig({
                      exportScale: Number(e.target.value) as 1 | 2 | 3,
                    })
                  }
                  className={inputBaseClass}
                >
                  <option value={1}>1× (Screen)</option>
                  <option value={2}>2× (High DPI)</option>
                  <option value={3}>3× (Print)</option>
                </select>
              </div>
              <div>
                <FieldLabel>Accent Color</FieldLabel>
                <input
                  type="color"
                  value={cfg.primaryColor}
                  onChange={(e) =>
                    onUpdateFigureConfig({ primaryColor: e.target.value })
                  }
                  className="w-full h-8 p-1 bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]"
                />
              </div>
              <div className="flex flex-col justify-end gap-1 pb-0.5 text-[12px]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.showGridlines}
                    onChange={(e) =>
                      onUpdateFigureConfig({ showGridlines: e.target.checked })
                    }
                  />
                  Gridlines
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.grayscaleMode}
                    onChange={(e) =>
                      onUpdateFigureConfig({ grayscaleMode: e.target.checked })
                    }
                  />
                  Grayscale
                </label>
              </div>
            </div>

            {/* Saved Presets */}
            <div className="pt-3 border-t border-[#E5E7EB] space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name for A4 report..."
                  className={`${inputBaseClass} flex-1`}
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    onSaveFigurePreset(presetName);
                    setPresetName('');
                  }}
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  Save
                </Button>
              </div>
              {session.savedFigures.length > 0 && (
                <div className="space-y-1">
                  {session.savedFigures.map((fig) => {
                    const repro = evaluateFigureReproducibility(
                      experiment,
                      'analytical',
                      fig,
                      session.id
                    );
                    return (
                      <div
                        key={fig.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] text-[12px]"
                      >
                        <div className="min-w-0 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onLoadFigurePreset(fig.id)}
                            className="text-left font-medium text-[#111827] hover:text-[#0F52BA] truncate cursor-pointer"
                          >
                            {fig.name}
                          </button>
                          <span
                            title={repro.message}
                            className={`px-1 py-0.25 border text-[9.5px] font-mono shrink-0 ${
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
                        <button
                          type="button"
                          aria-label={`Delete preset ${fig.name}`}
                          onClick={() => onDeleteFigurePreset(fig.id)}
                          className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Panel>

        <div className="lg:col-span-7 space-y-4">
          <AnalyticalFigureCanvas
            session={session}
            calibrationDataset={activeCalDataset}
            calibrationAnalysis={calibrationAnalysis}
            config={cfg}
            comparison={comparison}
            height={420}
            filePrefix={`${experiment.experimentId}-${session.sessionId}`}
          />
        </div>
      </div>

      {/* Comparative Analytical Analysis */}
      <Panel>
        <PanelHeader
          title="Comparative Analytical Analysis Across Sessions"
          subtitle="Descriptive comparison of concentration distributions, calibration slopes/R², residuals, and open quality flags. Never ranks instruments or claims method equivalence."
        />
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase font-semibold text-[#6B7280]">
                Sessions:
              </span>
              {(experiment.analyticalSessions ?? []).map((s) => {
                const checked = selectedComparisonSessions.some(
                  (sel) => sel.id === s.id
                );
                return (
                  <label
                    key={s.id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] border text-[12px] cursor-pointer ${
                      checked
                        ? 'border-[#0F52BA] bg-[#EFF6FF]/40 text-[#111827] font-medium'
                        : 'border-[#E5E7EB] bg-white text-[#4B5563]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSessionInComparison(s.id)}
                    />
                    <span className="font-mono">{s.sessionId}</span> ({s.technique})
                  </label>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11.5px] text-[#6B7280]">Analyte Filter:</label>
              <input
                type="text"
                value={experiment.analyticalComparison?.compareAnalyteSymbol ?? ''}
                onChange={(e) =>
                  onUpdateComparison({ compareAnalyteSymbol: e.target.value })
                }
                placeholder="e.g. Pt"
                className="h-7 px-2 text-[12px] font-mono bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] w-24"
              />
            </div>
          </div>

          {comparison.warnings.length > 0 && (
            <div className="space-y-1.5">
              {comparison.warnings.map((w, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] text-[12px] text-[#92400E] flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto border border-[#E5E7EB] rounded-[6px]">
            <table className="w-full text-[12px] border-collapse">
              <thead className="bg-[#F8F9FA] border-b border-[#E5E7EB]">
                <tr className="text-left text-[10.5px] uppercase text-[#6B7280]">
                  <th className="px-3 py-2">Session</th>
                  <th className="px-3 py-2">Technique & Line</th>
                  <th className="px-3 py-2 text-right">n (Inc / Total)</th>
                  <th className="px-3 py-2 text-right">Mean ± SD</th>
                  <th className="px-3 py-2 text-right">Cal. R²</th>
                  <th className="px-3 py-2 text-right">Max |Residual|</th>
                  <th className="px-3 py-2 text-right">Open Issues</th>
                  <th className="px-3 py-2">Provenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {comparison.entries.map((entry) => (
                  <tr key={entry.sessionId}>
                    <td className="px-3 py-2">
                      <div className="font-mono font-semibold text-[#111827]">
                        {entry.sessionCode}
                      </div>
                      <div className="text-[11px] text-[#6B7280]">
                        {entry.instrumentLabel}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {entry.technique} ·{' '}
                      <span className="font-mono">
                        {entry.analyteSymbol}
                        {entry.wavelengthNm ? ` ${entry.wavelengthNm} nm` : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-right tabular-nums">
                      {entry.includedSampleCount} / {entry.sampleCount}
                    </td>
                    <td className="px-3 py-2 font-mono text-right tabular-nums">
                      {entry.concentrationStats.value.mean !== null
                        ? `${entry.concentrationStats.value.mean.toFixed(2)} ± ${
                            entry.concentrationStats.value.sampleStdDev !== null
                              ? entry.concentrationStats.value.sampleStdDev.toFixed(2)
                              : '—'
                          } ${entry.concUnit}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-right tabular-nums">
                      {entry.calibrationR2 !== null
                        ? entry.calibrationR2.toFixed(6)
                        : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-right tabular-nums">
                      {entry.calibrationResidualMaxAbs !== null
                        ? entry.calibrationResidualMaxAbs.toFixed(2)
                        : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-right tabular-nums">
                      {entry.openQualityIssues}
                    </td>
                    <td className="px-3 py-2">
                      <ProvenanceIndicator provenance={entry.provenance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      {/* Comprehensive Analytical Export Center */}
      <Panel>
        <PanelHeader
          title="Traceable Analytical Data Exports"
          subtitle="All exports preserve internal UUIDs, explicit units, provenance tags, exclusion reasons, scientific review status, and synthetic fixture flags."
        />
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <Button
            variant="secondary"
            className="justify-start"
            onClick={() =>
              triggerFileDownload(
                exportAnalyticalSessionSamplesCsv(
                  { experimentId: experiment.experimentId },
                  session
                ),
                `${experiment.experimentId}-${session.sessionId}-samples.csv`,
                'text/csv;charset=utf-8'
              )
            }
          >
            <Download className="w-3.5 h-3.5 text-[#0F52BA]" />
            Raw Sample Measurements (CSV)
          </Button>

          <Button
            variant="secondary"
            className="justify-start"
            disabled={!activeCalDataset}
            onClick={() =>
              activeCalDataset &&
              triggerFileDownload(
                exportCalibrationDatasetCsv(
                  { experimentId: experiment.experimentId },
                  session,
                  activeCalDataset
                ),
                `${experiment.experimentId}-${activeCalDataset.calibrationId}-standards.csv`,
                'text/csv;charset=utf-8'
              )
            }
          >
            <Download className="w-3.5 h-3.5 text-[#0F52BA]" />
            Calibration Standards (CSV)
          </Button>

          <Button
            variant="secondary"
            className="justify-start"
            disabled={!activeCalDataset || !calibrationAnalysis}
            onClick={() =>
              activeCalDataset &&
              calibrationAnalysis &&
              triggerFileDownload(
                exportExploratoryRegressionSummaryCsv(
                  experiment.experimentId,
                  session,
                  activeCalDataset,
                  calibrationAnalysis
                ),
                `${experiment.experimentId}-${activeCalDataset.calibrationId}-regression.csv`,
                'text/csv;charset=utf-8'
              )
            }
          >
            <Download className="w-3.5 h-3.5 text-[#0F52BA]" />
            Exploratory Regression Summary (CSV)
          </Button>

          <Button
            variant="secondary"
            className="justify-start"
            disabled={!activeCalDataset || !calibrationAnalysis}
            onClick={() =>
              activeCalDataset &&
              calibrationAnalysis &&
              triggerFileDownload(
                exportRegressionResidualsCsv(
                  experiment.experimentId,
                  session,
                  activeCalDataset,
                  calibrationAnalysis
                ),
                `${experiment.experimentId}-${activeCalDataset.calibrationId}-residuals.csv`,
                'text/csv;charset=utf-8'
              )
            }
          >
            <Download className="w-3.5 h-3.5 text-[#0F52BA]" />
            Regression Residuals (CSV)
          </Button>

          <Button
            variant="secondary"
            className="justify-start"
            onClick={() =>
              triggerFileDownload(
                exportAnalyticalReplicateStatsCsv(
                  experiment.experimentId,
                  session,
                  replicateGroups
                ),
                `${experiment.experimentId}-${session.sessionId}-replicates.csv`,
                'text/csv;charset=utf-8'
              )
            }
          >
            <Download className="w-3.5 h-3.5 text-[#0F52BA]" />
            Replicate Statistics (CSV)
          </Button>

          <Button
            variant="secondary"
            className="justify-start"
            onClick={() =>
              triggerFileDownload(
                exportDilutionRecordsCsv(experiment.experimentId, session),
                `${experiment.experimentId}-${session.sessionId}-dilutions.csv`,
                'text/csv;charset=utf-8'
              )
            }
          >
            <Download className="w-3.5 h-3.5 text-[#0F52BA]" />
            Dilution Metadata Records (CSV)
          </Button>

          <Button
            variant="secondary"
            className="justify-start"
            onClick={() =>
              triggerFileDownload(
                exportQualityReviewCsv(
                  experiment.experimentId,
                  session,
                  qualityIssues
                ),
                `${experiment.experimentId}-${session.sessionId}-quality-review.csv`,
                'text/csv;charset=utf-8'
              )
            }
          >
            <Download className="w-3.5 h-3.5 text-[#0F52BA]" />
            Quality Review Findings (CSV)
          </Button>

          <Button
            variant="secondary"
            className="justify-start"
            onClick={() =>
              triggerFileDownload(
                exportMeasurementLinkageCsv(experiment),
                `${experiment.experimentId}-measurement-linkage.csv`,
                'text/csv;charset=utf-8'
              )
            }
          >
            <Download className="w-3.5 h-3.5 text-[#0F52BA]" />
            Survey–Analytical Linkage (CSV)
          </Button>

          <Button
            variant="secondary"
            className="justify-start"
            onClick={() =>
              triggerFileDownload(
                serializeAnalyticalSessionJson(experiment, session),
                `${experiment.experimentId}-${session.sessionId}.json`,
                'application/json;charset=utf-8'
              )
            }
          >
            <FileJson className="w-3.5 h-3.5 text-[#0F52BA]" />
            Full Analytical Session (JSON)
          </Button>
        </div>
      </Panel>
    </div>
  );
}
