'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ErrorBar,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download } from 'lucide-react';
import {
  AnalyticalFigureConfiguration,
  AnalyticalSession,
  CalibrationDataset,
} from '../../domain/models/types';
import {
  AnalyticalSessionComparisonSummary,
  CalibrationDatasetAnalysis,
  computeDistributionBins,
} from '../../domain/calculations/seaMath';
import {
  exportChartContainerToPng,
  exportChartContainerToSvg,
} from '../../services/import-export/backup';
import { Button } from '../ui/Primitives';

const COMPARE_COLORS = ['#0F52BA', '#111827', '#047857', '#B45309', '#6D28D9'];
const GRAYSCALE_COLORS = ['#111827', '#4B5563', '#6B7280', '#9CA3AF', '#374151'];

export interface AnalyticalFigureCanvasProps {
  session: AnalyticalSession;
  calibrationDataset: CalibrationDataset | null;
  calibrationAnalysis: CalibrationDatasetAnalysis | null;
  config: AnalyticalFigureConfiguration;
  comparison?: AnalyticalSessionComparisonSummary | null;
  height?: number;
  compact?: boolean;
  showExportButtons?: boolean;
  filePrefix?: string;
  onSelectPointId?: (recordId: string | null) => void;
}

function fmt(val: number | null | undefined, prec = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return Math.abs(val) >= 10000 || (Math.abs(val) > 0 && Math.abs(val) < 0.001)
    ? val.toExponential(Math.max(2, prec))
    : val.toFixed(prec);
}

export function AnalyticalFigureCanvas({
  session,
  calibrationDataset,
  calibrationAnalysis,
  config,
  comparison,
  height = 360,
  compact = false,
  showExportButtons = true,
  filePrefix = 'sea-analytical-figure',
  onSelectPointId,
}: AnalyticalFigureCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{
    id: string;
    label: string;
    detail: string;
  } | null>(null);
  const [exportingPng, setExportingPng] = useState(false);

  const primaryStroke = config.grayscaleMode
    ? '#111827'
    : config.primaryColor || '#0F52BA';
  const secondaryStroke = config.grayscaleMode ? '#6B7280' : '#374151';
  const palette = config.grayscaleMode ? GRAYSCALE_COLORS : COMPARE_COLORS;

  const isRegressionPlot =
    config.plotType === 'calibration_scatter' ||
    config.plotType === 'calibration_regression' ||
    config.plotType === 'residuals_vs_conc' ||
    config.plotType === 'residuals_vs_fitted';

  const containsSynthetic =
    session.isDemonstration ||
    session.provenance === 'synthetic_demo' ||
    Boolean(calibrationAnalysis?.containsSynthetic) ||
    Boolean(comparison?.containsSynthetic);

  const tickCount =
    config.tickDensity === 'compact'
      ? 5
      : config.tickDensity === 'dense'
        ? 10
        : 7;

  const dashArray =
    config.lineStyle === 'dashed'
      ? '6 4'
      : config.lineStyle === 'dotted'
        ? '2 3'
        : undefined;

  const calScatterPoints = useMemo(() => {
    if (!calibrationDataset) return [];
    return calibrationDataset.standards
      .filter(
        (s) =>
          s.qualityStatus !== 'excluded_by_user' &&
          s.nominalConc !== null &&
          s.instrumentResponse !== null
      )
      .map((s) => ({
        id: s.id,
        label: s.standardId,
        x: s.nominalConc as number,
        y: s.instrumentResponse as number,
        status: s.qualityStatus,
        replicate: s.replicateNumber,
      }));
  }, [calibrationDataset]);

  const regressionLineData = useMemo(() => {
    const reg = calibrationAnalysis?.regression.value;
    if (
      !reg ||
      reg.slope === null ||
      reg.intercept === null ||
      calScatterPoints.length < 2
    ) {
      return [];
    }
    const xs = calScatterPoints.map((p) => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    return [
      { x: minX, fittedY: reg.slope * minX + reg.intercept },
      { x: maxX, fittedY: reg.slope * maxX + reg.intercept },
    ];
  }, [calibrationAnalysis, calScatterPoints]);

  const residualPoints = useMemo(() => {
    if (!calibrationAnalysis) return [];
    return calibrationAnalysis.diagnosticPoints.map((pt) => ({
      id: pt.id,
      label: pt.standardId,
      x:
        config.plotType === 'residuals_vs_fitted'
          ? pt.fittedResponse
          : pt.nominalConc,
      y: pt.residual,
      nominalConc: pt.nominalConc,
      observed: pt.observedResponse,
      fitted: pt.fittedResponse,
    }));
  }, [calibrationAnalysis, config.plotType]);

  const replicateBarData = useMemo(() => {
    if (!calibrationAnalysis) return [];
    return calibrationAnalysis.replicateLevels
      .filter((lvl) => lvl.responseStats.value.mean !== null)
      .map((lvl) => ({
        level: `${lvl.nominalConc} ${lvl.unit}`,
        nominalConc: lvl.nominalConc,
        mean: lvl.responseStats.value.mean as number,
        sd: lvl.responseStats.value.sampleStdDev ?? 0,
        n: lvl.includedCount,
      }));
  }, [calibrationAnalysis]);

  const distributionData = useMemo(() => {
    const vals = (session.sampleMeasurements ?? [])
      .filter(
        (m) =>
          m.qualityStatus !== 'excluded_by_user' &&
          m.reportedConc !== null &&
          Number.isFinite(m.reportedConc)
      )
      .map((m) => m.reportedConc as number);
    return computeDistributionBins(vals, 8).map((b) => ({
      bin: b.binLabel,
      count: b.count,
    }));
  }, [session.sampleMeasurements]);

  const concentrationComparisonData = useMemo(() => {
    return (session.sampleMeasurements ?? [])
      .filter(
        (m) =>
          m.qualityStatus !== 'excluded_by_user' &&
          m.reportedConc !== null &&
          Number.isFinite(m.reportedConc)
      )
      .slice(0, 40)
      .map((m) => ({
        id: m.id,
        sampleId: m.sampleId,
        conc: m.reportedConc as number,
        stage: m.stage,
        unit: m.concUnit || 'ppm',
      }));
  }, [session.sampleMeasurements]);

  const multiSessionData = useMemo(() => {
    if (!comparison || comparison.entries.length === 0) return [];
    const sampleLabels = new Map<string, Record<string, number | string>>();
    comparison.entries.forEach((entry, idx) => {
      entry.valuesForPlot.slice(0, 25).forEach((pt, pIdx) => {
        const key = pt.sampleId.replace(/^(ICP-|AAS-|GFAAS-)/i, '') || `S-${pIdx + 1}`;
        const existing = sampleLabels.get(key) ?? { label: key };
        existing[`s${idx}`] = pt.value;
        sampleLabels.set(key, existing);
      });
    });
    return Array.from(sampleLabels.values());
  }, [comparison]);

  const xDomain: [number | 'auto', number | 'auto'] = [
    config.xMin !== null ? config.xMin : 'auto',
    config.xMax !== null ? config.xMax : 'auto',
  ];
  const yDomain: [number | 'auto', number | 'auto'] = [
    config.yMin !== null ? config.yMin : 'auto',
    config.yMax !== null ? config.yMax : 'auto',
  ];

  const subtitleParts = [
    `${session.sessionId} (${session.technique})`,
    calibrationDataset ? `Cal: ${calibrationDataset.calibrationId}` : null,
    isRegressionPlot
      ? 'Exploratory Numerical Analysis — Not Analytical Method Validation'
      : null,
  ].filter(Boolean);

  const handleExportSvg = () => {
    exportChartContainerToSvg(
      containerRef.current,
      `${filePrefix}-${config.plotType}.svg`,
      {
        title: config.title,
        subtitle: subtitleParts.join(' · '),
        syntheticNotice: containsSynthetic,
        widthPx: config.exportWidthPx,
        heightPx: config.exportHeightPx,
      }
    );
  };

  const handleExportPng = async () => {
    setExportingPng(true);
    try {
      await exportChartContainerToPng(
        containerRef.current,
        `${filePrefix}-${config.plotType}-${config.exportScale}x.png`,
        {
          title: config.title,
          subtitle: subtitleParts.join(' · '),
          syntheticNotice: containsSynthetic,
          widthPx: config.exportWidthPx,
          heightPx: config.exportHeightPx,
          scale: config.exportScale,
        }
      );
    } finally {
      setExportingPng(false);
    }
  };

  const handleSelect = (id: string, label: string, detail: string) => {
    setSelectedPoint({ id, label, detail });
    onSelectPointId?.(id);
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[8px]">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 border-b border-[#E5E7EB]">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-[#111827] leading-snug">
            {config.title}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-[11.5px] text-[#6B7280]">
            <span>{session.sessionId}</span>
            {isRegressionPlot && (
              <span className="font-medium text-[#92400E]">
                Exploratory Numerical Analysis — Not Analytical Method Validation
              </span>
            )}
            {containsSynthetic && (
              <span className="font-mono text-[11px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-1.5 py-0.5 rounded-[4px]">
                Synthetic Demo
              </span>
            )}
          </div>
        </div>
        {showExportButtons && !compact && (
          <div className="flex items-center gap-1.5 shrink-0 no-print">
            <Button size="sm" variant="secondary" onClick={handleExportSvg}>
              <Download className="w-3.5 h-3.5" />
              SVG
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={exportingPng}
              onClick={handleExportPng}
            >
              <Download className="w-3.5 h-3.5" />
              PNG ({config.exportScale}×)
            </Button>
          </div>
        )}
      </div>

      <div ref={containerRef} className="px-3 pt-3 pb-2" style={{ height }}>
        {(config.plotType === 'calibration_scatter' ||
          config.plotType === 'calibration_regression') &&
          (calScatterPoints.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12.5px] text-[#6B7280]">
              No included calibration standards with paired concentration and response values.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 14, right: 24, bottom: 28, left: 20 }}>
                {config.showGridlines && (
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                )}
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={xDomain}
                  tickCount={tickCount}
                  tick={{ fontSize: 11, fill: '#4B5563' }}
                  label={{
                    value: `${config.xAxisTitle}${config.xAxisUnit ? ` (${config.xAxisUnit})` : ''}`,
                    position: 'insideBottom',
                    offset: -16,
                    fontSize: 11.5,
                    fill: '#374151',
                  }}
                />
                <YAxis
                  type="number"
                  domain={yDomain}
                  tickCount={tickCount}
                  tick={{ fontSize: 11, fill: '#4B5563' }}
                  width={68}
                  label={{
                    value: `${config.yAxisTitle}${config.yAxisUnit ? ` (${config.yAxisUnit})` : ''}`,
                    angle: -90,
                    position: 'insideLeft',
                    offset: -4,
                    fontSize: 11.5,
                    fill: '#374151',
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0]?.payload as {
                      label?: string;
                      x?: number;
                      y?: number;
                      fittedY?: number;
                    };
                    return (
                      <div className="bg-white border border-[#D1D5DB] rounded-[6px] px-2.5 py-2 text-[11.5px] text-[#111827] font-mono">
                        {row.label && <div className="font-semibold mb-0.5">{row.label}</div>}
                        <div>
                          x: {fmt(row.x, config.numericPrecision)} {config.xAxisUnit}
                        </div>
                        {row.y !== undefined && (
                          <div>
                            y: {fmt(row.y, config.numericPrecision)} {config.yAxisUnit}
                          </div>
                        )}
                        {row.fittedY !== undefined && (
                          <div>
                            ŷ: {fmt(row.fittedY, config.numericPrecision)} {config.yAxisUnit}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                {config.legendPosition !== 'none' && (
                  <Legend
                    verticalAlign={config.legendPosition === 'bottom' ? 'bottom' : 'top'}
                    wrapperStyle={{ fontSize: 11.5 }}
                  />
                )}
                <Scatter
                  name="Included Standards"
                  data={calScatterPoints}
                  dataKey="y"
                  fill={primaryStroke}
                  onClick={(pt) => {
                    const raw = ((pt as { payload?: Record<string, unknown> })?.payload ??
                      pt) as { id?: string; label?: string; x?: number; y?: number };
                    if (raw && raw.id) {
                      handleSelect(
                        String(raw.id),
                        String(raw.label ?? raw.id),
                        `Nominal: ${fmt(raw.x, config.numericPrecision)} ${config.xAxisUnit} · Response: ${fmt(raw.y, config.numericPrecision)} ${config.yAxisUnit}`
                      );
                    }
                  }}
                />
                {config.plotType === 'calibration_regression' &&
                  regressionLineData.length === 2 && (
                    <Line
                      name="Exploratory OLS Fit"
                      data={regressionLineData}
                      dataKey="fittedY"
                      type="linear"
                      dot={false}
                      stroke={secondaryStroke}
                      strokeWidth={1.75}
                      strokeDasharray={dashArray}
                      isAnimationActive={false}
                    />
                  )}
              </ComposedChart>
            </ResponsiveContainer>
          ))}

        {(config.plotType === 'residuals_vs_conc' ||
          config.plotType === 'residuals_vs_fitted') &&
          (residualPoints.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12.5px] text-[#6B7280]">
              Residuals require a valid exploratory regression fit (≥ 2 distinct nominal concentrations).
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 14, right: 24, bottom: 28, left: 20 }}>
                {config.showGridlines && (
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                )}
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={xDomain}
                  tickCount={tickCount}
                  tick={{ fontSize: 11, fill: '#4B5563' }}
                  label={{
                    value: `${config.xAxisTitle}${config.xAxisUnit ? ` (${config.xAxisUnit})` : ''}`,
                    position: 'insideBottom',
                    offset: -16,
                    fontSize: 11.5,
                    fill: '#374151',
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={yDomain}
                  tickCount={tickCount}
                  tick={{ fontSize: 11, fill: '#4B5563' }}
                  width={68}
                  label={{
                    value: `${config.yAxisTitle}${config.yAxisUnit ? ` (${config.yAxisUnit})` : ''}`,
                    angle: -90,
                    position: 'insideLeft',
                    offset: -4,
                    fontSize: 11.5,
                    fill: '#374151',
                    style: { textAnchor: 'middle' },
                  }}
                />
                <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="4 4" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0]?.payload as {
                      label: string;
                      nominalConc: number;
                      observed: number;
                      fitted: number;
                      y: number;
                    };
                    return (
                      <div className="bg-white border border-[#D1D5DB] rounded-[6px] px-2.5 py-2 text-[11.5px] font-mono text-[#111827]">
                        <div className="font-semibold">{row.label}</div>
                        <div>Nominal: {fmt(row.nominalConc, config.numericPrecision)}</div>
                        <div>Observed: {fmt(row.observed, config.numericPrecision)}</div>
                        <div>Fitted ŷ: {fmt(row.fitted, config.numericPrecision)}</div>
                        <div>Residual: {fmt(row.y, config.numericPrecision)}</div>
                      </div>
                    );
                  }}
                />
                <Scatter
                  name="Residual (y − ŷ)"
                  data={residualPoints}
                  fill={primaryStroke}
                  onClick={(pt) => {
                    const raw = ((pt as { payload?: Record<string, unknown> })?.payload ??
                      pt) as { id?: string; label?: string; y?: number };
                    if (raw && raw.id) {
                      handleSelect(
                        String(raw.id),
                        String(raw.label ?? raw.id),
                        `Residual (y − ŷ): ${fmt(raw.y, config.numericPrecision)} ${config.yAxisUnit}`
                      );
                    }
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ))}

        {config.plotType === 'replicate_response' &&
          (replicateBarData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12.5px] text-[#6B7280]">
              No calibration replicate levels available for plotting.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={replicateBarData}
                margin={{ top: 14, right: 24, bottom: 28, left: 20 }}
              >
                {config.showGridlines && (
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                )}
                <XAxis
                  dataKey="level"
                  tick={{ fontSize: 11, fill: '#4B5563' }}
                  label={{
                    value: config.xAxisTitle,
                    position: 'insideBottom',
                    offset: -16,
                    fontSize: 11.5,
                    fill: '#374151',
                  }}
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fontSize: 11, fill: '#4B5563' }}
                  width={68}
                />
                <Tooltip />
                <Bar
                  dataKey="mean"
                  name="Mean Response"
                  fill={primaryStroke}
                  isAnimationActive={false}
                >
                  <ErrorBar dataKey="sd" width={6} strokeWidth={1.5} stroke="#111827" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ))}

        {config.plotType === 'measurement_distribution' &&
          (distributionData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12.5px] text-[#6B7280]">
              No included numeric sample concentrations to bin.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={distributionData}
                margin={{ top: 14, right: 24, bottom: 28, left: 20 }}
              >
                {config.showGridlines && (
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                )}
                <XAxis dataKey="bin" tick={{ fontSize: 10.5, fill: '#4B5563' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#4B5563' }} />
                <Tooltip />
                <Bar
                  dataKey="count"
                  name="Sample Count"
                  fill={primaryStroke}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          ))}

        {config.plotType === 'concentration_comparison' &&
          (concentrationComparisonData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12.5px] text-[#6B7280]">
              No included sample measurements with recorded concentrations.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={concentrationComparisonData}
                margin={{ top: 14, right: 24, bottom: 38, left: 20 }}
              >
                {config.showGridlines && (
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                )}
                <XAxis
                  dataKey="sampleId"
                  tick={{ fontSize: 10.5, fill: '#4B5563' }}
                  angle={-25}
                  textAnchor="end"
                  height={46}
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fontSize: 11, fill: '#4B5563' }}
                  width={60}
                />
                <Tooltip />
                <Bar
                  dataKey="conc"
                  name={`Reported Concentration (${config.yAxisUnit || 'ppm'})`}
                  fill={primaryStroke}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          ))}

        {config.plotType === 'multi_session_comparison' &&
          (!comparison || comparison.hasIncompatibleUnits || multiSessionData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12.5px] text-[#6B7280] text-center px-6">
              {comparison?.hasIncompatibleUnits
                ? 'Comparative overlay blocked: selected sessions have incompatible concentration units.'
                : 'Select at least one analytical session with recorded concentrations to compare.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={multiSessionData}
                margin={{ top: 14, right: 24, bottom: 36, left: 20 }}
              >
                {config.showGridlines && (
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                )}
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10.5, fill: '#4B5563' }}
                  angle={-20}
                  textAnchor="end"
                  height={44}
                />
                <YAxis tick={{ fontSize: 11, fill: '#4B5563' }} width={60} />
                <Tooltip />
                {config.legendPosition !== 'none' && (
                  <Legend
                    verticalAlign={config.legendPosition === 'bottom' ? 'bottom' : 'top'}
                    wrapperStyle={{ fontSize: 11.5 }}
                  />
                )}
                {comparison.entries.map((entry, idx) => (
                  <Bar
                    key={entry.sessionId}
                    dataKey={`s${idx}`}
                    name={`${entry.sessionCode} (${entry.technique}, ${entry.concUnit})`}
                    fill={palette[idx % palette.length]}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ))}
      </div>

      {selectedPoint && !compact && (
        <div className="px-4 py-2 border-t border-[#E5E7EB] bg-[#F8F9FA] flex items-center justify-between text-[12px]">
          <div>
            <span className="font-mono font-semibold text-[#111827]">
              {selectedPoint.label}
            </span>
            <span className="text-[#4B5563] ml-2">{selectedPoint.detail}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedPoint(null);
              onSelectPointId?.(null);
            }}
            className="text-[11.5px] text-[#0F52BA] hover:underline cursor-pointer"
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
}
