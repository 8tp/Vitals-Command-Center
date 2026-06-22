import { useEffect } from 'react';
import clsx from 'clsx';
import type { IntegrationId } from '@vcc/shared';
import { useUiStore } from '../../stores/uiStore.js';
import { useUnitsStore } from '../../stores/unitsStore.js';
import type { Units } from '../../lib/units.js';
import { useSettings, type IntegrationStatusView } from '../../hooks/useSettings.js';
import { IconX, IconSync, IconCheck, IconSparkle } from '../shared/icons.js';

/** Cadence options fold per-source auto-sync + interval into one control. */
const CADENCE: { label: string; value: string; autoSync: boolean; minutes?: number }[] = [
  { label: 'Manual only', value: 'manual', autoSync: false },
  { label: 'Every 15 min', value: '15', autoSync: true, minutes: 15 },
  { label: 'Every 30 min', value: '30', autoSync: true, minutes: 30 },
  { label: 'Hourly', value: '60', autoSync: true, minutes: 60 },
  { label: 'Every 4 hours', value: '240', autoSync: true, minutes: 240 },
  { label: 'Daily', value: '1440', autoSync: true, minutes: 1440 },
];

function cadenceValue(it: IntegrationStatusView): string {
  if (!it.autoSync) return 'manual';
  const match = CADENCE.find((c) => c.minutes === it.syncIntervalMinutes);
  return match?.value ?? '60';
}

function relTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function statusLine(it: IntegrationStatusView): string {
  if (!it.configured) return it.connectHint;
  if (!it.enabled) return 'Off · hidden from dashboard';
  if (it.connected) {
    const rel = relTime(it.lastSeen);
    return rel ? `Connected · synced ${rel}` : 'Connected';
  }
  return it.message ?? 'Connecting…';
}

export function SettingsModal() {
  const storeOpen = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  // ?settings opens the modal on load (screenshot/deep-link affordance).
  const open = storeOpen || (typeof location !== 'undefined' && /[?&]settings\b/.test(location.search));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return <SettingsPanel onClose={() => setOpen(false)} />;
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, loading, patchIntegration, patchApp } = useSettings(true);
  const units = useUnitsStore((s) => s.units);
  const setUnits = useUnitsStore((s) => s.setUnits);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-7 animate-fade-rise"
      style={{ background: 'rgba(20,33,61,0.34)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] max-h-[88vh] overflow-y-auto scrollbar-thin bg-bg-surface rounded-[24px] shadow-card-hover"
      >
        <div className="p-6 sm:p-7">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <h2 className="font-display font-semibold text-[22px] tracking-tight text-ink">Settings</h2>
              <p className="text-[12.5px] text-ink-mute mt-1.5 max-w-[42ch] leading-relaxed">
                Connected sources sync automatically. Turning one off hides it everywhere — it never
                shows as “offline”.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="grid place-items-center w-9 h-9 rounded-full text-ink-dim bg-bg-surface2 hover:text-accent transition-colors shrink-0"
            >
              <IconX size={16} />
            </button>
          </div>

          {/* Master auto-sync */}
          <div className="flex items-center gap-3.5 mt-5 mb-2 p-4 rounded-md" style={{ background: 'var(--accent-wash)', boxShadow: 'inset 0 0 0 1px var(--accent-soft)' }}>
            <span className="grid place-items-center w-9 h-9 rounded-[11px] text-white shrink-0" style={{ background: 'linear-gradient(140deg, var(--accent), var(--accent-deep))' }}>
              <IconSync size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[14px] text-ink">Automatic sync</div>
              <div className="text-[11.5px] text-ink-dim mt-0.5">Pull from all active sources on a schedule</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings?.app.autoSyncEnabled ?? false}
              aria-label="Automatic sync"
              disabled={!settings}
              onClick={() => settings && patchApp({ autoSyncEnabled: !settings.app.autoSyncEnabled })}
              className={clsx('toggle', settings?.app.autoSyncEnabled && 'on')}
            />
          </div>

          {/* Units */}
          <div className="flex items-center gap-3.5 mt-2 p-4 rounded-md bg-bg-surface shadow-[inset_0_0_0_1px_var(--hairline)]">
            <span className="grid place-items-center w-9 h-9 rounded-[11px] text-ink-dim bg-bg-surface2 shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2.5" y="8" width="19" height="8" rx="2" />
                <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[14px] text-ink">Units</div>
              <div className="text-[11.5px] text-ink-dim mt-0.5">Distance, pace &amp; temperature</div>
            </div>
            <div className="inline-flex bg-bg-inset rounded-pill p-1 shadow-[inset_0_0_0_1px_var(--hairline)]" role="radiogroup" aria-label="Measurement units">
              {(['metric', 'imperial'] as Units[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={units === u}
                  onClick={() => setUnits(u)}
                  className={clsx(
                    'px-3.5 py-1.5 rounded-pill text-[12px] font-semibold capitalize transition-colors',
                    units === u ? 'bg-bg-surface text-accent shadow-card' : 'text-ink-mute hover:text-ink',
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* AI features — master gate + auto-generate */}
          <div className="mt-2 rounded-md bg-bg-surface shadow-[inset_0_0_0_1px_var(--hairline)] overflow-hidden">
            <div className="flex items-center gap-3.5 p-4">
              <span className="grid place-items-center w-9 h-9 rounded-[11px] text-white shrink-0" style={{ background: 'linear-gradient(140deg, var(--accent), var(--accent-deep))' }}>
                <IconSparkle size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[14px] text-ink">AI features</div>
                <div className="text-[11.5px] text-ink-dim mt-0.5">Daily brief, the Ask tab &amp; on-dashboard summary</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings?.app.aiEnabled ?? false}
                aria-label="AI features"
                disabled={!settings}
                onClick={() => settings && patchApp({ aiEnabled: !settings.app.aiEnabled })}
                className={clsx('toggle', settings?.app.aiEnabled && 'on')}
              />
            </div>
            {/* Auto-generate — nested, only meaningful when AI is on */}
            <div
              className={clsx(
                'flex items-center gap-3.5 p-4 pl-[68px] border-t border-hairline transition-opacity',
                !settings?.app.aiEnabled && 'opacity-45',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[13.5px] text-ink">Auto-generate brief</div>
                <div className="text-[11.5px] text-ink-dim mt-0.5">Write it each morning &amp; refresh after new runs</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings?.app.aiAutoSummary ?? false}
                aria-label="Auto-generate brief"
                disabled={!settings || !settings.app.aiEnabled}
                onClick={() => settings && patchApp({ aiAutoSummary: !settings.app.aiAutoSummary })}
                className={clsx('toggle', settings?.app.aiEnabled && settings?.app.aiAutoSummary && 'on')}
              />
            </div>
          </div>

          {/* Sources */}
          <div className="label-micro mt-5 mb-2.5 px-0.5">Sources</div>
          {loading && !settings ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[58px] rounded-md bg-bg-surface2 animate-pulse" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {settings?.integrations.map((it) => (
                <IntegrationRow key={it.id} it={it} onPatch={patchIntegration} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function IntegrationRow({
  it,
  onPatch,
}: {
  it: IntegrationStatusView;
  onPatch: (id: IntegrationId, patch: { enabled?: boolean; autoSync?: boolean; syncIntervalMinutes?: number }) => void;
}) {
  return (
    <li
      className={clsx(
        'flex items-center gap-3.5 p-3 rounded-md bg-bg-surface shadow-[inset_0_0_0_1px_var(--hairline)] transition-opacity',
        !it.enabled && 'opacity-60',
      )}
    >
      <span className="grid place-items-center w-9 h-9 rounded-[11px] shrink-0 text-white text-[13px] font-bold" style={{ background: it.color }}>
        {it.brand.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[13.5px] text-ink truncate flex items-center gap-2">
          {it.label}
          {it.enabled && it.connected && <IconCheck size={13} className="text-good shrink-0" />}
        </div>
        <div className="meta-mono text-[10.5px] mt-0.5 truncate">{statusLine(it)}</div>
      </div>

      {/* Cadence (only when on + configured) */}
      {it.enabled && it.configured && (
        <select
          value={cadenceValue(it)}
          onChange={(e) => {
            const c = CADENCE.find((x) => x.value === e.target.value)!;
            onPatch(it.id, c.autoSync ? { autoSync: true, syncIntervalMinutes: c.minutes } : { autoSync: false });
          }}
          className="hidden sm:block text-[11.5px] font-medium text-ink-dim bg-bg-surface2 rounded-pill px-2.5 py-1.5 border-0 cursor-pointer focus:outline-none"
          aria-label={`${it.label} sync cadence`}
        >
          {CADENCE.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      )}

      {/* Connect (when not configured) */}
      {!it.configured && it.connectPath && (
        <a
          href={it.connectPath}
          className="text-[12px] font-semibold text-accent hover:underline shrink-0 px-1"
        >
          Connect
        </a>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={it.enabled}
        aria-label={it.label}
        onClick={() => onPatch(it.id, { enabled: !it.enabled })}
        className={clsx('toggle', it.enabled && 'on')}
      />
    </li>
  );
}
