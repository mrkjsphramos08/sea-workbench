'use client';

import React, { useMemo, useState } from 'react';
import {
  Copy,
  Download,
  Plus,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AnalyticalFigurePlotType,
  AnalyticalSession,
  CalibrationDataset,
  CalibrationStandard,
  DataProvenance,
  MeasurementQualityStatus,
} from '../../domain/models/types';
import {
  CalibrationDatasetAnalysis,
  createDefaultAnalyticalFigureConfig,
} from '../../domain/calculations/seaMath';
import { importCalibrationStandardsCsv } from '../../services/import-export/analyticalImport';
import {
  exportCalibrationDatasetCsv,
  exportExploratoryRegressionSummaryCsv,
  exportRegressionResidualsCsv,
  triggerFileDownload,
} from '../../services/import-export/backup';
import { generateUuid } from '../../data/demo/demoWorkspace';
import { AnalyticalFigureCanvas } from '../../components/charts/AnalyticalFigureCanvas';
import {
  Button,
  ConfirmDialog,
  FieldLabel,
  Modal,
  NumericInput,
  Panel,
  PanelHeader,
  ProvenanceIndicator,
  compactCellInputClass,
  inputBaseClass,
} from '../../components/ui/Primitives';

export interface CalibrationRegressionTabProps {
  experimentId: string;
  session: AnalyticalSession;
  activeCalDataset: CalibrationDataset | null;
  calibrationAnalysis: CalibrationDatasetAnalysis | null;
  onSelectCalDataset: (calId: string) => void;
  onCreateCalDataset: (input: {
    calibrationId?: string;
    title: string;
    analyteId: string | null;
    concUnit: string;
    responseUnit: string;
    referenceMethod?: string;
  }) => void;
  onDuplicateCalDataset: (calId: string) => void;
  onUpdateCalDatasetMeta: (
    calId: string,
    patch: Partial<
      Pick<
        CalibrationDataset,
        | 'calibrationId'
        | 'title'
        | 'analyteId'
        | 'referenceMethod'
        | 'concUnit'
        | 'responseUnit'
        | 'analyst'
        | 'analysisDate'
        | 'provenance'
        | 'notes'
      >
    >
  ) => void;
  onDeleteCalDataset: (calId: string) => void;
  onAddStandard: (calId: string, initial?: Partial<CalibrationStandard>) => void;
  onAddStandardsBulk: (calId: string, standards: CalibrationStandard[]) => void;
  onUpdateStandard: (
    calId: string,
    stdId: string,
    patch: Partial<CalibrationStandard>
  ) => void;
  onDeleteStandard: (calId: string, stdId: string) => void;
}

function fmtNum(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return Math.abs(v) >= 1e5 || (Math.abs(v) > 0 && Math.abs(v) < 1e-3)
    ? v.toExponential(3)
    : v.toFixed(digits);
}

export function CalibrationRegressionTab({
  experimentId,
  session,
  activeCalDataset,
  calibrationAnalysis,
  onSelectCalDataset,
  onCreateCalDataset,
  onDuplicateCalDataset,
  onUpdateCalDatasetMeta,
  onDeleteCalDataset,
  onAddStandard,
  onAddStandardsBulk,
  onUpdateStandard,
  onDeleteStandard,
}: CalibrationRegressionTabProps) {
  const [plotView, setPlotView] = useState<AnalyticalFigurePlotType>(
    'calibration_regression'
  );
  const [highlightedStdId, setHighlightedStdId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [newCalTitle, setNewCalTitle] = useState('');
  const [newCalAnalyteId, setNewCalAnalyteId] = useState<string>(
    session.activeAnalyteId ?? ''
  );
  const [newCalConcUnit, setNewCalConcUnit] = useState('ppm');
  const [newCalRespUnit, setNewCalRespUnit] = useState(
    session.technique.includes('AAS') ? 'Abs' : 'cps'
  );
  const [importOpen, setImportOpen] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const visibleStandards = useMemo(() => {
    if (!activeCalDataset) return [];
    return activeCalDataset.standards.filter((s) =>
      filterStatus === 'all' ? true : s.qualityStatus === filterStatus
    );
  }, [activeCalDataset, filterStatus]);

  const activePlotConfig = useMemo(() => {
    const base = createDefaultAnalyticalFigureConfig(
      plotView,
      activeCalDataset
        ? `${activeCalDataset.calibrationId} — ${activeCalDataset.title}`
        : 'Calibration Exploratory Plot'
    );
    if (activeCalDataset) {
      base.xAxisUnit =
        plotView === 'residuals_vs_fitted'
          ? activeCalDataset.responseUnit
          : activeCalDataset.concUnit;
      base.yAxisUnit = activeCalDataset.responseUnit;
    }
    return base;
  }, [plotView, activeCalDataset]);

  const handleCreateCal = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateCalDataset({
      title: newCalTitle.trim() || 'Calibration Series',
      analyteId: newCalAnalyteId || null,
      concUnit: newCalConcUnit.trim() || 'ppm',
      responseUnit: newCalRespUnit.trim() || 'cps',
    });
    setNewCalTitle('');
    setCreateOpen(false);
  };

  const handleImportCalibrationCsv = () => {
    if (!activeCalDataset || !importCsvText.trim()) return;
    const res = importCalibrationStandardsCsv(importCsvText, {
      analyteId: activeCalDataset.analyteId,
      concUnit: activeCalDataset.concUnit,
      responseUnit: activeCalDataset.responseUnit,
      provenance: 'measured_experimental',
      idGenerator: generateUuid,
    });
    if (res.standards.length > 0) {
      onAddStandardsBulk(activeCalDataset.id, res.standards);
    }
    setImportCsvText('');
    setImportOpen(false);
  };

  const reg = calibrationAnalysis?.regression;
  const regData = reg?.value;

  return (
    <div className="space-y-4">
      {/* Calibration Dataset Selector Bar */}
      <Panel>
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-[#6B7280]">
              Calibration Dataset
            </span>
            <select
              aria-label="Active calibration dataset"
              value={activeCalDataset?.id ?? ''}
              onChange={(e) => onSelectCalDataset(e.target.value)}
              className="h-8 px-2.5 text-[12.5px] font-medium bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] min-w-[240px]"
            >
              {session.calibrationDatasets.map((c) => {
                const an = session.analytes.find((a) => a.id === c.analyteId);
                return (
                  <option key={c.id} value={c.id}>
                    {c.calibrationId} · {an?.symbol || 'General'} — {c.title} (
                    {c.standards.length} pts)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5" />
              New Calibration
            </Button>
            {activeCalDataset && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onDuplicateCalDataset(activeCalDataset.id)}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setImportOpen(true)}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import CSV
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    triggerFileDownload(
                      exportCalibrationDatasetCsv(
                        { experimentId },
                        session,
                        activeCalDataset
                      ),
                      `${experimentId}-${activeCalDataset.calibrationId}-standards.csv`,
                      'text/csv;charset=utf-8'
                    )
                  }
                >
                  <Download className="w-3.5 h-3.5" />
                  Standards CSV
                </Button>
                {session.calibrationDatasets.length > 1 && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleteTargetId(activeCalDataset.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {activeCalDataset && (
          <div className="px-4 py-3 border-t border-[#E5E7EB] bg-[#F8F9FA] grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <FieldLabel>Calibration ID</FieldLabel>
              <input
                type="text"
                value={activeCalDataset.calibrationId}
                onChange={(e) =>
                  onUpdateCalDatasetMeta(activeCalDataset.id, {
                    calibrationId: e.target.value,
                  })
                }
                className={`${inputBaseClass} font-mono bg-white`}
              />
            </div>
            <div>
              <FieldLabel>Associated Analyte</FieldLabel>
              <select
                value={activeCalDataset.analyteId ?? ''}
                onChange={(e) =>
                  onUpdateCalDatasetMeta(activeCalDataset.id, {
                    analyteId: e.target.value || null,
                  })
                }
                className={`${inputBaseClass} bg-white`}
              >
                <option value="">— Unassigned —</option>
                {session.analytes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol || a.name}
                    {a.wavelengthNm ? ` (${a.wavelengthNm} nm)` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Conc Unit</FieldLabel>
              <input
                type="text"
                value={activeCalDataset.concUnit}
                onChange={(e) =>
                  onUpdateCalDatasetMeta(activeCalDataset.id, {
                    concUnit: e.target.value,
                  })
                }
                className={`${inputBaseClass} font-mono bg-white`}
              />
            </div>
            <div>
              <FieldLabel>Response Unit</FieldLabel>
              <input
                type="text"
                value={activeCalDataset.responseUnit}
                onChange={(e) =>
                  onUpdateCalDatasetMeta(activeCalDataset.id, {
                    responseUnit: e.target.value,
                  })
                }
                className={`${inputBaseClass} font-mono bg-white`}
              />
            </div>
            <div>
              <FieldLabel>Reference Method</FieldLabel>
              <input
                type="text"
                value={activeCalDataset.referenceMethod}
                onChange={(e) =>
                  onUpdateCalDatasetMeta(activeCalDataset.id, {
                    referenceMethod: e.target.value,
                  })
                }
                placeholder="Optional ref"
                className={`${inputBaseClass} bg-white`}
              />
            </div>
          </div>
        )}
      </Panel>

      {/* Exploratory Regression Notice & Metrics */}
      {activeCalDataset && calibrationAnalysis && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center bg-[#F3F4F6] p-0.5 rounded-[6px] border border-[#E5E7EB]">
                {(
                  [
                    ['calibration_regression', 'Calibration Fit'],
                    ['residuals_vs_conc', 'Residuals vs. Conc'],
                    ['residuals_vs_fitted', 'Residuals vs. Fitted'],
                    ['replicate_response', 'Replicate Levels'],
                  ] as Array<[AnalyticalFigurePlotType, string]>
                ).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPlotView(type)}
                    className={`px-2.5 py-1 text-[11.5px] font-medium rounded-[4px] transition-colors cursor-pointer ${
                      plotView === type
                        ? 'bg-white text-[#111827] border border-[#E5E7EB]'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {reg?.status === 'available' && (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      triggerFileDownload(
                        exportExploratoryRegressionSummaryCsv(
                          experimentId,
                          session,
                          activeCalDataset,
                          calibrationAnalysis
                        ),
                        `${experimentId}-${activeCalDataset.calibrationId}-regression.csv`,
                        'text/csv;charset=utf-8'
                      )
                    }
                  >
                    <Download className="w-3.5 h-3.5" />
                    Regression CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      triggerFileDownload(
                        exportRegressionResidualsCsv(
                          experimentId,
                          session,
                          activeCalDataset,
                          calibrationAnalysis
                        ),
                        `${experimentId}-${activeCalDataset.calibrationId}-residuals.csv`,
                        'text/csv;charset=utf-8'
                      )
                    }
                  >
                    <Download className="w-3.5 h-3.5" />
                    Residuals CSV
                  </Button>
                </div>
              )}
            </div>

            <AnalyticalFigureCanvas
              session={session}
              calibrationDataset={activeCalDataset}
              calibrationAnalysis={calibrationAnalysis}
              config={activePlotConfig}
              height={340}
              filePrefix={`${experimentId}-${activeCalDataset.calibrationId}`}
              onSelectPointId={setHighlightedStdId}
            />
          </div>

          <div className="lg:col-span-5 space-y-3">
            <Panel>
              <PanelHeader
                title="Exploratory Linear Regression (OLS)"
                subtitle="Exploratory Numerical Analysis — Not Analytical Method Validation"
              />
              <div className="p-4 space-y-3">
                {reg?.status !== 'available' ||
                !regData ||
                regData.slope === null ||
                regData.intercept === null ? (
                  <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] text-[12px] text-[#92400E]">
                    <div className="font-semibold mb-1">
                      Regression Guardrail Active ({reg?.status ?? 'missing_inputs'})
                    </div>
                    <p>
                      {reg?.validationMessages.join(' ') ||
                        'Requires at least 2 included standards with distinct nominal concentrations.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="p-2.5 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] font-mono text-[12.5px] text-[#111827]">
                      ŷ = {fmtNum(regData.slope, 4)}·x{' '}
                      {regData.intercept >= 0 ? '+' : '−'}{' '}
                      {fmtNum(Math.abs(regData.intercept), 4)}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                      <div className="p-2 border border-[#E5E7EB] rounded-[6px]">
                        <div className="text-[10.5px] uppercase text-[#6B7280]">Slope</div>
                        <div className="font-mono font-semibold tabular-nums">
                          {fmtNum(regData.slope, 4)}
                        </div>
                      </div>
                      <div className="p-2 border border-[#E5E7EB] rounded-[6px]">
                        <div className="text-[10.5px] uppercase text-[#6B7280]">
                          Free Intercept
                        </div>
                        <div className="font-mono font-semibold tabular-nums">
                          {fmtNum(regData.intercept, 4)}
                        </div>
                      </div>
                      <div className="p-2 border border-[#E5E7EB] rounded-[6px]">
                        <div className="text-[10.5px] uppercase text-[#6B7280]">R²</div>
                        <div className="font-mono font-semibold tabular-nums">
                          {regData.rSquared !== null ? regData.rSquared.toFixed(6) : '—'}
                        </div>
                      </div>
                      <div className="p-2 border border-[#E5E7EB] rounded-[6px]">
                        <div className="text-[10.5px] uppercase text-[#6B7280]">SEE</div>
                        <div className="font-mono font-semibold tabular-nums">
                          {fmtNum(regData.standardErrorOfEstimate, 4)}
                        </div>
                      </div>
                      <div className="p-2 border border-[#E5E7EB] rounded-[6px]">
                        <div className="text-[10.5px] uppercase text-[#6B7280]">RSS</div>
                        <div className="font-mono font-semibold tabular-nums">
                          {fmtNum(regData.rss, 4)}
                        </div>
                      </div>
                      <div className="p-2 border border-[#E5E7EB] rounded-[6px]">
                        <div className="text-[10.5px] uppercase text-[#6B7280]">
                          Points (Inc / Exc / Miss)
                        </div>
                        <div className="font-mono font-semibold tabular-nums">
                          {calibrationAnalysis.includedCount} /{' '}
                          {calibrationAnalysis.excludedCount} /{' '}
                          {calibrationAnalysis.missingCount}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] text-[11.5px] text-[#92400E] space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Pending Scientific Review Boundaries
                  </div>
                  <p>
                    Method LOD/LOQ, blank-variance limits, matrix spike recovery, and regulatory calibration acceptance criteria are intentionally disabled pending independent analytical validation.
                  </p>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* Calibration Standards Table */}
      {activeCalDataset && (
        <Panel>
          <PanelHeader
            title={`Calibration Standards — ${activeCalDataset.calibrationId}`}
            subtitle="Explicitly excluded standards remain visible with documented exclusion reasons and are omitted from exploratory OLS regression."
            actions={
              <div className="flex items-center gap-2">
                <select
                  aria-label="Filter standards by quality status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="h-7 px-2 text-[12px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]"
                >
                  <option value="all">All Statuses</option>
                  <option value="valid">Valid</option>
                  <option value="flagged">Flagged</option>
                  <option value="excluded_by_user">Excluded</option>
                </select>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onAddStandard(activeCalDataset.id)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Standard
                </Button>
              </div>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead className="bg-[#F8F9FA] border-b border-[#E5E7EB]">
                <tr className="text-left text-[10.5px] uppercase tracking-[0.04em] text-[#6B7280]">
                  <th className="px-3 py-2">Standard ID</th>
                  <th className="px-2 py-2 text-center">Blank</th>
                  <th className="px-2 py-2 text-right">Rep</th>
                  <th className="px-2 py-2 text-right">
                    Nominal ({activeCalDataset.concUnit})
                  </th>
                  <th className="px-2 py-2 text-right">
                    Response ({activeCalDataset.responseUnit})
                  </th>
                  <th className="px-2 py-2 text-right">Residual (y−ŷ)</th>
                  <th className="px-2 py-2">Quality</th>
                  <th className="px-2 py-2">Exclusion Reason / Notes</th>
                  <th className="px-2 py-2">Provenance</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {visibleStandards.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-6 text-center text-[#6B7280]"
                    >
                      No calibration standards match this filter. Click &ldquo;Add Standard&rdquo; or &ldquo;Import CSV&rdquo; to record calibration data.
                    </td>
                  </tr>
                ) : (
                  visibleStandards.map((std) => {
                    const diag = calibrationAnalysis?.diagnosticPoints.find(
                      (p) => p.id === std.id
                    );
                    const isHighlighted = highlightedStdId === std.id;
                    const isExcluded = std.qualityStatus === 'excluded_by_user';
                    return (
                      <tr
                        key={std.id}
                        className={
                          isHighlighted
                            ? 'bg-[#EFF6FF]'
                            : isExcluded
                              ? 'bg-[#F9FAFB] opacity-75'
                              : 'hover:bg-[#F8F9FA]'
                        }
                      >
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={std.standardId}
                            onChange={(e) =>
                              onUpdateStandard(activeCalDataset.id, std.id, {
                                standardId: e.target.value,
                              })
                            }
                            className={`${compactCellInputClass} font-mono font-medium`}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Blank flag for ${std.standardId}`}
                            checked={Boolean(std.isBlank || std.nominalConc === 0)}
                            onChange={(e) =>
                              onUpdateStandard(activeCalDataset.id, std.id, {
                                isBlank: e.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 w-16">
                          <NumericInput
                            compact
                            min={1}
                            value={std.replicateNumber}
                            onChange={(v) =>
                              onUpdateStandard(activeCalDataset.id, std.id, {
                                replicateNumber: v ? Math.max(1, Math.round(v)) : 1,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 w-28">
                          <NumericInput
                            compact
                            value={std.nominalConc}
                            onChange={(v) =>
                              onUpdateStandard(activeCalDataset.id, std.id, {
                                nominalConc: v,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 w-32">
                          <NumericInput
                            compact
                            value={std.instrumentResponse}
                            onChange={(v) =>
                              onUpdateStandard(activeCalDataset.id, std.id, {
                                instrumentResponse: v,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-right tabular-nums text-[#4B5563]">
                          {diag ? fmtNum(diag.residual, 2) : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={std.qualityStatus}
                            onChange={(e) =>
                              onUpdateStandard(activeCalDataset.id, std.id, {
                                qualityStatus: e.target
                                  .value as MeasurementQualityStatus,
                              })
                            }
                            className="h-7 px-1.5 text-[11.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px]"
                          >
                            <option value="valid">Valid</option>
                            <option value="flagged">Flagged</option>
                            <option value="excluded_by_user">Excluded</option>
                            <option value="pending">Pending</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 min-w-[200px]">
                          <input
                            type="text"
                            value={
                              isExcluded
                                ? std.exclusionReason ?? ''
                                : std.notes
                            }
                            placeholder={
                              isExcluded
                                ? 'Document reason for exclusion...'
                                : 'Standard notes...'
                            }
                            onChange={(e) =>
                              onUpdateStandard(
                                activeCalDataset.id,
                                std.id,
                                isExcluded
                                  ? { exclusionReason: e.target.value }
                                  : { notes: e.target.value }
                              )
                            }
                            className={compactCellInputClass}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <ProvenanceIndicator provenance={std.provenance} />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            aria-label={`Delete standard ${std.standardId}`}
                            onClick={() =>
                              onDeleteStandard(activeCalDataset.id, std.id)
                            }
                            className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Replicate Level Summary Table */}
      {calibrationAnalysis && calibrationAnalysis.replicateLevels.length > 0 && (
        <Panel>
          <PanelHeader
            title="Calibration Replicate Level Statistics"
            subtitle="Grouped by nominal standard concentration using shared descriptive statistics (excluded points omitted)."
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead className="bg-[#F8F9FA] border-b border-[#E5E7EB]">
                <tr className="text-left text-[10.5px] uppercase text-[#6B7280]">
                  <th className="px-3 py-2">Nominal Level</th>
                  <th className="px-3 py-2 text-right">Included / Total</th>
                  <th className="px-3 py-2 text-right">Mean Response</th>
                  <th className="px-3 py-2 text-right">Sample SD</th>
                  <th className="px-3 py-2 text-right">RSD (%)</th>
                  <th className="px-3 py-2">Standards</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6] font-mono tabular-nums">
                {calibrationAnalysis.replicateLevels.map((lvl) => (
                  <tr key={lvl.levelKey}>
                    <td className="px-3 py-1.5 font-medium text-[#111827]">
                      {lvl.nominalConc} {lvl.unit}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {lvl.includedCount} / {lvl.totalCount}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {fmtNum(lvl.responseStats.value.mean, 2)} {lvl.responseUnit}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {fmtNum(lvl.responseStats.value.sampleStdDev, 2)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {lvl.responseStats.value.rsdPercent !== null
                        ? `${lvl.responseStats.value.rsdPercent.toFixed(2)}%`
                        : '—'}
                    </td>
                    <td className="px-3 py-1.5 font-sans text-[#4B5563]">
                      {lvl.standardIds.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Create New Calibration Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Calibration Dataset"
        description="Create an independent calibration record linked to an analyte in this analytical session."
      >
        <form onSubmit={handleCreateCal} className="space-y-3">
          <div>
            <FieldLabel required>Calibration Title</FieldLabel>
            <input
              type="text"
              required
              value={newCalTitle}
              onChange={(e) => setNewCalTitle(e.target.value)}
              placeholder="e.g. Pt 214.423 nm Afternoon Re-Calibration"
              className={inputBaseClass}
            />
          </div>
          <div>
            <FieldLabel>Analyte</FieldLabel>
            <select
              value={newCalAnalyteId}
              onChange={(e) => setNewCalAnalyteId(e.target.value)}
              className={inputBaseClass}
            >
              <option value="">— General / Unassigned —</option>
              {session.analytes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol || a.name}
                  {a.wavelengthNm ? ` (${a.wavelengthNm} nm)` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Concentration Unit</FieldLabel>
              <input
                type="text"
                value={newCalConcUnit}
                onChange={(e) => setNewCalConcUnit(e.target.value)}
                className={`${inputBaseClass} font-mono`}
              />
            </div>
            <div>
              <FieldLabel>Response Unit</FieldLabel>
              <input
                type="text"
                value={newCalRespUnit}
                onChange={(e) => setNewCalRespUnit(e.target.value)}
                className={`${inputBaseClass} font-mono`}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Calibration
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Calibration CSV Modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Recorded Calibration Standards (CSV / TSV)"
        description="Paste columns such as Standard_ID, Nominal_Conc, Unit, Response, Response_Unit, Replicate, Notes."
      >
        <div className="space-y-3">
          <textarea
            rows={6}
            value={importCsvText}
            onChange={(e) => setImportCsvText(e.target.value)}
            placeholder={'Standard_ID,Nominal_Conc,Unit,Response,Response_Unit,Replicate\nSTD-00,0,ppm,110,cps,1\nSTD-10,10,ppm,36400,cps,1\nSTD-25,25,ppm,91200,cps,1'}
            className="w-full p-2.5 text-[12px] font-mono bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!importCsvText.trim()}
              onClick={handleImportCalibrationCsv}
            >
              Import Standards
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="Delete Calibration Dataset"
        message="Delete this calibration dataset and its recorded standards? Existing sample measurements will retain their recorded concentrations but lose this calibration reference."
        confirmLabel="Delete Calibration"
        onConfirm={() => {
          if (deleteTargetId) onDeleteCalDataset(deleteTargetId);
          setDeleteTargetId(null);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
