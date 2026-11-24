'use client';

import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import {
  DataProvenance,
  Experiment,
  ScientificReviewStatus,
  SurveyConfiguration,
  SurveyDataset,
} from '../../domain/models/types';
import {
  evaluateSurveyCompleteness,
  formatScientificNumber,
} from '../../domain/calculations/seaMath';
import {
  FieldLabel,
  NumericInput,
  PROVENANCE_LABELS,
  Panel,
  PanelHeader,
  ProvenanceIndicator,
  VERIFICATION_LABELS,
  inputBaseClass,
} from '../../components/ui/Primitives';

const PROVENANCE_OPTIONS: DataProvenance[] = [
  'measured_experimental',
  'user_entered',
  'literature_reference',
  'theoretical_estimate',
  'synthetic_demo',
  'unavailable',
];

const REVIEW_STATUS_OPTIONS: ScientificReviewStatus[] = [
  'Unreviewed',
  'Pending Peer Review',
  'Reviewed',
  'Demonstration Fixture',
];

export function SurveyOverviewTab({
  experiment,
  dataset,
  onUpdateDatasetMeta,
  onUpdateConfig,
}: {
  experiment: Experiment;
  dataset: SurveyDataset;
  onUpdateDatasetMeta: (
    patch: Partial<
      Pick<
        SurveyDataset,
        | 'datasetId'
        | 'title'
        | 'mode'
        | 'objective'
        | 'researcher'
        | 'provenance'
        | 'scientificReviewStatus'
        | 'notes'
      >
    >
  ) => void;
  onUpdateConfig: (patch: Partial<SurveyConfiguration>) => void;
}) {
  const completeness = useMemo(
    () =>
      evaluateSurveyCompleteness(dataset, experiment.instrumentMeasurements),
    [dataset, experiment.instrumentMeasurements]
  );

  const supportData =
    dataset.supportSnapshot?.supportData ??
    experiment.batch.supportSnapshot?.supportData ??
    null;
  const precursorData =
    dataset.precursorSnapshot?.precursorData ??
    experiment.batch.precursorSnapshot?.precursorData ??
    null;

  const provenanceEntries = Object.entries(
    completeness.provenanceBreakdown
  ).filter(([, count]) => count > 0) as Array<[DataProvenance, number]>;

  return (
    <div className="space-y-5">
      {/* Synthetic Notice */}
      {completeness.containsSynthetic && (
        <div className="px-3.5 py-2.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] text-[12px] text-[#92400E] flex items-start gap-2.5">
          <Info className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <strong>Synthetic Demonstration Dataset:</strong> This survey
            dataset contains synthetic fixtures for workflow illustration and
            numerical testing. It does not represent validated experimental SEA
            uptake or PZC evidence.
          </div>
        </div>
      )}

      {/* Concise Dataset Count Strip (strictly factual counts, zero fabricated quality scores) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'Total Samples',
            value: completeness.totalSamples,
            tone: 'text-[#111827]',
          },
          {
            label: 'Replicate Groups',
            value: completeness.replicateGroupCount,
            tone: 'text-[#111827]',
          },
          {
            label: 'Complete Rows',
            value: completeness.completeMeasurementRows,
            tone: 'text-[#065F46]',
          },
          {
            label: 'Incomplete Rows',
            value: completeness.incompleteMeasurementRows,
            tone:
              completeness.incompleteMeasurementRows > 0
                ? 'text-[#92400E]'
                : 'text-[#111827]',
          },
          {
            label: 'Flagged Rows',
            value: completeness.flaggedCount,
            tone:
              completeness.flaggedCount > 0
                ? 'text-[#92400E]'
                : 'text-[#111827]',
          },
          {
            label: 'User Excluded',
            value: completeness.excludedCount,
            tone: 'text-[#4B5563]',
          },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-white border border-[#E5E7EB] rounded-[8px] px-3.5 py-3"
          >
            <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280] font-medium">
              {item.label}
            </div>
            <div
              className={`font-mono tabular-nums text-[19px] font-semibold mt-0.5 ${item.tone}`}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Dataset Metadata & Experimental Conditions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Panel className="lg:col-span-7">
          <PanelHeader
            title="Survey Dataset Metadata & Provenance"
            subtitle="Dataset identity, research scope, attribution, and scientific review status."
            actions={<ProvenanceIndicator provenance={dataset.provenance} />}
          />
          <div className="p-4 space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <FieldLabel htmlFor="ds-meta-id">Dataset ID</FieldLabel>
                <input
                  id="ds-meta-id"
                  type="text"
                  value={dataset.datasetId}
                  onChange={(e) =>
                    onUpdateDatasetMeta({ datasetId: e.target.value })
                  }
                  className={`${inputBaseClass} font-mono`}
                />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="ds-meta-title">Dataset Title</FieldLabel>
                <input
                  id="ds-meta-title"
                  type="text"
                  value={dataset.title}
                  onChange={(e) =>
                    onUpdateDatasetMeta({ title: e.target.value })
                  }
                  className={inputBaseClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <FieldLabel htmlFor="ds-meta-mode">Survey Type</FieldLabel>
                <select
                  id="ds-meta-mode"
                  value={dataset.mode}
                  onChange={(e) =>
                    onUpdateDatasetMeta({
                      mode: e.target.value as 'uptake' | 'pzc',
                    })
                  }
                  className={inputBaseClass}
                >
                  <option value="uptake">Uptake Survey</option>
                  <option value="pzc">PZC / pH Shift Survey</option>
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="ds-meta-researcher">Researcher</FieldLabel>
                <input
                  id="ds-meta-researcher"
                  type="text"
                  value={dataset.researcher}
                  onChange={(e) =>
                    onUpdateDatasetMeta({ researcher: e.target.value })
                  }
                  className={inputBaseClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="ds-meta-prov">Data Provenance</FieldLabel>
                <select
                  id="ds-meta-prov"
                  value={dataset.provenance}
                  onChange={(e) =>
                    onUpdateDatasetMeta({
                      provenance: e.target.value as DataProvenance,
                    })
                  }
                  className={inputBaseClass}
                >
                  {PROVENANCE_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {PROVENANCE_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="ds-meta-review">
                  Scientific Review Status
                </FieldLabel>
                <select
                  id="ds-meta-review"
                  value={dataset.scientificReviewStatus}
                  onChange={(e) =>
                    onUpdateDatasetMeta({
                      scientificReviewStatus: e.target
                        .value as ScientificReviewStatus,
                    })
                  }
                  className={inputBaseClass}
                >
                  {REVIEW_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col justify-end text-[11.5px] font-mono text-[#6B7280] pb-1">
                <span>Created: {dataset.createdAt.slice(0, 16).replace('T', ' ')}</span>
                <span>Updated: {dataset.updatedAt.slice(0, 16).replace('T', ' ')}</span>
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="ds-meta-obj">Research Objective</FieldLabel>
              <textarea
                id="ds-meta-obj"
                rows={2}
                value={dataset.objective}
                onChange={(e) =>
                  onUpdateDatasetMeta({ objective: e.target.value })
                }
                placeholder="State the experimental question and scope for this survey series..."
                className="w-full px-2.5 py-2 text-[12.5px] text-[#111827] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
              />
            </div>

            <div>
              <FieldLabel htmlFor="ds-meta-notes">Dataset Notes</FieldLabel>
              <textarea
                id="ds-meta-notes"
                rows={2}
                value={dataset.notes}
                onChange={(e) => onUpdateDatasetMeta({ notes: e.target.value })}
                placeholder="Procedural remarks, reagent batch numbers, or calibration context..."
                className="w-full px-2.5 py-2 text-[12.5px] text-[#111827] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
              />
            </div>
          </div>
        </Panel>

        {/* Experimental Conditions & Attached Snapshots */}
        <div className="lg:col-span-5 space-y-5">
          <Panel>
            <PanelHeader
              title="Recorded Experimental Conditions"
              subtitle="Conditions associated with this dataset; compared automatically across series."
            />
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <FieldLabel htmlFor="cond-sl" unit="m²/L">
                    Target SL
                  </FieldLabel>
                  <NumericInput
                    id="cond-sl"
                    value={dataset.config.targetSurfaceLoadingM2L}
                    onChange={(v) =>
                      onUpdateConfig({ targetSurfaceLoadingM2L: v })
                    }
                    min={0}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="cond-time" unit="min">
                    Equilibration
                  </FieldLabel>
                  <NumericInput
                    id="cond-time"
                    value={dataset.config.equilibrationTimeMin}
                    onChange={(v) =>
                      onUpdateConfig({ equilibrationTimeMin: v })
                    }
                    min={0}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="cond-temp" unit="°C">
                    Temperature
                  </FieldLabel>
                  <NumericInput
                    id="cond-temp"
                    value={dataset.config.temperatureC}
                    onChange={(v) => onUpdateConfig({ temperatureC: v })}
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="cond-elec">
                  Background Electrolyte
                </FieldLabel>
                <input
                  id="cond-elec"
                  type="text"
                  value={dataset.config.backgroundElectrolyte}
                  onChange={(e) =>
                    onUpdateConfig({ backgroundElectrolyte: e.target.value })
                  }
                  placeholder="e.g., 0.01 M NaNO3 or Deionized water"
                  className={inputBaseClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="cond-ph-reagents">
                  pH Adjustment Reagents Note
                </FieldLabel>
                <input
                  id="cond-ph-reagents"
                  type="text"
                  value={dataset.config.phAdjustmentReagentsNote}
                  onChange={(e) =>
                    onUpdateConfig({ phAdjustmentReagentsNote: e.target.value })
                  }
                  placeholder="e.g., Dilute HNO3 / NaOH (no automated recipe)"
                  className={inputBaseClass}
                />
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Associated Material Snapshots"
              subtitle="Immutable snapshots preserved with this experiment/dataset."
            />
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
              <div className="p-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px]">
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
                  Support Material
                </div>
                {supportData ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="font-semibold text-[#111827]">
                      {supportData.name}
                    </div>
                    <div className="font-mono text-[11px] text-[#4B5563]">
                      BET: {formatScientificNumber(supportData.betSurfaceArea.value, 1)}{' '}
                      {supportData.betSurfaceArea.unit}
                    </div>
                    <div className="font-mono text-[11px] text-[#4B5563]">
                      Ref PZC: {formatScientificNumber(supportData.pzc.value, 2)} pH
                    </div>
                    <div className="text-[11px] text-[#6B7280]">
                      {VERIFICATION_LABELS[supportData.verificationStatus]}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-[#6B7280]">
                    No support snapshot attached.
                  </div>
                )}
              </div>

              <div className="p-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px]">
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
                  Metal Precursor
                </div>
                {precursorData ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="font-semibold text-[#111827]">
                      {precursorData.name}
                    </div>
                    <div className="font-mono text-[11px] text-[#4B5563]">
                      {precursorData.formula} · {precursorData.chargeClassification}
                    </div>
                    <div className="font-mono text-[11px] text-[#4B5563]">
                      MW: {formatScientificNumber(precursorData.molarMass.value, 2)}{' '}
                      {precursorData.molarMass.unit}
                    </div>
                    <div className="text-[11px] text-[#6B7280]">
                      {VERIFICATION_LABELS[precursorData.verificationStatus]}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-[#6B7280]">
                    {dataset.mode === 'pzc'
                      ? 'Not required for bare-support PZC survey.'
                      : 'No precursor snapshot attached.'}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Data Completeness & Discrepancy Diagnostics */}
      <Panel>
        <PanelHeader
          title="Data Completeness & Discrepancy Diagnostics"
          subtitle="Tracks missing fields, flagged/excluded observations, analytical link status, and provenance distribution."
        />
        <div className="p-4 space-y-4">
          <div className="px-3 py-2 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] text-[12px] text-[#4B5563]">
            <strong>Methodological Boundary:</strong>{' '}
            {completeness.completenessDisclaimer}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[12px]">
            {/* Missing Values Breakdown */}
            <div className="border border-[#E5E7EB] rounded-[6px] p-3 space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-[#4B5563]">
                Missing Field Counts (Nulls Preserved)
              </div>
              <div className="flex justify-between font-mono tabular-nums">
                <span className="font-sans text-[#4B5563]">Missing Initial pH</span>
                <span>{completeness.missingInitialPhCount}</span>
              </div>
              <div className="flex justify-between font-mono tabular-nums">
                <span className="font-sans text-[#4B5563]">Missing Final pH</span>
                <span>{completeness.missingFinalPhCount}</span>
              </div>
              <div className="flex justify-between font-mono tabular-nums">
                <span className="font-sans text-[#4B5563]">
                  Missing Recorded Uptake
                </span>
                <span>{completeness.missingUptakeCount}</span>
              </div>
              <div className="flex justify-between font-mono tabular-nums">
                <span className="font-sans text-[#4B5563]">
                  Missing C₀ or Cf Conc.
                </span>
                <span>{completeness.missingConcCount}</span>
              </div>
            </div>

            {/* Analytical Linkage & Review Status */}
            <div className="border border-[#E5E7EB] rounded-[6px] p-3 space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-[#4B5563]">
                Analytical Linkage &amp; Discrepancies
              </div>
              <div className="flex justify-between font-mono tabular-nums">
                <span className="font-sans text-[#4B5563]">
                  Unresolved Link Discrepancies
                </span>
                <span
                  className={
                    completeness.unresolvedDiscrepancyCount > 0
                      ? 'text-[#92400E] font-semibold'
                      : 'text-[#065F46]'
                  }
                >
                  {completeness.unresolvedDiscrepancyCount}
                </span>
              </div>
              <div className="flex justify-between font-mono tabular-nums">
                <span className="font-sans text-[#4B5563]">
                  Unavailable Linked Sources
                </span>
                <span
                  className={
                    completeness.unavailableAnalyticalSourceCount > 0
                      ? 'text-[#991B1B] font-semibold'
                      : 'text-[#111827]'
                  }
                >
                  {completeness.unavailableAnalyticalSourceCount}
                </span>
              </div>
              <div className="flex justify-between font-mono tabular-nums">
                <span className="font-sans text-[#4B5563]">
                  Tolerance Threshold
                </span>
                <span>
                  ±{dataset.analysisConfig.discrepancyTolerancePpm} ppm
                </span>
              </div>
              <div className="pt-1 text-[11px] text-[#6B7280]">
                {completeness.unresolvedDiscrepancyCount === 0 &&
                completeness.unavailableAnalyticalSourceCount === 0 ? (
                  <span className="inline-flex items-center gap-1 text-[#065F46]">
                    <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    All active analytical links match within tolerance.
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[#92400E]">
                    <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Review discrepancies in the Measurement Data tab.
                  </span>
                )}
              </div>
            </div>

            {/* Metadata & Provenance Summary */}
            <div className="border border-[#E5E7EB] rounded-[6px] p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-[#4B5563]">
                Row Provenance Breakdown
              </div>
              {provenanceEntries.length === 0 ? (
                <div className="text-[#6B7280]">No measurement rows yet.</div>
              ) : (
                <div className="space-y-1">
                  {provenanceEntries.map(([prov, count]) => (
                    <div
                      key={prov}
                      className="flex items-center justify-between text-[11.5px]"
                    >
                      <span className="text-[#4B5563]">
                        {PROVENANCE_LABELS[prov]}
                      </span>
                      <span className="font-mono tabular-nums font-medium text-[#111827]">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {completeness.incompleteMetadataFields.length > 0 && (
                <div className="pt-2 border-t border-[#E5E7EB]">
                  <div className="text-[10.5px] uppercase tracking-[0.04em] text-[#92400E] font-medium">
                    Unpopulated Metadata ({completeness.incompleteMetadataFields.length})
                  </div>
                  <p className="text-[11px] text-[#6B7280] mt-0.5">
                    {completeness.incompleteMetadataFields.join(', ')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
