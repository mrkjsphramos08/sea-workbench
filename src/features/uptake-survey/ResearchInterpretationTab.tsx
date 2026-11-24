'use client';

import React, { useMemo, useState } from 'react';
import { BookOpen, Edit3, Plus, Trash2 } from 'lucide-react';
import {
  Experiment,
  ResearchAnnotation,
  ResearchAnnotationCategory,
  SurveyDataset,
} from '../../domain/models/types';
import {
  Button,
  FieldLabel,
  Modal,
  Panel,
  PanelHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';

export const ANNOTATION_CATEGORY_LABELS: Record<
  ResearchAnnotationCategory,
  string
> = {
  research_question: 'Research Question',
  observed_trend: 'Observed Trend',
  anomalous_observation: 'Anomalous Observation',
  potential_explanation: 'Potential Explanation',
  measurement_limitation: 'Measurement Limitation',
  literature_reference: 'Literature Reference',
  data_quality_concern: 'Data Quality Concern',
  research_conclusion: 'Research Conclusion',
  unresolved_question: 'Unresolved Question',
};

const ALL_CATEGORIES = Object.keys(
  ANNOTATION_CATEGORY_LABELS
) as ResearchAnnotationCategory[];

export function ResearchInterpretationTab({
  experiment,
  dataset,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: {
  experiment: Experiment;
  dataset: SurveyDataset;
  onAddAnnotation: (
    annotation: Omit<ResearchAnnotation, 'id' | 'createdAt' | 'updatedAt'>
  ) => void;
  onUpdateAnnotation: (
    annotationId: string,
    patch: Partial<ResearchAnnotation>
  ) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [category, setCategory] =
    useState<ResearchAnnotationCategory>('observed_trend');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState(
    dataset.researcher || experiment.researcher || 'Researcher'
  );
  const [linkedMeasurementIds, setLinkedMeasurementIds] = useState<string[]>(
    []
  );
  const [linkedGroupIds, setLinkedGroupIds] = useState<string[]>([]);
  const [linkedFigureId, setLinkedFigureId] = useState<string>('');
  const [linkedReferenceIds, setLinkedReferenceIds] = useState<string[]>([]);

  const distinctGroupIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of dataset.measurements) {
      if (r.sampleGroupId.trim()) s.add(r.sampleGroupId.trim());
    }
    return Array.from(s).sort();
  }, [dataset.measurements]);

  const availableReferences = useMemo(() => {
    const refs: Array<{ id: string; label: string }> = [];
    const sup =
      dataset.supportSnapshot?.supportData ??
      experiment.batch.supportSnapshot?.supportData;
    const pre =
      dataset.precursorSnapshot?.precursorData ??
      experiment.batch.precursorSnapshot?.precursorData;
    sup?.references.forEach((r) =>
      refs.push({ id: r.id, label: `[Support] ${r.title || r.citation || r.id}` })
    );
    pre?.references.forEach((r) =>
      refs.push({
        id: r.id,
        label: `[Precursor] ${r.title || r.citation || r.id}`,
      })
    );
    return refs;
  }, [dataset, experiment.batch]);

  const filteredAnnotations = useMemo(() => {
    if (categoryFilter === 'ALL') return dataset.annotations;
    return dataset.annotations.filter((a) => a.category === categoryFilter);
  }, [dataset.annotations, categoryFilter]);

  const openNewModal = () => {
    setEditingId(null);
    setCategory('observed_trend');
    setTitle('');
    setBody('');
    setAuthor(dataset.researcher || experiment.researcher || 'Researcher');
    setLinkedMeasurementIds([]);
    setLinkedGroupIds([]);
    setLinkedFigureId('');
    setLinkedReferenceIds([]);
    setModalOpen(true);
  };

  const openEditModal = (ann: ResearchAnnotation) => {
    setEditingId(ann.id);
    setCategory(ann.category);
    setTitle(ann.title);
    setBody(ann.body);
    setAuthor(ann.author);
    setLinkedMeasurementIds(ann.linkedMeasurementIds);
    setLinkedGroupIds(ann.linkedGroupIds);
    setLinkedFigureId(ann.linkedFigureId ?? '');
    setLinkedReferenceIds(ann.linkedReferenceIds);
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!title.trim() || !body.trim()) return;
    const payload = {
      category,
      title: title.trim(),
      body: body.trim(),
      author: author.trim() || 'Researcher',
      linkedDatasetId: dataset.id,
      linkedMeasurementIds,
      linkedGroupIds,
      linkedFigureId: linkedFigureId || null,
      linkedReferenceIds,
    };

    if (editingId) {
      onUpdateAnnotation(editingId, payload);
    } else {
      onAddAnnotation(payload);
    }
    setModalOpen(false);
  };

  const toggleMulti = (
    current: string[],
    setter: (next: string[]) => void,
    val: string
  ) => {
    setter(
      current.includes(val)
        ? current.filter((x) => x !== val)
        : [...current, val]
    );
  };

  return (
    <div className="space-y-4">
      {/* Explicit Authorship Boundary Banner */}
      <div className="px-3.5 py-2.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-[6px] text-[12px] text-[#1E3A8A] flex items-start gap-2.5">
        <BookOpen className="w-4 h-4 shrink-0 mt-0.5 text-[#0F52BA]" strokeWidth={1.75} />
        <div>
          <strong>Researcher-Authored Interpretations:</strong> Entries below
          represent structured scientific notes authored by researchers and are
          explicitly separated from application-generated descriptive statistics
          and numerical calculations.
        </div>
      </div>

      <Panel>
        <PanelHeader
          title={`Research Interpretations & Traceable Annotations (${dataset.annotations.length})`}
          subtitle="Link observations, limitations, and unresolved questions directly to measurements, replicate groups, saved figures, and material references."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter annotations by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-8 px-2.5 text-[12px] bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px]"
              >
                <option value="ALL">
                  All Categories ({dataset.annotations.length})
                </option>
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {ANNOTATION_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
              <Button variant="primary" size="sm" onClick={openNewModal}>
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                New Interpretation Note
              </Button>
            </div>
          }
        />

        <div className="divide-y divide-[#E5E7EB]">
          {filteredAnnotations.length === 0 ? (
            <div className="py-10 px-6 text-center text-[13px] text-[#6B7280]">
              No research annotations recorded for this filter. Document
              observed trends, data quality concerns, or measurement limitations
              to preserve research rationale alongside your dataset.
            </div>
          ) : (
            filteredAnnotations.map((ann) => {
              const linkedRowLabels = ann.linkedMeasurementIds
                .map(
                  (id) =>
                    dataset.measurements.find((m) => m.id === id)?.sampleId ?? id
                )
                .filter(Boolean);
              const linkedFig = ann.linkedFigureId
                ? dataset.savedFigures.find((f) => f.id === ann.linkedFigureId)
                : null;
              return (
                <article key={ann.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.04em] bg-[#F3F4F6] text-[#111827] border border-[#E5E7EB] rounded-[4px]">
                          {ANNOTATION_CATEGORY_LABELS[ann.category]}
                        </span>
                        <h4 className="text-[13.5px] font-semibold text-[#111827]">
                          {ann.title}
                        </h4>
                      </div>
                      <div className="text-[11px] font-mono text-[#6B7280]">
                        Author: {ann.author} · Created:{' '}
                        {ann.createdAt.slice(0, 16).replace('T', ' ')} ·
                        Updated: {ann.updatedAt.slice(0, 16).replace('T', ' ')}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(ann)}
                      >
                        <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        Edit
                      </Button>
                      <button
                        type="button"
                        aria-label={`Delete annotation ${ann.title}`}
                        onClick={() => onDeleteAnnotation(ann.id)}
                        className="p-1.5 text-[#9CA3AF] hover:text-[#991B1B] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>

                  <p className="text-[12.5px] text-[#374151] leading-relaxed whitespace-pre-wrap">
                    {ann.body}
                  </p>

                  {/* Traceability Link Metadata */}
                  {(linkedRowLabels.length > 0 ||
                    ann.linkedGroupIds.length > 0 ||
                    linkedFig ||
                    ann.linkedReferenceIds.length > 0) && (
                    <div className="pt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-[#4B5563]">
                      {linkedRowLabels.length > 0 && (
                        <span>
                          Samples:{' '}
                          <strong className="text-[#0F52BA]">
                            {linkedRowLabels.join(', ')}
                          </strong>
                        </span>
                      )}
                      {ann.linkedGroupIds.length > 0 && (
                        <span>
                          Groups:{' '}
                          <strong className="text-[#0F52BA]">
                            {ann.linkedGroupIds.join(', ')}
                          </strong>
                        </span>
                      )}
                      {linkedFig && (
                        <span>
                          Figure:{' '}
                          <strong className="text-[#111827]">
                            {linkedFig.name}
                          </strong>
                        </span>
                      )}
                      {ann.linkedReferenceIds.length > 0 && (
                        <span>
                          References: {ann.linkedReferenceIds.length} linked
                        </span>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </Panel>

      {/* Add / Edit Annotation Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingId
            ? 'Edit Research Interpretation'
            : 'New Research Interpretation'
        }
        description="Author a structured scientific note linked to specific dataset artifacts."
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="ann-cat" required>
                Category
              </FieldLabel>
              <select
                id="ann-cat"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ResearchAnnotationCategory)
                }
                className={inputBaseClass}
              >
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {ANNOTATION_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="ann-author">Author</FieldLabel>
              <input
                id="ann-author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className={inputBaseClass}
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="ann-title" required>
              Title / Summary Heading
            </FieldLabel>
            <input
              id="ann-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Concise summary of observation, concern, or question"
              className={inputBaseClass}
            />
          </div>

          <div>
            <FieldLabel htmlFor="ann-body" required>
              Detailed Researcher Note
            </FieldLabel>
            <textarea
              id="ann-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="State evidence, limitations, or hypotheses clearly..."
              className="w-full p-2.5 text-[12.5px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
            />
          </div>

          {/* Traceable Artifact Linking */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E5E7EB]">
            <div>
              <div className="text-[11px] uppercase tracking-[0.05em] font-medium text-[#4B5563] mb-1">
                Link Specific Measurements
              </div>
              <div className="max-h-28 overflow-y-auto border border-[#E5E7EB] rounded-[6px] p-2 space-y-1 bg-[#F8F9FA] text-[11.5px]">
                {dataset.measurements.length === 0 ? (
                  <span className="text-[#6B7280]">No rows available.</span>
                ) : (
                  dataset.measurements.slice(0, 50).map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 font-mono cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={linkedMeasurementIds.includes(m.id)}
                        onChange={() =>
                          toggleMulti(
                            linkedMeasurementIds,
                            setLinkedMeasurementIds,
                            m.id
                          )
                        }
                        className="accent-[#0F52BA]"
                      />
                      <span>
                        {m.sampleId} ({m.sampleGroupId})
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.05em] font-medium text-[#4B5563] mb-1">
                  Link Replicate Groups
                </div>
                <div className="max-h-20 overflow-y-auto border border-[#E5E7EB] rounded-[6px] p-2 flex flex-wrap gap-2 bg-[#F8F9FA] text-[11.5px]">
                  {distinctGroupIds.length === 0 ? (
                    <span className="text-[#6B7280]">No groups available.</span>
                  ) : (
                    distinctGroupIds.map((gid) => (
                      <label
                        key={gid}
                        className="inline-flex items-center gap-1.5 font-mono cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={linkedGroupIds.includes(gid)}
                          onChange={() =>
                            toggleMulti(linkedGroupIds, setLinkedGroupIds, gid)
                          }
                          className="accent-[#0F52BA]"
                        />
                        <span>{gid}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="ann-fig-link">Link Saved Figure</FieldLabel>
                <select
                  id="ann-fig-link"
                  value={linkedFigureId}
                  onChange={(e) => setLinkedFigureId(e.target.value)}
                  className={inputBaseClass}
                >
                  <option value="">— None —</option>
                  {dataset.savedFigures.map((fig) => (
                    <option key={fig.id} value={fig.id}>
                      {fig.name} ({fig.plotType})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {availableReferences.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-[0.05em] font-medium text-[#4B5563] mb-1">
                Link Material Snapshot References
              </div>
              <div className="border border-[#E5E7EB] rounded-[6px] p-2 space-y-1 bg-[#F8F9FA] text-[11.5px]">
                {availableReferences.map((ref) => (
                  <label
                    key={ref.id}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={linkedReferenceIds.includes(ref.id)}
                      onChange={() =>
                        toggleMulti(
                          linkedReferenceIds,
                          setLinkedReferenceIds,
                          ref.id
                        )
                      }
                      className="accent-[#0F52BA]"
                    />
                    <span className="truncate">{ref.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!title.trim() || !body.trim()}
              onClick={handleSave}
            >
              {editingId ? 'Save Changes' : 'Save Interpretation'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
