'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, Image as ImageIcon } from 'lucide-react';
import {
  DataProvenance,
  FigureConfiguration,
  LineStyle,
  MarkerShape,
  MeasurementQualityStatus,
  ReferencePzcMarker,
  SurveyDataset,
} from '../../domain/models/types';
import {
  DatasetComparisonSummary,
  SurveyPointSummary,
  analyzeSurveyDataset,
  buildSurveyChartSeries,
  computeDistributionBins,
  formatScientificNumber,
} from '../../domain/calculations/seaMath';
import {
  exportChartContainerToPng,
  exportChartContainerToSvg,
} from '../../services/import-export/backup';
import { Button, PROVENANCE_LABELS } from '../ui/Primitives';

export interface InspectedObservation {
  datasetId: string;
  datasetTitle: string;
  kind: 'individual' | 'replicate_mean';
  sampleId: string;
  sampleGroupId: string;
  replicateId?: string;
  xLabel: string;
  xValue: number;
  yLabel: string;
  yValue: number;
  yUnit: string;
  n?: number;
  sd?: number | null;
  sem?: number | null;
  provenance: DataProvenance;
  qualityStatus?: MeasurementQualityStatus;
  exclusionReason?: string;
  linkedInitialMeasurementId?: string | null;
  linkedFinalMeasurementId?: string | null;
  notes?: string;
}

const COLOR_SERIES_PALETTE = [
  '#0F52BA', // Laboratory cobalt
  '#065F46', // Deep emerald
  '#B45309', // Laboratory amber
  '#7C2D12', // Oxide rust
  '#4338CA', // Deep indigo
  '#374151', // Slate ink
];

const GRAYSCALE_SERIES_PALETTE = [
  '#111827',
  '#4B5563',
  '#6B7280',
  '#1F2937',
  '#9CA3AF',
  '#374151',
];

const COMPARATIVE_SHAPES: MarkerShape[] = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'cross',
];

function getStrokeDasharray(style: LineStyle): string | undefined {
  if (style === 'dashed') return '5 3';
  if (style === 'dotted') return '2 2';
  return undefined;
}

function getTickCount(density: FigureConfiguration['tickDensity']): number {
  if (density === 'compact') return 5;
  if (density === 'dense') return 11;
  return 8;
}

function renderCustomMarker(
  shape: MarkerShape,
  size: number,
  fill: string,
  stroke: string,
  hollow = false
) {
  const r = Math.max(3, Math.min(10, size));
  const MarkerShapeRenderer = (props: {
    cx?: number;
    cy?: number;
    payload?: { qualityStatus?: MeasurementQualityStatus };
  }) => {
    const cx = props.cx;
    const cy = props.cy;
    if (typeof cx !== 'number' || typeof cy !== 'number') return null;

    const isFlagged = props.payload?.qualityStatus === 'flagged';
    const actualStroke = isFlagged ? '#B45309' : stroke;
    const actualFill = hollow ? '#FFFFFF' : isFlagged ? '#FFFBEB' : fill;
    const strokeW = isFlagged ? 1.8 : 1.3;

    switch (shape) {
      case 'square':
        return (
          <rect
            x={cx - r}
            y={cy - r}
            width={r * 2}
            height={r * 2}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={strokeW}
          />
        );
      case 'triangle': {
        const pts = `${cx},${cy - r * 1.15} ${cx - r * 1.1},${cy + r * 0.9} ${cx + r * 1.1},${cy + r * 0.9}`;
        return (
          <polygon
            points={pts}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={strokeW}
          />
        );
      }
      case 'diamond': {
        const pts = `${cx},${cy - r * 1.15} ${cx + r * 1.15},${cy} ${cx},${cy + r * 1.15} ${cx - r * 1.15},${cy}`;
        return (
          <polygon
            points={pts}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={strokeW}
          />
        );
      }
      case 'cross':
        return (
          <g stroke={actualStroke} strokeWidth={Math.max(1.6, strokeW)}>
            <line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} />
            <line x1={cx + r} y1={cy - r} x2={cx - r} y2={cy + r} />
          </g>
        );
      case 'circle':
      default:
        return (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill={actualFill}
            stroke={actualStroke}
            strokeWidth={strokeW}
          />
        );
    }
  };
  return MarkerShapeRenderer;
}

interface PlotPoint {
  x: number;
  y: number;
  errY?: number;
  datasetId: string;
  datasetTitle: string;
  kind: 'individual' | 'replicate_mean';
  sampleId: string;
  sampleGroupId: string;
  replicateId?: string;
  n?: number;
  sd?: number | null;
  sem?: number | null;
  provenance: DataProvenance;
  qualityStatus?: MeasurementQualityStatus;
  exclusionReason?: string;
  linkedInitialMeasurementId?: string | null;
  linkedFinalMeasurementId?: string | null;
  notes?: string;
}

export function ScientificFigureCanvas({
  dataset,
  figureConfig,
  experimentId,
  referencePzcMarkers = [],
  comparison,
  comparePlotMode = 'uptake_vs_phf',
  compareShowGroupMeans = false,
  height = 340,
  compact = false,
  hideExports = false,
  onInspectObservation,
}: {
  dataset: SurveyDataset;
  figureConfig: FigureConfiguration;
  experimentId: string;
  referencePzcMarkers?: ReferencePzcMarker[];
  comparison?: DatasetComparisonSummary | null;
  comparePlotMode?: 'uptake_vs_phf' | 'phf_vs_phi' | 'delta_ph_vs_phi';
  compareShowGroupMeans?: boolean;
  height?: number;
  compact?: boolean;
  hideExports?: boolean;
  onInspectObservation?: (obs: InspectedObservation) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const excludeFlagged = dataset.analysisConfig.excludeFlaggedInStats;
  const precision = Math.max(0, Math.min(4, figureConfig.numericPrecision));
  const palette = figureConfig.grayscaleMode
    ? GRAYSCALE_SERIES_PALETTE
    : COLOR_SERIES_PALETTE;
  const primaryColor = figureConfig.grayscaleMode
    ? '#111827'
    : figureConfig.primaryColor || '#0F52BA';
  const secondaryColor = figureConfig.grayscaleMode ? '#4B5563' : '#111827';

  const analysis = useMemo(
    () => analyzeSurveyDataset(dataset.measurements, { excludeFlagged }),
    [dataset.measurements, excludeFlagged]
  );

  const points: SurveyPointSummary[] = useMemo(
    () => buildSurveyChartSeries(dataset.measurements, { excludeFlagged }),
    [dataset.measurements, excludeFlagged]
  );

  const containsSynthetic =
    figureConfig.plotType === 'comparative' && comparison
      ? comparison.containsSynthetic
      : dataset.isDemonstration ||
        dataset.provenance === 'synthetic_demo' ||
        analysis.containsSynthetic;

  const isPzcFinal = figureConfig.plotType === 'pzc_final_vs_initial';
  const isPzcDelta = figureConfig.plotType === 'pzc_delta_vs_initial';
  const isDistribution = figureConfig.plotType === 'distribution';
  const isComparative = figureConfig.plotType === 'comparative';

  // Build individual points for active dataset
  const individualPlotPoints: PlotPoint[] = useMemo(() => {
    const mapped: PlotPoint[] = [];
    for (const p of points) {
      let x: number | null = null;
      let y: number | null = null;
      if (isPzcFinal) {
        x = p.initialPh;
        y = p.finalPh;
      } else if (isPzcDelta) {
        x = p.initialPh;
        y = p.recordedDeltaPh;
      } else {
        x = p.finalPh;
        y = p.recordedUptakeUmolM2;
      }
      if (
        x !== null &&
        y !== null &&
        Number.isFinite(x) &&
        Number.isFinite(y)
      ) {
        mapped.push({
          x,
          y,
          datasetId: dataset.datasetId,
          datasetTitle: dataset.title,
          kind: 'individual',
          sampleId: p.sampleId,
          sampleGroupId: p.sampleGroupId,
          replicateId: p.replicateId,
          provenance: p.provenance,
          qualityStatus: p.qualityStatus,
          exclusionReason: p.exclusionReason,
          linkedInitialMeasurementId: p.linkedInitialMeasurementId,
          linkedFinalMeasurementId: p.linkedFinalMeasurementId,
          notes: p.notes,
        });
      }
    }
    // Strictly sort by X independent variable when drawing connecting lines
    return mapped.sort((a, b) => a.x - b.x);
  }, [points, isPzcFinal, isPzcDelta, dataset.datasetId, dataset.title]);

  // Build explicit replicate group means for active dataset
  const groupMeanPoints: PlotPoint[] = useMemo(() => {
    const out: PlotPoint[] = [];
    for (const g of analysis.replicateGroups) {
      const xStat =
        isPzcFinal || isPzcDelta ? g.initialPhStats.value : g.finalPhStats.value;
      const yStat = isPzcFinal
        ? g.finalPhStats.value
        : isPzcDelta
          ? g.deltaPhStats.value
          : g.uptakeStats.value;

      if (xStat.mean === null || yStat.mean === null) continue;
      const canErrorBar = yStat.validCount >= 2;
      let errY: number | undefined = undefined;
      if (canErrorBar && figureConfig.errorBarMode === 'sd' && yStat.sampleStdDev !== null) {
        errY = yStat.sampleStdDev;
      } else if (canErrorBar && figureConfig.errorBarMode === 'sem' && yStat.sem !== null) {
        errY = yStat.sem;
      }

      out.push({
        x: xStat.mean,
        y: yStat.mean,
        errY,
        datasetId: dataset.datasetId,
        datasetTitle: dataset.title,
        kind: 'replicate_mean',
        sampleId: `${g.sampleGroupId} (n=${yStat.validCount})`,
        sampleGroupId: g.sampleGroupId,
        n: yStat.validCount,
        sd: yStat.sampleStdDev,
        sem: yStat.sem,
        provenance: g.containsSynthetic ? 'synthetic_demo' : 'derived_calculated',
      });
    }
    return out.sort((a, b) => a.x - b.x);
  }, [
    analysis.replicateGroups,
    isPzcFinal,
    isPzcDelta,
    figureConfig.errorBarMode,
    dataset.datasetId,
    dataset.title,
  ]);

  const eligibleErrorBarGroups = useMemo(
    () => groupMeanPoints.filter((g) => typeof g.errY === 'number' && g.errY > 0).length,
    [groupMeanPoints]
  );

  // Build comparative multi-dataset series
  const comparativeSeries = useMemo(() => {
    if (!isComparative || !comparison || !comparison.unitsCompatible) return [];
    return comparison.entries.map((entry, idx) => {
      const ds = entry.dataset;
      const exFlagged = ds.analysisConfig.excludeFlaggedInStats;
      const color = palette[idx % palette.length];
      const shape = COMPARATIVE_SHAPES[idx % COMPARATIVE_SHAPES.length];

      if (compareShowGroupMeans) {
        const pts: PlotPoint[] = [];
        for (const g of entry.analysis.replicateGroups) {
          const xStat =
            comparePlotMode === 'uptake_vs_phf'
              ? g.finalPhStats.value
              : g.initialPhStats.value;
          const yStat =
            comparePlotMode === 'uptake_vs_phf'
              ? g.uptakeStats.value
              : comparePlotMode === 'phf_vs_phi'
                ? g.finalPhStats.value
                : g.deltaPhStats.value;
          if (xStat.mean === null || yStat.mean === null) continue;
          const canErr = yStat.validCount >= 2;
          const errY =
            canErr && figureConfig.errorBarMode === 'sd' && yStat.sampleStdDev !== null
              ? yStat.sampleStdDev
              : canErr && figureConfig.errorBarMode === 'sem' && yStat.sem !== null
                ? yStat.sem
                : undefined;
          pts.push({
            x: xStat.mean,
            y: yStat.mean,
            errY,
            datasetId: ds.datasetId,
            datasetTitle: ds.title,
            kind: 'replicate_mean',
            sampleId: `${g.sampleGroupId} (n=${yStat.validCount})`,
            sampleGroupId: g.sampleGroupId,
            n: yStat.validCount,
            sd: yStat.sampleStdDev,
            sem: yStat.sem,
            provenance: g.containsSynthetic ? 'synthetic_demo' : 'derived_calculated',
          });
        }
        pts.sort((a, b) => a.x - b.x);
        return {
          key: `${entry.experimentUuid}:${ds.id}`,
          label: `${entry.experimentId} / ${ds.datasetId} — ${ds.title}`,
          shortLabel: `${ds.datasetId}: ${ds.title}`,
          color,
          shape,
          points: pts,
        };
      }

      const rawSeries = buildSurveyChartSeries(ds.measurements, {
        excludeFlagged: exFlagged,
      });
      const pts: PlotPoint[] = [];
      for (const p of rawSeries) {
        const x =
          comparePlotMode === 'uptake_vs_phf' ? p.finalPh : p.initialPh;
        const y =
          comparePlotMode === 'uptake_vs_phf'
            ? p.recordedUptakeUmolM2
            : comparePlotMode === 'phf_vs_phi'
              ? p.finalPh
              : p.recordedDeltaPh;
        if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) {
          pts.push({
            x,
            y,
            datasetId: ds.datasetId,
            datasetTitle: ds.title,
            kind: 'individual',
            sampleId: p.sampleId,
            sampleGroupId: p.sampleGroupId,
            replicateId: p.replicateId,
            provenance: p.provenance,
            qualityStatus: p.qualityStatus,
            exclusionReason: p.exclusionReason,
            linkedInitialMeasurementId: p.linkedInitialMeasurementId,
            linkedFinalMeasurementId: p.linkedFinalMeasurementId,
            notes: p.notes,
          });
        }
      }
      pts.sort((a, b) => a.x - b.x);
      return {
        key: `${entry.experimentUuid}:${ds.id}`,
        label: `${entry.experimentId} / ${ds.datasetId} — ${ds.title}`,
        shortLabel: `${ds.datasetId}: ${ds.title}`,
        color,
        shape,
        points: pts,
      };
    });
  }, [
    isComparative,
    comparison,
    comparePlotMode,
    compareShowGroupMeans,
    figureConfig.errorBarMode,
    palette,
  ]);

  // Distribution histogram bins
  const distributionBins = useMemo(() => {
    if (!isDistribution) return [];
    const values =
      dataset.mode === 'pzc'
        ? points.map((p) => p.recordedDeltaPh)
        : points.map((p) => p.recordedUptakeUmolM2);
    return computeDistributionBins(values, 6, precision);
  }, [isDistribution, dataset.mode, points, precision]);

  // Effective axis labels
  const xLabel = isComparative
    ? comparePlotMode === 'uptake_vs_phf'
      ? 'Final Equilibrium pH (pH)'
      : 'Measured Initial pH (pH)'
    : isDistribution
      ? dataset.mode === 'pzc'
        ? 'Recorded ΔpH Bin (pHf − pHi)'
        : `Recorded Uptake Bin (${figureConfig.yAxisUnit || 'µmol/m²'})`
      : `${figureConfig.xAxisTitle}${figureConfig.xAxisUnit ? ` (${figureConfig.xAxisUnit})` : ''}`;

  const yLabel = isComparative
    ? comparePlotMode === 'uptake_vs_phf'
      ? `Recorded Uptake (${comparison?.entries[0]?.uptakeUnit || 'µmol/m²'})`
      : comparePlotMode === 'phf_vs_phi'
        ? 'Measured Final pH (pH)'
        : 'Recorded ΔpH (pHf − pHi)'
    : isDistribution
      ? 'Observation Count (n)'
      : `${figureConfig.yAxisTitle}${figureConfig.yAxisUnit ? ` (${figureConfig.yAxisUnit})` : ''}`;

  const xDomain: [number | 'auto', number | 'auto'] = [
    figureConfig.xMin !== null ? figureConfig.xMin : isPzcFinal || isPzcDelta ? 0 : 'auto',
    figureConfig.xMax !== null ? figureConfig.xMax : isPzcFinal || isPzcDelta ? 14 : 'auto',
  ];

  const yDomain: [number | 'auto', number | 'auto'] = [
    figureConfig.yMin !== null ? figureConfig.yMin : isPzcFinal ? 0 : 'auto',
    figureConfig.yMax !== null ? figureConfig.yMax : isPzcFinal ? 14 : 'auto',
  ];

  const identityData = useMemo(() => {
    const low = figureConfig.xMin !== null ? figureConfig.xMin : 0;
    const high = figureConfig.xMax !== null ? figureConfig.xMax : 14;
    return [
      { x: low, y: low },
      { x: high, y: high },
    ];
  }, [figureConfig.xMin, figureConfig.xMax]);

  const showIndividual =
    figureConfig.plotType === 'scatter' ||
    figureConfig.plotType === 'scatter_line' ||
    figureConfig.plotType === 'pzc_final_vs_initial' ||
    figureConfig.plotType === 'pzc_delta_vs_initial' ||
    (figureConfig.plotType === 'error_bar' &&
      (figureConfig.displayMode === 'individual' ||
        figureConfig.displayMode === 'both'));

  const showMeans =
    figureConfig.plotType === 'replicate_means' ||
    (figureConfig.plotType === 'error_bar' &&
      (figureConfig.displayMode === 'means' ||
        figureConfig.displayMode === 'both')) ||
    ((isPzcFinal || isPzcDelta) &&
      (figureConfig.displayMode === 'means' ||
        figureConfig.displayMode === 'both'));

  const connectLine =
    figureConfig.plotType === 'scatter_line' || figureConfig.showLines;
  const dashArray = getStrokeDasharray(figureConfig.lineStyle);

  const handlePointClick = (rawPoint: unknown) => {
    if (!onInspectObservation || !rawPoint || typeof rawPoint !== 'object') return;
    const pt = (
      'payload' in rawPoint && rawPoint.payload && typeof rawPoint.payload === 'object'
        ? rawPoint.payload
        : rawPoint
    ) as PlotPoint;
    if (typeof pt.x !== 'number' || typeof pt.y !== 'number') return;
    onInspectObservation({
      datasetId: pt.datasetId,
      datasetTitle: pt.datasetTitle,
      kind: pt.kind,
      sampleId: pt.sampleId,
      sampleGroupId: pt.sampleGroupId,
      replicateId: pt.replicateId,
      xLabel,
      xValue: pt.x,
      yLabel,
      yValue: pt.y,
      yUnit: figureConfig.yAxisUnit || 'µmol/m²',
      n: pt.n,
      sd: pt.sd,
      sem: pt.sem,
      provenance: pt.provenance,
      qualityStatus: pt.qualityStatus,
      exclusionReason: pt.exclusionReason,
      linkedInitialMeasurementId: pt.linkedInitialMeasurementId,
      linkedFinalMeasurementId: pt.linkedFinalMeasurementId,
      notes: pt.notes,
    });
  };

  const handleExportSvg = () => {
    const ok = exportChartContainerToSvg(
      containerRef.current,
      `${experimentId}-${dataset.datasetId}-${figureConfig.plotType}.svg`,
      {
        title: figureConfig.title,
        subtitle: `${experimentId} · ${dataset.datasetId} (${dataset.title})`,
        syntheticNotice: containsSynthetic,
        widthPx: figureConfig.exportWidthPx,
        heightPx: figureConfig.exportHeightPx,
      }
    );
    setExportStatus(ok ? 'SVG exported.' : 'No rendered plot available.');
    window.setTimeout(() => setExportStatus(null), 2600);
  };

  const handleExportPng = async () => {
    const ok = await exportChartContainerToPng(
      containerRef.current,
      `${experimentId}-${dataset.datasetId}-${figureConfig.plotType}-${figureConfig.exportScale}x.png`,
      {
        title: figureConfig.title,
        subtitle: `${experimentId} · ${dataset.datasetId} (${dataset.title})`,
        syntheticNotice: containsSynthetic,
        widthPx: figureConfig.exportWidthPx,
        heightPx: figureConfig.exportHeightPx,
        scale: figureConfig.exportScale,
      }
    );
    setExportStatus(
      ok
        ? `PNG exported (${figureConfig.exportScale}×).`
        : 'Unable to export PNG.'
    );
    window.setTimeout(() => setExportStatus(null), 2600);
  };

  const hasData = isComparative
    ? comparativeSeries.some((s) => s.points.length > 0)
    : isDistribution
      ? distributionBins.length > 0
      : individualPlotPoints.length > 0 || groupMeanPoints.length > 0;

  const renderLegend = () => {
    if (figureConfig.legendPosition === 'none') return null;
    if (isComparative && comparativeSeries.length > 0) {
      return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#4B5563]">
          {comparativeSeries.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 border"
                style={{ backgroundColor: s.color, borderColor: s.color }}
              />
              <span className="font-mono text-[#111827]">{s.shortLabel}</span>
            </span>
          ))}
        </div>
      );
    }
    if (isDistribution) {
      return (
        <div className="text-[11px] text-[#6B7280]">
          Descriptive frequency bins over non-null included observations (n=
          {distributionBins.reduce((acc, b) => acc + b.count, 0)}).
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#4B5563]">
        {showIndividual && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full border"
              style={{
                backgroundColor: showMeans ? '#FFFFFF' : primaryColor,
                borderColor: primaryColor,
              }}
            />
            <span>Recorded Observations</span>
          </span>
        )}
        {showMeans && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 border"
              style={{
                backgroundColor: primaryColor,
                borderColor: secondaryColor,
              }}
            />
            <span>
              Replicate Group Means
              {figureConfig.errorBarMode !== 'none'
                ? ` (± ${figureConfig.errorBarMode.toUpperCase()}, n ≥ 2)`
                : ''}
            </span>
          </span>
        )}
        {(isPzcFinal || (isComparative && comparePlotMode === 'phf_vs_phi')) &&
          figureConfig.showIdentityLine && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-[#6B7280]" />
              <span>1:1 Identity (pHf = pHi)</span>
            </span>
          )}
        {(isPzcDelta ||
          (isComparative && comparePlotMode === 'delta_ph_vs_phi')) &&
          figureConfig.showReferenceLine && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-[#6B7280]" />
              <span>ΔpH = 0 Line</span>
            </span>
          )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[8px] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold text-[#111827] leading-snug">
            {figureConfig.title || dataset.title}
          </h3>
          <p className="text-[11.5px] text-[#6B7280] mt-0.5">
            {isComparative
              ? `Multi-dataset comparison (${comparison?.entries.length ?? 0} series) · Exploratory visualization`
              : isDistribution
                ? 'Descriptive frequency distribution · Missing observations excluded (never coerced to zero)'
                : `Explicit replicate grouping · ${excludeFlagged ? 'Flagged observations excluded' : 'Flagged observations included (highlighted)'}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {containsSynthetic && (
            <span className="px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.04em] bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] rounded-[4px]">
              Synthetic Demo — Not Experimental Evidence
            </span>
          )}
          {!hideExports && hasData && (
            <div className="flex items-center gap-1.5 no-print shrink-0">
              <Button variant="secondary" size="sm" onClick={handleExportSvg}>
                <Download className="w-3 h-3" strokeWidth={1.75} />
                SVG
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExportPng}>
                <ImageIcon className="w-3 h-3" strokeWidth={1.75} />
                PNG ({figureConfig.exportScale}×)
              </Button>
            </div>
          )}
        </div>
      </div>

      {exportStatus && (
        <div className="mb-2 text-[11px] font-mono text-[#0F52BA] no-print">
          {exportStatus}
        </div>
      )}

      {figureConfig.legendPosition === 'top' && (
        <div className="mb-2">{renderLegend()}</div>
      )}

      {isComparative && comparison && !comparison.unitsCompatible ? (
        <div className="h-[260px] flex flex-col items-center justify-center bg-[#FEF2F2] border border-[#FECACA] rounded-[6px] px-6 text-center">
          <p className="text-[13px] font-semibold text-[#991B1B]">
            Incompatible Units — Comparative Overlay Blocked
          </p>
          <p className="text-[12px] text-[#991B1B] mt-1 max-w-lg">
            {comparison.unitIncompatibilityReason}
          </p>
        </div>
      ) : !hasData ? (
        <div className="h-[260px] flex flex-col items-center justify-center bg-[#F8F9FA] border border-dashed border-[#D1D5DB] rounded-[6px] px-4 text-center">
          <p className="text-[13px] font-medium text-[#4B5563]">
            No plottable observations available for this figure configuration
          </p>
          <p className="text-[12px] text-[#6B7280] mt-1 max-w-md">
            Enter numeric measurements in the Measurement Data tab or adjust
            exclusion/comparison settings. Missing cells are never interpolated.
          </p>
        </div>
      ) : (
        <div ref={containerRef} style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            {isDistribution ? (
              <BarChart
                data={distributionBins}
                margin={{ top: 14, right: 20, bottom: 32, left: 16 }}
              >
                {figureConfig.showGridlines && (
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                )}
                <XAxis
                  dataKey="binLabel"
                  tick={{
                    fontSize: 10.5,
                    fill: '#4B5563',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  }}
                  stroke="#9CA3AF"
                  label={{
                    value: xLabel,
                    position: 'insideBottom',
                    offset: -20,
                    style: { fontSize: 11.5, fill: '#111827', fontWeight: 500 },
                  }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{
                    fontSize: 11,
                    fill: '#4B5563',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  }}
                  stroke="#9CA3AF"
                  label={{
                    value: yLabel,
                    angle: -90,
                    position: 'insideLeft',
                    offset: 4,
                    style: {
                      fontSize: 11.5,
                      fill: '#111827',
                      fontWeight: 500,
                      textAnchor: 'middle',
                    },
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const bin = payload[0].payload as {
                      binLabel: string;
                      count: number;
                    };
                    return (
                      <div className="bg-white border border-[#D1D5DB] rounded-[6px] px-3 py-2 text-[11.5px] font-mono">
                        <div className="font-semibold text-[#111827]">
                          Bin: {bin.binLabel}
                        </div>
                        <div className="text-[#4B5563]">
                          Observations: {bin.count}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="count"
                  fill={primaryColor}
                  stroke={secondaryColor}
                  strokeWidth={1}
                  isAnimationActive={false}
                />
              </BarChart>
            ) : (
              <ScatterChart
                margin={{ top: 14, right: 22, bottom: 32, left: 16 }}
              >
                {figureConfig.showGridlines && (
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                )}
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={xDomain}
                  tickCount={getTickCount(figureConfig.tickDensity)}
                  tickFormatter={(v) =>
                    typeof v === 'number' ? v.toFixed(precision) : String(v)
                  }
                  tick={{
                    fontSize: 11,
                    fill: '#4B5563',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  }}
                  stroke="#9CA3AF"
                  label={{
                    value: xLabel,
                    position: 'insideBottom',
                    offset: -20,
                    style: { fontSize: 11.5, fill: '#111827', fontWeight: 500 },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={yDomain}
                  tickCount={getTickCount(figureConfig.tickDensity)}
                  tickFormatter={(v) =>
                    typeof v === 'number' ? v.toFixed(precision) : String(v)
                  }
                  tick={{
                    fontSize: 11,
                    fill: '#4B5563',
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  }}
                  stroke="#9CA3AF"
                  label={{
                    value: yLabel,
                    angle: -90,
                    position: 'insideLeft',
                    offset: 4,
                    style: {
                      fontSize: 11.5,
                      fill: '#111827',
                      fontWeight: 500,
                      textAnchor: 'middle',
                    },
                  }}
                />

                {/* Reference PZC markers */}
                {figureConfig.showReferenceLine &&
                  referencePzcMarkers.map((marker) => (
                    <ReferenceLine
                      key={marker.id}
                      x={marker.valuePh}
                      stroke={figureConfig.grayscaleMode ? '#4B5563' : '#6B7280'}
                      strokeDasharray="4 4"
                      label={{
                        value: `Ref PZC ${marker.valuePh.toFixed(2)}`,
                        position: 'insideTopLeft',
                        dx: 5,
                        dy: 4,
                        fill: '#4B5563',
                        fontSize: 10.5,
                      }}
                    />
                  ))}

                {/* Delta pH = 0 zero line */}
                {(isPzcDelta ||
                  (isComparative && comparePlotMode === 'delta_ph_vs_phi')) &&
                  figureConfig.showReferenceLine && (
                    <ReferenceLine
                      y={0}
                      stroke="#4B5563"
                      strokeDasharray="4 3"
                    />
                  )}

                {/* 1:1 Identity line for Final pH vs Initial pH */}
                {(isPzcFinal ||
                  (isComparative && comparePlotMode === 'phf_vs_phi')) &&
                  figureConfig.showIdentityLine && (
                    <Scatter
                      name="1:1 Identity (pHf = pHi)"
                      data={identityData}
                      fill="none"
                      line={{
                        stroke: '#6B7280',
                        strokeWidth: 1.25,
                        strokeDasharray: '5 4',
                      }}
                      shape={() => null}
                      isAnimationActive={false}
                    />
                  )}

                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: '#9CA3AF' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0]?.payload as PlotPoint | undefined;
                    if (!pt || !pt.sampleId) return null;
                    return (
                      <div className="bg-white border border-[#D1D5DB] rounded-[6px] px-3 py-2 text-[11.5px] font-mono tabular-nums max-w-[260px]">
                        <div className="font-semibold text-[#111827] truncate">
                          {pt.sampleId}
                        </div>
                        <div className="text-[10.5px] text-[#6B7280] font-sans mb-1 truncate">
                          {pt.datasetId} · Group {pt.sampleGroupId}
                          {pt.replicateId ? ` · ${pt.replicateId}` : ''}
                        </div>
                        <div className="text-[#4B5563]">
                          X: {formatScientificNumber(pt.x, precision)}
                        </div>
                        <div className="text-[#4B5563]">
                          Y: {formatScientificNumber(pt.y, precision)}
                        </div>
                        {pt.kind === 'replicate_mean' && (
                          <div className="text-[#4B5563] mt-0.5">
                            n={pt.n} · SD={formatScientificNumber(pt.sd ?? null, 3)} · SEM=
                            {formatScientificNumber(pt.sem ?? null, 3)}
                          </div>
                        )}
                        <div className="text-[10.5px] text-[#6B7280] font-sans mt-1">
                          {PROVENANCE_LABELS[pt.provenance]}
                          {pt.qualityStatus === 'flagged' ? ' · Flagged' : ''}
                        </div>
                      </div>
                    );
                  }}
                />

                {isComparative ? (
                  comparativeSeries.map((series) => (
                    <Scatter
                      key={series.key}
                      name={series.label}
                      data={series.points}
                      fill={series.color}
                      line={
                        connectLine
                          ? {
                              stroke: series.color,
                              strokeWidth: 1.5,
                              strokeDasharray: dashArray,
                            }
                          : false
                      }
                      shape={renderCustomMarker(
                        series.shape,
                        figureConfig.markerSize,
                        series.color,
                        series.color,
                        false
                      )}
                      onClick={handlePointClick}
                      isAnimationActive={false}
                    >
                      {compareShowGroupMeans &&
                        figureConfig.errorBarMode !== 'none' && (
                          <ErrorBar
                            dataKey="errY"
                            width={5}
                            strokeWidth={1.3}
                            stroke={series.color}
                            direction="y"
                          />
                        )}
                    </Scatter>
                  ))
                ) : (
                  <>
                    {showIndividual && individualPlotPoints.length > 0 && (
                      <Scatter
                        name="Recorded Observations"
                        data={individualPlotPoints}
                        fill={primaryColor}
                        line={
                          connectLine && !showMeans
                            ? {
                                stroke: primaryColor,
                                strokeWidth: 1.5,
                                strokeDasharray: dashArray,
                              }
                            : false
                        }
                        shape={renderCustomMarker(
                          figureConfig.markerShape,
                          showMeans
                            ? Math.max(3, figureConfig.markerSize - 1)
                            : figureConfig.markerSize,
                          primaryColor,
                          primaryColor,
                          showMeans
                        )}
                        onClick={handlePointClick}
                        isAnimationActive={false}
                      />
                    )}

                    {showMeans && groupMeanPoints.length > 0 && (
                      <Scatter
                        name="Replicate Group Means"
                        data={groupMeanPoints}
                        fill={primaryColor}
                        line={
                          connectLine
                            ? {
                                stroke: primaryColor,
                                strokeWidth: 1.6,
                                strokeDasharray: dashArray,
                              }
                            : false
                        }
                        shape={renderCustomMarker(
                          figureConfig.markerShape,
                          figureConfig.markerSize,
                          primaryColor,
                          secondaryColor,
                          false
                        )}
                        onClick={handlePointClick}
                        isAnimationActive={false}
                      >
                        {figureConfig.errorBarMode !== 'none' && (
                          <ErrorBar
                            dataKey="errY"
                            width={6}
                            strokeWidth={1.4}
                            stroke={secondaryColor}
                            direction="y"
                          />
                        )}
                      </Scatter>
                    )}
                  </>
                )}
              </ScatterChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {figureConfig.legendPosition === 'bottom' && (
        <div className="mt-2">{renderLegend()}</div>
      )}

      {!compact && (
        <div className="mt-2 pt-2 border-t border-[#F3F4F6] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6B7280]">
          <span>
            {isComparative
              ? 'Series identities preserved; no cross-dataset regression or pooling applied.'
              : showMeans && figureConfig.errorBarMode !== 'none'
                ? `Error bars (± ${figureConfig.errorBarMode.toUpperCase()}) rendered only for explicit groups with n ≥ 2 (${eligibleErrorBarGroups} eligible group${eligibleErrorBarGroups === 1 ? '' : 's'}).`
                : 'Discrete recorded values plotted without unreviewed isotherm or PZC curve fitting.'}
          </span>
          {onInspectObservation && !isDistribution && (
            <span className="font-mono text-[10.5px] text-[#4B5563]">
              Click any data point to inspect record provenance
            </span>
          )}
        </div>
      )}
    </div>
  );
}
