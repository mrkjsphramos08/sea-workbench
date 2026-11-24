'use client';

import React, { useMemo, useRef } from 'react';
import { Download } from 'lucide-react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { CalculationResult } from '../../domain/calculations/calculationTypes';
import { LinearRegressionData } from '../../domain/calculations/regression';
import { formatWithScientificNotation } from '../../domain/calculations/numericValidation';
import { exportChartContainerToSvg } from '../../services/import-export/backup';
import { Button } from '../ui/Primitives';

interface CalibrationTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: {
      label?: string;
      x?: number;
      y?: number;
      yHat?: number;
      residual?: number;
    };
  }>;
  xUnit: string;
  yUnit: string;
}

function CalibrationTooltip({
  active,
  payload,
  xUnit,
  yUnit,
}: CalibrationTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt || pt.x === undefined) return null;

  return (
    <div className="bg-white border border-[#D1D5DB] rounded-[6px] px-3 py-2 text-[11.5px] font-mono tabular-nums text-[#111827] space-y-0.5">
      <div className="font-semibold border-b border-[#E5E7EB] pb-1 mb-1">
        {pt.label}
      </div>
      <div>
        Conc.: {formatWithScientificNotation(pt.x)} {xUnit}
      </div>
      {pt.y !== undefined && (
        <div>
          Observed: {formatWithScientificNotation(pt.y)} {yUnit}
        </div>
      )}
      {pt.yHat !== undefined && (
        <div className="text-[#0F52BA]">
          Fitted (ŷ): {formatWithScientificNotation(pt.yHat)} {yUnit}
        </div>
      )}
      {pt.residual !== undefined && (
        <div className="text-[#4B5563]">
          Residual (y − ŷ): {formatWithScientificNotation(pt.residual)} {yUnit}
        </div>
      )}
    </div>
  );
}

export function CalibrationRegressionChart({
  regression,
  xUnit,
  yUnit,
  experimentId,
  height = 250,
}: {
  regression: CalculationResult<LinearRegressionData>;
  xUnit: string;
  yUnit: string;
  experimentId: string;
  height?: number;
}) {
  const fitRef = useRef<HTMLDivElement>(null);
  const resRef = useRef<HTMLDivElement>(null);

  const sortedPoints = useMemo(
    () => [...regression.value.fittedPoints].sort((a, b) => a.x - b.x),
    [regression.value.fittedPoints]
  );

  const canPlot =
    regression.status === 'available' && sortedPoints.length >= 2;

  if (!canPlot) {
    return (
      <div className="p-6 border border-dashed border-[#D1D5DB] rounded-[6px] bg-[#F8F9FA] text-center text-[12.5px] text-[#4B5563]">
        <div className="font-medium text-[#111827]">
          Exploratory linear regression unavailable ({regression.value.regressionStatus.replace(/_/g, ' ')})
        </div>
        <div className="mt-1 text-[12px] text-[#6B7280]">
          {regression.validationMessages.join(' ')}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      {/* Main Calibration Curve: Observed Points + OLS Fitted Line */}
      <div className="xl:col-span-7 bg-white border border-[#E5E7EB] rounded-[6px] p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <h4 className="text-[12.5px] font-semibold text-[#111827]">
              Calibration Response vs. Nominal Concentration (OLS Fit)
            </h4>
            <p className="text-[11px] text-[#6B7280]">
              Exploratory unweighted OLS line (free intercept) · n ={' '}
              {regression.value.validCount}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              exportChartContainerToSvg(
                fitRef.current,
                `${experimentId}-calibration-ols.svg`,
                `${experimentId} Exploratory OLS Calibration Fit`
              )
            }
          >
            <Download className="w-3 h-3" strokeWidth={1.75} />
            SVG
          </Button>
        </div>
        <div ref={fitRef} style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={sortedPoints}
              margin={{ top: 10, right: 16, bottom: 24, left: 16 }}
            >
              <CartesianGrid stroke="#E5E7EB" strokeDasharray="2 2" />
              <XAxis
                type="number"
                dataKey="x"
                domain={['auto', 'auto']}
                tick={{ fontSize: 10.5, fill: '#4B5563', fontFamily: 'var(--font-mono)' }}
                stroke="#9CA3AF"
                label={{
                  value: `Nominal Concentration (${xUnit})`,
                  position: 'insideBottom',
                  offset: -14,
                  style: { fontSize: 10.5, fill: '#4B5563', fontWeight: 500 },
                }}
              />
              <YAxis
                type="number"
                tick={{ fontSize: 10.5, fill: '#4B5563', fontFamily: 'var(--font-mono)' }}
                stroke="#9CA3AF"
                label={{
                  value: `Response (${yUnit})`,
                  angle: -90,
                  position: 'insideLeft',
                  offset: -4,
                  style: {
                    fontSize: 10.5,
                    fill: '#4B5563',
                    fontWeight: 500,
                    textAnchor: 'middle',
                  },
                }}
              />
              <Tooltip
                content={<CalibrationTooltip xUnit={xUnit} yUnit={yUnit} />}
                isAnimationActive={false}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ fontSize: 10.5, paddingBottom: 6 }}
              />
              <Line
                type="linear"
                dataKey="yHat"
                name="OLS Fitted Line (ŷ)"
                stroke="#0F52BA"
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
              <Scatter
                name="Observed Standards"
                dataKey="y"
                fill="#111827"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Residual Plot */}
      <div className="xl:col-span-5 bg-white border border-[#E5E7EB] rounded-[6px] p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <h4 className="text-[12.5px] font-semibold text-[#111827]">
              Residual Plot (y − ŷ)
            </h4>
            <p className="text-[11px] text-[#6B7280]">
              Vertical deviation from linear OLS fit ({yUnit})
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              exportChartContainerToSvg(
                resRef.current,
                `${experimentId}-calibration-residuals.svg`,
                `${experimentId} Calibration Residuals`
              )
            }
          >
            <Download className="w-3 h-3" strokeWidth={1.75} />
            SVG
          </Button>
        </div>
        <div ref={resRef} style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 16 }}>
              <CartesianGrid stroke="#E5E7EB" strokeDasharray="2 2" />
              <XAxis
                type="number"
                dataKey="x"
                domain={['auto', 'auto']}
                tick={{ fontSize: 10.5, fill: '#4B5563', fontFamily: 'var(--font-mono)' }}
                stroke="#9CA3AF"
                label={{
                  value: `Nominal Conc. (${xUnit})`,
                  position: 'insideBottom',
                  offset: -14,
                  style: { fontSize: 10.5, fill: '#4B5563', fontWeight: 500 },
                }}
              />
              <YAxis
                type="number"
                dataKey="residual"
                tick={{ fontSize: 10.5, fill: '#4B5563', fontFamily: 'var(--font-mono)' }}
                stroke="#9CA3AF"
                label={{
                  value: `Residual (${yUnit})`,
                  angle: -90,
                  position: 'insideLeft',
                  offset: -4,
                  style: {
                    fontSize: 10.5,
                    fill: '#4B5563',
                    fontWeight: 500,
                    textAnchor: 'middle',
                  },
                }}
              />
              <ZAxis range={[44, 44]} />
              <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="3 3" />
              <Tooltip
                content={<CalibrationTooltip xUnit={xUnit} yUnit={yUnit} />}
                isAnimationActive={false}
              />
              <Scatter
                name="Residuals"
                data={sortedPoints}
                fill="#0F52BA"
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
