import { DEVICE_COLOR, DEVICE_COLOR_BG, type DeviceSource } from './devices.js';

/**
 * The integration registry — the single source of truth for every data source
 * the dashboard can talk to. This is broader than DEVICE_SOURCES because it
 * includes Strava (an activity/workout source that is not a daily-vitals
 * "device"). Both the API and the web UI render from this.
 *
 * An integration is something the user can enable/disable in Settings. A
 * disabled integration is treated as "not set up" and never shown as
 * disconnected — it simply doesn't appear, which is the whole point: WHOOP/Oura
 * shouldn't read as "offline" when the user just isn't wearing them.
 */
export const INTEGRATION_IDS = ['fitbit', 'apple', 'strava', 'whoop', 'oura'] as const;
export type IntegrationId = (typeof INTEGRATION_IDS)[number];

/** Workouts can come from any wearable plus Strava. */
export type WorkoutSource = DeviceSource | 'strava';

export type IntegrationKind = 'wearable' | 'activity';
/** How an integration authenticates / receives data. */
export type IntegrationAuth = 'google-health' | 'oauth' | 'pat' | 'ingest';

export interface IntegrationMeta {
  id: IntegrationId;
  /** Full product name, e.g. "Fitbit Air". */
  label: string;
  /** Brand short name, e.g. "Fitbit". */
  brand: string;
  kind: IntegrationKind;
  /** Identity color (hex). */
  color: string;
  /** Identity color as a translucent background. */
  colorBg: string;
  auth: IntegrationAuth;
  /** Short human list of what this source contributes. */
  provides: string[];
  /** One-line description for the Settings card. */
  summary: string;
  /** Guidance shown when the integration isn't configured yet. */
  connectHint: string;
  /** API path that begins the connect flow (OAuth), or null for manual setup. */
  connectPath: string | null;
  /** Whether this integration is on by default for a fresh install. */
  defaultEnabled: boolean;
  /** Default per-source auto-sync cadence, in minutes. */
  defaultSyncIntervalMinutes: number;
}

export const INTEGRATIONS: Record<IntegrationId, IntegrationMeta> = {
  fitbit: {
    id: 'fitbit',
    label: 'Fitbit Air',
    brand: 'Fitbit',
    kind: 'wearable',
    color: DEVICE_COLOR.fitbit,
    colorBg: DEVICE_COLOR_BG.fitbit,
    auth: 'google-health',
    provides: ['HRV', 'Resting HR', 'SpO₂', 'Sleep', 'Steps', 'Calories', 'Skin temp', 'Respiratory'],
    summary: 'Primary 24/7 vitals — sleep, heart, SpO₂, steps & calories via Google Health.',
    connectHint: 'Connect Google Health to sync your Fitbit Air.',
    connectPath: '/api/auth/google',
    defaultEnabled: true,
    defaultSyncIntervalMinutes: 240,
  },
  apple: {
    id: 'apple',
    label: 'Apple Watch Ultra 2',
    brand: 'Apple Watch',
    kind: 'wearable',
    color: DEVICE_COLOR.apple,
    colorBg: DEVICE_COLOR_BG.apple,
    auth: 'ingest',
    provides: ['VO₂ max', 'Workouts', 'Exercise', 'Steps', 'Activity'],
    summary: 'Workouts, VO₂ max and activity from Apple Health.',
    connectHint: 'Use the iOS "Health Auto Export" app to POST to /api/ingest/apple.',
    connectPath: null,
    defaultEnabled: true,
    defaultSyncIntervalMinutes: 240,
  },
  strava: {
    id: 'strava',
    label: 'Strava',
    brand: 'Strava',
    kind: 'activity',
    color: '#fc5200',
    colorBg: 'rgba(252, 82, 0, 0.12)',
    auth: 'oauth',
    provides: ['Runs', 'Cardio', 'Distance', 'Pace', 'Relative effort'],
    summary: 'Runs and cardio with distance, pace and training load.',
    connectHint: 'Connect Strava to sync your runs and rides.',
    connectPath: '/api/auth/strava',
    defaultEnabled: true,
    defaultSyncIntervalMinutes: 60,
  },
  whoop: {
    id: 'whoop',
    label: 'WHOOP MG',
    brand: 'WHOOP',
    kind: 'wearable',
    color: DEVICE_COLOR.whoop,
    colorBg: DEVICE_COLOR_BG.whoop,
    auth: 'oauth',
    provides: ['Recovery', 'Strain', 'HRV', 'Sleep'],
    summary: 'Recovery, strain and sleep coaching.',
    connectHint: 'Connect WHOOP to sync recovery and strain.',
    connectPath: '/api/auth/whoop',
    defaultEnabled: false,
    defaultSyncIntervalMinutes: 240,
  },
  oura: {
    id: 'oura',
    label: 'Oura Ring 4',
    brand: 'Oura',
    kind: 'wearable',
    color: DEVICE_COLOR.oura,
    colorBg: DEVICE_COLOR_BG.oura,
    auth: 'pat',
    provides: ['Readiness', 'Sleep', 'HRV', 'Temperature'],
    summary: 'Readiness, sleep staging and temperature trends.',
    connectHint: 'Add an Oura Personal Access Token (OURA_PAT) to your .env.',
    connectPath: null,
    defaultEnabled: false,
    defaultSyncIntervalMinutes: 240,
  },
};

/** Stable, display-ordered list. */
export const INTEGRATION_LIST: IntegrationMeta[] = INTEGRATION_IDS.map((id) => INTEGRATIONS[id]);

export function isIntegrationId(value: string): value is IntegrationId {
  return (INTEGRATION_IDS as readonly string[]).includes(value);
}
