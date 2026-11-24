'use client';

import React from 'react';
import {
  AlertTriangle,
  Download,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  AnalyticalSession,
  DilutionRecord,
  ReportedValueBasis,
  VerificationStatus,
} from '../../domain/models/types';
import { DilutionDiagnosticIssue } from '../../domain/calculations/seaMath';
import {
  exportDilutionRecordsCsv,
  triggerFileDownload,
} from '../../services/import-export/backup';
import {
  Button,
  NumericInput,
  Panel,
  PanelHeader,
  VerificationIndicator,
  compactCellInputClass,
} from '../../components/ui/Primitives';

export interface DilutionRecordsTabProps {
  experimentId: string;
  session: AnalyticalSession;
  diagnostics: DilutionDiagnosticIssue[];
  onAddDilutionRecord: (record: Omit<DilutionRecord, 'id'>) => void;
  onUpdateDilutionRecord: (
    recordId: string,
    patch: Partial<DilutionRecord>
  ) => void;
  onDeleteDilutionRecord: (recordId: string) => void;
}

export function DilutionRecordsTab({
  experimentId,
  session,
  diagnostics,
  onAddDilutionRecord,
  onUpdateDilutionRecord,
  onDeleteDilutionRecord,
}: DilutionRecordsTabProps) {
  const handleAdd = () => {
    const firstSample = session.sampleMeasurements[0] ?? null;
    onAddDilutionRecord({
      sampleMeasurementId: firstSample?.id ?? null,
      sampleId: firstSample?.sampleId || `DIL-${session.dilutionRecords.length + 1}`,
      stage:
        firstSample?.stage === 'Initial' || firstSample?.stage === 'Final'
          ? firstSample.stage
          : 'Final',
      dilutionFactor: null,
      sourceVolumeMl: null,
      finalVolumeMl: null,
      concUnit: firstSample?.concUnit || 'ppm',
      reportedValueBasis: 'as_measured_diluted',
      preparationReference: '',
      matrixDescription: session.matrixDescription,
      analyst: session.analyst,
      date: session.analysisDate,
      verificationStatus: 'unverified',
      provenance: 'user_entered',
      notes: '',
    });
  };

  return (
    <div className="space-y-4">
      {/* Scope & Safety Boundary Notice */}
      <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] flex items-start gap-2.5 text-[12px] text-[#92400E]">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">
            Traceable Dilution Documentation Only:
          </span>{' '}
          Record already-performed initial and final sample dilution metadata for analytical transparency and double-correction prevention. SEA Workbench does not generate pipetting schedules, acid/base digestion volumes, or chemical preparation recipes.
        </div>
      </div>

      {/* Consistency & Duplicate-Correction Diagnostics */}
      <Panel>
        <PanelHeader
          title={`Dilution Consistency Diagnostics (${diagnostics.length} finding${diagnostics.length === 1 ? '' : 's'})`}
          subtitle="Checks recorded dilution factors against source/final volumes, sample table factors, and instrument software pre-correction flags."
        />
        <div className="p-4">
          {diagnostics.length === 0 ? (
            <p className="text-[12.5px] text-[#065F46]">
              No dilution ratio conflicts, missing factors, or duplicate-correction warnings detected in this session.
            </p>
          ) : (
            <div className="space-y-2">
              {diagnostics.map((d) => (
                <div
                  key={d.id}
                  className={`px-3 py-2 rounded-[6px] border text-[12px] flex items-start gap-2 ${
                    d.severity === 'conflict'
                      ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                      : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-mono font-semibold">{d.sampleId}</span>{' '}
                    — {d.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* Dilution Metadata Table */}
      <Panel>
        <PanelHeader
          title={`Recorded Dilution Metadata (${session.dilutionRecords.length})`}
          subtitle="Independent dilution entries for initial and final aliquots linked to analytical sample measurements."
          actions={
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="primary" onClick={handleAdd}>
                <Plus className="w-3.5 h-3.5" />
                Add Dilution Record
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  triggerFileDownload(
                    exportDilutionRecordsCsv(experimentId, session),
                    `${experimentId}-${session.sessionId}-dilutions.csv`,
                    'text/csv;charset=utf-8'
                  )
                }
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </Button>
            </div>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead className="bg-[#F8F9FA] border-b border-[#E5E7EB]">
              <tr className="text-left text-[10.5px] uppercase tracking-[0.04em] text-[#6B7280]">
                <th className="px-3 py-2 min-w-[140px]">Linked Sample</th>
                <th className="px-2 py-2">Stage</th>
                <th className="px-2 py-2 text-right w-24">Factor (×)</th>
                <th className="px-2 py-2 text-right w-24">Source (mL)</th>
                <th className="px-2 py-2 text-right w-24">Final (mL)</th>
                <th className="px-2 py-2 text-right w-20">Ratio</th>
                <th className="px-2 py-2 min-w-[165px]">Instrument Output Basis</th>
                <th className="px-2 py-2 min-w-[125px]">Prep Ref</th>
                <th className="px-2 py-2">Verification</th>
                <th className="px-2 py-2 min-w-[170px]">Notes</th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {session.dilutionRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-[#6B7280]">
                    No dilution records documented in this session yet.
                  </td>
                </tr>
              ) : (
                session.dilutionRecords.map((rec) => {
                  const implied =
                    rec.sourceVolumeMl &&
                    rec.finalVolumeMl &&
                    rec.sourceVolumeMl > 0
                      ? rec.finalVolumeMl / rec.sourceVolumeMl
                      : null;
                  const hasConflict = diagnostics.some(
                    (d) =>
                      d.dilutionRecordId === rec.id && d.severity === 'conflict'
                  );

                  return (
                    <tr
                      key={rec.id}
                      className={hasConflict ? 'bg-[#FEF2F2]/50' : 'hover:bg-[#F8F9FA]'}
                    >
                      <td className="px-2 py-1.5">
                        <select
                          value={rec.sampleMeasurementId ?? ''}
                          onChange={(e) => {
                            const sample = session.sampleMeasurements.find(
                              (s) => s.id === e.target.value
                            );
                            onUpdateDilutionRecord(rec.id, {
                              sampleMeasurementId: e.target.value || null,
                              sampleId: sample ? sample.sampleId : rec.sampleId,
                            });
                          }}
                          className="h-7 px-1.5 text-[11.5px] font-mono bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px] w-full"
                        >
                          <option value="">— Unlinked ({rec.sampleId}) —</option>
                          {session.sampleMeasurements.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.sampleId} ({s.stage})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={rec.stage}
                          onChange={(e) =>
                            onUpdateDilutionRecord(rec.id, {
                              stage: e.target.value as DilutionRecord['stage'],
                            })
                          }
                          className="h-7 px-1.5 text-[11.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px]"
                        >
                          <option value="Initial">Initial</option>
                          <option value="Final">Final</option>
                          <option value="Other">Other</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <NumericInput
                          compact
                          min={0}
                          value={rec.dilutionFactor}
                          onChange={(v) =>
                            onUpdateDilutionRecord(rec.id, { dilutionFactor: v })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumericInput
                          compact
                          min={0}
                          value={rec.sourceVolumeMl}
                          onChange={(v) =>
                            onUpdateDilutionRecord(rec.id, { sourceVolumeMl: v })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumericInput
                          compact
                          min={0}
                          value={rec.finalVolumeMl}
                          onChange={(v) =>
                            onUpdateDilutionRecord(rec.id, { finalVolumeMl: v })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-right tabular-nums text-[#4B5563]">
                        {implied !== null ? `${implied.toFixed(2)}×` : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={rec.reportedValueBasis}
                          onChange={(e) =>
                            onUpdateDilutionRecord(rec.id, {
                              reportedValueBasis: e.target
                                .value as ReportedValueBasis,
                            })
                          }
                          className="h-7 px-1.5 text-[11px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px] w-full"
                        >
                          <option value="as_measured_diluted">
                            As-Measured (Diluted)
                          </option>
                          <option value="already_dilution_corrected">
                            Already Dilution-Corrected
                          </option>
                          <option value="unspecified">Unspecified</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={rec.preparationReference}
                          placeholder="Prep log ref..."
                          onChange={(e) =>
                            onUpdateDilutionRecord(rec.id, {
                              preparationReference: e.target.value,
                            })
                          }
                          className={`${compactCellInputClass} font-mono`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <select
                            aria-label={`Verification status for ${rec.sampleId}`}
                            value={rec.verificationStatus}
                            onChange={(e) =>
                              onUpdateDilutionRecord(rec.id, {
                                verificationStatus: e.target
                                  .value as VerificationStatus,
                              })
                            }
                            className="h-7 px-1 text-[11px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px]"
                          >
                            <option value="unverified">Unverified</option>
                            <option value="internal_check">Internal Check</option>
                            <option value="synthetic_fixture">Synthetic</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={rec.notes}
                          placeholder="Notes..."
                          onChange={(e) =>
                            onUpdateDilutionRecord(rec.id, {
                              notes: e.target.value,
                            })
                          }
                          className={compactCellInputClass}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          aria-label={`Delete dilution record ${rec.sampleId}`}
                          onClick={() => onDeleteDilutionRecord(rec.id)}
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
        {session.dilutionRecords.length > 0 && (
          <div className="px-4 py-2 border-t border-[#E5E7EB] bg-[#F8F9FA] flex flex-wrap items-center gap-3 text-[11.5px] text-[#6B7280]">
            <span>Verification Legend:</span>
            <VerificationIndicator status="unverified" />
            <VerificationIndicator status="internal_check" />
            <VerificationIndicator status="synthetic_fixture" />
          </div>
        )}
      </Panel>
    </div>
  );
}
