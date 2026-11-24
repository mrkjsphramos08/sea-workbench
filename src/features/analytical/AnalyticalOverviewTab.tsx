'use client';

import React, { useState } from 'react';
import {
  ArrowRight,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import {
  AnalyticalAnalyte,
  AnalyticalSession,
  AnalyticalWorkspaceTab,
  DataProvenance,
  InstrumentType,
  ScientificReviewStatus,
} from '../../domain/models/types';
import { AnalyticalSessionOverview } from '../../domain/calculations/seaMath';
import {
  Button,
  FieldLabel,
  NumericInput,
  PROVENANCE_LABELS,
  Panel,
  PanelHeader,
  ProvenanceIndicator,
  inputBaseClass,
} from '../../components/ui/Primitives';

const INSTRUMENT_TECHNIQUES: InstrumentType[] = [
  'ICP-OES',
  'Flame AAS',
  'Graphite Furnace AAS',
  'AAS',
  'ICP-MS',
  'UV-Vis',
  'Other',
];

const REVIEW_STATUSES: ScientificReviewStatus[] = [
  'Unreviewed',
  'Pending Peer Review',
  'Reviewed',
  'Demonstration Fixture',
];

export interface AnalyticalOverviewTabProps {
  session: AnalyticalSession;
  overview: AnalyticalSessionOverview;
  onUpdateSessionMeta: (
    patch: Partial<
      Pick<
        AnalyticalSession,
        | 'sessionId'
        | 'title'
        | 'technique'
        | 'customTechniqueName'
        | 'instrumentManufacturer'
        | 'instrumentModel'
        | 'instrumentIdentifier'
        | 'methodReference'
        | 'analyst'
        | 'analysisDate'
        | 'matrixDescription'
        | 'conditionsNote'
        | 'observations'
        | 'provenance'
        | 'scientificReviewStatus'
        | 'notes'
      >
    >
  ) => void;
  onSelectAnalyte: (analyteId: string) => void;
  onAddAnalyte: (analyte: Omit<AnalyticalAnalyte, 'id'>) => void;
  onUpdateAnalyte: (analyteId: string, patch: Partial<AnalyticalAnalyte>) => void;
  onDeleteAnalyte: (analyteId: string) => void;
  onNavigateTab: (tab: AnalyticalWorkspaceTab) => void;
}

export function AnalyticalOverviewTab({
  session,
  overview,
  onUpdateSessionMeta,
  onSelectAnalyte,
  onAddAnalyte,
  onUpdateAnalyte,
  onDeleteAnalyte,
  onNavigateTab,
}: AnalyticalOverviewTabProps) {
  const [newName, setNewName] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [newWavelength, setNewWavelength] = useState<number | null>(null);
  const [newUnit, setNewUnit] = useState('ppm');

  const handleAddAnalyte = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim() && !newName.trim()) return;
    onAddAnalyte({
      name: newName.trim() || newSymbol.trim(),
      symbol: newSymbol.trim() || newName.trim(),
      wavelengthNm: newWavelength,
      measurementUnit: newUnit.trim() || 'ppm',
      methodReference: '',
      calibrationDatasetId: null,
      notes: '',
    });
    setNewName('');
    setNewSymbol('');
    setNewWavelength(null);
    setNewUnit('ppm');
  };

  const provenanceEntries = (
    Object.entries(overview.provenanceDistribution) as Array<[DataProvenance, number]>
  ).filter(([, count]) => count > 0);

  return (
    <div className="space-y-4">
      {/* KPI Factual Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => onNavigateTab('calibration')}
          className="text-left p-3 bg-white border border-[#E5E7EB] rounded-[8px] hover:border-[#0F52BA] transition-colors cursor-pointer"
        >
          <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
            Calibrations
          </div>
          <div className="mt-1 font-mono text-[18px] font-semibold text-[#111827] tabular-nums">
            {overview.analyzableCalibrationDatasets}/{overview.totalCalibrationDatasets}
          </div>
          <div className="text-[11px] text-[#6B7280]">analyzable / total</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('samples')}
          className="text-left p-3 bg-white border border-[#E5E7EB] rounded-[8px] hover:border-[#0F52BA] transition-colors cursor-pointer"
        >
          <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
            Sample Records
          </div>
          <div className="mt-1 font-mono text-[18px] font-semibold text-[#111827] tabular-nums">
            {overview.totalSampleMeasurements}
          </div>
          <div className="text-[11px] text-[#6B7280]">
            {overview.validSampleMeasurements} valid · {overview.missingValueSamples} missing
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('samples')}
          className="text-left p-3 bg-white border border-[#E5E7EB] rounded-[8px] hover:border-[#0F52BA] transition-colors cursor-pointer"
        >
          <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
            Survey Links
          </div>
          <div className="mt-1 font-mono text-[18px] font-semibold text-[#0F52BA] tabular-nums">
            {overview.linkedSurveyCount}
          </div>
          <div className="text-[11px] text-[#6B7280]">
            {overview.discrepancyLinkCount} discrepancies · {overview.unresolvedLinkCount} unresolved
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('dilutions')}
          className="text-left p-3 bg-white border border-[#E5E7EB] rounded-[8px] hover:border-[#0F52BA] transition-colors cursor-pointer"
        >
          <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
            Dilution Records
          </div>
          <div className="mt-1 font-mono text-[18px] font-semibold text-[#111827] tabular-nums">
            {overview.dilutionRecordCount}
          </div>
          <div className="text-[11px] text-[#6B7280]">
            {overview.dilutionConflictCount} conflict(s)
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('quality')}
          className="text-left p-3 bg-white border border-[#E5E7EB] rounded-[8px] hover:border-[#0F52BA] transition-colors cursor-pointer"
        >
          <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
            Open Quality Items
          </div>
          <div className="mt-1 font-mono text-[18px] font-semibold text-[#92400E] tabular-nums">
            {overview.openQualityIssueCount}
          </div>
          <div className="text-[11px] text-[#6B7280]">
            {overview.flaggedSamples} flagged · {overview.excludedSamples} excluded
          </div>
        </button>

        <div className="p-3 bg-white border border-[#E5E7EB] rounded-[8px]">
          <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
            Analytes Tracked
          </div>
          <div className="mt-1 font-mono text-[18px] font-semibold text-[#111827] tabular-nums">
            {overview.totalAnalytes}
          </div>
          <div className="text-[11px] text-[#6B7280] truncate">
            {session.analytes.map((a) => a.symbol || a.name).join(', ') || 'None'}
          </div>
        </div>
      </div>

      {/* Explicit Status Distinction & Completeness Diagnostics (Zero misleading validity score) */}
      <Panel>
        <PanelHeader
          title="Completeness & Scientific Review Distinction"
          subtitle="Record completeness, mathematical analyzability, researcher review, and analytical method validation are tracked separately."
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onNavigateTab('quality')}
            >
              Inspect Quality Queue
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          }
        />
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
          <div className="p-3 rounded-[6px] border border-[#E5E7EB] bg-[#F8F9FA]">
            <div className="flex items-center gap-1.5 font-semibold text-[#111827]">
              {overview.statusDistinction.hasCompleteMetadata ? (
                <CheckCircle2 className="w-4 h-4 text-[#065F46]" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#92400E]" />
              )}
              1. Metadata Completeness
            </div>
            <p className="mt-1 text-[#4B5563]">
              {overview.statusDistinction.hasCompleteMetadata
                ? 'Core instrument, method reference, analyst, date, and analyte fields are recorded.'
                : `Missing: ${overview.statusDistinction.missingMetadataFields.join(', ')}.`}
            </p>
          </div>

          <div className="p-3 rounded-[6px] border border-[#E5E7EB] bg-[#F8F9FA]">
            <div className="flex items-center gap-1.5 font-semibold text-[#111827]">
              {overview.statusDistinction.hasMathematicallyAnalyzableCalibration ? (
                <CheckCircle2 className="w-4 h-4 text-[#0F52BA]" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#92400E]" />
              )}
              2. Mathematically Analyzable
            </div>
            <p className="mt-1 text-[#4B5563]">
              {overview.statusDistinction.hasMathematicallyAnalyzableCalibration
                ? `${overview.analyzableCalibrationDatasets} calibration dataset(s) satisfy exploratory OLS preconditions (n ≥ 2 distinct concentrations).`
                : 'No calibration dataset currently meets exploratory OLS preconditions.'}
            </p>
          </div>

          <div className="p-3 rounded-[6px] border border-[#E5E7EB] bg-[#F8F9FA]">
            <div className="flex items-center gap-1.5 font-semibold text-[#111827]">
              {overview.statusDistinction.hasResearcherReviewedRecords ? (
                <CheckCircle2 className="w-4 h-4 text-[#065F46]" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#6B7280]" />
              )}
              3. Researcher Review Status
            </div>
            <p className="mt-1 text-[#4B5563]">
              Session status: <span className="font-medium text-[#111827]">{session.scientificReviewStatus}</span>.{' '}
              {overview.openQualityIssueCount > 0
                ? `${overview.openQualityIssueCount} quality finding(s) remain open.`
                : 'No open quality findings.'}
            </p>
          </div>

          <div className="p-3 rounded-[6px] border border-[#FDE68A] bg-[#FFFBEB]">
            <div className="flex items-center gap-1.5 font-semibold text-[#92400E]">
              <ShieldAlert className="w-4 h-4 text-[#92400E]" />
              4. Method Validation
            </div>
            <p className="mt-1 text-[#92400E]">
              Not independently validated. Automated LOD/LOQ, spike recovery, and regulatory acceptance certification remain disabled.
            </p>
          </div>
        </div>
      </Panel>

      {/* Main Two-Column Grid: Session Metadata + Multi-Analyte Registry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel className="lg:col-span-7">
          <PanelHeader
            title="Analytical Session & Instrument Metadata"
            subtitle="Editable session provenance, instrument attribution, and method reference."
            actions={<ProvenanceIndicator provenance={session.provenance} />}
          />
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Session ID</FieldLabel>
              <input
                type="text"
                value={session.sessionId}
                onChange={(e) =>
                  onUpdateSessionMeta({ sessionId: e.target.value })
                }
                className={`${inputBaseClass} font-mono`}
              />
            </div>
            <div>
              <FieldLabel>Analytical Technique</FieldLabel>
              <select
                value={session.technique}
                onChange={(e) =>
                  onUpdateSessionMeta({
                    technique: e.target.value as InstrumentType,
                  })
                }
                className={inputBaseClass}
              >
                {INSTRUMENT_TECHNIQUES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {session.technique === 'Other' && (
              <div className="sm:col-span-2">
                <FieldLabel>Custom Technique Description</FieldLabel>
                <input
                  type="text"
                  value={session.customTechniqueName}
                  onChange={(e) =>
                    onUpdateSessionMeta({ customTechniqueName: e.target.value })
                  }
                  placeholder="Specify analytical technique..."
                  className={inputBaseClass}
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <FieldLabel>Session Title</FieldLabel>
              <input
                type="text"
                value={session.title}
                onChange={(e) => onUpdateSessionMeta({ title: e.target.value })}
                className={inputBaseClass}
              />
            </div>

            <div>
              <FieldLabel>Instrument Manufacturer</FieldLabel>
              <input
                type="text"
                value={session.instrumentManufacturer}
                onChange={(e) =>
                  onUpdateSessionMeta({ instrumentManufacturer: e.target.value })
                }
                placeholder="e.g. Agilent, PerkinElmer, Thermo"
                className={inputBaseClass}
              />
            </div>
            <div>
              <FieldLabel>Instrument Model</FieldLabel>
              <input
                type="text"
                value={session.instrumentModel}
                onChange={(e) =>
                  onUpdateSessionMeta({ instrumentModel: e.target.value })
                }
                placeholder="Model name"
                className={inputBaseClass}
              />
            </div>

            <div>
              <FieldLabel>Instrument Identifier / Asset Tag</FieldLabel>
              <input
                type="text"
                value={session.instrumentIdentifier}
                onChange={(e) =>
                  onUpdateSessionMeta({ instrumentIdentifier: e.target.value })
                }
                placeholder="e.g. LAB-ICP-02"
                className={`${inputBaseClass} font-mono`}
              />
            </div>
            <div>
              <FieldLabel>Method / SOP Reference</FieldLabel>
              <input
                type="text"
                value={session.methodReference}
                onChange={(e) =>
                  onUpdateSessionMeta({ methodReference: e.target.value })
                }
                placeholder="Recorded SOP or method identifier"
                className={inputBaseClass}
              />
            </div>

            <div>
              <FieldLabel>Analyst</FieldLabel>
              <input
                type="text"
                value={session.analyst}
                onChange={(e) => onUpdateSessionMeta({ analyst: e.target.value })}
                className={inputBaseClass}
              />
            </div>
            <div>
              <FieldLabel>Analysis Date</FieldLabel>
              <input
                type="date"
                value={session.analysisDate}
                onChange={(e) =>
                  onUpdateSessionMeta({ analysisDate: e.target.value })
                }
                className={`${inputBaseClass} font-mono`}
              />
            </div>

            <div>
              <FieldLabel>Data Provenance</FieldLabel>
              <select
                value={session.provenance}
                onChange={(e) =>
                  onUpdateSessionMeta({
                    provenance: e.target.value as DataProvenance,
                  })
                }
                className={inputBaseClass}
              >
                {(Object.keys(PROVENANCE_LABELS) as DataProvenance[]).map((p) => (
                  <option key={p} value={p}>
                    {PROVENANCE_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Scientific Review Status</FieldLabel>
              <select
                value={session.scientificReviewStatus}
                onChange={(e) =>
                  onUpdateSessionMeta({
                    scientificReviewStatus: e.target.value as ScientificReviewStatus,
                  })
                }
                className={inputBaseClass}
              >
                {REVIEW_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <FieldLabel>Sample Matrix Description</FieldLabel>
              <input
                type="text"
                value={session.matrixDescription}
                onChange={(e) =>
                  onUpdateSessionMeta({ matrixDescription: e.target.value })
                }
                placeholder="e.g. Diluted aqueous matrix (descriptive metadata only)"
                className={inputBaseClass}
              />
            </div>

            <div className="sm:col-span-2">
              <FieldLabel>Analyst Notes & Recorded Conditions</FieldLabel>
              <textarea
                rows={3}
                value={session.observations}
                onChange={(e) =>
                  onUpdateSessionMeta({ observations: e.target.value })
                }
                placeholder="Record analytical run observations, drift notes, or sample handling remarks..."
                className="w-full p-2.5 text-[12.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
              />
            </div>
          </div>
        </Panel>

        {/* Right Column: Multi-Analyte Manager + Provenance Distribution */}
        <div className="lg:col-span-5 space-y-4">
          <Panel>
            <PanelHeader
              title="Multi-Analyte Registry"
              subtitle="Track multiple elements/wavelengths in this session without inventing default lines."
            />
            <div className="p-4 space-y-3">
              <div className="space-y-2">
                {session.analytes.map((an) => {
                  const isActive = an.id === session.activeAnalyteId;
                  return (
                    <div
                      key={an.id}
                      className={`p-2.5 rounded-[6px] border ${
                        isActive
                          ? 'border-[#0F52BA] bg-[#EFF6FF]/40'
                          : 'border-[#E5E7EB] bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => onSelectAnalyte(an.id)}
                          className="text-[12.5px] font-semibold text-[#111827] hover:text-[#0F52BA] cursor-pointer text-left"
                        >
                          <span className="font-mono">{an.symbol || '—'}</span> · {an.name}
                          {isActive && (
                            <span className="ml-2 text-[10.5px] font-medium text-[#0F52BA]">
                              Active
                            </span>
                          )}
                        </button>
                        {session.analytes.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Delete analyte ${an.symbol || an.name}`}
                            onClick={() => onDeleteAnalyte(an.id)}
                            className="p-1 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <FieldLabel>Symbol</FieldLabel>
                          <input
                            type="text"
                            value={an.symbol}
                            onChange={(e) =>
                              onUpdateAnalyte(an.id, { symbol: e.target.value })
                            }
                            className={`${inputBaseClass} font-mono`}
                          />
                        </div>
                        <div>
                          <FieldLabel unit="nm">Wavelength</FieldLabel>
                          <NumericInput
                            value={an.wavelengthNm}
                            onChange={(val) =>
                              onUpdateAnalyte(an.id, { wavelengthNm: val })
                            }
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <FieldLabel>Unit</FieldLabel>
                          <input
                            type="text"
                            value={an.measurementUnit}
                            onChange={(e) =>
                              onUpdateAnalyte(an.id, {
                                measurementUnit: e.target.value,
                              })
                            }
                            className={`${inputBaseClass} font-mono`}
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <FieldLabel>Associated Calibration Dataset</FieldLabel>
                        <select
                          value={an.calibrationDatasetId ?? ''}
                          onChange={(e) =>
                            onUpdateAnalyte(an.id, {
                              calibrationDatasetId: e.target.value || null,
                            })
                          }
                          className={inputBaseClass}
                        >
                          <option value="">— None assigned —</option>
                          {session.calibrationDatasets.map((cal) => (
                            <option key={cal.id} value={cal.id}>
                              {cal.calibrationId} — {cal.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={handleAddAnalyte}
                className="pt-3 border-t border-[#E5E7EB] space-y-2"
              >
                <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-[#4B5563]">
                  Add Analyte to Session
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    placeholder="Symbol (e.g. Pd, Al)"
                    className={`${inputBaseClass} font-mono`}
                  />
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Name (e.g. Palladium)"
                    className={inputBaseClass}
                  />
                  <NumericInput
                    value={newWavelength}
                    onChange={setNewWavelength}
                    placeholder="Wavelength (nm)"
                  />
                  <input
                    type="text"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="Unit (e.g. ppm)"
                    className={`${inputBaseClass} font-mono`}
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={!newSymbol.trim() && !newName.trim()}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Analyte
                </Button>
              </form>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Sample Provenance Distribution"
              subtitle="Recorded source breakdown across all sample measurements in this session."
            />
            <div className="p-4">
              {provenanceEntries.length === 0 ? (
                <p className="text-[12.5px] text-[#6B7280]">
                  No sample measurements recorded in this session yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {provenanceEntries.map(([prov, count]) => (
                    <div
                      key={prov}
                      className="flex items-center justify-between text-[12px]"
                    >
                      <ProvenanceIndicator provenance={prov} />
                      <span className="font-mono font-medium text-[#111827] tabular-nums">
                        {count} record(s)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
