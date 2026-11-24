'use client';

import React, { useMemo } from 'react';
import { AlertTriangle, Download, Lock, Plus, Trash2 } from 'lucide-react';
import {
  AnalyticalConfiguration,
  CalibrationStandard,
  DataProvenance,
  Experiment,
  InstrumentMeasurement,
  InstrumentType,
  MeasurementQualityStatus,
  SampleStage,
} from '../../domain/models/types';
import {
  evaluateAnalyticalBoundary,
  formatWithScientificNotation,
} from '../../domain/calculations/seaMath';
import {
  exportCalibrationStandardsCsv,
  exportInstrumentMeasurementsCsv,
  triggerFileDownload,
} from '../../services/import-export/backup';
import { CalibrationRegressionChart } from '../../components/charts/CalibrationRegressionChart';
import {
  Button,
  FieldLabel,
  NumericInput,
  Panel,
  PanelHeader,
  WorkspaceHeader,
  compactCellInputClass,
  inputBaseClass,
} from '../../components/ui/Primitives';

const INSTRUMENT_TYPES: InstrumentType[] = [
  'ICP-OES',
  'AAS',
  'ICP-MS',
  'UV-Vis',
  'Other',
];

const STAGES: SampleStage[] = ['Initial', 'Final', 'Blank', 'Control'];

const PROVENANCES: { value: DataProvenance; label: string }[] = [
  { value: 'measured_experimental', label: 'Measured' },
  { value: 'user_entered', label: 'User Entered' },
  { value: 'synthetic_demo', label: 'Synthetic Demo' },
  { value: 'unavailable', label: 'Unavailable' },
];

const QUALITY_OPTIONS: { value: MeasurementQualityStatus; label: string }[] = [
  { value: 'valid', label: 'Valid' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'excluded_by_user', label: 'Excluded' },
];

export function DilutionStandardsWorkspace({
  experiment,
  onUpdateConfig,
  onAddStandard,
  onUpdateStandard,
  onDeleteStandard,
  onAddSample,
  onUpdateSample,
  onDeleteSample,
}: {
  experiment: Experiment;
  onUpdateConfig: (patch: Partial<AnalyticalConfiguration>) => void;
  onAddStandard: () => void;
  onUpdateStandard: (stdId: string, patch: Partial<CalibrationStandard>) => void;
  onDeleteStandard: (stdId: string) => void;
  onAddSample: (stage?: SampleStage) => void;
  onUpdateSample: (rowId: string, patch: Partial<InstrumentMeasurement>) => void;
  onDeleteSample: (rowId: string) => void;
}) {
  const { analyticalConfig, calibrationStandards, instrumentMeasurements } =
    experiment;

  const boundary = useMemo(
    () =>
      evaluateAnalyticalBoundary(
        calibrationStandards,
        instrumentMeasurements,
        analyticalConfig
      ),
    [calibrationStandards, instrumentMeasurements, analyticalConfig]
  );

  const reg = boundary.calibrationRegression;
  const regData = reg.value;
  const xUnit =
    calibrationStandards[0]?.unit || analyticalConfig.calibrationUnits || 'ppm';
  const yUnit = calibrationStandards[0]?.responseUnit || 'cps';

  const handleExportCalibrationCsv = () => {
    const csv = exportCalibrationStandardsCsv(experiment, calibrationStandards);
    triggerFileDownload(
      csv,
      `${experiment.experimentId}-calibration-standards.csv`,
      'text/csv;charset=utf-8'
    );
  };

  const handleExportSamplesCsv = () => {
    const csv = exportInstrumentMeasurementsCsv(
      experiment,
      instrumentMeasurements
    );
    triggerFileDownload(
      csv,
      `${experiment.experimentId}-analytical-samples.csv`,
      'text/csv;charset=utf-8'
    );
  };

  return (
    <div className="space-y-5">
      <WorkspaceHeader
        title="Dilution & Standards"
        description="ICP-OES and AAS analytical configuration, calibration standard records, exploratory OLS regression diagnostics, and traceable sample aliquot logs."
        metadata={
          <>
            <span>
              Instrument:{' '}
              <strong className="font-mono text-[#111827]">
                {analyticalConfig.instrumentType}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Analyte:{' '}
              <strong className="font-mono text-[#0F52BA]">
                {analyticalConfig.analyteElement || 'Unspecified'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Valid Standards:{' '}
              <span className="font-mono tabular-nums">
                {boundary.validCalibrationPoints}/{boundary.calibrationPointCount}
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Sample Aliquots:{' '}
              <span className="font-mono tabular-nums">
                {instrumentMeasurements.length}
              </span>
            </span>
          </>
        }
      />

      {/* Subsection 1: Analytical Configuration */}
      <Panel>
        <PanelHeader
          title="1. Analytical Configuration"
          subtitle="Instrument parameters, analytical line, matrix notes, and analyst attribution."
        />
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div>
            <FieldLabel htmlFor="ana-instrument">Instrument Type</FieldLabel>
            <select
              id="ana-instrument"
              value={analyticalConfig.instrumentType}
              onChange={(e) =>
                onUpdateConfig({
                  instrumentType: e.target.value as InstrumentType,
                })
              }
              className={inputBaseClass}
            >
              {INSTRUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="ana-model">Instrument Model / ID</FieldLabel>
            <input
              id="ana-model"
              type="text"
              value={analyticalConfig.instrumentModel}
              onChange={(e) =>
                onUpdateConfig({ instrumentModel: e.target.value })
              }
              placeholder="e.g., Radial ICP-OES #2"
              className={inputBaseClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ana-element">Analyte Element</FieldLabel>
            <input
              id="ana-element"
              type="text"
              value={analyticalConfig.analyteElement}
              onChange={(e) =>
                onUpdateConfig({ analyteElement: e.target.value })
              }
              placeholder="e.g., Pt, Pd, Cu"
              className={`${inputBaseClass} font-mono`}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ana-wavelength">
              Emission / Absorption Line
            </FieldLabel>
            <NumericInput
              id="ana-wavelength"
              value={analyticalConfig.wavelengthNm}
              onChange={(v) => onUpdateConfig({ wavelengthNm: v })}
              unit="nm"
              min={0}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ana-matrix">Matrix Description</FieldLabel>
            <input
              id="ana-matrix"
              type="text"
              value={analyticalConfig.matrixDescription}
              onChange={(e) =>
                onUpdateConfig({ matrixDescription: e.target.value })
              }
              placeholder="Record matrix background note"
              className={inputBaseClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ana-units">Calibration Units</FieldLabel>
            <input
              id="ana-units"
              type="text"
              value={analyticalConfig.calibrationUnits}
              onChange={(e) =>
                onUpdateConfig({ calibrationUnits: e.target.value })
              }
              className={`${inputBaseClass} font-mono`}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ana-analyst">Analyst</FieldLabel>
            <input
              id="ana-analyst"
              type="text"
              value={analyticalConfig.analystName}
              onChange={(e) => onUpdateConfig({ analystName: e.target.value })}
              className={inputBaseClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ana-date">Analysis Date</FieldLabel>
            <input
              id="ana-date"
              type="date"
              value={analyticalConfig.analysisDate}
              onChange={(e) => onUpdateConfig({ analysisDate: e.target.value })}
              className={`${inputBaseClass} font-mono`}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <FieldLabel htmlFor="ana-notes">Analytical Notes</FieldLabel>
            <input
              id="ana-notes"
              type="text"
              value={analyticalConfig.notes}
              onChange={(e) => onUpdateConfig({ notes: e.target.value })}
              placeholder="Instrument drift notes, internal standard remarks, or run sequence reference..."
              className={inputBaseClass}
            />
          </div>
        </div>
      </Panel>

      {/* Subsection 2: Calibration Standards */}
      <Panel>
        <PanelHeader
          title="2. Calibration Standards"
          subtitle="Record nominal standard concentrations and raw instrument responses. Rows marked Excluded remain archived but are omitted from the exploratory OLS regression."
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportCalibrationCsv}
                disabled={calibrationStandards.length === 0}
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                Export CSV
              </Button>
              <Button variant="primary" size="sm" onClick={onAddStandard}>
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                Add Standard
              </Button>
            </>
          }
        />

        {calibrationStandards.length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-[#6B7280]">
            No calibration standards logged. Click &ldquo;Add Standard&rdquo; to record calibration series points.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[920px]">
              <thead>
                <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[11px] uppercase tracking-[0.04em] text-[#4B5563]">
                  <th className="py-2 px-2.5 font-medium w-[110px]">Standard ID</th>
                  <th className="py-2 px-2 font-medium text-right w-[112px]">
                    Nominal Conc.
                  </th>
                  <th className="py-2 px-2 font-medium w-[74px]">Unit</th>
                  <th className="py-2 px-2 font-medium text-right w-[128px]">
                    Instrument Response
                  </th>
                  <th className="py-2 px-2 font-medium w-[74px]">Resp. Unit</th>
                  <th className="py-2 px-2 font-medium w-[94px]">Quality</th>
                  <th className="py-2 px-2 font-medium w-[128px]">Provenance</th>
                  <th className="py-2 px-2 font-medium">Notes</th>
                  <th className="py-2 px-2 font-medium w-[44px] text-center">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-[12px]">
                {calibrationStandards.map((std) => (
                  <tr
                    key={std.id}
                    className={
                      std.qualityStatus === 'excluded_by_user'
                        ? 'bg-[#F8F9FA] opacity-60'
                        : 'hover:bg-[#F8F9FA]'
                    }
                  >
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        aria-label={`Standard ID ${std.standardId}`}
                        value={std.standardId}
                        onChange={(e) =>
                          onUpdateStandard(std.id, { standardId: e.target.value })
                        }
                        className={`${compactCellInputClass} font-mono font-medium`}
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <NumericInput
                        compact
                        ariaLabel={`Nominal concentration for ${std.standardId}`}
                        value={std.nominalConc}
                        min={0}
                        onChange={(v) =>
                          onUpdateStandard(std.id, { nominalConc: v })
                        }
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <input
                        type="text"
                        aria-label={`Concentration unit for ${std.standardId}`}
                        value={std.unit}
                        onChange={(e) =>
                          onUpdateStandard(std.id, { unit: e.target.value })
                        }
                        className={`${compactCellInputClass} font-mono`}
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <NumericInput
                        compact
                        ariaLabel={`Instrument response for ${std.standardId}`}
                        value={std.instrumentResponse}
                        onChange={(v) =>
                          onUpdateStandard(std.id, { instrumentResponse: v })
                        }
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <input
                        type="text"
                        aria-label={`Response unit for ${std.standardId}`}
                        value={std.responseUnit}
                        onChange={(e) =>
                          onUpdateStandard(std.id, {
                            responseUnit: e.target.value,
                          })
                        }
                        className={`${compactCellInputClass} font-mono`}
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <select
                        aria-label={`Quality status for ${std.standardId}`}
                        value={std.qualityStatus}
                        onChange={(e) =>
                          onUpdateStandard(std.id, {
                            qualityStatus: e.target
                              .value as MeasurementQualityStatus,
                          })
                        }
                        className="w-full h-7 px-1.5 text-[11.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px]"
                      >
                        {QUALITY_OPTIONS.map((q) => (
                          <option key={q.value} value={q.value}>
                            {q.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 px-1.5">
                      <select
                        aria-label={`Provenance for ${std.standardId}`}
                        value={std.provenance}
                        onChange={(e) =>
                          onUpdateStandard(std.id, {
                            provenance: e.target.value as DataProvenance,
                          })
                        }
                        className="w-full h-7 px-1.5 text-[11.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px]"
                      >
                        {PROVENANCES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 px-1.5">
                      <input
                        type="text"
                        aria-label={`Notes for ${std.standardId}`}
                        value={std.notes}
                        onChange={(e) =>
                          onUpdateStandard(std.id, { notes: e.target.value })
                        }
                        className={compactCellInputClass}
                      />
                    </td>
                    <td className="py-1.5 px-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteStandard(std.id)}
                        aria-label={`Delete standard ${std.standardId}`}
                        className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Subsection 3: Sample Measurements (Independent Initial & Final Records) */}
      <Panel>
        <PanelHeader
          title="3. Sample Measurements (Initial & Final Aliquots)"
          subtitle="Maintain independent records for initial, final, blank, and control aliquots with explicit dilution factors. Link aliquots to Uptake Survey rows using stable internal IDs."
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportSamplesCsv}
                disabled={instrumentMeasurements.length === 0}
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                Export CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAddSample('Initial')}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                Add Initial
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onAddSample('Final')}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                Add Final
              </Button>
            </>
          }
        />

        {instrumentMeasurements.length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-[#6B7280]">
            No analytical sample aliquots logged yet. Add Initial or Final sample records above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1160px]">
              <thead>
                <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[11px] uppercase tracking-[0.04em] text-[#4B5563]">
                  <th className="py-2 px-2.5 font-medium w-[136px]">Sample ID</th>
                  <th className="py-2 px-2 font-medium w-[92px]">Survey Ref.</th>
                  <th className="py-2 px-2 font-medium w-[86px]">Stage</th>
                  <th className="py-2 px-2 font-medium w-[58px]">Rep.</th>
                  <th className="py-2 px-2 font-medium text-right w-[86px]">
                    Dilution (×)
                  </th>
                  <th className="py-2 px-2 font-medium text-right w-[100px]">
                    Raw Signal
                  </th>
                  <th className="py-2 px-2 font-medium text-right w-[106px]">
                    Reported Conc.
                  </th>
                  <th className="py-2 px-2 font-medium w-[68px]">Unit</th>
                  <th className="py-2 px-2 font-medium w-[92px]">Quality</th>
                  <th className="py-2 px-2 font-medium w-[128px]">Provenance</th>
                  <th className="py-2 px-2 font-medium">Notes</th>
                  <th className="py-2 px-2 font-medium w-[42px] text-center">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-[12px]">
                {instrumentMeasurements.map((m) => (
                  <tr
                    key={m.id}
                    className={
                      m.qualityStatus === 'excluded_by_user'
                        ? 'bg-[#F8F9FA] opacity-60'
                        : 'hover:bg-[#F8F9FA]'
                    }
                  >
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        aria-label={`Analytical sample ID ${m.sampleId}`}
                        value={m.sampleId}
                        onChange={(e) =>
                          onUpdateSample(m.id, { sampleId: e.target.value })
                        }
                        className={`${compactCellInputClass} font-mono font-medium`}
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <input
                        type="text"
                        aria-label={`Linked survey sample ID for ${m.sampleId}`}
                        value={m.linkedSurveySampleId}
                        onChange={(e) =>
                          onUpdateSample(m.id, {
                            linkedSurveySampleId: e.target.value,
                          })
                        }
                        placeholder="UPT-01"
                        className={`${compactCellInputClass} font-mono`}
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <select
                        aria-label={`Sample stage for ${m.sampleId}`}
                        value={m.stage}
                        onChange={(e) =>
                          onUpdateSample(m.id, {
                            stage: e.target.value as SampleStage,
                          })
                        }
                        className="w-full h-7 px-1.5 text-[11.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px]"
                      >
                        {STAGES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 px-1.5">
                      <input
                        type="text"
                        aria-label={`Replicate for ${m.sampleId}`}
                        value={m.replicateId}
                        onChange={(e) =>
                          onUpdateSample(m.id, { replicateId: e.target.value })
                        }
                        className={`${compactCellInputClass} font-mono`}
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <NumericInput
                        compact
                        ariaLabel={`Dilution factor for ${m.sampleId}`}
                        value={m.dilutionFactor}
                        min={0}
                        onChange={(v) =>
                          onUpdateSample(m.id, { dilutionFactor: v })
                        }
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <NumericInput
                        compact
                        ariaLabel={`Raw signal for ${m.sampleId}`}
                        value={m.rawSignal}
                        onChange={(v) => onUpdateSample(m.id, { rawSignal: v })}
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <NumericInput
                        compact
                        ariaLabel={`Reported concentration for ${m.sampleId}`}
                        value={m.reportedConc}
                        min={0}
                        onChange={(v) =>
                          onUpdateSample(m.id, { reportedConc: v })
                        }
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <input
                        type="text"
                        aria-label={`Concentration unit for ${m.sampleId}`}
                        value={m.concUnit}
                        onChange={(e) =>
                          onUpdateSample(m.id, { concUnit: e.target.value })
                        }
                        className={`${compactCellInputClass} font-mono`}
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <select
                        aria-label={`Quality status for ${m.sampleId}`}
                        value={m.qualityStatus}
                        onChange={(e) =>
                          onUpdateSample(m.id, {
                            qualityStatus: e.target
                              .value as MeasurementQualityStatus,
                          })
                        }
                        className="w-full h-7 px-1.5 text-[11.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px]"
                      >
                        {QUALITY_OPTIONS.map((q) => (
                          <option key={q.value} value={q.value}>
                            {q.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 px-1.5">
                      <select
                        aria-label={`Provenance for ${m.sampleId}`}
                        value={m.provenance}
                        onChange={(e) =>
                          onUpdateSample(m.id, {
                            provenance: e.target.value as DataProvenance,
                          })
                        }
                        className="w-full h-7 px-1.5 text-[11.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px]"
                      >
                        {PROVENANCES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 px-1.5">
                      <input
                        type="text"
                        aria-label={`Notes for ${m.sampleId}`}
                        value={m.notes}
                        onChange={(e) =>
                          onUpdateSample(m.id, { notes: e.target.value })
                        }
                        className={compactCellInputClass}
                      />
                    </td>
                    <td className="py-1.5 px-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteSample(m.id)}
                        aria-label={`Delete sample ${m.sampleId}`}
                        className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Subsection 4: Exploratory Calibration Linear Regression & Method Validation Boundary */}
      <Panel>
        <PanelHeader
          title="4. Exploratory OLS Calibration Regression & Validation Boundary"
          subtitle="Unweighted ordinary least squares fit (y = mx + b, free intercept) for general numerical inspection. Explicitly distinct from certified analytical method validation."
          actions={
            <span className="font-mono text-[11px] text-[#6B7280]">
              {boundary.engineVersion}
            </span>
          }
        />
        <div className="p-4 space-y-4">
          <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] flex items-start gap-2.5 text-[12.5px] text-[#92400E]">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
            <div>
              <div className="font-semibold">
                Exploratory Numerical Fit — Not Analytical Method Validation
              </div>
              <p className="mt-0.5">{boundary.notice}</p>
            </div>
          </div>

          {/* Regression Metric Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              {
                label: `Slope (${yUnit}/${xUnit})`,
                value: formatWithScientificNotation(regData.slope, {
                  fixedDecimals: 4,
                }),
                accent: true,
              },
              {
                label: `Intercept (${yUnit})`,
                value: formatWithScientificNotation(regData.intercept, {
                  fixedDecimals: 4,
                }),
                accent: false,
              },
              {
                label: 'R² (Fit Metric)',
                value:
                  regData.rSquared !== null ? regData.rSquared.toFixed(6) : '—',
                accent: true,
              },
              {
                label: 'RSS',
                value: formatWithScientificNotation(regData.rss, {
                  fixedDecimals: 4,
                }),
                accent: false,
              },
              {
                label: `SEE (${yUnit})`,
                value: formatWithScientificNotation(
                  regData.standardErrorOfEstimate,
                  { fixedDecimals: 4 }
                ),
                accent: false,
              },
              {
                label: 'Included Points (n)',
                value: `${regData.validCount} (${regData.excludedCount} excl.)`,
                accent: false,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="p-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px]"
              >
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
                  {item.label}
                </div>
                <div
                  className={`mt-1 text-[15px] font-mono tabular-nums font-semibold ${
                    item.accent ? 'text-[#0F52BA]' : 'text-[#111827]'
                  }`}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {reg.validationMessages.length > 0 && (
            <ul className="text-[12px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] px-3 py-2 space-y-1">
              {reg.validationMessages.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          )}

          {/* Calibration Fit & Residual Charts */}
          <CalibrationRegressionChart
            regression={reg}
            xUnit={xUnit}
            yUnit={yUnit}
            experimentId={experiment.experimentId}
          />

          {/* Explicit Review Boundary for Analytical Certification */}
          <div className="pt-2 border-t border-[#E5E7EB] space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] font-medium text-[#6B7280]">
              <Lock className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Analytical Validation Metrics (Pending Scientific Review)</span>
            </div>
            <div className="overflow-x-auto border border-[#E5E7EB] rounded-[6px]">
              <table className="w-full text-left border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[11px] uppercase tracking-[0.05em] text-[#4B5563]">
                    <th className="py-2 px-3 font-medium">Analytical Metric</th>
                    <th className="py-2 px-3 font-medium text-right">Value</th>
                    <th className="py-2 px-3 font-medium">Unit</th>
                    <th className="py-2 px-3 font-medium">Review Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {boundary.fields.map((f) => (
                    <tr key={f.key}>
                      <td className="py-2 px-3">
                        <div className="font-medium text-[#111827]">{f.label}</div>
                        <div className="text-[11px] text-[#6B7280]">{f.reason}</div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[#6B7280]">
                        —
                      </td>
                      <td className="py-2 px-3 font-mono text-[11.5px] text-[#6B7280]">
                        {f.unit}
                      </td>
                      <td className="py-2 px-3">
                        <span className="inline-flex px-2 py-0.5 text-[11px] font-medium text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-[4px] whitespace-nowrap">
                          Pending Scientific Review
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
