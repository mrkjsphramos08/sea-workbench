'use client';

import React, { useMemo, useState } from 'react';
import {
  RefreshCw,
  Plus,
  Trash2,
  AlertTriangle,
  Lock,
  BookmarkPlus,
  FileStack,
} from 'lucide-react';
import {
  BatchConfiguration,
  DataProvenance,
  Experiment,
  ExperimentTemplate,
  Precursor,
  ResearchPlanMetadata,
  ResearchProject,
  ScientificReviewStatus,
  Support,
} from '../../domain/models/types';
import {
  evaluateBatchSynthesisBoundary,
  formatScientificNumber,
} from '../../domain/calculations/seaMath';
import {
  Button,
  ConfirmDialog,
  FieldLabel,
  NumericInput,
  Panel,
  PanelHeader,
  ProvenanceIndicator,
  VerificationIndicator,
  WorkspaceHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';

const REVIEW_STATUSES: ScientificReviewStatus[] = [
  'Unreviewed',
  'Pending Peer Review',
  'Reviewed',
  'Demonstration Fixture',
];

const PROVENANCE_OPTIONS: DataProvenance[] = [
  'user_entered',
  'measured_experimental',
  'manufacturer_spec',
  'literature_reference',
  'theoretical_estimate',
  'synthetic_demo',
  'unavailable',
];

export function BatchSynthesisWorkspace({
  experiment,
  projects,
  supports,
  precursors,
  experimentTemplates = [],
  onUpdateMeta,
  onUpdateBatch,
  onAssignSupport,
  onAssignPrecursor,
  onRefreshSnapshot,
  onAddObservation,
  onDeleteObservation,
  onUpdateResearchPlan,
  onAddPlanDeviation,
  onDeletePlanDeviation,
  onApplyTemplate,
  onSaveTemplate,
  onDeleteTemplate,
}: {
  experiment: Experiment;
  projects: ResearchProject[];
  supports: Support[];
  precursors: Precursor[];
  experimentTemplates?: ExperimentTemplate[];
  onUpdateMeta: (
    patch: Partial<
      Pick<
        Experiment,
        | 'researcher'
        | 'projectId'
        | 'experimentDate'
        | 'objective'
        | 'scientificReviewStatus'
        | 'generalObservations'
      >
    >
  ) => void;
  onUpdateBatch: (patch: Partial<BatchConfiguration>) => void;
  onAssignSupport: (supportId: string | null) => void;
  onAssignPrecursor: (precursorId: string | null) => void;
  onRefreshSnapshot: (kind: 'support' | 'precursor') => void;
  onAddObservation: (text: string) => void;
  onDeleteObservation: (obsId: string) => void;
  onUpdateResearchPlan?: (patch: Partial<ResearchPlanMetadata>) => void;
  onAddPlanDeviation?: (input: { description: string; reason: string }) => void;
  onDeletePlanDeviation?: (deviationId: string) => void;
  onApplyTemplate?: (templateId: string) => void;
  onSaveTemplate?: (name: string, description: string) => void;
  onDeleteTemplate?: (templateId: string) => void;
}) {
  const [obsDraft, setObsDraft] = useState('');
  const [refreshConfirm, setRefreshConfirm] = useState<'support' | 'precursor' | null>(null);
  const [devDesc, setDevDesc] = useState('');
  const [devReason, setDevReason] = useState('');
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const [templateDescDraft, setTemplateDescDraft] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const calcBoundary = useMemo(
    () => evaluateBatchSynthesisBoundary(experiment.batch),
    [experiment.batch]
  );

  const supportSnap = experiment.batch.supportSnapshot?.supportData ?? null;
  const precursorSnap = experiment.batch.precursorSnapshot?.precursorData ?? null;

  const liveSupport = experiment.batch.supportId
    ? supports.find((s) => s.id === experiment.batch.supportId) ?? null
    : null;
  const livePrecursor = experiment.batch.precursorId
    ? precursors.find((p) => p.id === experiment.batch.precursorId) ?? null
    : null;

  const supportDrift = Boolean(
    experiment.batch.supportSnapshot &&
      liveSupport &&
      liveSupport.updatedAt !== experiment.batch.supportSnapshot.sourceUpdatedAt
  );
  const precursorDrift = Boolean(
    experiment.batch.precursorSnapshot &&
      livePrecursor &&
      livePrecursor.updatedAt !== experiment.batch.precursorSnapshot.sourceUpdatedAt
  );

  const synthesisObservations = experiment.observations.filter(
    (o) => o.module === 'batch-synthesis' || o.category === 'Synthesis'
  );

  const handleAddObs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsDraft.trim()) return;
    onAddObservation(obsDraft.trim());
    setObsDraft('');
  };

  return (
    <div className="space-y-5">
      <WorkspaceHeader
        title="Batch Synthesis & Research Planning"
        description="Configure experiment metadata, lock immutable material snapshots, document structured research plans and deviations, and record planned versus actual batch synthesis parameters."
        metadata={
          <>
            <span>
              Record:{' '}
              <strong className="font-mono text-[#0F52BA]">
                {experiment.experimentId}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Data Version:{' '}
              <span className="font-mono">{experiment.dataVersion}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Calc Engine Boundary:{' '}
              <span className="font-mono">{calcBoundary.engineVersion}</span>
            </span>
            <span aria-hidden="true">·</span>
            <ProvenanceIndicator provenance={experiment.batch.dataProvenance} />
          </>
        }
      />

      {/* Responsive 40% / 60% two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN (~40% = 5 cols): Inputs & Configuration */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Experiment Information */}
          <Panel>
            <PanelHeader title="Experiment Information" />
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="batch-researcher">Researcher</FieldLabel>
                  <input
                    id="batch-researcher"
                    type="text"
                    value={experiment.researcher}
                    onChange={(e) =>
                      onUpdateMeta({ researcher: e.target.value })
                    }
                    className={inputBaseClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="batch-date">Experiment Date</FieldLabel>
                  <input
                    id="batch-date"
                    type="date"
                    value={experiment.experimentDate}
                    onChange={(e) =>
                      onUpdateMeta({ experimentDate: e.target.value })
                    }
                    className={`${inputBaseClass} font-mono`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="batch-project">Research Project</FieldLabel>
                  <select
                    id="batch-project"
                    value={experiment.projectId ?? ''}
                    onChange={(e) =>
                      onUpdateMeta({ projectId: e.target.value || null })
                    }
                    className={inputBaseClass}
                  >
                    <option value="">Unassigned</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="batch-review-status">
                    Scientific Review Status
                  </FieldLabel>
                  <select
                    id="batch-review-status"
                    value={experiment.scientificReviewStatus}
                    onChange={(e) =>
                      onUpdateMeta({
                        scientificReviewStatus: e.target
                          .value as ScientificReviewStatus,
                      })
                    }
                    className={inputBaseClass}
                  >
                    {REVIEW_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="batch-objective">Research Objective</FieldLabel>
                <textarea
                  id="batch-objective"
                  rows={2}
                  value={experiment.objective}
                  onChange={(e) => onUpdateMeta({ objective: e.target.value })}
                  className="w-full p-2.5 text-[13px] text-[#111827] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
                />
              </div>
            </div>
          </Panel>

          {/* 2. Support & Precursor Selection with Immutable Snapshots */}
          <Panel>
            <PanelHeader
              title="Material Selection & Snapshots"
              subtitle="Selected materials are snapshotted into this experiment so later database edits never alter historical records."
            />
            <div className="p-4 space-y-4">
              {/* Support */}
              <div className="space-y-2">
                <FieldLabel htmlFor="batch-support-select">
                  Support Material
                </FieldLabel>
                <select
                  id="batch-support-select"
                  value={experiment.batch.supportId ?? ''}
                  onChange={(e) => onAssignSupport(e.target.value || null)}
                  className={inputBaseClass}
                >
                  <option value="">— Select Support from Database —</option>
                  {!liveSupport && supportSnap && experiment.batch.supportId && (
                    <option value={experiment.batch.supportId}>
                      {supportSnap.name} ({supportSnap.composition}) [Archived Snapshot]
                    </option>
                  )}
                  {supports.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.composition})
                    </option>
                  ))}
                </select>

                {supportSnap ? (
                  <div className="p-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] text-[12px] space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#111827]">
                        Snapshot: {supportSnap.name}
                      </span>
                      <VerificationIndicator status={supportSnap.verificationStatus} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono tabular-nums text-[11.5px] text-[#4B5563]">
                      <div>
                        BET:{' '}
                        {formatScientificNumber(supportSnap.betSurfaceArea.value, 1)}{' '}
                        {supportSnap.betSurfaceArea.unit}
                      </div>
                      <div>
                        PZC:{' '}
                        {formatScientificNumber(supportSnap.pzc.value, 2)}{' '}
                        {supportSnap.pzc.unit}
                      </div>
                      <div>Composition: {supportSnap.composition}</div>
                      <div>
                        Captured:{' '}
                        {experiment.batch.supportSnapshot?.capturedAt.slice(0, 10)}
                      </div>
                    </div>
                    {supportSnap.references.length > 0 && (
                      <div className="pt-1.5 border-t border-[#E5E7EB] text-[11px] text-[#4B5563]">
                        <span className="text-[#6B7280]">References ({supportSnap.references.length}):</span>{' '}
                        {supportSnap.references
                          .map((r) => r.title || r.citation)
                          .join('; ')}
                      </div>
                    )}
                    {supportDrift && (
                      <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-between gap-2 text-[#92400E]">
                        <span className="text-[11px]">
                          Database record updated since snapshot. Historical values preserved.
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setRefreshConfirm('support')}
                        >
                          <RefreshCw className="w-3 h-3" strokeWidth={1.75} />
                          Sync
                        </Button>
                      </div>
                    )}
                    {!liveSupport && experiment.batch.supportId && (
                      <div className="pt-1 text-[11px] text-[#6B7280]">
                        Source record removed from database; experiment snapshot remains intact.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#6B7280]">
                    No support snapshot attached to this experiment.
                  </p>
                )}
              </div>

              {/* Precursor */}
              <div className="space-y-2 pt-3 border-t border-[#E5E7EB]">
                <FieldLabel htmlFor="batch-precursor-select">
                  Metal Precursor
                </FieldLabel>
                <select
                  id="batch-precursor-select"
                  value={experiment.batch.precursorId ?? ''}
                  onChange={(e) => onAssignPrecursor(e.target.value || null)}
                  className={inputBaseClass}
                >
                  <option value="">— Select Precursor from Database —</option>
                  {!livePrecursor && precursorSnap && experiment.batch.precursorId && (
                    <option value={experiment.batch.precursorId}>
                      {precursorSnap.name} ({precursorSnap.formula}) [Archived Snapshot]
                    </option>
                  )}
                  {precursors.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.formula})
                    </option>
                  ))}
                </select>

                {precursorSnap ? (
                  <div className="p-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] text-[12px] space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#111827]">
                        Snapshot: {precursorSnap.name}
                      </span>
                      <VerificationIndicator status={precursorSnap.verificationStatus} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono tabular-nums text-[11.5px] text-[#4B5563]">
                      <div>Formula: {precursorSnap.formula}</div>
                      <div>Charge: {precursorSnap.chargeClassification}</div>
                      <div>
                        MW:{' '}
                        {formatScientificNumber(precursorSnap.molarMass.value, 2)}{' '}
                        {precursorSnap.molarMass.unit}
                      </div>
                      <div>
                        Metal wt%:{' '}
                        {formatScientificNumber(
                          precursorSnap.metalWeightFraction.value,
                          2
                        )}{' '}
                        {precursorSnap.metalWeightFraction.unit}
                      </div>
                    </div>
                    {precursorSnap.references.length > 0 && (
                      <div className="pt-1.5 border-t border-[#E5E7EB] text-[11px] text-[#4B5563]">
                        <span className="text-[#6B7280]">References ({precursorSnap.references.length}):</span>{' '}
                        {precursorSnap.references
                          .map((r) => r.title || r.citation)
                          .join('; ')}
                      </div>
                    )}
                    {precursorDrift && (
                      <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-between gap-2 text-[#92400E]">
                        <span className="text-[11px]">
                          Database record updated since snapshot. Historical values preserved.
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setRefreshConfirm('precursor')}
                        >
                          <RefreshCw className="w-3 h-3" strokeWidth={1.75} />
                          Sync
                        </Button>
                      </div>
                    )}
                    {!livePrecursor && experiment.batch.precursorId && (
                      <div className="pt-1 text-[11px] text-[#6B7280]">
                        Source record removed from database; experiment snapshot remains intact.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#6B7280]">
                    No precursor snapshot attached to this experiment.
                  </p>
                )}
              </div>
            </div>
          </Panel>

          {/* 3. Experimental Configuration: Planned vs Actual */}
          <Panel>
            <PanelHeader
              title="Planned vs. Actual Parameters"
              subtitle="Leave unmeasured fields blank; missing measurements are never coerced to zero."
            />
            <div className="p-4 space-y-3.5">
              <div>
                <FieldLabel htmlFor="batch-provenance">
                  Batch Record Provenance
                </FieldLabel>
                <select
                  id="batch-provenance"
                  value={experiment.batch.dataProvenance}
                  onChange={(e) =>
                    onUpdateBatch({
                      dataProvenance: e.target.value as DataProvenance,
                    })
                  }
                  className={inputBaseClass}
                >
                  {PROVENANCE_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="batch-plan-mass">
                    Planned Support Mass
                  </FieldLabel>
                  <NumericInput
                    id="batch-plan-mass"
                    value={experiment.batch.plannedSupportMassG}
                    onChange={(v) => onUpdateBatch({ plannedSupportMassG: v })}
                    unit="g"
                    min={0}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="batch-act-mass">
                    Actual Support Mass
                  </FieldLabel>
                  <NumericInput
                    id="batch-act-mass"
                    value={experiment.batch.actualSupportMassG}
                    onChange={(v) => onUpdateBatch({ actualSupportMassG: v })}
                    unit="g"
                    min={0}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="batch-plan-vol">
                    Planned Volume
                  </FieldLabel>
                  <NumericInput
                    id="batch-plan-vol"
                    value={experiment.batch.plannedSolutionVolumeMl}
                    onChange={(v) =>
                      onUpdateBatch({ plannedSolutionVolumeMl: v })
                    }
                    unit="mL"
                    min={0}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="batch-act-vol">
                    Actual Volume
                  </FieldLabel>
                  <NumericInput
                    id="batch-act-vol"
                    value={experiment.batch.actualSolutionVolumeMl}
                    onChange={(v) =>
                      onUpdateBatch({ actualSolutionVolumeMl: v })
                    }
                    unit="mL"
                    min={0}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="batch-plan-sl">
                    Planned Surface Loading
                  </FieldLabel>
                  <NumericInput
                    id="batch-plan-sl"
                    value={experiment.batch.plannedSurfaceLoadingM2L}
                    onChange={(v) =>
                      onUpdateBatch({ plannedSurfaceLoadingM2L: v })
                    }
                    unit="m²/L"
                    min={0}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="batch-act-sl">
                    Recorded Surface Loading
                  </FieldLabel>
                  <NumericInput
                    id="batch-act-sl"
                    value={experiment.batch.actualSurfaceLoadingM2L}
                    onChange={(v) =>
                      onUpdateBatch({ actualSurfaceLoadingM2L: v })
                    }
                    unit="m²/L"
                    min={0}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="batch-plan-load">
                    Target Metal Loading
                  </FieldLabel>
                  <NumericInput
                    id="batch-plan-load"
                    value={experiment.batch.plannedTargetMetalLoadingWtPct}
                    onChange={(v) =>
                      onUpdateBatch({ plannedTargetMetalLoadingWtPct: v })
                    }
                    unit="wt%"
                    min={0}
                    max={100}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="batch-act-load">
                    Measured Loading
                  </FieldLabel>
                  <NumericInput
                    id="batch-act-load"
                    value={experiment.batch.actualMeasuredMetalLoadingWtPct}
                    onChange={(v) =>
                      onUpdateBatch({ actualMeasuredMetalLoadingWtPct: v })
                    }
                    unit="wt%"
                    min={0}
                    max={100}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <FieldLabel htmlFor="batch-plan-ph" unit="pH">
                    Planned pHi
                  </FieldLabel>
                  <NumericInput
                    id="batch-plan-ph"
                    value={experiment.batch.plannedInitialPh}
                    onChange={(v) => onUpdateBatch({ plannedInitialPh: v })}
                    min={0}
                    max={14}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="batch-act-phi" unit="pH">
                    Actual pHi
                  </FieldLabel>
                  <NumericInput
                    id="batch-act-phi"
                    value={experiment.batch.actualInitialPh}
                    onChange={(v) => onUpdateBatch({ actualInitialPh: v })}
                    min={0}
                    max={14}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="batch-act-phf" unit="pH">
                    Actual pHf
                  </FieldLabel>
                  <NumericInput
                    id="batch-act-phf"
                    value={experiment.batch.actualFinalPh}
                    onChange={(v) => onUpdateBatch({ actualFinalPh: v })}
                    min={0}
                    max={14}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="batch-plan-conc">
                    Planned Conc.
                  </FieldLabel>
                  <NumericInput
                    id="batch-plan-conc"
                    value={experiment.batch.plannedPrecursorConcPpm}
                    onChange={(v) =>
                      onUpdateBatch({ plannedPrecursorConcPpm: v })
                    }
                    unit="ppm"
                    min={0}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="batch-act-conc">
                    Actual Conc.
                  </FieldLabel>
                  <NumericInput
                    id="batch-act-conc"
                    value={experiment.batch.actualPrecursorConcPpm}
                    onChange={(v) =>
                      onUpdateBatch({ actualPrecursorConcPpm: v })
                    }
                    unit="ppm"
                    min={0}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="batch-contact">
                    Contact Time
                  </FieldLabel>
                  <NumericInput
                    id="batch-contact"
                    value={experiment.batch.contactTimeMin}
                    onChange={(v) => onUpdateBatch({ contactTimeMin: v })}
                    unit="min"
                    min={0}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="batch-temp">
                    Temperature
                  </FieldLabel>
                  <NumericInput
                    id="batch-temp"
                    value={experiment.batch.temperatureC}
                    onChange={(v) => onUpdateBatch({ temperatureC: v })}
                    unit="°C"
                  />
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="batch-agitation">
                  Agitation & Post-Processing Notes
                </FieldLabel>
                <input
                  id="batch-agitation"
                  type="text"
                  value={experiment.batch.agitationMode}
                  onChange={(e) =>
                    onUpdateBatch({ agitationMode: e.target.value })
                  }
                  placeholder="Agitation, filtration, or drying record notes..."
                  className={inputBaseClass}
                />
              </div>
            </div>
          </Panel>
        </div>

        {/* RIGHT COLUMN (~60% = 7 cols): Results, Scientific Validation & Observations */}
        <div className="lg:col-span-7 space-y-5">
          {/* Results Panel */}
          <Panel>
            <PanelHeader
              title="Synthesis Results & Scientific Review Boundary"
              subtitle="Explicit separation between recorded experiment values and SEA domain models pending independent scientific review."
            />
            <div className="p-4 space-y-4">
              <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] flex items-start gap-2.5 text-[12.5px] text-[#92400E]">
                <Lock className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
                <div>
                  <div className="font-semibold">
                    Scientific Review Boundary ({calcBoundary.engineVersion})
                  </div>
                  <p className="mt-0.5 leading-relaxed">
                    {calcBoundary.notice}
                  </p>
                </div>
              </div>

              {/* Recorded Values Summary Table */}
              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] font-medium text-[#6B7280] mb-2">
                  Recorded Planned vs. Actual Comparison
                </div>
                <div className="overflow-x-auto border border-[#E5E7EB] rounded-[6px]">
                  <table className="w-full text-left border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[11px] uppercase tracking-[0.05em] text-[#4B5563]">
                        <th className="py-2 px-3 font-medium">Parameter</th>
                        <th className="py-2 px-3 font-medium text-right">Planned</th>
                        <th className="py-2 px-3 font-medium text-right">Actual / Recorded</th>
                        <th className="py-2 px-3 font-medium">Unit</th>
                        <th className="py-2 px-3 font-medium">Provenance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
                      {[
                        {
                          label: 'Support Mass',
                          planned: experiment.batch.plannedSupportMassG,
                          actual: experiment.batch.actualSupportMassG,
                          unit: 'g',
                          decimals: 3,
                        },
                        {
                          label: 'Solution Volume',
                          planned: experiment.batch.plannedSolutionVolumeMl,
                          actual: experiment.batch.actualSolutionVolumeMl,
                          unit: 'mL',
                          decimals: 2,
                        },
                        {
                          label: 'Surface Loading (SL)',
                          planned: experiment.batch.plannedSurfaceLoadingM2L,
                          actual: experiment.batch.actualSurfaceLoadingM2L,
                          unit: 'm²/L',
                          decimals: 1,
                        },
                        {
                          label: 'Metal Loading',
                          planned: experiment.batch.plannedTargetMetalLoadingWtPct,
                          actual: experiment.batch.actualMeasuredMetalLoadingWtPct,
                          unit: 'wt%',
                          decimals: 2,
                        },
                        {
                          label: 'Initial pH',
                          planned: experiment.batch.plannedInitialPh,
                          actual: experiment.batch.actualInitialPh,
                          unit: 'pH',
                          decimals: 2,
                        },
                        {
                          label: 'Final Equilibrium pH',
                          planned: null,
                          actual: experiment.batch.actualFinalPh,
                          unit: 'pH',
                          decimals: 2,
                        },
                        {
                          label: 'Precursor Concentration',
                          planned: experiment.batch.plannedPrecursorConcPpm,
                          actual: experiment.batch.actualPrecursorConcPpm,
                          unit: 'ppm',
                          decimals: 1,
                        },
                      ].map((row) => (
                        <tr key={row.label}>
                          <td className="py-2 px-3 text-[#111827] font-medium">
                            {row.label}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-[#4B5563]">
                            {formatScientificNumber(row.planned, row.decimals)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-[#0F52BA] font-medium">
                            {formatScientificNumber(row.actual, row.decimals)}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11.5px] text-[#6B7280]">
                            {row.unit}
                          </td>
                          <td className="py-2 px-3">
                            <ProvenanceIndicator
                              provenance={
                                row.actual === null && row.planned === null
                                  ? 'unavailable'
                                  : experiment.batch.dataProvenance
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Derived Domain Outputs Pending Review */}
              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] font-medium text-[#6B7280] mb-2">
                  Derived SEA Domain Outputs (Pending Independent Scientific Review)
                </div>
                <div className="overflow-x-auto border border-[#E5E7EB] rounded-[6px]">
                  <table className="w-full text-left border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[11px] uppercase tracking-[0.05em] text-[#4B5563]">
                        <th className="py-2 px-3 font-medium">Output Quantity</th>
                        <th className="py-2 px-3 font-medium text-right">Value</th>
                        <th className="py-2 px-3 font-medium">Unit</th>
                        <th className="py-2 px-3 font-medium">Review Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
                      {calcBoundary.fields.map((field) => (
                        <tr key={field.key}>
                          <td className="py-2 px-3">
                            <div className="font-medium text-[#111827]">
                              {field.label}
                            </div>
                            <div className="text-[11px] text-[#6B7280]">
                              {field.reason}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-[#6B7280]">
                            —
                          </td>
                          <td className="py-2 px-3 font-mono text-[11.5px] text-[#6B7280]">
                            {field.unit}
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

          {/* Scientific Validation Panel */}
          <Panel>
            <PanelHeader
              title="Scientific Data Integrity & Input Readiness"
              subtitle="Audits material snapshots, verification status, and missing fields without generating unreviewed recommendations."
              actions={
                <span className="font-mono tabular-nums text-[12px] text-[#0F52BA] font-medium">
                  Inputs: {calcBoundary.inputCompleteness.completedCount}/
                  {calcBoundary.inputCompleteness.totalCount}
                </span>
              }
            />
            <div className="p-4 space-y-2.5 text-[12.5px]">
              {[
                {
                  label: 'Support material snapshot attached',
                  ok: calcBoundary.inputCompleteness.hasSupportSnapshot,
                  detail: supportSnap
                    ? `${supportSnap.name} (${supportSnap.verificationStatus})`
                    : 'Not selected',
                },
                {
                  label: 'Precursor material snapshot attached',
                  ok: calcBoundary.inputCompleteness.hasPrecursorSnapshot,
                  detail: precursorSnap
                    ? `${precursorSnap.name} (${precursorSnap.verificationStatus})`
                    : 'Not selected',
                },
                {
                  label: 'Planned support mass & solution volume recorded',
                  ok:
                    calcBoundary.inputCompleteness.hasPlannedMass &&
                    calcBoundary.inputCompleteness.hasPlannedVolume,
                  detail:
                    calcBoundary.inputCompleteness.hasPlannedMass &&
                    calcBoundary.inputCompleteness.hasPlannedVolume
                      ? 'Both quantities present'
                      : 'One or more quantities unrecorded',
                },
                {
                  label: 'Material property verification check',
                  ok:
                    supportSnap?.verificationStatus === 'literature_verified' &&
                    precursorSnap?.verificationStatus === 'literature_verified',
                  detail:
                    supportSnap?.verificationStatus === 'literature_verified' &&
                    precursorSnap?.verificationStatus === 'literature_verified'
                      ? 'Both materials literature-verified'
                      : 'Contains unverified or synthetic demonstration fixtures',
                },
              ].map((check) => (
                <div
                  key={check.label}
                  className="flex items-start justify-between gap-4 py-2 border-b border-[#F3F4F6] last:border-b-0"
                >
                  <div>
                    <div className="font-medium text-[#111827]">{check.label}</div>
                    <div className="text-[11.5px] text-[#6B7280]">{check.detail}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[11px] font-medium border rounded-[4px] whitespace-nowrap ${
                      check.ok
                        ? 'text-[#065F46] bg-[#ECFDF5] border-[#A7F3D0]'
                        : 'text-[#92400E] bg-[#FFFBEB] border-[#FDE68A]'
                    }`}
                  >
                    {check.ok ? 'Recorded' : 'Attention'}
                  </span>
                </div>
              ))}
              {experiment.isDemonstration && (
                <div className="pt-2 flex items-center gap-2 text-[12px] text-[#92400E]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                  <span>
                    This record is flagged as a Synthetic Demonstration Fixture and must not be cited as validated laboratory evidence.
                  </span>
                </div>
              )}
            </div>
          </Panel>

          {/* Research Planning, Deviations & Reusable Documentation Templates */}
          {onUpdateResearchPlan && (
            <Panel>
              <PanelHeader
                title="Research Plan, Deviations & Documentation Templates"
                subtitle="Structured planning metadata and documentation-only templates (never operational chemical preparation instructions)."
              />
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="plan-questions">
                      Research Questions (one per line)
                    </FieldLabel>
                    <textarea
                      id="plan-questions"
                      rows={3}
                      value={(
                        experiment.researchPlan?.researchQuestions ?? []
                      ).join('\n')}
                      onChange={(e) =>
                        onUpdateResearchPlan({
                          researchQuestions: e.target.value
                            .split('\n')
                            .map((line) => line.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="e.g., How does initial pH affect Pt uptake across the PZC window?"
                      className="w-full p-2 text-[12px] text-[#111827] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="plan-sample-ids">
                      Planned Sample IDs (comma or newline separated)
                    </FieldLabel>
                    <textarea
                      id="plan-sample-ids"
                      rows={3}
                      value={(
                        experiment.researchPlan?.plannedSampleIds ?? []
                      ).join(', ')}
                      onChange={(e) =>
                        onUpdateResearchPlan({
                          plannedSampleIds: e.target.value
                            .split(/[,\n]+/)
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="e.g., UPT-01, UPT-02, UPT-03, BLK-01"
                      className="w-full p-2 text-[12px] font-mono text-[#111827] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="plan-meas-req">
                      Planned Measurement Requirements
                    </FieldLabel>
                    <input
                      id="plan-meas-req"
                      type="text"
                      value={
                        experiment.researchPlan
                          ?.plannedMeasurementRequirements ?? ''
                      }
                      onChange={(e) =>
                        onUpdateResearchPlan({
                          plannedMeasurementRequirements: e.target.value,
                        })
                      }
                      placeholder="e.g., Initial/final pH (±0.02), duplicate aliquots, ICP-OES Pt 214.423 nm"
                      className={inputBaseClass}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="plan-analytical">
                      Planned Analytical Sessions
                    </FieldLabel>
                    <input
                      id="plan-analytical"
                      type="text"
                      value={
                        experiment.researchPlan?.plannedAnalyticalSessions ?? ''
                      }
                      onChange={(e) =>
                        onUpdateResearchPlan({
                          plannedAnalyticalSessions: e.target.value,
                        })
                      }
                      placeholder="e.g., ICP-OES calibration 0.5–50 ppm + 10x diluted supernatants"
                      className={inputBaseClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="plan-deliverables">
                      Expected Research Deliverables
                    </FieldLabel>
                    <input
                      id="plan-deliverables"
                      type="text"
                      value={experiment.researchPlan?.expectedDeliverables ?? ''}
                      onChange={(e) =>
                        onUpdateResearchPlan({
                          expectedDeliverables: e.target.value,
                        })
                      }
                      placeholder="e.g., Uptake vs pH figure, PZC shift plot, finalized A4 report"
                      className={inputBaseClass}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="plan-refs">
                      External Protocol References (comma separated)
                    </FieldLabel>
                    <input
                      id="plan-refs"
                      type="text"
                      value={(
                        experiment.researchPlan?.externalProtocolRefs ?? []
                      ).join(', ')}
                      onChange={(e) =>
                        onUpdateResearchPlan({
                          externalProtocolRefs: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="e.g., SOP-CAT-014, Lab Notebook Vol. 4 p. 82"
                      className={inputBaseClass}
                    />
                  </div>
                </div>

                {/* Deviations Log */}
                {onAddPlanDeviation && onDeletePlanDeviation && (
                  <div className="pt-3 border-t border-[#E5E7EB] space-y-2">
                    <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-[#4B5563]">
                      Recorded Deviations from Plan (
                      {(experiment.researchPlan?.deviations ?? []).length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <input
                        type="text"
                        aria-label="Deviation description"
                        value={devDesc}
                        onChange={(e) => setDevDesc(e.target.value)}
                        placeholder="Deviation observed..."
                        className={`${inputBaseClass} sm:col-span-5`}
                      />
                      <input
                        type="text"
                        aria-label="Deviation reason"
                        value={devReason}
                        onChange={(e) => setDevReason(e.target.value)}
                        placeholder="Reason / impact note..."
                        className={`${inputBaseClass} sm:col-span-5`}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="sm:col-span-2"
                        disabled={!devDesc.trim()}
                        onClick={() => {
                          onAddPlanDeviation({
                            description: devDesc.trim(),
                            reason: devReason.trim(),
                          });
                          setDevDesc('');
                          setDevReason('');
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Log
                      </Button>
                    </div>
                    {(experiment.researchPlan?.deviations ?? []).length > 0 && (
                      <ul className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-[6px] text-[12px]">
                        {(experiment.researchPlan?.deviations ?? []).map(
                          (dev) => (
                            <li
                              key={dev.id}
                              className="px-3 py-2 flex items-start justify-between gap-2 bg-[#F8F9FA]"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-[#111827]">
                                  {dev.description}
                                </div>
                                {dev.reason && (
                                  <div className="text-[#4B5563]">
                                    Reason: {dev.reason}
                                  </div>
                                )}
                                <div className="text-[10.5px] font-mono text-[#6B7280]">
                                  {dev.timestamp.slice(0, 16).replace('T', ' ')}{' '}
                                  · {dev.author}
                                </div>
                              </div>
                              <button
                                type="button"
                                aria-label="Delete deviation"
                                onClick={() => onDeletePlanDeviation(dev.id)}
                                className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </li>
                          )
                        )}
                      </ul>
                    )}
                  </div>
                )}

                {/* Reusable Documentation Templates */}
                {onApplyTemplate && onSaveTemplate && (
                  <div className="pt-3 border-t border-[#E5E7EB] space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-[#4B5563] inline-flex items-center gap-1.5">
                        <FileStack className="w-3.5 h-3.5 text-[#0F52BA]" />
                        Documentation Templates ({experimentTemplates.length})
                      </span>
                      <span className="text-[10.5px] text-[#6B7280]">
                        Structure-only templates — no chemical recipes
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Select documentation template"
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="h-8 px-2.5 text-[12px] bg-white border border-[#E5E7EB] rounded-[6px] flex-1 min-w-[200px]"
                      >
                        <option value="">
                          — Select Documentation Template —
                        </option>
                        {experimentTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.experimentType})
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!selectedTemplateId}
                        onClick={() => {
                          if (selectedTemplateId) {
                            onApplyTemplate(selectedTemplateId);
                          }
                        }}
                      >
                        Apply Structure
                      </Button>
                      {onDeleteTemplate && selectedTemplateId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          ariaLabel="Delete selected template"
                          onClick={() => {
                            onDeleteTemplate(selectedTemplateId);
                            setSelectedTemplateId('');
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <input
                        type="text"
                        aria-label="New template name"
                        value={templateNameDraft}
                        onChange={(e) => setTemplateNameDraft(e.target.value)}
                        placeholder="Save current plan as template name..."
                        className={`${inputBaseClass} sm:col-span-5`}
                      />
                      <input
                        type="text"
                        aria-label="New template description"
                        value={templateDescDraft}
                        onChange={(e) => setTemplateDescDraft(e.target.value)}
                        placeholder="Short template description..."
                        className={`${inputBaseClass} sm:col-span-5`}
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        className="sm:col-span-2"
                        disabled={!templateNameDraft.trim()}
                        onClick={() => {
                          onSaveTemplate(
                            templateNameDraft.trim(),
                            templateDescDraft.trim()
                          );
                          setTemplateNameDraft('');
                          setTemplateDescDraft('');
                        }}
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* Observations */}
          <Panel>
            <PanelHeader
              title="Synthesis Observations"
              subtitle="Timestamped synthesis notes linked to this experiment and included in the A4 report."
            />
            <div className="p-4 space-y-3">
              <form onSubmit={handleAddObs} className="flex gap-2">
                <input
                  type="text"
                  aria-label="Add synthesis observation"
                  value={obsDraft}
                  onChange={(e) => setObsDraft(e.target.value)}
                  placeholder="Record synthesis observation (e.g., slurry dispersion, pH drift, filtration note)..."
                  className={inputBaseClass}
                />
                <Button type="submit" variant="primary" disabled={!obsDraft.trim()}>
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Add Note
                </Button>
              </form>

              {synthesisObservations.length === 0 ? (
                <p className="text-[12.5px] text-[#6B7280]">
                  No synthesis observations recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-[#E5E7EB]">
                  {synthesisObservations.map((obs) => (
                    <li
                      key={obs.id}
                      className="py-2.5 flex items-start justify-between gap-3 text-[12.5px]"
                    >
                      <div className="min-w-0">
                        <div className="text-[#111827] leading-relaxed">
                          {obs.text}
                        </div>
                        <div className="text-[11px] font-mono text-[#6B7280] mt-0.5">
                          {new Date(obs.timestamp).toLocaleString()} · {obs.author}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteObservation(obs.id)}
                        aria-label="Delete observation"
                        className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(refreshConfirm)}
        title="Update Experiment Material Snapshot?"
        message="This will overwrite this experiment's historical material snapshot with the latest properties from the Material Database. Existing historical property values in this experiment will be replaced."
        confirmLabel="Sync Snapshot"
        variant="primary"
        onConfirm={() => {
          if (refreshConfirm) onRefreshSnapshot(refreshConfirm);
          setRefreshConfirm(null);
        }}
        onCancel={() => setRefreshConfirm(null)}
      />
    </div>
  );
}
