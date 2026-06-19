export type RangePreset = '7d' | '14d' | '30d' | '90d';

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface SyncStatus {
  lastSyncAt: string | null;
  running: boolean;
  perDevice: Array<{
    source: 'whoop' | 'oura' | 'apple';
    lastSyncAt: string | null;
    ok: boolean;
    message: string | null;
  }>;
}
