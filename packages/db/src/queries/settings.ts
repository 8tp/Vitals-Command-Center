import type { Database } from 'better-sqlite3';
import { INTEGRATION_IDS, INTEGRATIONS, type IntegrationId } from '@vcc/shared';

export interface IntegrationSetting {
  id: IntegrationId;
  enabled: boolean;
  autoSync: boolean;
  syncIntervalMinutes: number;
  displayOrder: number;
  updatedAt: string | null;
}

interface IntegrationSettingRow {
  id: string;
  enabled: number;
  auto_sync: number;
  sync_interval_minutes: number;
  display_order: number;
  updated_at: string | null;
}

function defaultSetting(id: IntegrationId): IntegrationSetting {
  const meta = INTEGRATIONS[id];
  return {
    id,
    enabled: meta.defaultEnabled,
    autoSync: meta.defaultEnabled,
    syncIntervalMinutes: meta.defaultSyncIntervalMinutes,
    displayOrder: INTEGRATION_IDS.indexOf(id),
    updatedAt: null,
  };
}

function toSetting(r: IntegrationSettingRow): IntegrationSetting {
  return {
    id: r.id as IntegrationId,
    enabled: !!r.enabled,
    autoSync: !!r.auto_sync,
    syncIntervalMinutes: r.sync_interval_minutes,
    displayOrder: r.display_order,
    updatedAt: r.updated_at,
  };
}

/** All integration settings, falling back to registry defaults for any id with
 * no row yet, always returned in display order. */
export function listIntegrationSettings(db: Database): IntegrationSetting[] {
  const rows = db
    .prepare('SELECT * FROM integration_settings')
    .all() as IntegrationSettingRow[];
  const byId = new Map(rows.map((r) => [r.id, toSetting(r)]));
  return INTEGRATION_IDS.map((id) => byId.get(id) ?? defaultSetting(id)).sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
}

export function getIntegrationSetting(db: Database, id: IntegrationId): IntegrationSetting {
  const row = db
    .prepare('SELECT * FROM integration_settings WHERE id = ?')
    .get(id) as IntegrationSettingRow | undefined;
  return row ? toSetting(row) : defaultSetting(id);
}

export function updateIntegrationSetting(
  db: Database,
  id: IntegrationId,
  patch: { enabled?: boolean; autoSync?: boolean; syncIntervalMinutes?: number },
): IntegrationSetting {
  const current = getIntegrationSetting(db, id);
  const next: IntegrationSetting = {
    ...current,
    enabled: patch.enabled ?? current.enabled,
    autoSync: patch.autoSync ?? current.autoSync,
    syncIntervalMinutes: patch.syncIntervalMinutes ?? current.syncIntervalMinutes,
  };
  db.prepare(
    `INSERT INTO integration_settings (id, enabled, auto_sync, sync_interval_minutes, display_order, updated_at)
     VALUES (@id, @enabled, @autoSync, @interval, @order, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       enabled=excluded.enabled,
       auto_sync=excluded.auto_sync,
       sync_interval_minutes=excluded.sync_interval_minutes,
       updated_at=excluded.updated_at`,
  ).run({
    id,
    enabled: next.enabled ? 1 : 0,
    autoSync: next.autoSync ? 1 : 0,
    interval: next.syncIntervalMinutes,
    order: next.displayOrder,
  });
  return next;
}

// --- generic app settings (JSON-encoded) -----------------------------------

export function getAppSetting(db: Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setAppSetting(db: Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
  ).run(key, value);
}

export function getAppSettingJson<T>(db: Database, key: string, fallback: T): T {
  const raw = getAppSetting(db, key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
