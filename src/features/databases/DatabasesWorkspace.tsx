'use client';

import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  Precursor,
  PrecursorChargeClass,
  ReferenceProperty,
  ReferenceSourceType,
  ScientificReference,
  Support,
  VerificationStatus,
} from '../../domain/models/types';
import { generateUuid } from '../../data/demo/demoWorkspace';
import { formatScientificNumber } from '../../domain/calculations/seaMath';
import {
  Button,
  ConfirmDialog,
  FieldLabel,
  Modal,
  NumericInput,
  Panel,
  PanelHeader,
  ProvenanceIndicator,
  VerificationIndicator,
  WorkspaceHeader,
  inputBaseClass,
} from '../../components/ui/Primitives';

type DbTab = 'precursors' | 'supports';

const VERIFICATION_OPTIONS: VerificationStatus[] = [
  'unverified',
  'synthetic_fixture',
  'internal_check',
  'literature_verified',
];

const CHARGE_OPTIONS: PrecursorChargeClass[] = [
  'Cationic',
  'Anionic',
  'Neutral',
  'Amphoteric',
  'Unspecified',
];

const REFERENCE_SOURCE_TYPES: { value: ReferenceSourceType; label: string }[] = [
  { value: 'peer_reviewed_publication', label: 'Peer-Reviewed Publication' },
  { value: 'manufacturer_datasheet', label: 'Manufacturer Datasheet' },
  { value: 'certificate_of_analysis', label: 'Certificate of Analysis (COA)' },
  { value: 'internal_measurement', label: 'Internal Lab Measurement' },
  { value: 'user_provided', label: 'User Provided / Other' },
  { value: 'synthetic_demo_fixture', label: 'Synthetic Demo Fixture' },
];

const SOURCE_TYPE_LABELS: Record<ReferenceSourceType, string> = {
  peer_reviewed_publication: 'Peer-Reviewed',
  manufacturer_datasheet: 'Datasheet',
  certificate_of_analysis: 'COA',
  internal_measurement: 'Internal Lab',
  user_provided: 'User Provided',
  synthetic_demo_fixture: 'Demo Fixture',
};

interface ReferenceFormDraft {
  title: string;
  authorOrOrganization: string;
  year: string;
  doiOrUrl: string;
  sourceType: ReferenceSourceType;
  relevantProperty: string;
  measurementConditions: string;
  verificationStatus: VerificationStatus;
  reviewerNotes: string;
}

function emptyReferenceDraft(): ReferenceFormDraft {
  return {
    title: '',
    authorOrOrganization: '',
    year: '',
    doiOrUrl: '',
    sourceType: 'peer_reviewed_publication',
    relevantProperty: '',
    measurementConditions: '',
    verificationStatus: 'unverified',
    reviewerNotes: '',
  };
}

function emptyRefProp(unit: string): ReferenceProperty<number | null> {
  return {
    value: null,
    unit,
    source: '',
    conditions: '',
    verificationStatus: 'unverified',
    provenance: 'user_entered',
    notes: '',
  };
}

function ReferencePropertyBlock({
  title,
  prop,
  decimals = 2,
}: {
  title: string;
  prop: ReferenceProperty<number | null>;
  decimals?: number;
}) {
  return (
    <div className="p-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] space-y-1.5 text-[12px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.05em] font-medium text-[#4B5563]">
          {title}
        </span>
        <VerificationIndicator status={prop.verificationStatus} />
      </div>
      <div className="font-mono tabular-nums text-[15px] font-semibold text-[#111827]">
        {formatScientificNumber(prop.value, decimals)}{' '}
        <span className="text-[11.5px] font-normal text-[#6B7280]">
          {prop.unit}
        </span>
      </div>
      <div className="text-[11.5px] text-[#4B5563] space-y-0.5">
        <div>
          <span className="text-[#6B7280]">Source:</span> {prop.source || '—'}
        </div>
        <div>
          <span className="text-[#6B7280]">Conditions:</span>{' '}
          {prop.conditions || '—'}
        </div>
        {prop.notes && (
          <div>
            <span className="text-[#6B7280]">Notes:</span> {prop.notes}
          </div>
        )}
      </div>
    </div>
  );
}

function ReferenceListCard({
  references,
}: {
  references: ScientificReference[];
}) {
  if (references.length === 0) {
    return (
      <p className="text-[12px] text-[#6B7280]">
        No structured scientific references attached.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {references.map((r) => (
        <li
          key={r.id}
          className="p-2.5 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] text-[12px] space-y-1"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-[#111827] leading-snug">
              {r.title || r.citation}
            </div>
            <VerificationIndicator status={r.verificationStatus} />
          </div>
          <div className="text-[11.5px] text-[#4B5563] flex flex-wrap gap-x-2 gap-y-0.5">
            {r.authorOrOrganization && <span>{r.authorOrOrganization}</span>}
            {r.year !== null && (
              <span className="font-mono tabular-nums">({r.year})</span>
            )}
            <span className="text-[#6B7280]">
              · {SOURCE_TYPE_LABELS[r.sourceType] ?? r.sourceType}
            </span>
            {r.relevantProperty && (
              <span className="font-mono text-[#0F52BA]">
                · Property: {r.relevantProperty}
              </span>
            )}
          </div>
          {r.measurementConditions && (
            <div className="text-[11px] text-[#6B7280]">
              Conditions: {r.measurementConditions}
            </div>
          )}
          {r.doiOrUrl && (
            <div className="font-mono text-[11px] text-[#0F52BA] break-all">
              {r.doiOrUrl}
            </div>
          )}
          {r.reviewerNotes && (
            <div className="text-[11px] text-[#6B7280]">
              Reviewer note: {r.reviewerNotes}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function StructuredReferenceEditor({
  draft,
  onChangeDraft,
  onAdd,
  references,
  onRemove,
}: {
  draft: ReferenceFormDraft;
  onChangeDraft: (patch: Partial<ReferenceFormDraft>) => void;
  onAdd: () => void;
  references: ScientificReference[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="pt-2 border-t border-[#E5E7EB] space-y-2.5">
      <div className="flex items-center justify-between">
        <FieldLabel>
          Structured Scientific References ({references.length})
        </FieldLabel>
        <span className="text-[11px] text-[#6B7280]">
          Multiple references &amp; differing literature values may coexist
        </span>
      </div>

      <div className="p-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[6px] space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="text"
            aria-label="Reference title or citation"
            placeholder="Title or document name *"
            value={draft.title}
            onChange={(e) => onChangeDraft({ title: e.target.value })}
            className={`${inputBaseClass} sm:col-span-6`}
          />
          <input
            type="text"
            aria-label="Author or organization"
            placeholder="Author / Organization"
            value={draft.authorOrOrganization}
            onChange={(e) =>
              onChangeDraft({ authorOrOrganization: e.target.value })
            }
            className={`${inputBaseClass} sm:col-span-4`}
          />
          <input
            type="number"
            aria-label="Publication year"
            placeholder="Year"
            value={draft.year}
            onChange={(e) => onChangeDraft({ year: e.target.value })}
            className={`${inputBaseClass} sm:col-span-2 font-mono`}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <select
            aria-label="Reference source type"
            value={draft.sourceType}
            onChange={(e) =>
              onChangeDraft({
                sourceType: e.target.value as ReferenceSourceType,
              })
            }
            className={`${inputBaseClass} sm:col-span-4`}
          >
            {REFERENCE_SOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            aria-label="Relevant material property"
            placeholder="Property (e.g., PZC, BET, MW)"
            value={draft.relevantProperty}
            onChange={(e) =>
              onChangeDraft({ relevantProperty: e.target.value })
            }
            className={`${inputBaseClass} sm:col-span-4`}
          />
          <input
            type="text"
            aria-label="DOI or URL"
            placeholder="DOI / URL (optional)"
            value={draft.doiOrUrl}
            onChange={(e) => onChangeDraft({ doiOrUrl: e.target.value })}
            className={`${inputBaseClass} sm:col-span-4 font-mono`}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="text"
            aria-label="Measurement conditions"
            placeholder="Measurement conditions (electrolyte, method, T)"
            value={draft.measurementConditions}
            onChange={(e) =>
              onChangeDraft({ measurementConditions: e.target.value })
            }
            className={`${inputBaseClass} sm:col-span-6`}
          />
          <select
            aria-label="Reference verification status"
            value={draft.verificationStatus}
            onChange={(e) =>
              onChangeDraft({
                verificationStatus: e.target.value as VerificationStatus,
              })
            }
            className={`${inputBaseClass} sm:col-span-4`}
          >
            {VERIFICATION_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={onAdd}
            disabled={!draft.title.trim()}
            className="sm:col-span-2"
          >
            Add Ref
          </Button>
        </div>
        <input
          type="text"
          aria-label="Reviewer notes"
          placeholder="Reviewer notes (optional)"
          value={draft.reviewerNotes}
          onChange={(e) => onChangeDraft({ reviewerNotes: e.target.value })}
          className={inputBaseClass}
        />
      </div>

      {references.length > 0 && (
        <ul className="text-[12px] space-y-1.5 text-[#4B5563]">
          {references.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-2 p-2 bg-white border border-[#E5E7EB] rounded-[4px]"
            >
              <div className="min-w-0">
                <div className="font-medium text-[#111827]">
                  {r.title || r.citation}
                </div>
                <div className="text-[11px] text-[#6B7280]">
                  {[
                    r.authorOrOrganization,
                    r.year !== null ? String(r.year) : '',
                    r.relevantProperty ? `Property: ${r.relevantProperty}` : '',
                    r.doiOrUrl,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(r.id)}
                className="text-[#991B1B] text-[11px] shrink-0 cursor-pointer"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DatabasesWorkspace({
  precursors,
  supports,
  onAddPrecursor,
  onUpdatePrecursor,
  onDeletePrecursor,
  onAddSupport,
  onUpdateSupport,
  onDeleteSupport,
}: {
  precursors: Precursor[];
  supports: Support[];
  onAddPrecursor: (
    p: Omit<Precursor, 'id' | 'createdAt' | 'updatedAt'>
  ) => Precursor;
  onUpdatePrecursor: (id: string, patch: Partial<Precursor>) => void;
  onDeletePrecursor: (id: string) => void;
  onAddSupport: (s: Omit<Support, 'id' | 'createdAt' | 'updatedAt'>) => Support;
  onUpdateSupport: (id: string, patch: Partial<Support>) => void;
  onDeleteSupport: (id: string) => void;
}) {
  const [tab, setTab] = useState<DbTab>('precursors');
  const [search, setSearch] = useState('');
  const [verificationFilter, setVerificationFilter] = useState<
    VerificationStatus | 'All'
  >('All');
  const [sortAsc, setSortAsc] = useState(true);

  const [selectedPrecursorId, setSelectedPrecursorId] = useState<string | null>(
    precursors[0]?.id ?? null
  );
  const [selectedSupportId, setSelectedSupportId] = useState<string | null>(
    supports[0]?.id ?? null
  );

  // Modal state for Precursor editor
  const [precModalOpen, setPrecModalOpen] = useState(false);
  const [editingPrecId, setEditingPrecId] = useState<string | null>(null);
  const [precDraft, setPrecDraft] = useState<
    Omit<Precursor, 'id' | 'createdAt' | 'updatedAt'>
  >({
    name: '',
    formula: '',
    metalIdentity: '',
    chargeClassification: 'Cationic',
    casNumber: '',
    molarMass: emptyRefProp('g/mol'),
    metalWeightFraction: emptyRefProp('wt%'),
    purity: emptyRefProp('%'),
    solubilityNotes: '',
    verificationStatus: 'unverified',
    provenance: 'user_entered',
    references: [],
    notes: '',
  });

  // Modal state for Support editor
  const [suppModalOpen, setSuppModalOpen] = useState(false);
  const [editingSuppId, setEditingSuppId] = useState<string | null>(null);
  const [suppDraft, setSuppDraft] = useState<
    Omit<Support, 'id' | 'createdAt' | 'updatedAt'>
  >({
    name: '',
    composition: '',
    supplierOrGrade: '',
    betSurfaceArea: emptyRefProp('m²/g'),
    pzc: emptyRefProp('pH'),
    poreVolume: emptyRefProp('cm³/g'),
    particleSizeRange: '',
    measurementConditions: '',
    verificationStatus: 'unverified',
    provenance: 'user_entered',
    references: [],
    notes: '',
  });

  const [refDraft, setRefDraft] = useState<ReferenceFormDraft>(
    emptyReferenceDraft()
  );
  const [deleteConfirm, setDeleteConfirm] = useState<{
    kind: 'precursor' | 'support';
    id: string;
    name: string;
  } | null>(null);

  const filteredPrecursors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return precursors
      .filter((p) => {
        if (
          verificationFilter !== 'All' &&
          p.verificationStatus !== verificationFilter
        ) {
          return false;
        }
        if (q) {
          const hay =
            `${p.name} ${p.formula} ${p.metalIdentity} ${p.casNumber} ${p.chargeClassification}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) =>
        sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      );
  }, [precursors, search, verificationFilter, sortAsc]);

  const filteredSupports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return supports
      .filter((s) => {
        if (
          verificationFilter !== 'All' &&
          s.verificationStatus !== verificationFilter
        ) {
          return false;
        }
        if (q) {
          const hay =
            `${s.name} ${s.composition} ${s.supplierOrGrade}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) =>
        sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      );
  }, [supports, search, verificationFilter, sortAsc]);

  const activePrecursor =
    precursors.find((p) => p.id === selectedPrecursorId) ??
    filteredPrecursors[0] ??
    null;
  const activeSupport =
    supports.find((s) => s.id === selectedSupportId) ??
    filteredSupports[0] ??
    null;

  const openAddPrecursor = () => {
    setEditingPrecId(null);
    setPrecDraft({
      name: '',
      formula: '',
      metalIdentity: '',
      chargeClassification: 'Cationic',
      casNumber: '',
      molarMass: emptyRefProp('g/mol'),
      metalWeightFraction: emptyRefProp('wt%'),
      purity: emptyRefProp('%'),
      solubilityNotes: '',
      verificationStatus: 'unverified',
      provenance: 'user_entered',
      references: [],
      notes: '',
    });
    setRefDraft(emptyReferenceDraft());
    setPrecModalOpen(true);
  };

  const openEditPrecursor = (p: Precursor) => {
    setEditingPrecId(p.id);
    setPrecDraft({
      name: p.name,
      formula: p.formula,
      metalIdentity: p.metalIdentity,
      chargeClassification: p.chargeClassification,
      casNumber: p.casNumber,
      molarMass: { ...p.molarMass },
      metalWeightFraction: { ...p.metalWeightFraction },
      purity: { ...p.purity },
      solubilityNotes: p.solubilityNotes,
      verificationStatus: p.verificationStatus,
      provenance: p.provenance,
      references: [...p.references],
      notes: p.notes,
    });
    setRefDraft(emptyReferenceDraft());
    setPrecModalOpen(true);
  };

  const savePrecursor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!precDraft.name.trim() || !precDraft.formula.trim()) return;
    if (editingPrecId) {
      onUpdatePrecursor(editingPrecId, precDraft);
      setSelectedPrecursorId(editingPrecId);
    } else {
      const created = onAddPrecursor(precDraft);
      setSelectedPrecursorId(created.id);
    }
    setPrecModalOpen(false);
  };

  const openAddSupport = () => {
    setEditingSuppId(null);
    setSuppDraft({
      name: '',
      composition: '',
      supplierOrGrade: '',
      betSurfaceArea: emptyRefProp('m²/g'),
      pzc: emptyRefProp('pH'),
      poreVolume: emptyRefProp('cm³/g'),
      particleSizeRange: '',
      measurementConditions: '',
      verificationStatus: 'unverified',
      provenance: 'user_entered',
      references: [],
      notes: '',
    });
    setRefDraft(emptyReferenceDraft());
    setSuppModalOpen(true);
  };

  const openEditSupport = (s: Support) => {
    setEditingSuppId(s.id);
    setSuppDraft({
      name: s.name,
      composition: s.composition,
      supplierOrGrade: s.supplierOrGrade,
      betSurfaceArea: { ...s.betSurfaceArea },
      pzc: { ...s.pzc },
      poreVolume: { ...s.poreVolume },
      particleSizeRange: s.particleSizeRange,
      measurementConditions: s.measurementConditions,
      verificationStatus: s.verificationStatus,
      provenance: s.provenance,
      references: [...s.references],
      notes: s.notes,
    });
    setRefDraft(emptyReferenceDraft());
    setSuppModalOpen(true);
  };

  const saveSupport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suppDraft.name.trim() || !suppDraft.composition.trim()) return;
    if (editingSuppId) {
      onUpdateSupport(editingSuppId, suppDraft);
      setSelectedSupportId(editingSuppId);
    } else {
      const created = onAddSupport(suppDraft);
      setSelectedSupportId(created.id);
    }
    setSuppModalOpen(false);
  };

  const addRefToCurrentDraft = (kind: 'precursor' | 'support') => {
    const title = refDraft.title.trim();
    if (!title) return;
    const parsedYear =
      refDraft.year.trim() && Number.isFinite(Number(refDraft.year))
        ? Math.trunc(Number(refDraft.year))
        : null;
    const citationParts = [
      refDraft.authorOrOrganization.trim(),
      parsedYear !== null ? `(${parsedYear})` : '',
      title,
    ].filter(Boolean);

    const ref: ScientificReference = {
      id: generateUuid('ref'),
      title,
      authorOrOrganization: refDraft.authorOrOrganization.trim(),
      citation: citationParts.join(' '),
      doiOrUrl: refDraft.doiOrUrl.trim(),
      year: parsedYear,
      sourceType: refDraft.sourceType,
      relevantProperty: refDraft.relevantProperty.trim(),
      measurementConditions: refDraft.measurementConditions.trim(),
      dateAccessed: new Date().toISOString().slice(0, 10),
      verificationStatus: refDraft.verificationStatus,
      reviewerNotes: refDraft.reviewerNotes.trim(),
      notes: refDraft.reviewerNotes.trim(),
    };

    if (kind === 'precursor') {
      setPrecDraft((prev) => ({
        ...prev,
        references: [...prev.references, ref],
      }));
    } else {
      setSuppDraft((prev) => ({
        ...prev,
        references: [...prev.references, ref],
      }));
    }
    setRefDraft(emptyReferenceDraft());
  };

  return (
    <div className="space-y-5">
      <WorkspaceHeader
        title="Material Databases"
        description="Manage metal precursors and oxide/carbon supports with structured scientific references, explicit provenance, and verification tracking. Historical experiment snapshots are never overwritten by edits here."
        metadata={
          <>
            <span>
              Precursors:{' '}
              <strong className="font-mono tabular-nums text-[#111827]">
                {precursors.length}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Supports:{' '}
              <strong className="font-mono tabular-nums text-[#111827]">
                {supports.length}
              </strong>
            </span>
          </>
        }
        actions={
          <>
            <div
              role="tablist"
              aria-label="Material database category"
              className="inline-flex items-center p-0.5 bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'precursors'}
                onClick={() => setTab('precursors')}
                className={`px-3 py-1 text-[12px] font-medium rounded-[5px] transition-colors cursor-pointer ${
                  tab === 'precursors'
                    ? 'bg-white text-[#0F52BA] border border-[#E5E7EB]'
                    : 'text-[#4B5563] hover:text-[#111827] border border-transparent'
                }`}
              >
                Precursors ({precursors.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'supports'}
                onClick={() => setTab('supports')}
                className={`px-3 py-1 text-[12px] font-medium rounded-[5px] transition-colors cursor-pointer ${
                  tab === 'supports'
                    ? 'bg-white text-[#0F52BA] border border-[#E5E7EB]'
                    : 'text-[#4B5563] hover:text-[#111827] border border-transparent'
                }`}
              >
                Supports ({supports.length})
              </button>
            </div>
            <Button
              variant="primary"
              onClick={tab === 'precursors' ? openAddPrecursor : openAddSupport}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              {tab === 'precursors' ? 'Add Precursor' : 'Add Support'}
            </Button>
          </>
        }
      />

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-[#E5E7EB] rounded-[8px] p-3 grid grid-cols-1 md:grid-cols-12 gap-2.5">
        <div className="md:col-span-6 relative">
          <Search
            className="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            strokeWidth={1.75}
          />
          <input
            type="search"
            aria-label={`Search ${tab}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              tab === 'precursors'
                ? 'Search precursor name, formula, metal, CAS...'
                : 'Search support name, composition, supplier grade...'
            }
            className={`${inputBaseClass} pl-8`}
          />
        </div>
        <div className="md:col-span-3">
          <select
            aria-label="Filter by verification status"
            value={verificationFilter}
            onChange={(e) =>
              setVerificationFilter(
                e.target.value as VerificationStatus | 'All'
              )
            }
            className={inputBaseClass}
          >
            <option value="All">All Verification States</option>
            {VERIFICATION_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-3">
          <select
            aria-label="Sort materials"
            value={sortAsc ? 'asc' : 'desc'}
            onChange={(e) => setSortAsc(e.target.value === 'asc')}
            className={inputBaseClass}
          >
            <option value="asc">Sort: Name (A–Z)</option>
            <option value="desc">Sort: Name (Z–A)</option>
          </select>
        </div>
      </div>

      {/* Master-Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Table List (7 cols) */}
        <Panel className="lg:col-span-7 overflow-hidden">
          {tab === 'precursors' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[540px]">
                <thead>
                  <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[11px] uppercase tracking-[0.04em] text-[#4B5563]">
                    <th className="py-2.5 px-3 font-medium">Precursor &amp; Formula</th>
                    <th className="py-2.5 px-2.5 font-medium">Metal / Charge</th>
                    <th className="py-2.5 px-2.5 font-medium text-right">MW (g/mol)</th>
                    <th className="py-2.5 px-2.5 font-medium">Status</th>
                    <th className="py-2.5 px-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] text-[12.5px]">
                  {filteredPrecursors.map((p) => {
                    const selected = activePrecursor?.id === p.id;
                    return (
                      <tr
                        key={p.id}
                        className={selected ? 'bg-[#EFF6FF]/60' : 'hover:bg-[#F8F9FA]'}
                      >
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => setSelectedPrecursorId(p.id)}
                            className="text-left cursor-pointer"
                          >
                            <div className="font-medium text-[#111827] hover:text-[#0F52BA]">
                              {p.name}
                            </div>
                            <div className="font-mono text-[11.5px] text-[#6B7280]">
                              {p.formula}
                            </div>
                          </button>
                        </td>
                        <td className="py-2.5 px-2.5 text-[#4B5563] whitespace-nowrap">
                          <span className="font-mono font-medium text-[#111827]">
                            {p.metalIdentity || '—'}
                          </span>{' '}
                          · {p.chargeClassification}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-[#111827]">
                          {formatScientificNumber(p.molarMass.value, 2)}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <VerificationIndicator status={p.verificationStatus} />
                        </td>
                        <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditPrecursor(p)}
                              ariaLabel={`Edit ${p.name}`}
                            >
                              <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDeleteConfirm({
                                  kind: 'precursor',
                                  id: p.id,
                                  name: p.name,
                                })
                              }
                              ariaLabel={`Delete ${p.name}`}
                              className="hover:text-[#991B1B] hover:bg-[#FEF2F2]"
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPrecursors.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-[12.5px] text-[#6B7280]"
                      >
                        No precursors match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[540px]">
                <thead>
                  <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB] text-[11px] uppercase tracking-[0.04em] text-[#4B5563]">
                    <th className="py-2.5 px-3 font-medium">Support &amp; Composition</th>
                    <th className="py-2.5 px-2.5 font-medium text-right">BET (m²/g)</th>
                    <th className="py-2.5 px-2.5 font-medium text-right">PZC (pH)</th>
                    <th className="py-2.5 px-2.5 font-medium">Status</th>
                    <th className="py-2.5 px-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] text-[12.5px]">
                  {filteredSupports.map((s) => {
                    const selected = activeSupport?.id === s.id;
                    return (
                      <tr
                        key={s.id}
                        className={selected ? 'bg-[#EFF6FF]/60' : 'hover:bg-[#F8F9FA]'}
                      >
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => setSelectedSupportId(s.id)}
                            className="text-left cursor-pointer"
                          >
                            <div className="font-medium text-[#111827] hover:text-[#0F52BA]">
                              {s.name}
                            </div>
                            <div className="font-mono text-[11.5px] text-[#6B7280]">
                              {s.composition} · {s.supplierOrGrade || 'Unspecified grade'}
                            </div>
                          </button>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-[#111827]">
                          {formatScientificNumber(s.betSurfaceArea.value, 1)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-[#0F52BA] font-medium">
                          {formatScientificNumber(s.pzc.value, 2)}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <VerificationIndicator status={s.verificationStatus} />
                        </td>
                        <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditSupport(s)}
                              ariaLabel={`Edit ${s.name}`}
                            >
                              <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDeleteConfirm({
                                  kind: 'support',
                                  id: s.id,
                                  name: s.name,
                                })
                              }
                              ariaLabel={`Delete ${s.name}`}
                              className="hover:text-[#991B1B] hover:bg-[#FEF2F2]"
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSupports.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-[12.5px] text-[#6B7280]"
                      >
                        No supports match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Material Detail Inspector (5 cols) */}
        <Panel className="lg:col-span-5">
          {tab === 'precursors' && activePrecursor ? (
            <>
              <PanelHeader
                title={activePrecursor.name}
                subtitle={`${activePrecursor.formula} · CAS ${activePrecursor.casNumber || '—'}`}
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditPrecursor(activePrecursor)}
                  >
                    <Pencil className="w-3 h-3" strokeWidth={1.75} />
                    Edit
                  </Button>
                }
              />
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <VerificationIndicator
                    status={activePrecursor.verificationStatus}
                  />
                  <ProvenanceIndicator provenance={activePrecursor.provenance} />
                  <span className="text-[12px] text-[#4B5563]">
                    {activePrecursor.metalIdentity} ·{' '}
                    {activePrecursor.chargeClassification}
                  </span>
                </div>

                <ReferencePropertyBlock
                  title="Molar Mass"
                  prop={activePrecursor.molarMass}
                />
                <ReferencePropertyBlock
                  title="Metal Weight Fraction"
                  prop={activePrecursor.metalWeightFraction}
                />
                <ReferencePropertyBlock
                  title="Purity"
                  prop={activePrecursor.purity}
                />

                {activePrecursor.solubilityNotes && (
                  <div className="text-[12px]">
                    <div className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
                      Solubility Notes
                    </div>
                    <p className="text-[#4B5563] mt-0.5">
                      {activePrecursor.solubilityNotes}
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-[#E5E7EB]">
                  <div className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280] mb-1.5">
                    Scientific References ({activePrecursor.references.length})
                  </div>
                  <ReferenceListCard references={activePrecursor.references} />
                </div>
              </div>
            </>
          ) : tab === 'supports' && activeSupport ? (
            <>
              <PanelHeader
                title={activeSupport.name}
                subtitle={`${activeSupport.composition} · ${activeSupport.supplierOrGrade || 'Unspecified'}`}
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditSupport(activeSupport)}
                  >
                    <Pencil className="w-3 h-3" strokeWidth={1.75} />
                    Edit
                  </Button>
                }
              />
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <VerificationIndicator
                    status={activeSupport.verificationStatus}
                  />
                  <ProvenanceIndicator provenance={activeSupport.provenance} />
                  {activeSupport.particleSizeRange && (
                    <span className="text-[12px] font-mono text-[#4B5563]">
                      Size: {activeSupport.particleSizeRange}
                    </span>
                  )}
                </div>

                <ReferencePropertyBlock
                  title="BET Surface Area"
                  prop={activeSupport.betSurfaceArea}
                  decimals={1}
                />
                <ReferencePropertyBlock
                  title="Point of Zero Charge (PZC)"
                  prop={activeSupport.pzc}
                  decimals={2}
                />
                <ReferencePropertyBlock
                  title="Pore Volume"
                  prop={activeSupport.poreVolume}
                  decimals={2}
                />

                {activeSupport.measurementConditions && (
                  <div className="text-[12px]">
                    <div className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280]">
                      Measurement Conditions
                    </div>
                    <p className="text-[#4B5563] mt-0.5">
                      {activeSupport.measurementConditions}
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-[#E5E7EB]">
                  <div className="text-[11px] uppercase tracking-[0.05em] text-[#6B7280] mb-1.5">
                    Scientific References ({activeSupport.references.length})
                  </div>
                  <ReferenceListCard references={activeSupport.references} />
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-[12.5px] text-[#6B7280]">
              Select a material record to inspect reference properties and verification metadata.
            </div>
          )}
        </Panel>
      </div>

      {/* Precursor Add/Edit Modal */}
      <Modal
        open={precModalOpen}
        onClose={() => setPrecModalOpen(false)}
        title={editingPrecId ? 'Edit Precursor Record' : 'Add Metal Precursor'}
        description="Specify chemical identity, charge classification, reference properties, structured references, and verification status."
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={savePrecursor} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="prec-name" required>
                Precursor Name
              </FieldLabel>
              <input
                id="prec-name"
                type="text"
                required
                value={precDraft.name}
                onChange={(e) =>
                  setPrecDraft({ ...precDraft, name: e.target.value })
                }
                className={inputBaseClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="prec-formula" required>
                Chemical Formula
              </FieldLabel>
              <input
                id="prec-formula"
                type="text"
                required
                value={precDraft.formula}
                onChange={(e) =>
                  setPrecDraft({ ...precDraft, formula: e.target.value })
                }
                className={`${inputBaseClass} font-mono`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="prec-metal">Metal Identity</FieldLabel>
              <input
                id="prec-metal"
                type="text"
                value={precDraft.metalIdentity}
                onChange={(e) =>
                  setPrecDraft({ ...precDraft, metalIdentity: e.target.value })
                }
                placeholder="e.g., Pt, Pd, Ni"
                className={`${inputBaseClass} font-mono`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="prec-charge">Charge Classification</FieldLabel>
              <select
                id="prec-charge"
                value={precDraft.chargeClassification}
                onChange={(e) =>
                  setPrecDraft({
                    ...precDraft,
                    chargeClassification: e.target.value as PrecursorChargeClass,
                  })
                }
                className={inputBaseClass}
              >
                {CHARGE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="prec-cas">CAS Number</FieldLabel>
              <input
                id="prec-cas"
                type="text"
                value={precDraft.casNumber}
                onChange={(e) =>
                  setPrecDraft({ ...precDraft, casNumber: e.target.value })
                }
                className={`${inputBaseClass} font-mono`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="prec-verif">Verification Status</FieldLabel>
              <select
                id="prec-verif"
                value={precDraft.verificationStatus}
                onChange={(e) =>
                  setPrecDraft({
                    ...precDraft,
                    verificationStatus: e.target.value as VerificationStatus,
                  })
                }
                className={inputBaseClass}
              >
                {VERIFICATION_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#E5E7EB]">
            <div>
              <FieldLabel htmlFor="prec-mw">Molar Mass</FieldLabel>
              <NumericInput
                id="prec-mw"
                value={precDraft.molarMass.value}
                min={0}
                unit="g/mol"
                onChange={(v) =>
                  setPrecDraft({
                    ...precDraft,
                    molarMass: { ...precDraft.molarMass, value: v },
                  })
                }
              />
              <input
                type="text"
                placeholder="Source / COA"
                value={precDraft.molarMass.source}
                onChange={(e) =>
                  setPrecDraft({
                    ...precDraft,
                    molarMass: { ...precDraft.molarMass, source: e.target.value },
                  })
                }
                className={`${inputBaseClass} mt-1.5 text-[12px]`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="prec-wt">Metal wt%</FieldLabel>
              <NumericInput
                id="prec-wt"
                value={precDraft.metalWeightFraction.value}
                min={0}
                max={100}
                unit="wt%"
                onChange={(v) =>
                  setPrecDraft({
                    ...precDraft,
                    metalWeightFraction: {
                      ...precDraft.metalWeightFraction,
                      value: v,
                    },
                  })
                }
              />
              <input
                type="text"
                placeholder="Assay source"
                value={precDraft.metalWeightFraction.source}
                onChange={(e) =>
                  setPrecDraft({
                    ...precDraft,
                    metalWeightFraction: {
                      ...precDraft.metalWeightFraction,
                      source: e.target.value,
                    },
                  })
                }
                className={`${inputBaseClass} mt-1.5 text-[12px]`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="prec-purity">Purity</FieldLabel>
              <NumericInput
                id="prec-purity"
                value={precDraft.purity.value}
                min={0}
                max={100}
                unit="%"
                onChange={(v) =>
                  setPrecDraft({
                    ...precDraft,
                    purity: { ...precDraft.purity, value: v },
                  })
                }
              />
              <input
                type="text"
                placeholder="COA / basis"
                value={precDraft.purity.source}
                onChange={(e) =>
                  setPrecDraft({
                    ...precDraft,
                    purity: { ...precDraft.purity, source: e.target.value },
                  })
                }
                className={`${inputBaseClass} mt-1.5 text-[12px]`}
              />
            </div>
          </div>

          <StructuredReferenceEditor
            draft={refDraft}
            onChangeDraft={(patch) =>
              setRefDraft((prev) => ({ ...prev, ...patch }))
            }
            onAdd={() => addRefToCurrentDraft('precursor')}
            references={precDraft.references}
            onRemove={(id) =>
              setPrecDraft({
                ...precDraft,
                references: precDraft.references.filter((x) => x.id !== id),
              })
            }
          />

          <div className="pt-3 border-t border-[#E5E7EB] flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setPrecModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingPrecId ? 'Save Changes' : 'Add Precursor'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Support Add/Edit Modal */}
      <Modal
        open={suppModalOpen}
        onClose={() => setSuppModalOpen(false)}
        title={editingSuppId ? 'Edit Support Record' : 'Add Support Material'}
        description="Record support identity, composition, BET surface area, PZC, measurement conditions, and structured scientific references."
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={saveSupport} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="supp-name" required>
                Support Name
              </FieldLabel>
              <input
                id="supp-name"
                type="text"
                required
                value={suppDraft.name}
                onChange={(e) =>
                  setSuppDraft({ ...suppDraft, name: e.target.value })
                }
                className={inputBaseClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="supp-comp" required>
                Composition
              </FieldLabel>
              <input
                id="supp-comp"
                type="text"
                required
                value={suppDraft.composition}
                onChange={(e) =>
                  setSuppDraft({ ...suppDraft, composition: e.target.value })
                }
                placeholder="e.g., SiO2, γ-Al2O3, Carbon"
                className={`${inputBaseClass} font-mono`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="supp-grade">Supplier / Grade / Lot</FieldLabel>
              <input
                id="supp-grade"
                type="text"
                value={suppDraft.supplierOrGrade}
                onChange={(e) =>
                  setSuppDraft({
                    ...suppDraft,
                    supplierOrGrade: e.target.value,
                  })
                }
                className={inputBaseClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="supp-verif">Verification Status</FieldLabel>
              <select
                id="supp-verif"
                value={suppDraft.verificationStatus}
                onChange={(e) =>
                  setSuppDraft({
                    ...suppDraft,
                    verificationStatus: e.target.value as VerificationStatus,
                  })
                }
                className={inputBaseClass}
              >
                {VERIFICATION_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#E5E7EB]">
            <div>
              <FieldLabel htmlFor="supp-bet">BET Surface Area</FieldLabel>
              <NumericInput
                id="supp-bet"
                value={suppDraft.betSurfaceArea.value}
                min={0}
                unit="m²/g"
                onChange={(v) =>
                  setSuppDraft({
                    ...suppDraft,
                    betSurfaceArea: { ...suppDraft.betSurfaceArea, value: v },
                  })
                }
              />
              <input
                type="text"
                placeholder="BET source / method"
                value={suppDraft.betSurfaceArea.source}
                onChange={(e) =>
                  setSuppDraft({
                    ...suppDraft,
                    betSurfaceArea: {
                      ...suppDraft.betSurfaceArea,
                      source: e.target.value,
                    },
                  })
                }
                className={`${inputBaseClass} mt-1.5 text-[12px]`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="supp-pzc">Point of Zero Charge</FieldLabel>
              <NumericInput
                id="supp-pzc"
                value={suppDraft.pzc.value}
                min={0}
                max={14}
                unit="pH"
                onChange={(v) =>
                  setSuppDraft({
                    ...suppDraft,
                    pzc: { ...suppDraft.pzc, value: v },
                  })
                }
              />
              <input
                type="text"
                placeholder="PZC method / conditions"
                value={suppDraft.pzc.conditions}
                onChange={(e) =>
                  setSuppDraft({
                    ...suppDraft,
                    pzc: { ...suppDraft.pzc, conditions: e.target.value },
                  })
                }
                className={`${inputBaseClass} mt-1.5 text-[12px]`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="supp-pv">Pore Volume</FieldLabel>
              <NumericInput
                id="supp-pv"
                value={suppDraft.poreVolume.value}
                min={0}
                unit="cm³/g"
                onChange={(v) =>
                  setSuppDraft({
                    ...suppDraft,
                    poreVolume: { ...suppDraft.poreVolume, value: v },
                  })
                }
              />
              <input
                type="text"
                placeholder="Source"
                value={suppDraft.poreVolume.source}
                onChange={(e) =>
                  setSuppDraft({
                    ...suppDraft,
                    poreVolume: {
                      ...suppDraft.poreVolume,
                      source: e.target.value,
                    },
                  })
                }
                className={`${inputBaseClass} mt-1.5 text-[12px]`}
              />
            </div>
          </div>

          <StructuredReferenceEditor
            draft={refDraft}
            onChangeDraft={(patch) =>
              setRefDraft((prev) => ({ ...prev, ...patch }))
            }
            onAdd={() => addRefToCurrentDraft('support')}
            references={suppDraft.references}
            onRemove={(id) =>
              setSuppDraft({
                ...suppDraft,
                references: suppDraft.references.filter((x) => x.id !== id),
              })
            }
          />

          <div className="pt-3 border-t border-[#E5E7EB] flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setSuppModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingSuppId ? 'Save Changes' : 'Add Support'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteConfirm)}
        title={`Delete ${deleteConfirm?.name ?? 'Material'}?`}
        message="This removes the material from the shared database. Existing experiments that already snapshotted this material will retain their historical property snapshots."
        confirmLabel="Delete Material"
        onConfirm={() => {
          if (deleteConfirm?.kind === 'precursor') {
            onDeletePrecursor(deleteConfirm.id);
          } else if (deleteConfirm?.kind === 'support') {
            onDeleteSupport(deleteConfirm.id);
          }
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
