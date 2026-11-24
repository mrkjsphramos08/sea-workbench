'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPaste, Upload } from 'lucide-react';
import {
  DataProvenance,
  SurveyMeasurement,
  SurveyMode,
} from '../../domain/models/types';
import {
  CsvColumnMapping,
  ImportTargetField,
  TARGET_FIELD_METADATA,
  parseDelimitedText,
  suggestCsvColumnMappings,
  validateAndBuildCsvImport,
} from '../../services/import-export/surveyCsvImport';
import {
  Button,
  FieldLabel,
  Modal,
  inputBaseClass,
} from '../../components/ui/Primitives';

const TARGET_FIELD_OPTIONS: ImportTargetField[] = [
  'ignore',
  'sampleId',
  'sampleGroupId',
  'replicateId',
  'targetInitialPh',
  'measuredInitialPh',
  'measuredFinalPh',
  'initialConcPpm',
  'finalConcPpm',
  'supportMassMg',
  'solutionVolumeMl',
  'recordedUptakeUmolM2',
  'qualityStatus',
  'provenance',
  'measurementDate',
  'notes',
];

const SAMPLE_CSV_TEMPLATE = `Sample_ID,Sample_Group_ID,Replicate_ID,Measured_Initial_pH (pH),Measured_Final_pH (pH),Initial_Conc (ppm),Final_Conc (ppm),Support_Mass (mg),Solution_Volume (mL),Recorded_Uptake (umol/m2),Notes
UPT-11,GRP-11,R1,8.50,8.25,200.0,152.4,500,50,1.42,Imported batch row 1
UPT-11B,GRP-11,R2,8.52,8.28,200.0,154.0,500,50,1.38,Imported replicate row 2
UPT-12,GRP-12,R1,9.50,9.12,200.0,,500,50,,Final analytical assay pending`;

export function CsvImportModal({
  open,
  onClose,
  surveyMode,
  existingRowCount,
  defaultDate,
  onConfirmImport,
}: {
  open: boolean;
  onClose: () => void;
  surveyMode: SurveyMode;
  existingRowCount: number;
  defaultDate: string;
  onConfirmImport: (rows: SurveyMeasurement[]) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawText, setRawText] = useState('');
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [defaultProvenance, setDefaultProvenance] = useState<DataProvenance>(
    'measured_experimental'
  );
  const [mappings, setMappings] = useState<CsvColumnMapping[]>([]);

  const parsedTable = useMemo(() => {
    if (!rawText.trim()) return null;
    return parseDelimitedText(rawText);
  }, [rawText]);

  const handleLoadText = (text: string, filename: string | null = null) => {
    setRawText(text);
    setSourceFilename(filename);
    const parsed = parseDelimitedText(text);
    setMappings(suggestCsvColumnMappings(parsed.headers));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      handleLoadText(content, file.name);
    };
    reader.readAsText(file);
  };

  const validation = useMemo(() => {
    if (!parsedTable || mappings.length === 0) return null;
    return validateAndBuildCsvImport(parsedTable, mappings, {
      defaultDate,
      defaultProvenance,
      surveyMode,
      existingRowCount,
    });
  }, [
    parsedTable,
    mappings,
    defaultDate,
    defaultProvenance,
    surveyMode,
    existingRowCount,
  ]);

  const handleResetAndClose = () => {
    setStep(1);
    setRawText('');
    setSourceFilename(null);
    setMappings([]);
    onClose();
  };

  const handleCommit = () => {
    if (!validation || validation.acceptedRows.length === 0) return;
    onConfirmImport(validation.acceptedRows);
    handleResetAndClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleResetAndClose}
      title="Import Survey Measurements (CSV / Spreadsheet Paste)"
      description="Structured multi-step import with explicit column mapping, unit compatibility checks, and null preservation."
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Stepper Indicator */}
        <div className="flex items-center gap-2 text-[11.5px] font-medium border-b border-[#E5E7EB] pb-3">
          {[
            { id: 1, label: '1. Select File or Paste Data' },
            { id: 2, label: '2. Preview & Map Columns / Units' },
            { id: 3, label: '3. Validate & Confirm Import' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={s.id > 1 && (!parsedTable || parsedTable.headers.length === 0)}
              onClick={() => setStep(s.id as 1 | 2 | 3)}
              className={`px-2.5 py-1 rounded-[5px] border transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                step === s.id
                  ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#0F52BA]'
                  : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#4B5563]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* STEP 1: Source Input */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px]">
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="inline-flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium bg-white text-[#111827] border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-[6px] cursor-pointer">
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Select CSV / TSV File</span>
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    handleLoadText(SAMPLE_CSV_TEMPLATE, 'example-template.csv')
                  }
                >
                  <ClipboardPaste className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Load Example CSV Format
                </Button>
                {sourceFilename && (
                  <span className="font-mono text-[11.5px] text-[#0F52BA]">
                    Loaded: {sourceFilename}
                  </span>
                )}
              </div>

              <div className="w-52">
                <FieldLabel htmlFor="import-default-prov">
                  Default Row Provenance
                </FieldLabel>
                <select
                  id="import-default-prov"
                  value={defaultProvenance}
                  onChange={(e) =>
                    setDefaultProvenance(e.target.value as DataProvenance)
                  }
                  className={inputBaseClass}
                >
                  <option value="measured_experimental">
                    Measured Experimental
                  </option>
                  <option value="user_entered">User Entered</option>
                  <option value="literature_reference">
                    Literature Reference
                  </option>
                  <option value="synthetic_demo">Synthetic Demo</option>
                </select>
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="csv-paste-area">
                Paste CSV or Tab-Separated Spreadsheet Rows (Header Row Required)
              </FieldLabel>
              <textarea
                id="csv-paste-area"
                rows={8}
                value={rawText}
                onChange={(e) => handleLoadText(e.target.value, null)}
                placeholder="Paste comma-separated CSV or spreadsheet cells copied from Excel / OriginLab / Google Sheets (first row = column headers)..."
                className="w-full p-3 font-mono text-[12px] text-[#111827] bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA] resize-y"
              />
            </div>

            {parsedTable && parsedTable.headers.length > 0 && (
              <div className="text-[12px] text-[#4B5563] flex flex-wrap items-center gap-4">
                <span>
                  Detected Delimiter:{' '}
                  <strong className="font-mono text-[#111827]">
                    {parsedTable.delimiter === '\t'
                      ? 'TAB (Spreadsheet)'
                      : parsedTable.delimiter === ';'
                        ? 'Semicolon (;)'
                        : 'Comma (,)'}
                  </strong>
                </span>
                <span>
                  Columns:{' '}
                  <strong className="font-mono text-[#111827]">
                    {parsedTable.headers.length}
                  </strong>
                </span>
                <span>
                  Data Rows:{' '}
                  <strong className="font-mono text-[#111827]">
                    {parsedTable.rows.length}
                  </strong>
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
              <Button variant="secondary" onClick={handleResetAndClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={
                  !parsedTable ||
                  parsedTable.headers.length === 0 ||
                  parsedTable.rows.length === 0
                }
                onClick={() => setStep(2)}
              >
                Next: Map Columns &amp; Units
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Preview & Column / Unit Mapping */}
        {step === 2 && parsedTable && (
          <div className="space-y-4">
            <div className="text-[12px] text-[#4B5563]">
              Verify column mappings and source units. Compatible units (e.g.,{' '}
              <span className="font-mono">g → mg</span>,{' '}
              <span className="font-mono">L → mL</span>,{' '}
              <span className="font-mono">mg/L → ppm</span>) are converted
              explicitly; incompatible units are blocked rather than guessed.
            </div>

            <div className="overflow-x-auto border border-[#E5E7EB] rounded-[6px]">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[10.5px] uppercase tracking-[0.04em] text-[#4B5563]">
                    <th className="py-2 px-3 font-medium">Source Header</th>
                    <th className="py-2 px-3 font-medium">Sample Value (Row 1)</th>
                    <th className="py-2 px-3 font-medium">Target Field</th>
                    <th className="py-2 px-3 font-medium">Source Unit</th>
                    <th className="py-2 px-3 font-medium">Expected Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {mappings.map((m, idx) => {
                    const meta = TARGET_FIELD_METADATA[m.targetField];
                    const sampleVal = parsedTable.rows[0]?.[m.columnIndex] ?? '—';
                    return (
                      <tr key={m.columnIndex}>
                        <td className="py-2 px-3 font-mono font-medium text-[#111827]">
                          {m.header}
                        </td>
                        <td className="py-2 px-3 font-mono text-[#6B7280] max-w-[160px] truncate">
                          {sampleVal || '—'}
                        </td>
                        <td className="py-1.5 px-3">
                          <select
                            aria-label={`Map column ${m.header}`}
                            value={m.targetField}
                            onChange={(e) => {
                              const nextField = e.target
                                .value as ImportTargetField;
                              const nextExpected =
                                TARGET_FIELD_METADATA[nextField].expectedUnit ??
                                '';
                              setMappings((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        targetField: nextField,
                                        sourceUnit:
                                          item.sourceUnit || nextExpected,
                                      }
                                    : item
                                )
                              );
                            }}
                            className="h-7 px-2 text-[12px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[5px]"
                          >
                            {TARGET_FIELD_OPTIONS.map((f) => (
                              <option key={f} value={f}>
                                {TARGET_FIELD_METADATA[f].label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 px-3">
                          {meta.expectedUnit ? (
                            <input
                              type="text"
                              aria-label={`Source unit for ${m.header}`}
                              value={m.sourceUnit}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMappings((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? { ...item, sourceUnit: val }
                                      : item
                                  )
                                );
                              }}
                              className="w-24 h-7 px-2 font-mono text-[12px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[5px]"
                            />
                          ) : (
                            <span className="text-[#9CA3AF]">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11.5px] text-[#4B5563]">
                          {meta.expectedUnit || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Raw Preview (first 5 rows) */}
            <div>
              <div className="text-[11px] uppercase tracking-[0.05em] font-medium text-[#4B5563] mb-1.5">
                Raw Data Preview (First {Math.min(5, parsedTable.rows.length)} of{' '}
                {parsedTable.rows.length} Rows)
              </div>
              <div className="overflow-x-auto border border-[#E5E7EB] rounded-[6px]">
                <table className="w-full text-left border-collapse text-[11.5px] font-mono">
                  <thead>
                    <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[#4B5563]">
                      {parsedTable.headers.map((h, i) => (
                        <th key={i} className="py-1.5 px-2 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {parsedTable.rows.slice(0, 5).map((r, rIdx) => (
                      <tr key={rIdx}>
                        {parsedTable.headers.map((_, cIdx) => (
                          <td key={cIdx} className="py-1 px-2 text-[#111827] whitespace-nowrap">
                            {r[cIdx] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-2 border-t border-[#E5E7EB]">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="primary" onClick={() => setStep(3)}>
                Next: Inspect Validation Results
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Validation Summary & Confirmation */}
        {step === 3 && validation && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
              <div className="p-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px]">
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#6B7280]">
                  Source Rows
                </div>
                <div className="font-mono text-[16px] font-semibold text-[#111827] mt-0.5">
                  {validation.summary.totalSourceRows}
                </div>
              </div>
              <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-[6px]">
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#065F46]">
                  Accepted Rows
                </div>
                <div className="font-mono text-[16px] font-semibold text-[#065F46] mt-0.5">
                  {validation.summary.acceptedCount}
                </div>
              </div>
              <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px]">
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#92400E]">
                  Incomplete (Nulls Preserved)
                </div>
                <div className="font-mono text-[16px] font-semibold text-[#92400E] mt-0.5">
                  {validation.summary.incompleteCount}
                </div>
              </div>
              <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[6px]">
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-[#991B1B]">
                  Rejected Rows
                </div>
                <div className="font-mono text-[16px] font-semibold text-[#991B1B] mt-0.5">
                  {validation.summary.rejectedCount}
                </div>
              </div>
            </div>

            {validation.unitErrors.length > 0 && (
              <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[6px] text-[12px] text-[#991B1B] space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  <span>Unit Compatibility Error — Import Blocked</span>
                </div>
                {validation.unitErrors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}

            {validation.issues.length > 0 && validation.unitErrors.length === 0 && (
              <div className="border border-[#E5E7EB] rounded-[6px] overflow-hidden">
                <div className="px-3 py-2 bg-[#F8F9FA] border-b border-[#E5E7EB] text-[11.5px] font-medium text-[#4B5563]">
                  Validation Findings ({validation.issues.length})
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-[#E5E7EB] text-[12px]">
                  {validation.issues.slice(0, 40).map((issue, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-1.5 flex items-start gap-2.5"
                    >
                      <span
                        className={`font-mono text-[10.5px] px-1.5 py-0.5 rounded-[4px] border shrink-0 ${
                          issue.severity === 'error'
                            ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                            : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                        }`}
                      >
                        Row {issue.rowNumber}
                      </span>
                      <span className="font-mono text-[#111827] shrink-0">
                        {issue.rawSampleId}
                      </span>
                      <span className="text-[#4B5563]">{issue.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {validation.issues.length === 0 &&
              validation.summary.acceptedCount > 0 && (
                <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-[6px] text-[12px] text-[#065F46] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  <span>
                    All {validation.summary.acceptedCount} row(s) passed unit
                    and type validation cleanly.
                  </span>
                </div>
              )}

            <div className="flex justify-between gap-2 pt-2 border-t border-[#E5E7EB]">
              <Button variant="secondary" onClick={() => setStep(2)}>
                Back to Column Mapping
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={handleResetAndClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={validation.acceptedRows.length === 0}
                  onClick={handleCommit}
                >
                  Confirm Import ({validation.acceptedRows.length} Row
                  {validation.acceptedRows.length === 1 ? '' : 's'})
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
