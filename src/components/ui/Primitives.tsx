'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  DataProvenance,
  ExperimentStatus,
  VerificationStatus,
} from '../../domain/models/types';
import { parseOptionalNumber } from '../../domain/calculations/seaMath';

export function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-white border border-[#E5E7EB] rounded-[8px] ${className}`}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#E5E7EB]">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-[#111827] leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[12px] text-[#6B7280] mt-0.5 leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function WorkspaceHeader({
  title,
  description,
  metadata,
  actions,
}: {
  title: string;
  description: string;
  metadata?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="pb-4 mb-5 border-b border-[#E5E7EB]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-[260px] max-w-xl">
          <h1 className="text-[19px] font-semibold tracking-[-0.015em] text-[#111827] leading-tight">
            {title}
          </h1>
          <p className="text-[13px] text-[#4B5563] mt-1 leading-relaxed">
            {description}
          </p>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
      {metadata && (
        <div className="mt-3 pt-3 border-t border-[#F3F4F6] flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#4B5563]">
          {metadata}
        </div>
      )}
    </header>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  unit,
  required,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  unit?: string;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-[0.05em] font-medium text-[#4B5563] mb-1"
    >
      <span>
        {children}
        {required && <span className="text-[#991B1B] ml-0.5">*</span>}
      </span>
      {unit && (
        <span className="font-mono normal-case tracking-normal text-[11px] text-[#6B7280]">
          {unit}
        </span>
      )}
    </label>
  );
}

export const inputBaseClass =
  'w-full h-8 px-2.5 text-[13px] text-[#111827] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[6px] hover:border-[#D1D5DB] focus:bg-white focus:border-[#0F52BA] transition-colors placeholder:text-[#9CA3AF] disabled:opacity-60 disabled:cursor-not-allowed';

export const compactCellInputClass =
  'w-full h-7 px-2 text-[12px] text-[#111827] bg-transparent border border-transparent hover:border-[#D1D5DB] focus:bg-white focus:border-[#0F52BA] rounded-[4px] transition-colors placeholder:text-[#9CA3AF]';

export function NumericInput({
  id,
  value,
  onChange,
  unit,
  placeholder = '—',
  step = 'any',
  min,
  max,
  ariaLabel,
  compact = false,
  disabled = false,
}: {
  id?: string;
  value: number | null;
  onChange: (next: number | null) => void;
  unit?: string;
  placeholder?: string;
  step?: string | number;
  min?: number;
  max?: number;
  ariaLabel?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayedValue =
    draft !== null ? draft : value === null ? '' : String(value);

  const handleFocus = () => {
    setDraft(value === null ? '' : String(value));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDraft(raw);
    if (raw.trim() === '') {
      onChange(null);
      return;
    }
    const parsed = parseOptionalNumber(raw);
    if (parsed !== null) {
      if (min !== undefined && parsed < min) return;
      if (max !== undefined && parsed > max) return;
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    const currentDraft = draft ?? '';
    const parsed = parseOptionalNumber(currentDraft);
    if (parsed === null) {
      if (value !== null) onChange(null);
    } else {
      const bounded =
        min !== undefined && parsed < min
          ? min
          : max !== undefined && parsed > max
            ? max
            : parsed;
      if (bounded !== value) onChange(bounded);
    }
    setDraft(null);
  };

  if (compact) {
    return (
      <input
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={displayedValue}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        className={`${compactCellInputClass} font-mono tabular-nums text-right`}
      />
    );
  }

  return (
    <div className="relative flex items-center">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={displayedValue}
        disabled={disabled}
        step={step}
        placeholder={placeholder}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        className={`${inputBaseClass} font-mono tabular-nums text-right ${
          unit ? 'pr-16' : ''
        }`}
      />
      {unit && (
        <span className="pointer-events-none absolute right-2.5 font-mono text-[11px] text-[#6B7280] select-none">
          {unit}
        </span>
      )}
    </div>
  );
}

export const PROVENANCE_LABELS: Record<DataProvenance, string> = {
  user_entered: 'User Entered',
  literature_reference: 'Literature Ref',
  manufacturer_spec: 'Manufacturer Spec',
  measured_experimental: 'Measured Exp.',
  theoretical_estimate: 'Theoretical Est.',
  derived_calculated: 'Derived Calc.',
  synthetic_demo: 'Synthetic Demo',
  unavailable: 'Unavailable',
};

export function ProvenanceIndicator({
  provenance,
}: {
  provenance: DataProvenance;
}) {
  const tone =
    provenance === 'synthetic_demo'
      ? 'text-[#92400E] bg-[#FFFBEB] border-[#FDE68A]'
      : provenance === 'unavailable'
        ? 'text-[#6B7280] bg-[#F3F4F6] border-[#E5E7EB]'
        : provenance === 'measured_experimental'
          ? 'text-[#065F46] bg-[#ECFDF5] border-[#A7F3D0]'
          : provenance === 'derived_calculated'
            ? 'text-[#0F52BA] bg-[#EFF6FF] border-[#BFDBFE]'
            : 'text-[#4B5563] bg-[#F8F9FA] border-[#E5E7EB]';

  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[11px] font-medium leading-none border rounded-[4px] whitespace-nowrap ${tone}`}
    >
      {PROVENANCE_LABELS[provenance]}
    </span>
  );
}

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  unverified: 'Unverified',
  synthetic_fixture: 'Synthetic Fixture',
  internal_check: 'Internal Check',
  literature_verified: 'Literature Verified',
};

export function VerificationIndicator({
  status,
}: {
  status: VerificationStatus;
}) {
  const tone =
    status === 'literature_verified'
      ? 'text-[#065F46] bg-[#ECFDF5] border-[#A7F3D0]'
      : status === 'synthetic_fixture' || status === 'unverified'
        ? 'text-[#92400E] bg-[#FFFBEB] border-[#FDE68A]'
        : 'text-[#0F52BA] bg-[#EFF6FF] border-[#BFDBFE]';

  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[11px] font-medium leading-none border rounded-[4px] whitespace-nowrap ${tone}`}
    >
      {VERIFICATION_LABELS[status]}
    </span>
  );
}

export function StatusText({ status }: { status: ExperimentStatus }) {
  const color =
    status === 'Completed'
      ? 'text-[#065F46]'
      : status === 'In Progress'
        ? 'text-[#0F52BA]'
        : status === 'Planned'
          ? 'text-[#92400E]'
          : status === 'Archived'
            ? 'text-[#6B7280]'
            : 'text-[#4B5563]';

  return (
    <span className={`text-[12px] font-medium whitespace-nowrap ${color}`}>
      {status}
    </span>
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'secondary',
  size = 'md',
  disabled = false,
  className = '',
  ariaLabel,
  title,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const variantClasses = {
    primary:
      'bg-[#111827] text-white border border-[#111827] hover:bg-[#1F2937] hover:border-[#1F2937]',
    secondary:
      'bg-white text-[#111827] border border-[#E5E7EB] hover:bg-[#F8F9FA] hover:border-[#D1D5DB]',
    danger:
      'bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA] hover:bg-[#FEE2E2]',
    ghost:
      'bg-transparent text-[#4B5563] border border-transparent hover:bg-[#F3F4F6] hover:text-[#111827]',
  }[variant];

  const sizeClasses =
    size === 'sm'
      ? 'h-7 px-2.5 text-[12px] gap-1.5'
      : 'h-8 px-3 text-[12.5px] gap-1.5';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={`inline-flex items-center justify-center font-medium rounded-[6px] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${variantClasses} ${sizeClasses} ${className}`}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-10 text-center bg-white border border-[#E5E7EB] rounded-[8px]">
      <h3 className="text-[14px] font-semibold text-[#111827]">{title}</h3>
      <p className="text-[13px] text-[#6B7280] mt-1 max-w-md mx-auto">
        {description}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidthClass = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
    >
      <div
        className={`w-full ${maxWidthClass} bg-white border border-[#E5E7EB] rounded-[8px] max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#E5E7EB]">
          <div>
            <h2
              id="modal-heading"
              className="text-[15px] font-semibold text-[#111827]"
            >
              {title}
            </h2>
            {description && (
              <p className="text-[12.5px] text-[#6B7280] mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 text-[#6B7280] hover:text-[#111827] rounded-[6px] hover:bg-[#F3F4F6] cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidthClass="max-w-md">
      <p className="text-[13px] text-[#4B5563] leading-relaxed">{message}</p>
      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={variant} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
