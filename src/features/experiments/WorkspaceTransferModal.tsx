'use client';

import React, { useState } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  WorkspaceBackupEnvelope,
  WorkspaceStateData,
} from '../../domain/models/types';
import {
  parseWorkspaceBackup,
  serializeWorkspaceBackup,
  triggerFileDownload,
} from '../../services/import-export/backup';
import { Button, FieldLabel, Modal } from '../../components/ui/Primitives';

export function WorkspaceTransferModal({
  open,
  onClose,
  getSerializableWorkspace,
  onImportWorkspace,
}: {
  open: boolean;
  onClose: () => void;
  getSerializableWorkspace: () => WorkspaceStateData;
  onImportWorkspace: (workspace: WorkspaceStateData) => void;
}) {
  const [rawText, setRawText] = useState('');
  const [validatedEnvelope, setValidatedEnvelope] =
    useState<WorkspaceBackupEnvelope | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const resetImportState = () => {
    setRawText('');
    setValidatedEnvelope(null);
    setValidationErrors([]);
    setValidationWarnings([]);
    setConfirmOverwrite(false);
  };

  const handleClose = () => {
    resetImportState();
    onClose();
  };

  const handleExportJson = () => {
    const workspace = getSerializableWorkspace();
    const json = serializeWorkspaceBackup(workspace);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(
      json,
      `sea-workbench-backup-${stamp}.json`,
      'application/json;charset=utf-8'
    );
  };

  const validateText = (text: string) => {
    setRawText(text);
    setConfirmOverwrite(false);
    if (!text.trim()) {
      setValidatedEnvelope(null);
      setValidationErrors([]);
      setValidationWarnings([]);
      return;
    }
    const result = parseWorkspaceBackup(text);
    if (result.valid && result.data) {
      setValidatedEnvelope(result.data);
      setValidationErrors([]);
      setValidationWarnings(result.warnings);
    } else {
      setValidatedEnvelope(null);
      setValidationErrors(result.errors);
      setValidationWarnings(result.warnings);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      validateText(content);
    };
    reader.onerror = () => {
      setValidationErrors(['Failed to read selected file from disk.']);
      setValidatedEnvelope(null);
    };
    reader.readAsText(file);
  };

  const handleCommitImport = () => {
    if (!validatedEnvelope || !confirmOverwrite) return;
    onImportWorkspace(validatedEnvelope.workspace);
    handleClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Workspace Backup — Load & Export JSON"
      description="Export a full local workspace snapshot or validate and restore a previously exported SEA Workbench JSON backup."
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-5">
        {/* Export Section */}
        <div className="p-4 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold text-[#111827]">
              Export Full Workspace Backup
            </h3>
            <p className="text-[12px] text-[#6B7280] mt-0.5">
              Includes projects, experiments, material databases, immutable snapshots, measurements, notes, and report settings.
            </p>
          </div>
          <Button variant="primary" onClick={handleExportJson}>
            <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
            Export JSON
          </Button>
        </div>

        {/* Import Section */}
        <div className="space-y-3">
          <div>
            <FieldLabel htmlFor="backup-file-input">
              Load Backup File (.json)
            </FieldLabel>
            <input
              id="backup-file-input"
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="block w-full text-[12.5px] text-[#4B5563] file:mr-3 file:py-1.5 file:px-3 file:rounded-[6px] file:border file:border-[#E5E7EB] file:text-[12px] file:font-medium file:bg-white file:text-[#111827] hover:file:bg-[#F3F4F6] cursor-pointer"
            />
          </div>

          <div>
            <FieldLabel htmlFor="backup-json-paste">
              Or Paste Backup JSON Directly
            </FieldLabel>
            <textarea
              id="backup-json-paste"
              rows={5}
              value={rawText}
              onChange={(e) => validateText(e.target.value)}
              placeholder='{"format": "sea-workbench-backup", "schemaVersion": "1.0.0", ...}'
              className="w-full p-2.5 font-mono text-[11.5px] text-[#111827] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
            />
          </div>

          {validationErrors.length > 0 && (
            <div
              role="alert"
              className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[6px] text-[12px] text-[#991B1B] space-y-1"
            >
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} />
                Import Rejected — Validation Failed
              </div>
              {validationErrors.map((err) => (
                <div key={err} className="pl-5">
                  {err}
                </div>
              ))}
            </div>
          )}

          {validatedEnvelope && (
            <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-[6px] text-[12px] text-[#065F46] space-y-2">
              <div className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                Valid SEA Workbench Backup (Schema {validatedEnvelope.schemaVersion})
              </div>
              <div className="font-mono tabular-nums text-[11.5px] grid grid-cols-2 gap-1 pl-5">
                <span>Projects: {validatedEnvelope.workspace.projects.length}</span>
                <span>Experiments: {validatedEnvelope.workspace.experiments.length}</span>
                <span>Precursors: {validatedEnvelope.workspace.precursors.length}</span>
                <span>Supports: {validatedEnvelope.workspace.supports.length}</span>
              </div>
              {validationWarnings.length > 0 && (
                <div className="pl-5 text-[#92400E]">
                  {validationWarnings.join(' ')}
                </div>
              )}
              <label className="flex items-start gap-2 pt-2 border-t border-[#A7F3D0] text-[#111827] cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmOverwrite}
                  onChange={(e) => setConfirmOverwrite(e.target.checked)}
                  className="mt-0.5 accent-[#0F52BA]"
                />
                <span className="text-[12px]">
                  I confirm that importing this backup will replace all current local workspace records.
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
          <Button
            variant="primary"
            disabled={!validatedEnvelope || !confirmOverwrite}
            onClick={handleCommitImport}
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
            Replace Workspace
          </Button>
        </div>
      </div>
    </Modal>
  );
}
