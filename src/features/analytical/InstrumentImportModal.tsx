'use client';

import React, { useMemo, useState } from 'react';
import { Upload, Save, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  AnalyticalAnalyte,
  AnalyticalSession,
  DataProvenance,
  ImportMappingTemplate,
  InstrumentImportColumnKey,
  InstrumentImportRecord,
  InstrumentMeasurement,
  ReportedValueBasis,
} from '../../domain/models/types';
import {
  InstrumentColumnMapping,
  parseDelimitedText,
  suggestInstrumentColumnMapping,
  validateAndBuildInstrumentImport,
} from '../../services/import-export/analyticalImport';
import { generateUuid } from '../../data/demo/demoWorkspace';
import {
  MEASUREMENT_QUALIFIER_LABELS,
  resolveEffectiveMeasurementQualifier,
} from '../../domain/calculations/workflowEngine';
import { Button, FieldLabel, Modal, inputBaseClass } from '../../components/ui/Primitives';

const COLUMN_FIELDS: Array<{ key: InstrumentImportColumnKey; label: string; required?: boolean }> = [
  { key: 'sampleId', label: 'Sample ID', required: true },
  { key: 'analyte', label: 'Analyte / Element' },
  { key: 'stage', label: 'Stage / Classification' },
  { key: 'replicateId', label: 'Replicate ID' },
  { key: 'reportedConc', label: 'Reported Concentration' },
  { key: 'concUnit', label: 'Concentration Unit' },
  { key: 'rawSignal', label: 'Raw Signal / Intensity' },
  { key: 'signalUnit', label: 'Signal Unit' },
  { key: 'dilutionFactor', label: 'Dilution Factor' },
  { key: 'analysisTimestamp', label: 'Acquisition Timestamp / Date' },
  { key: 'instrumentFlag', label: 'Instrument Warning / QC Flag' },
  { key: 'notes', label: 'Notes / Comments' },
];

export interface InstrumentImportModalProps {
  open: boolean;
  onClose: () => void;
  session: AnalyticalSession;
  activeAnalyte: AnalyticalAnalyte | null;
  knownSurveySampleIds: string[];
  templates: ImportMappingTemplate[];
  onSaveTemplate: (
    template: Omit<ImportMappingTemplate, 'id' | 'createdAt'>
  ) => void;
  onDeleteTemplate: (templateId: string) => void;
  onCommitImport: (
    rows: InstrumentMeasurement[],
    importRecord: InstrumentImportRecord
  ) => void;
}

export function InstrumentImportModal({
  open,
  onClose,
  session,
  activeAnalyte,
  knownSurveySampleIds,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onCommitImport,
}: InstrumentImportModalProps) {
  const [rawText, setRawText] = useState('');
  const [filename, setFilename] = useState('clipboard-paste.csv');
  const [format, setFormat] = useState<'csv' | 'tsv' | 'clipboard'>('clipboard');
  const [mapping, setMapping] = useState<InstrumentColumnMapping>({});
  const [defaultConcUnit, setDefaultConcUnit] = useState(
    activeAnalyte?.measurementUnit || 'ppm'
  );
  const [defaultSignalUnit, setDefaultSignalUnit] = useState(
    session.technique.includes('AAS') ? 'Abs' : 'cps'
  );
  const [defaultProvenance, setDefaultProvenance] =
    useState<DataProvenance>('measured_experimental');
  const [defaultValueBasis, setDefaultValueBasis] =
    useState<ReportedValueBasis>('as_measured_diluted');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [templateName, setTemplateName] = useState('');

  const parsed = useMemo(() => parseDelimitedText(rawText), [rawText]);

  const handleLoadText = (
    text: string,
    name: string,
    srcFormat: 'csv' | 'tsv' | 'clipboard'
  ) => {
    setRawText(text);
    setFilename(name);
    setFormat(srcFormat);
    const p = parseDelimitedText(text);
    if (p.headers.length > 0) {
      setMapping(suggestInstrumentColumnMapping(p.headers));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const ext = file.name.toLowerCase().endsWith('.tsv') ? 'tsv' : 'csv';
      handleLoadText(content, file.name, ext);
    };
    reader.readAsText(file);
  };

  const applyTemplate = (tmpl: ImportMappingTemplate) => {
    const next: InstrumentColumnMapping = {};
    for (const [k, header] of Object.entries(tmpl.mappings)) {
      if (header && parsed.headers.includes(header)) {
        next[k as InstrumentImportColumnKey] = header;
      }
    }
    setMapping(next);
  };

  const validation = useMemo(() => {
    if (parsed.headers.length === 0 || parsed.rows.length === 0) return null;
    return validateAndBuildInstrumentImport({
      headers: parsed.headers,
      rawRows: parsed.rows,
      mapping,
      sessionId: session.id,
      filename,
      format,
      defaultAnalyte: activeAnalyte,
      defaultCalibrationDatasetId:
        activeAnalyte?.calibrationDatasetId ??
        session.activeCalibrationDatasetId ??
        null,
      defaultConcUnit,
      defaultSignalUnit,
      defaultDate: session.analysisDate || new Date().toISOString().slice(0, 10),
      defaultProvenance,
      defaultValueBasis,
      existingMeasurements: session.sampleMeasurements,
      knownSurveySampleIds,
      idGenerator: generateUuid,
    });
  }, [
    parsed,
    mapping,
    session.id,
    session.activeCalibrationDatasetId,
    session.analysisDate,
    session.sampleMeasurements,
    filename,
    format,
    activeAnalyte,
    defaultConcUnit,
    defaultSignalUnit,
    defaultProvenance,
    defaultValueBasis,
    knownSurveySampleIds,
  ]);

  const rowsToCommit = useMemo(() => {
    if (!validation) return [];
    if (skipDuplicates) return validation.acceptedRecords;
    const dupRecords = validation.rows
      .filter((r) => r.status === 'duplicate' && r.record)
      .map((r) => r.record as InstrumentMeasurement);
    return [...validation.acceptedRecords, ...dupRecords];
  }, [validation, skipDuplicates]);

  const handleCommit = () => {
    if (!validation || rowsToCommit.length === 0) return;
    onCommitImport(rowsToCommit, validation.importRecord);
    setRawText('');
    onClose();
  };

  const loadSampleSnippet = () => {
    const snippet = [
      'Sample_ID,Analyte,Stage,Replicate,Conc,Unit,Intensity_cps,Dilution_Factor,QC_Flag,Notes',
      'UPT-01-FIN,Pt,Final,R1,19.82,ppm,72650,10,,Imported ICP-OES synthetic check',
      'UPT-02-FIN,Pt,Final,R1,<0.02,ppm,95,10,BELOW_LOD,Below externally supplied LOD (preserved as null)',
      'UPT-03-FIN,Pt,Final,R1,BDL,ppm,128,10,BELOW_DL,Preserved as null with qualifier',
      'UPT-04-BLK,Pt,Blank,R1,0,ppm,42,1,,Valid measured zero',
    ].join('\n');
    handleLoadText(snippet, 'sample-icp-export.csv', 'csv');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Instrument Data (CSV / TSV / Clipboard)"
      description={`Target session: ${session.sessionId} (${session.technique}). Original imported values, headers, and row numbers are preserved; blank or BDL cells remain null.`}
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Step 1: Source Input */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <FieldLabel>Upload Instrument CSV / TSV File</FieldLabel>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium bg-white border border-[#E5E7EB] rounded-[6px] hover:bg-[#F8F9FA] cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#0F52BA]" />
                Choose File
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <Button size="sm" variant="ghost" onClick={loadSampleSnippet}>
                Load Sample CSV
              </Button>
            </div>
          </div>
          <div>
            <FieldLabel>Saved Mapping Templates</FieldLabel>
            <div className="flex flex-wrap items-center gap-1.5">
              {templates.length === 0 && (
                <span className="text-[12px] text-[#6B7280]">No saved templates yet.</span>
              )}
              {templates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="inline-flex items-center border border-[#E5E7EB] rounded-[4px] bg-[#F8F9FA] text-[11.5px]"
                >
                  <button
                    type="button"
                    onClick={() => applyTemplate(tmpl)}
                    className="px-2 py-1 hover:text-[#0F52BA] cursor-pointer"
                  >
                    {tmpl.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete template ${tmpl.name}`}
                    onClick={() => onDeleteTemplate(tmpl.id)}
                    className="px-1.5 py-1 text-[#6B7280] hover:text-[#991B1B] border-l border-[#E5E7EB] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <FieldLabel>Or Paste Tabular Instrument Output (CSV / TSV)</FieldLabel>
          <textarea
            rows={4}
            value={rawText}
            onChange={(e) =>
              handleLoadText(e.target.value, filename || 'clipboard-paste.csv', 'clipboard')
            }
            placeholder="Sample_ID,Analyte,Stage,Replicate,Conc,Unit,Intensity_cps,Dilution_Factor,QC_Flag,Notes"
            className="w-full p-2.5 text-[12px] font-mono bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
          />
        </div>

        {/* Step 2: Explicit Import Defaults (no silent guessing) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-[#E5E7EB]">
          <div>
            <FieldLabel>Fallback Conc Unit</FieldLabel>
            <input
              type="text"
              value={defaultConcUnit}
              onChange={(e) => setDefaultConcUnit(e.target.value)}
              placeholder="e.g. ppm"
              className={inputBaseClass}
            />
          </div>
          <div>
            <FieldLabel>Fallback Signal Unit</FieldLabel>
            <input
              type="text"
              value={defaultSignalUnit}
              onChange={(e) => setDefaultSignalUnit(e.target.value)}
              placeholder="e.g. cps or Abs"
              className={inputBaseClass}
            />
          </div>
          <div>
            <FieldLabel>Reported Value Basis</FieldLabel>
            <select
              value={defaultValueBasis}
              onChange={(e) =>
                setDefaultValueBasis(e.target.value as ReportedValueBasis)
              }
              className={inputBaseClass}
            >
              <option value="as_measured_diluted">As-Measured (Diluted Aliquot)</option>
              <option value="already_dilution_corrected">
                Already Dilution-Corrected by Instrument
              </option>
              <option value="unspecified">Unspecified</option>
            </select>
          </div>
          <div>
            <FieldLabel>Provenance</FieldLabel>
            <select
              value={defaultProvenance}
              onChange={(e) =>
                setDefaultProvenance(e.target.value as DataProvenance)
              }
              className={inputBaseClass}
            >
              <option value="measured_experimental">Measured Experimental</option>
              <option value="user_entered">User Entered</option>
              <option value="synthetic_demo">Synthetic Demo</option>
            </select>
          </div>
        </div>

        {/* Step 3: Column Mapping */}
        {parsed.headers.length > 0 && (
          <div className="pt-2 border-t border-[#E5E7EB]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-[12px] font-semibold text-[#111827]">
                Column Mapping ({parsed.headers.length} columns detected · {parsed.rows.length} rows)
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Save mapping as template..."
                  className="h-7 px-2 text-[12px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[4px]"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!templateName.trim()}
                  onClick={() => {
                    onSaveTemplate({
                      name: templateName.trim(),
                      technique: session.technique,
                      mappings: mapping,
                    });
                    setTemplateName('');
                  }}
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Template
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {COLUMN_FIELDS.map((field) => (
                <div key={field.key}>
                  <FieldLabel required={field.required}>{field.label}</FieldLabel>
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(e) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field.key]: e.target.value || undefined,
                      }))
                    }
                    className={inputBaseClass}
                  >
                    <option value="">— Unmapped —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Validation Summary & Preview */}
        {validation && (
          <div className="pt-2 border-t border-[#E5E7EB] space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px]">
              <div className="p-2 bg-[#ECFDF5] border border-[#A7F3D0] rounded-[6px]">
                <div className="text-[10.5px] uppercase text-[#065F46]">Accepted</div>
                <div className="font-mono font-semibold text-[#065F46]">
                  {validation.acceptedCount}
                </div>
              </div>
              <div className="p-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px]">
                <div className="text-[10.5px] uppercase text-[#92400E]">Incomplete</div>
                <div className="font-mono font-semibold text-[#92400E]">
                  {validation.incompleteCount}
                </div>
              </div>
              <div className="p-2 bg-[#FEF2F2] border border-[#FECACA] rounded-[6px]">
                <div className="text-[10.5px] uppercase text-[#991B1B]">Rejected</div>
                <div className="font-mono font-semibold text-[#991B1B]">
                  {validation.rejectedCount}
                </div>
              </div>
              <div className="p-2 bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]">
                <div className="text-[10.5px] uppercase text-[#4B5563]">Duplicates</div>
                <div className="font-mono font-semibold text-[#111827]">
                  {validation.duplicateCount}
                </div>
              </div>
              <div className="p-2 bg-[#EFF6FF] border border-[#BFDBFE] rounded-[6px]">
                <div className="text-[10.5px] uppercase text-[#0F52BA]">Unresolved Links</div>
                <div className="font-mono font-semibold text-[#0F52BA]">
                  {validation.unresolvedLinkCount}
                </div>
              </div>
            </div>

            {validation.duplicateCount > 0 && (
              <label className="flex items-center gap-2 text-[12px] text-[#4B5563]">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                />
                Skip duplicate Sample ID + Analyte + Stage + Replicate rows during commit
              </label>
            )}

            <div className="max-h-48 overflow-auto border border-[#E5E7EB] rounded-[6px]">
              <table className="w-full text-[11.5px] border-collapse">
                <thead className="bg-[#F8F9FA] sticky top-0 border-b border-[#E5E7EB]">
                  <tr className="text-left text-[10.5px] uppercase text-[#6B7280]">
                    <th className="px-2 py-1.5">Row</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Sample ID</th>
                    <th className="px-2 py-1.5">Analyte</th>
                    <th className="px-2 py-1.5">Stage</th>
                    <th className="px-2 py-1.5 text-right">Conc</th>
                    <th className="px-2 py-1.5">Qualifier</th>
                    <th className="px-2 py-1.5">Unit</th>
                    <th className="px-2 py-1.5">Diagnostics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {validation.rows.slice(0, 50).map((row) => {
                    const qualifier = row.record
                      ? resolveEffectiveMeasurementQualifier(row.record)
                      : null;
                    return (
                      <tr key={row.rowNumber}>
                        <td className="px-2 py-1 font-mono text-[#6B7280]">{row.rowNumber}</td>
                        <td className="px-2 py-1">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10.5px] font-medium ${
                              row.status === 'accepted'
                                ? 'bg-[#ECFDF5] text-[#065F46]'
                                : row.status === 'rejected'
                                  ? 'bg-[#FEF2F2] text-[#991B1B]'
                                  : 'bg-[#FFFBEB] text-[#92400E]'
                            }`}
                          >
                            {row.status === 'accepted' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <AlertTriangle className="w-3 h-3" />
                            )}
                            {row.status}
                          </span>
                        </td>
                        <td className="px-2 py-1 font-mono">{row.record?.sampleId ?? '—'}</td>
                        <td className="px-2 py-1">{row.record?.analyte || '—'}</td>
                        <td className="px-2 py-1">{row.record?.stage ?? '—'}</td>
                        <td className="px-2 py-1 font-mono text-right">
                          {row.record?.reportedConc !== null &&
                          row.record?.reportedConc !== undefined
                            ? row.record.reportedConc
                            : row.record?.originalValueToken || '—'}
                        </td>
                        <td className="px-2 py-1 font-mono text-[10.5px] text-[#374151]">
                          {qualifier
                            ? MEASUREMENT_QUALIFIER_LABELS[qualifier]
                            : '—'}
                        </td>
                        <td className="px-2 py-1 font-mono">{row.record?.concUnit || '—'}</td>
                        <td className="px-2 py-1 text-[#6B7280]">
                          {[...row.errors, ...row.warnings].join(' ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!validation || rowsToCommit.length === 0}
            onClick={handleCommit}
          >
            Commit {rowsToCommit.length} Row(s) to {session.sessionId}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
