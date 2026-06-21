import { useCallback, useEffect, useState } from 'react';
import type { IntegrationId, IntegrationMeta } from '@vcc/shared';
import { apiGet, apiPatch } from '../lib/api.js';
import { useHealthStore } from '../stores/healthStore.js';
import { useUiStore } from '../stores/uiStore.js';

/** Mirror of the server's IntegrationStatus (registry meta + settings + live state). */
export interface IntegrationStatusView extends IntegrationMeta {
  enabled: boolean;
  autoSync: boolean;
  syncIntervalMinutes: number;
  configured: boolean;
  connected: boolean;
  hasTodayData: boolean;
  lastSeen: string | null;
  lastSyncOk: boolean;
  message: string | null;
}

export interface SettingsPayload {
  app: { autoSyncEnabled: boolean };
  integrations: IntegrationStatusView[];
}

export interface IntegrationPatch {
  enabled?: boolean;
  autoSync?: boolean;
  syncIntervalMinutes?: number;
}

/**
 * Loads /api/settings and exposes optimistic-ish patchers. Each PATCH returns
 * the full settings payload (server contract), so we just replace state. When an
 * integration's `enabled` flips we also refetch health data so the rail's device
 * cluster reflects it immediately (a disabled device disappears, never "offline").
 */
export function useSettings(active: boolean) {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchAll = useHealthStore((s) => s.fetchAll);
  const range = useUiStore((s) => s.range);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await apiGet<SettingsPayload>('/api/settings'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const patchIntegration = useCallback(
    async (id: IntegrationId, patch: IntegrationPatch) => {
      const next = await apiPatch<IntegrationPatch, SettingsPayload>(
        `/api/settings/integrations/${id}`,
        patch,
      );
      setSettings(next);
      if ('enabled' in patch) void fetchAll(range);
    },
    [fetchAll, range],
  );

  const patchApp = useCallback(async (patch: { autoSyncEnabled?: boolean }) => {
    setSettings(await apiPatch<typeof patch, SettingsPayload>('/api/settings/app', patch));
  }, []);

  return { settings, loading, error, patchIntegration, patchApp, reload: load };
}
