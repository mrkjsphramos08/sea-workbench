'use client';

import React from 'react';
import {
  Activity,
  BarChart3,
  Beaker,
  Database,
  FileText,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  Timer,
} from 'lucide-react';
import {
  APP_VERSION,
  ActiveModule,
  WORKSPACE_SCHEMA_VERSION,
} from '../../domain/models/types';
import {
  StorageDiagnostics,
  formatStorageBytes,
} from '../../services/persistence/storage';

interface NavGroup {
  heading: string;
  items: Array<{
    id: ActiveModule;
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'RESEARCH',
    items: [
      { id: 'library', label: 'Experiment Library', icon: FolderKanban },
      { id: 'research-analytics', label: 'Research Analytics', icon: BarChart3 },
    ],
  },
  {
    heading: 'WORKBENCH',
    items: [
      { id: 'overview', label: 'Experiment Overview', icon: LayoutDashboard },
      { id: 'batch-synthesis', label: 'Batch & Planning', icon: FlaskConical },
      { id: 'uptake-survey', label: 'Uptake & PZC Survey', icon: Activity },
      { id: 'analytical', label: 'Dilution & Standards', icon: Beaker },
      { id: 'bench-runner', label: 'Bench Runner', icon: Timer },
      { id: 'lab-report', label: 'Lab Report (A4)', icon: FileText },
    ],
  },
  {
    heading: 'RESOURCES',
    items: [{ id: 'databases', label: 'Databases', icon: Database }],
  },
];

export function Sidebar({
  activeModule,
  collapsed,
  storageBytes,
  storageError,
  storageDiagnostics,
  experimentCount,
  onSelectModule,
  onOpenBackup,
}: {
  activeModule: ActiveModule;
  collapsed: boolean;
  storageBytes: number;
  storageError: string | null;
  storageDiagnostics?: StorageDiagnostics | null;
  experimentCount: number;
  onSelectModule: (mod: ActiveModule) => void;
  onOpenBackup?: () => void;
}) {
  return (
    <aside
      aria-label="Primary workbench navigation"
      className={`bg-white border-r border-[#E5E7EB] shrink-0 flex flex-col justify-between transition-[width] duration-150 no-print ${
        collapsed ? 'w-[56px]' : 'w-[220px]'
      }`}
    >
      <nav className="py-4 px-2 space-y-5 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading}>
            {!collapsed && (
              <div className="px-2.5 mb-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-[#6B7280] select-none">
                {group.heading}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelectModule(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#EFF6FF] text-[#0F52BA] font-medium'
                          : 'text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#111827] font-normal'
                      } ${collapsed ? 'justify-center px-0' : ''}`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-[#0F52BA]' : 'text-[#6B7280]'
                        }`}
                        strokeWidth={1.75}
                      />
                      {!collapsed && (
                        <span className="truncate whitespace-nowrap">
                          {item.label}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: Version & Local Workspace Storage Status */}
      <div className="border-t border-[#E5E7EB] px-3 py-3 text-[11px] text-[#6B7280]">
        {collapsed ? (
          <div
            className="text-center font-mono tabular-nums text-[10px]"
            title={`SEA Workbench v${APP_VERSION} · Schema ${WORKSPACE_SCHEMA_VERSION} · Local storage: ${formatStorageBytes(storageBytes)}`}
          >
            v{APP_VERSION}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between font-mono tabular-nums">
              <span className="text-[#4B5563] font-medium">
                v{APP_VERSION}
              </span>
              <span>Schema {WORKSPACE_SCHEMA_VERSION}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span>Local Workspace</span>
              <span
                className={`font-mono tabular-nums ${
                  storageError ? 'text-[#991B1B]' : 'text-[#4B5563]'
                }`}
              >
                {storageError ? 'Storage Error' : formatStorageBytes(storageBytes)}
              </span>
            </div>
            <div className="text-[11px] text-[#6B7280] font-mono tabular-nums">
              {experimentCount} {experimentCount === 1 ? 'record' : 'records'} stored locally
            </div>
            {storageDiagnostics && (
              <div className="pt-1 space-y-1">
                <div className="w-full h-1 bg-[#F3F4F6] overflow-hidden">
                  <div
                    className={`h-full ${
                      storageDiagnostics.level === 'critical'
                        ? 'bg-[#DC2626]'
                        : storageDiagnostics.level === 'elevated'
                          ? 'bg-[#D97706]'
                          : 'bg-[#0F52BA]'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(2, storageDiagnostics.usageRatio * 100))}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-[#6B7280]">
                  <span>{(storageDiagnostics.usageRatio * 100).toFixed(1)}% of 5 MB</span>
                  {storageDiagnostics.backupRecommended && onOpenBackup && (
                    <button
                      type="button"
                      onClick={onOpenBackup}
                      className="text-[#0F52BA] hover:underline font-sans font-medium"
                    >
                      Backup JSON
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
