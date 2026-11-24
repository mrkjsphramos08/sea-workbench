'use client';

import React, { useMemo, useRef } from 'react';
import { Download } from 'lucide-react';
import {
  CartesianGrid,
  ComposedChart,
  ErrorBar,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import {
  ChartDisplayMode,
  ErrorBarMode,
  SurveyConfiguration,
  SurveyMeasurement,
} from '../../domain/models/types';
import {
  analyzeSurveyDataset,
  buildSurveyChartSeries,
} from '../../domain/calculations/seaMath';
import { exportChartContainerToSvg } from '../../services/import-export/backup';
import { Button } from '../ui/Primitives';

interface TooltipPayloadItem {
  payload?: {
    sampleId?: string;
    sampleGroupId?: string;
    replicateId?: string;
    initialPh?: number | null;
    finalPh?: number | null;
    deltaPh?: number | null;
    uptake?: number | null;
    uptakeErr?: number | null;
    validN?: number;
    isGroupMean?: boolean;
  };
}

function ScientificTooltip({
  active,
  payload,
  mode,
  errorBarMode,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  mode: 'uptake' | 'pzc';
  errorBarMode: ErrorBarMode;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;

  return (
    <div className="bg-white border border-[#D1D5DB] rounded-[6px] px-3 py-2 text-[12px] text-[#111827]">
      <div className="font-mono font-medium text-[#111827] border-b border-[#E5E7EB] pb-1 mb-1">
        {pt.isGroupMean
          ? `Group Mean: ${pt.sampleGroupId} (n = ${pt.validN ?? 0})`
          : `${pt.sampleId} · ${pt.replicateId}${pt.sampleGroupId ? ` (${pt.sampleGroupId})` : ''}`}
      </div>
      <div className="space-y-0.5 font-mono tabular-nums text-[11.5px]">
        <div className="flex justify-between gap-4">
          <span className="text-[#6B7280]">pH (initial):</span>
          <span>
            {pt.initialPh !== null && pt.initialPh !== undefined
              ? pt.initialPh.toFixed(2)
              : '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#6B7280]">pH (final):</span>
          <span>
            {pt.finalPh !== null && pt.finalPh !== undefined
              ? pt.finalPh.toFixed(2)
              : '—'}
          </span>
        </div>
        {mode === 'uptake' ? (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-[#6B7280]">
                {pt.isGroupMean ? 'Mean Uptake:' : 'Recorded Uptake:'}
              </span>
              <span className="text-[#0F52BA] font-medium">
                {pt.uptake !== null && pt.uptake !== undefined
                  ? `${pt.uptake.toFixed(3)} µmol/m²`
                  : 'Missing'}
              </span>
            </div>
            {pt.isGroupMean &&
              pt.uptakeErr !== null &&
              pt.uptakeErr !== undefined &&
              errorBarMode !== 'none' && (
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B7280]">
                    ±{errorBarMode === 'sd' ? 'SD' : 'SEM'}:
                  </span>
                  <span>±{pt.uptakeErr.toFixed(3)} µmol/m²</span>
                </div>
              )}
          </>
        ) : (
          <div className="flex justify-between gap-4">
            <span className="text-[#6B7280]">ΔpH (final − init):</span>
            <span className="text-[#0F52BA] font-medium">
              {pt.deltaPh !== null && pt.deltaPh !== undefined
                ? `${pt.deltaPh >= 0 ? '+' : ''}${pt.deltaPh.toFixed(2)}`
                : 'Missing'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ScientificSurveyChart({
  config,
  measurements,
  supportPzcReference,
  experimentId = 'experiment',
  height = 320,
  showControls = false,
  onChangeDisplayMode,
  onChangeErrorBarMode,
}: {
  config: SurveyConfiguration;
  measurements: SurveyMeasurement[];
  supportPzcReference?: number | null;
  experimentId?: string;
  height?: number;
  showControls?: boolean;
  onChangeDisplayMode?: (mode: ChartDisplayMode) => void;
  onChangeErrorBarMode?: (mode: ErrorBarMode) => void;
}) {
  const chartBoxRef = useRef<HTMLDivElement>(null);

  const displayMode: ChartDisplayMode = config.chartDisplayMode ?? 'individual';
  const errorBarMode: ErrorBarMode = config.errorBarMode ?? 'none';

  const hasSyntheticRows = useMemo(
    () =>
      config.showSyntheticNotice ||
      config.dataProvenance === 'synthetic_demo' ||
      measurements.some((m) => m.provenance === 'synthetic_demo'),
    [config.showSyntheticNotice, config.dataProvenance, measurements]
  );

  const series = useMemo(() => buildSurveyChartSeries(measurements), [measurements]);
  const analysis = useMemo(() => analyzeSurveyDataset(measurements), [measurements]);

  const individualUptakePoints = useMemo(() => {
    return series
      .filter((s) => s.finalPh !== null && s.recordedUptakeUmolM2 !== null)
      .map((s) => ({
        sampleId: s.sampleId,
        sampleGroupId: s.sampleGroupId,
        replicateId: s.replicateId,
        initialPh: s.initialPh,
        finalPh: s.finalPh as number,
        deltaPh: s.recordedDeltaPh,
        uptake: s.recordedUptakeUmolM2 as number,
        isGroupMean: false,
      }))
      .sort((a, b) => a.finalPh - b.finalPh);
  }, [series]);

  const groupMeanUptakePoints = useMemo(() => {
    return analysis.replicateGroups
      .filter(
        (g) =>
          g.finalPhStats.value.mean !== null &&
          g.uptakeStats.value.mean !== null
      )
      .map((g) => {
        // Never fabricate error bars: only attach SD/SEM when n >= 2
        const validError =
          errorBarMode === 'sd'
            ? g.uptakeStats.value.sampleStdDev
            : errorBarMode === 'sem'
              ? g.uptakeStats.value.sem
              : null;
        return {
          sampleGroupId: g.sampleGroupId,
          sampleId: g.sampleIds.join(', '),
          initialPh: g.initialPhStats.value.mean,
          finalPh: g.finalPhStats.value.mean as number,
          uptake: g.uptakeStats.value.mean as number,
          uptakeErr: validError,
          validN: g.uptakeStats.value.validCount,
          isGroupMean: true,
        };
      })
      .sort((a, b) => a.finalPh - b.finalPh);
  }, [analysis.replicateGroups, errorBarMode]);

  const pzcIndividualPoints = useMemo(() => {
    return series
      .filter((s) => s.initialPh !== null && s.finalPh !== null)
      .map((s) => ({
        sampleId: s.sampleId,
        sampleGroupId: s.sampleGroupId,
        replicateId: s.replicateId,
        initialPh: s.initialPh as number,
        finalPh: s.finalPh as number,
        deltaPh: s.recordedDeltaPh,
        identityPh: s.initialPh as number,
        isGroupMean: false,
      }))
      .sort((a, b) => a.initialPh - b.initialPh);
  }, [series]);

  const pzcGroupMeanPoints = useMemo(() => {
    return analysis.replicateGroups
      .filter(
        (g) =>
          g.initialPhStats.value.mean !== null &&
          g.finalPhStats.value.mean !== null
      )
      .map((g) => {
        const initMean = g.initialPhStats.value.mean as number;
        const finMean = g.finalPhStats.value.mean as number;
        const finErr =
          errorBarMode === 'sd'
            ? g.finalPhStats.value.sampleStdDev
            : errorBarMode === 'sem'
              ? g.finalPhStats.value.sem
              : null;
        return {
          sampleGroupId: g.sampleGroupId,
          sampleId: g.sampleIds.join(', '),
          initialPh: initMean,
          finalPh: finMean,
          finalPhErr: finErr,
          deltaPh: Number((finMean - initMean).toFixed(3)),
          identityPh: initMean,
          validN: g.finalPhStats.value.validCount,
          isGroupMean: true,
        };
      })
      .sort((a, b) => a.initialPh - b.initialPh);
  }, [analysis.replicateGroups, errorBarMode]);

  const missingUptakeCount = measurements.filter(
    (m) =>
      m.qualityStatus !== 'excluded_by_user' &&
      (m.measuredFinalPh === null || m.recordedUptakeUmolM2 === null)
  ).length;

  const missingPzcCount = measurements.filter(
    (m) =>
      m.qualityStatus !== 'excluded_by_user' &&
      (m.measuredInitialPh === null || m.measuredFinalPh === null)
  ).length;

  const hasChartableData =
    config.mode === 'uptake'
      ? individualUptakePoints.length > 0 || groupMeanUptakePoints.length > 0
      : pzcIndividualPoints.length > 0;

  const handleExportSvg = () => {
    exportChartContainerToSvg(
      chartBoxRef.current,
      `${experimentId}-${config.mode}-figure.svg`,
      config.chartTitle
    );
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[8px] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-[#111827]">
            {config.chartTitle ||
              (config.mode === 'uptake'
                ? 'Recorded Metal Uptake vs. Final pH'
                : 'pH Shift Plot (Final pH vs. Initial pH)')}
          </h3>
          <p className="text-[11.5px] text-[#6B7280] mt-0.5">
            {config.mode === 'uptake'
              ? 'Discrete observations and explicit replicate-group means (no automated isotherm fitting or interpolation).'
              : 'Measured final pH versus initial pH with 1:1 identity line (no automated PZC inflection inference).'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {hasSyntheticRows && (
            <div className="px-2 py-1 text-[11px] font-medium text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-[4px]">
              Synthetic Demonstration Data — Not Experimental Evidence
            </div>
          )}
          {showControls && hasChartableData && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportSvg}
              title="Export publication SVG figure"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
              Export SVG
            </Button>
          )}
        </div>
      </div>

      {/* Chart Display Controls (Series & Error Bars) */}
      {showControls && onChangeDisplayMode && onChangeErrorBarMode && (
        <div className="mb-3 pb-2.5 border-b border-[#F3F4F6] flex flex-wrap items-center justify-between gap-3 text-[12px] no-print">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280] font-medium">
              Series:
            </span>
            <div className="inline-flex p-0.5 bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]">
              {(
                [
                  { id: 'individual', label: 'Individual' },
                  { id: 'means', label: 'Group Means' },
                  { id: 'both', label: 'Both' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeDisplayMode(opt.id)}
                  className={`px-2.5 py-0.5 text-[11.5px] rounded-[4px] transition-colors cursor-pointer ${
                    displayMode === opt.id
                      ? 'bg-white text-[#0F52BA] font-medium border border-[#E5E7EB]'
                      : 'text-[#4B5563] hover:text-[#111827] border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280] font-medium">
              Error Bars (n ≥ 2):
            </span>
            <div className="inline-flex p-0.5 bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]">
              {(
                [
                  { id: 'none', label: 'None' },
                  { id: 'sd', label: '± SD' },
                  { id: 'sem', label: '± SEM' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={displayMode === 'individual'}
                  onClick={() => onChangeErrorBarMode(opt.id)}
                  className={`px-2.5 py-0.5 text-[11.5px] rounded-[4px] transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                    errorBarMode === opt.id
                      ? 'bg-white text-[#0F52BA] font-medium border border-[#E5E7EB]'
                      : 'text-[#4B5563] hover:text-[#111827] border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div ref={chartBoxRef}>
        {!hasChartableData ? (
          <div
            style={{ height }}
            className="flex flex-col items-center justify-center border border-dashed border-[#D1D5DB] rounded-[6px] bg-[#F8F9FA] text-center px-6"
          >
            <p className="text-[13px] font-medium text-[#4B5563]">
              No plottable measurement pairs available
            </p>
            <p className="text-[12px] text-[#6B7280] mt-1 max-w-md">
              {config.mode === 'uptake'
                ? 'Enter measured Final pH and Recorded Uptake (µmol/m²) values in the measurement table to populate this plot. Missing entries remain unplotted.'
                : 'Enter both Measured Initial pH and Measured Final pH values in the measurement table to populate this plot.'}
            </p>
          </div>
        ) : config.mode === 'uptake' ? (
          <div style={{ width: '100%', height }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 14, right: 20, bottom: 26, left: 12 }}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="2 2" />
                <XAxis
                  type="number"
                  dataKey="finalPh"
                  name="Final pH"
                  domain={[0, 14]}
                  ticks={[0, 2, 4, 6, 8, 10, 12, 14]}
                  tick={{ fontSize: 11, fill: '#4B5563', fontFamily: 'var(--font-mono)' }}
                  stroke="#9CA3AF"
                  label={{
                    value: 'Final Equilibrium pH (pH units)',
                    position: 'insideBottom',
                    offset: -16,
                    style: { fontSize: 11, fill: '#4B5563', fontWeight: 500 },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="uptake"
                  name="Recorded Uptake"
                  tick={{ fontSize: 11, fill: '#4B5563', fontFamily: 'var(--font-mono)' }}
                  stroke="#9CA3AF"
                  label={{
                    value: 'Recorded Uptake (µmol/m²)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 4,
                    style: {
                      fontSize: 11,
                      fill: '#4B5563',
                      fontWeight: 500,
                      textAnchor: 'middle',
                    },
                  }}
                />
                <ZAxis range={[44, 44]} />
                <Tooltip
                  cursor={{ stroke: '#D1D5DB', strokeDasharray: '2 2' }}
                  content={
                    <ScientificTooltip
                      mode="uptake"
                      errorBarMode={errorBarMode}
                    />
                  }
                  isAnimationActive={false}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
                />
                {supportPzcReference !== null &&
                  supportPzcReference !== undefined && (
                    <ReferenceLine
                      x={supportPzcReference}
                      stroke="#6B7280"
                      strokeDasharray="4 4"
                      label={{
                        value: `Ref. PZC (${supportPzcReference.toFixed(1)})`,
                        position: 'top',
                        fill: '#4B5563',
                        fontSize: 10,
                      }}
                    />
                  )}
                {(displayMode === 'individual' || displayMode === 'both') && (
                  <Scatter
                    name="Individual Observations"
                    data={individualUptakePoints}
                    fill={displayMode === 'both' ? '#6B7280' : '#0F52BA'}
                    fillOpacity={displayMode === 'both' ? 0.55 : 1}
                    isAnimationActive={false}
                  />
                )}
                {(displayMode === 'means' || displayMode === 'both') && (
                  <Scatter
                    name={
                      errorBarMode === 'none'
                        ? 'Replicate Group Means'
                        : `Replicate Group Means (±${errorBarMode.toUpperCase()})`
                    }
                    data={groupMeanUptakePoints}
                    fill="#0F52BA"
                    shape="square"
                    isAnimationActive={false}
                  >
                    {errorBarMode !== 'none' && (
                      <ErrorBar
                        dataKey="uptakeErr"
                        width={5}
                        strokeWidth={1.5}
                        stroke="#0F52BA"
                        direction="y"
                      />
                    )}
                  </Scatter>
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : displayMode === 'means' ? (
          <div style={{ width: '100%', height }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={pzcGroupMeanPoints}
                margin={{ top: 14, right: 20, bottom: 26, left: 12 }}
              >
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="2 2" />
                <XAxis
                  type="number"
                  dataKey="initialPh"
                  domain={[0, 14]}
                  ticks={[0, 2, 4, 6, 8, 10, 12, 14]}
                  tick={{ fontSize: 11, fill: '#4B5563', fontFamily: 'var(--font-mono)' }}
                  stroke="#9CA3AF"
                  label={{
                    value: 'Mean Initial pH',
                    position: 'insideBottom',
                    offset: -16,
                    style: { fontSize: 11, fill: '#4B5563', fontWeight: 500 },
                  }}
                />
                <YAxis
                  type="number"
                  domain={[0, 14]}
                  ticks={[0, 2, 4, 6, 8, 10, 12, 14]}
                  tick={{ fontSize: 11, fill: '#4B5563', fontFamily: 'var(--font-mono)' }}
                  stroke="#9CA3AF"
                  label={{
                    value: 'Mean Final pH',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 4,
                    style: {
                      fontSize: 11,
                      fill: '#4B5563',
                      fontWeight: 500,
                      textAnchor: 'middle',
                    },
                  }}
                />
                <Tooltip
                  content={
                    <ScientificTooltip
                      mode="pzc"
                      errorBarMode={errorBarMode}
                    />
                  }
                  isAnimationActive={false}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
                />
                <Line
                  type="linear"
                  dataKey="identityPh"
                  name="1:1 Reference (pHf = pHi)"
                  stroke="#9CA3AF"
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="finalPh"
                  name="Group Mean Final pH"
                  stroke="#0F52BA"
                  strokeWidth={1.75}
                  connectNulls={false}
                  dot={{ r: 3.5, fill: '#0F52BA', strokeWidth: 0 }}
                  isAnimationActive={false}
                >
                  {errorBarMode !== 'none' && (
                    <ErrorBar
                      dataKey="finalPhErr"
                      width={4}
                      strokeWidth={1.25}
                      stroke="#0F52BA"
                      direction="y"
                    />
                  )}
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ width: '100%', height }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={pzcIndividualPoints}
                margin={{ top: 14, right: 20, bottom: 26, left: 12 }}
              >
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="2 2" />
                <XAxis
                  type="number"
                  dataKey="initialPh"
                  domain={[0, 14]}
                  ticks={[0, 2, 4, 6, 8, 10, 12, 14]}
                  tick={{ fontSize: 11, fill: '#4B5563', fontFamily: 'var(--font-mono)' }}
                  stroke="#9CA3AF"
                  label={{
                    value: 'Measured Initial pH',
                    position: 'insideBottom',
                    offset: -16,
                    style: { fontSize: 11, fill: '#4B5563', fontWeight: 500 },
                  }}
                />
                <YAxis
                  type="number"
                  domain={[0, 14]}
                  ticks={[0, 2, 4, 6, 8, 10, 12, 14]}
                  tick={{ fontSize: 11, fill: '#4B5563', fontFamily: 'var(--font-mono)' }}
                  stroke="#9CA3AF"
                  label={{
                    value: 'Measured Final pH',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 4,
                    style: {
                      fontSize: 11,
                      fill: '#4B5563',
                      fontWeight: 500,
                      textAnchor: 'middle',
                    },
                  }}
                />
                <Tooltip
                  content={
                    <ScientificTooltip
                      mode="pzc"
                      errorBarMode={errorBarMode}
                    />
                  }
                  isAnimationActive={false}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
                />
                <Line
                  type="linear"
                  dataKey="identityPh"
                  name="1:1 Reference (pHf = pHi)"
                  stroke="#9CA3AF"
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="finalPh"
                  name="Measured Final pH"
                  stroke="#0F52BA"
                  strokeWidth={1.75}
                  connectNulls={false}
                  dot={{ r: 3.5, fill: '#0F52BA', strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-[#F3F4F6] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6B7280]">
        <span>
          Plotted:{' '}
          <span className="font-mono tabular-nums text-[#4B5563]">
            {config.mode === 'uptake'
              ? `${individualUptakePoints.length} obs / ${groupMeanUptakePoints.length} groups`
              : `${pzcIndividualPoints.length} pairs / ${pzcGroupMeanPoints.length} groups`}
          </span>
          {' · '}
          Missing excluded (never coerced to 0):{' '}
          <span className="font-mono tabular-nums text-[#4B5563]">
            {config.mode === 'uptake' ? missingUptakeCount : missingPzcCount}
          </span>
          {analysis.excludedByUserCount > 0 && (
            <>
              {' · '}
              Excluded by user:{' '}
              <span className="font-mono tabular-nums text-[#4B5563]">
                {analysis.excludedByUserCount}
              </span>
            </>
          )}
        </span>
        <span>Error bars rendered strictly for explicit replicate groups with n ≥ 2</span>
      </div>
    </div>
  );
}
