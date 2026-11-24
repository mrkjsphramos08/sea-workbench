'use client';

import React, { useMemo, useState } from 'react';
import {
  Archive,
  Copy,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  ArrowUpRight,
} from 'lucide-react';
import {
  ActiveModule,
  Experiment,
  ExperimentStatus,
  ExperimentType,
  ResearchProject,
} from '../../domain/models/types';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  FieldLabel,
  Modal,
  Panel,
  PanelHeader,
  StatusText,
  WorkspaceHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';

const TYPES: Array<ExperimentType | 'All'> = [
  'All',
  'Batch Synthesis',
  'Uptake Survey',
  'PZC / pH Shift Survey',
];

const STATUSES: Array<ExperimentStatus | 'All'> = [
  'All',
  'Draft',
  'Planned',
  'In Progress',
  'Measurements Pending',
  'Analysis in Progress',
  'Under Review',
  'Completed',
  'Archived',
];

type SortOption = 'updated_desc' | 'updated_asc' | 'created_desc' | 'created_asc';

function formatShortDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

function defaultModuleForType(_type: ExperimentType): ActiveModule {
  void _type;
  return 'overview';
}

export function ExperimentLibrary({
  experiments,
  projects,
  activeExperimentUuid,
  onOpenNewExperiment,
  onOpenExperiment,
  onRenameExperiment,
  onDuplicateExperiment,
  onArchiveExperiment,
  onDeleteExperiment,
  onCreateProject,
  onDeleteProject,
}: {
  experiments: Experiment[];
  projects: ResearchProject[];
  activeExperimentUuid: string | null;
  onOpenNewExperiment: () => void;
  onOpenExperiment: (uuid: string, targetModule?: ActiveModule) => void;
  onRenameExperiment: (uuid: string, title: string) => void;
  onDuplicateExperiment: (uuid: string) => void;
  onArchiveExperiment: (uuid: string) => void;
  onDeleteExperiment: (uuid: string) => void;
  onCreateProject: (input: {
    code: string;
    name: string;
    description: string;
    principalInvestigator: string;
  }) => void;
  onDeleteProject: (projectId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ExperimentType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<ExperimentStatus | 'All'>('All');
  const [projectFilter, setProjectFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('updated_desc');

  const [renameTarget, setRenameTarget] = useState<Experiment | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Experiment | null>(null);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projCode, setProjCode] = useState('');
  const [projName, setProjName] = useState('');
  const [projPi, setProjPi] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projError, setProjError] = useState('');
  const [deleteProjectTarget, setDeleteProjectTarget] =
    useState<ResearchProject | null>(null);

  const projectMap = useMemo(() => {
    const map = new Map<string, ResearchProject>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  const filteredExperiments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return experiments
      .filter((exp) => {
        if (typeFilter !== 'All' && exp.type !== typeFilter) return false;
        if (statusFilter !== 'All' && exp.status !== statusFilter) return false;
        if (projectFilter === 'Unassigned' && exp.projectId !== null) return false;
        if (
          projectFilter !== 'All' &&
          projectFilter !== 'Unassigned' &&
          exp.projectId !== projectFilter
        ) {
          return false;
        }
        if (q) {
          const proj = exp.projectId ? projectMap.get(exp.projectId) : null;
          const haystack = [
            exp.experimentId,
            exp.title,
            exp.researcher,
            exp.objective,
            exp.tags.join(' '),
            proj?.code ?? '',
            proj?.name ?? '',
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'updated_desc') return b.updatedAt.localeCompare(a.updatedAt);
        if (sortBy === 'updated_asc') return a.updatedAt.localeCompare(b.updatedAt);
        if (sortBy === 'created_desc') return b.createdAt.localeCompare(a.createdAt);
        return a.createdAt.localeCompare(b.createdAt);
      });
  }, [
    experiments,
    searchQuery,
    typeFilter,
    statusFilter,
    projectFilter,
    sortBy,
    projectMap,
  ]);

  const handleProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projCode.trim() || !projName.trim()) {
      setProjError('Project code and project name are required.');
      return;
    }
    onCreateProject({
      code: projCode.trim(),
      name: projName.trim(),
      principalInvestigator: projPi.trim() || 'Unspecified',
      description: projDesc.trim(),
    });
    setProjCode('');
    setProjName('');
    setProjPi('');
    setProjDesc('');
    setProjError('');
    setProjectModalOpen(false);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameDraft.trim()) return;
    onRenameExperiment(renameTarget.uuid, renameDraft.trim());
    setRenameTarget(null);
  };

  return (
    <div className="space-y-5">
      <WorkspaceHeader
        title="Experiment Library"
        description="Central registry of SEA catalyst synthesis batches, uptake surveys, and PZC characterization records organized by research project."
        metadata={
          <>
            <span>
              Total Records:{' '}
              <strong className="font-mono tabular-nums text-[#111827]">
                {experiments.length}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Research Projects:{' '}
              <strong className="font-mono tabular-nums text-[#111827]">
                {projects.length}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Active:{' '}
              <strong className="font-mono text-[#0F52BA]">
                {experiments.find((e) => e.uuid === activeExperimentUuid)
                  ?.experimentId ?? 'None'}
              </strong>
            </span>
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setProjectModalOpen(true)}
            >
              <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
              New Project
            </Button>
            <Button variant="primary" onClick={onOpenNewExperiment}>
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              New Blank Experiment
            </Button>
          </>
        }
      />

      {/* Research Projects Bar */}
      <Panel>
        <PanelHeader
          title="Research Projects"
          subtitle="Filter experiments by project or organize work into independent studies."
        />
        <div className="p-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setProjectFilter('All')}
            className={`px-3 py-1.5 text-[12px] rounded-[6px] border transition-colors cursor-pointer ${
              projectFilter === 'All'
                ? 'bg-[#EFF6FF] border-[#0F52BA] text-[#0F52BA] font-medium'
                : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#D1D5DB]'
            }`}
          >
            All Projects ({experiments.length})
          </button>
          <button
            type="button"
            onClick={() => setProjectFilter('Unassigned')}
            className={`px-3 py-1.5 text-[12px] rounded-[6px] border transition-colors cursor-pointer ${
              projectFilter === 'Unassigned'
                ? 'bg-[#EFF6FF] border-[#0F52BA] text-[#0F52BA] font-medium'
                : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#D1D5DB]'
            }`}
          >
            Unassigned ({experiments.filter((e) => !e.projectId).length})
          </button>
          {projects.map((project) => {
            const count = experiments.filter(
              (e) => e.projectId === project.id
            ).length;
            const active = projectFilter === project.id;
            return (
              <div
                key={project.id}
                className={`inline-flex items-center rounded-[6px] border text-[12px] transition-colors ${
                  active
                    ? 'bg-[#EFF6FF] border-[#0F52BA] text-[#0F52BA] font-medium'
                    : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#D1D5DB]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setProjectFilter(project.id)}
                  className="px-3 py-1.5 cursor-pointer flex items-center gap-1.5"
                >
                  <span className="font-mono text-[11px]">{project.code}</span>
                  <span>{project.name}</span>
                  <span className="font-mono tabular-nums text-[11px] opacity-75">
                    ({count})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteProjectTarget(project)}
                  aria-label={`Delete project ${project.code}`}
                  title="Delete project (keeps experiments unassigned)"
                  className="pr-2 pl-1 py-1.5 text-[#6B7280] hover:text-[#991B1B] cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                </button>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Search, Filters & Sort */}
      <Panel>
        <div className="p-3 border-b border-[#E5E7EB] grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <div className="md:col-span-5 relative">
            <Search
              className="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              strokeWidth={1.75}
            />
            <input
              type="search"
              aria-label="Search experiments"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, title, researcher, tags, or objective..."
              className={`${inputBaseClass} pl-8`}
            />
          </div>
          <div className="md:col-span-2">
            <select
              aria-label="Filter by experiment type"
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as ExperimentType | 'All')
              }
              className={inputBaseClass}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'All' ? 'All Types' : t}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <select
              aria-label="Filter by experiment status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as ExperimentStatus | 'All')
              }
              className={inputBaseClass}
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st === 'All' ? 'All Statuses' : st}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <select
              aria-label="Sort experiments"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={inputBaseClass}
            >
              <option value="updated_desc">Modified: Newest first</option>
              <option value="updated_asc">Modified: Oldest first</option>
              <option value="created_desc">Created: Newest first</option>
              <option value="created_asc">Created: Oldest first</option>
            </select>
          </div>
        </div>

        {/* Experiments Table */}
        {filteredExperiments.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No matching experiments found"
              description="Adjust your search or filter criteria, or create a new blank experiment record."
              action={
                <Button variant="primary" onClick={onOpenNewExperiment}>
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Create Blank Experiment
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[860px]">
              <thead>
                <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[11px] uppercase tracking-[0.05em] text-[#4B5563]">
                  <th className="py-2.5 px-3 font-medium">Experiment ID</th>
                  <th className="py-2.5 px-3 font-medium">Title & Project</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium">Researcher</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium text-right">Date</th>
                  <th className="py-2.5 px-3 font-medium text-right">Modified</th>
                  <th className="py-2.5 px-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-[13px]">
                {filteredExperiments.map((exp) => {
                  const isActive = exp.uuid === activeExperimentUuid;
                  const proj = exp.projectId
                    ? projectMap.get(exp.projectId)
                    : null;

                  return (
                    <tr
                      key={exp.uuid}
                      className={`transition-colors ${
                        isActive ? 'bg-[#EFF6FF]/50' : 'hover:bg-[#F8F9FA]'
                      }`}
                    >
                      <td className="py-2.5 px-3 align-top whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenExperiment(
                              exp.uuid,
                              defaultModuleForType(exp.type)
                            )
                          }
                          className="font-mono tabular-nums text-[12.5px] font-medium text-[#0F52BA] hover:underline cursor-pointer"
                        >
                          {exp.experimentId}
                        </button>
                        {exp.isDemonstration && (
                          <div className="text-[10.5px] text-[#92400E] mt-0.5">
                            Synthetic Demo
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 align-top max-w-md">
                        <div className="font-medium text-[#111827] leading-snug">
                          {exp.title}
                        </div>
                        <div className="text-[11.5px] text-[#6B7280] mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>{proj ? `${proj.code} · ${proj.name}` : 'Unassigned project'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{exp.scientificReviewStatus}</span>
                          {exp.tags.length > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-[11px]">
                                {exp.tags.join(', ')}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 align-top text-[12.5px] text-[#4B5563] whitespace-nowrap">
                        {exp.type}
                      </td>
                      <td className="py-2.5 px-3 align-top text-[12.5px] text-[#4B5563] whitespace-nowrap">
                        {exp.researcher}
                      </td>
                      <td className="py-2.5 px-3 align-top whitespace-nowrap">
                        <StatusText status={exp.status} />
                      </td>
                      <td className="py-2.5 px-3 align-top text-right font-mono tabular-nums text-[12px] text-[#4B5563] whitespace-nowrap">
                        {exp.experimentDate}
                      </td>
                      <td className="py-2.5 px-3 align-top text-right font-mono tabular-nums text-[12px] text-[#6B7280] whitespace-nowrap">
                        {formatShortDate(exp.updatedAt)}
                      </td>
                      <td className="py-2.5 px-3 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              onOpenExperiment(
                                exp.uuid,
                                defaultModuleForType(exp.type)
                              )
                            }
                            ariaLabel={`Open ${exp.experimentId}`}
                          >
                            Open
                            <ArrowUpRight className="w-3 h-3" strokeWidth={1.75} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRenameTarget(exp);
                              setRenameDraft(exp.title);
                            }}
                            ariaLabel={`Rename ${exp.experimentId}`}
                            title="Rename experiment"
                          >
                            <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDuplicateExperiment(exp.uuid)}
                            ariaLabel={`Duplicate ${exp.experimentId}`}
                            title="Duplicate as independent experiment"
                          >
                            <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onArchiveExperiment(exp.uuid)}
                            ariaLabel={
                              exp.status === 'Archived'
                                ? `Restore ${exp.experimentId}`
                                : `Archive ${exp.experimentId}`
                            }
                            title={
                              exp.status === 'Archived'
                                ? 'Restore from archive'
                                : 'Archive experiment'
                            }
                          >
                            <Archive className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(exp)}
                            ariaLabel={`Delete ${exp.experimentId}`}
                            title="Delete experiment"
                            className="hover:text-[#991B1B] hover:bg-[#FEF2F2]"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Rename Modal */}
      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title={`Rename ${renameTarget?.experimentId ?? ''}`}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleRenameSubmit} className="space-y-4">
          <div>
            <FieldLabel htmlFor="rename-exp-title" required>
              Experiment Title
            </FieldLabel>
            <input
              id="rename-exp-title"
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className={inputBaseClass}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Title
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Project Modal */}
      <Modal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title="New Research Project"
        description="Group related batch syntheses, uptake surveys, and PZC studies."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleProjectSubmit} className="space-y-3.5">
          {projError && (
            <div className="p-2.5 text-[12px] text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-[6px]">
              {projError}
            </div>
          )}
          <div>
            <FieldLabel htmlFor="proj-code" required>
              Project Code
            </FieldLabel>
            <input
              id="proj-code"
              type="text"
              value={projCode}
              onChange={(e) => setProjCode(e.target.value)}
              placeholder="PRJ-2026-02"
              className={`${inputBaseClass} font-mono`}
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="proj-name" required>
              Project Name
            </FieldLabel>
            <input
              id="proj-name"
              type="text"
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              placeholder="Supported Pd/Al2O3 Catalyst Screening"
              className={inputBaseClass}
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="proj-pi">Principal Investigator</FieldLabel>
            <input
              id="proj-pi"
              type="text"
              value={projPi}
              onChange={(e) => setProjPi(e.target.value)}
              className={inputBaseClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="proj-desc">Description</FieldLabel>
            <textarea
              id="proj-desc"
              rows={2}
              value={projDesc}
              onChange={(e) => setProjDesc(e.target.value)}
              className="w-full p-2 text-[13px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] focus:bg-white focus:border-[#0F52BA]"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setProjectModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Project
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Experiment Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.experimentId ?? 'Experiment'}?`}
        message={`This permanently removes "${deleteTarget?.title ?? ''}" and all its associated synthesis, survey, analytical, and bench tracking records from local storage.`}
        confirmLabel="Delete Experiment"
        onConfirm={() => {
          if (deleteTarget) onDeleteExperiment(deleteTarget.uuid);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Delete Project Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteProjectTarget)}
        title={`Delete Project ${deleteProjectTarget?.code ?? ''}?`}
        message="Experiments assigned to this project will not be deleted; they will become unassigned."
        confirmLabel="Delete Project"
        onConfirm={() => {
          if (deleteProjectTarget) onDeleteProject(deleteProjectTarget.id);
          setDeleteProjectTarget(null);
        }}
        onCancel={() => setDeleteProjectTarget(null)}
      />
    </div>
  );
}
