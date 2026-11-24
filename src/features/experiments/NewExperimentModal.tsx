'use client';

import React, { useState } from 'react';
import {
  Experiment,
  ExperimentType,
  ResearchProject,
} from '../../domain/models/types';
import { generateUniqueExperimentId } from '../../data/demo/demoWorkspace';
import { validateNewExperimentInput } from '../../domain/validation/validators';
import { Button, FieldLabel, Modal, inputBaseClass } from '../../components/ui/Primitives';

const EXPERIMENT_TYPES: ExperimentType[] = [
  'Batch Synthesis',
  'Uptake Survey',
  'PZC / pH Shift Survey',
];

interface NewExperimentFormProps {
  onClose: () => void;
  projects: ResearchProject[];
  existingExperiments: Experiment[];
  defaultResearcher: string;
  onCreate: (input: {
    experimentId: string;
    title: string;
    projectId: string | null;
    researcher: string;
    type: ExperimentType;
    objective: string;
    experimentDate: string;
    tags: string[];
  }) => void;
}

export function NewExperimentModal({
  open,
  ...rest
}: NewExperimentFormProps & { open: boolean }) {
  return (
    <Modal
      open={open}
      onClose={rest.onClose}
      title="New Blank Experiment"
      description="Create an isolated, unpopulated experiment record with its own material snapshots, measurement tables, and A4 report state."
      maxWidthClass="max-w-xl"
    >
      {open && <NewExperimentForm {...rest} />}
    </Modal>
  );
}

function NewExperimentForm({
  onClose,
  projects,
  existingExperiments,
  defaultResearcher,
  onCreate,
}: NewExperimentFormProps) {
  const [experimentId, setExperimentId] = useState(() =>
    generateUniqueExperimentId(existingExperiments)
  );
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? '');
  const [researcher, setResearcher] = useState(
    defaultResearcher || 'Research Scientist'
  );
  const [type, setType] = useState<ExperimentType>('Batch Synthesis');
  const [objective, setObjective] = useState('');
  const [experimentDate, setExperimentDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [tagsRaw, setTagsRaw] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateNewExperimentInput({
      experimentId,
      title,
      researcher,
      existingExperiments,
    });

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onCreate({
      experimentId: experimentId.trim(),
      title: title.trim(),
      projectId: projectId || null,
      researcher: researcher.trim(),
      type,
      objective: objective.trim(),
      experimentDate,
      tags,
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
        {errors.length > 0 && (
          <div
            role="alert"
            className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[6px] text-[12.5px] text-[#991B1B] space-y-1"
          >
            {errors.map((err) => (
              <div key={err}>{err}</div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <FieldLabel htmlFor="new-exp-id" required>
              Experiment ID
            </FieldLabel>
            <input
              id="new-exp-id"
              type="text"
              value={experimentId}
              onChange={(e) => setExperimentId(e.target.value)}
              className={`${inputBaseClass} font-mono`}
              placeholder="SEA-2026-001"
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="new-exp-type" required>
              Experiment Type
            </FieldLabel>
            <select
              id="new-exp-type"
              value={type}
              onChange={(e) => setType(e.target.value as ExperimentType)}
              className={inputBaseClass}
            >
              {EXPERIMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="new-exp-title" required>
            Experiment Title
          </FieldLabel>
          <input
            id="new-exp-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputBaseClass}
            placeholder="e.g., Pt(NH3)4(NO3)2 Uptake Survey on Silica S-300"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div>
            <FieldLabel htmlFor="new-exp-researcher" required>
              Researcher
            </FieldLabel>
            <input
              id="new-exp-researcher"
              type="text"
              value={researcher}
              onChange={(e) => setResearcher(e.target.value)}
              className={inputBaseClass}
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="new-exp-date">Experiment Date</FieldLabel>
            <input
              id="new-exp-date"
              type="date"
              value={experimentDate}
              onChange={(e) => setExperimentDate(e.target.value)}
              className={`${inputBaseClass} font-mono`}
            />
          </div>
          <div>
            <FieldLabel htmlFor="new-exp-project">Research Project</FieldLabel>
            <select
              id="new-exp-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
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
        </div>

        <div>
          <FieldLabel htmlFor="new-exp-objective">Research Objective</FieldLabel>
          <textarea
            id="new-exp-objective"
            rows={3}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="w-full p-2.5 text-[13px] text-[#111827] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] hover:border-[#D1D5DB] focus:bg-white focus:border-[#0F52BA] transition-colors"
            placeholder="State hypothesis, support/precursor system, or analytical scope..."
          />
        </div>

        <div>
          <FieldLabel htmlFor="new-exp-tags">Tags (comma-separated)</FieldLabel>
          <input
            id="new-exp-tags"
            type="text"
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            className={inputBaseClass}
            placeholder="Pt, SiO2, baseline"
          />
        </div>

        <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Create Blank Experiment
          </Button>
        </div>
      </form>
  );
}
