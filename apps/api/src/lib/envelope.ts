import type { ApiResponse } from '@vcc/shared';

export function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function fail(error: string, code = 'INTERNAL', details?: unknown): ApiResponse<never> {
  return { ok: false, error: { error, code, details } };
}
