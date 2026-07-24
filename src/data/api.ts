/**
 * Data-access boundary for the dashboard.
 *
 * The UI never talks to a channel API directly. It calls `fetchDashboard()`,
 * which fans out to per-channel providers and normalizes the results into a
 * `DashboardSnapshot`. Today that fan-out is served by the mock provider in
 * `mockProvider.ts`. To go live, swap `activeProvider` for a real
 * implementation that hits your backend (see README → "Integración real").
 *
 * IMPORTANT: real channel calls MUST happen server-side. The browser only ever
 * talks to *your* backend (e.g. `/api/dashboard?period=7d`), which holds the
 * OAuth tokens and enforces the recommended 5–15 min cache. Never ship Meta /
 * Google / Amazon secrets to the client.
 */

import type { ChannelId, DashboardSnapshot, Period } from './types';
import { mockProvider } from './mockProvider';
import { httpProvider, isHttpProviderConfigured } from './httpProvider';

export interface DashboardProvider {
  /** Returns a fully normalized snapshot for the given period. */
  fetchDashboard(period: Period, signal?: AbortSignal): Promise<DashboardSnapshot>;
}

/**
 * Provider activo.
 *
 * Se usa el backend real (Edge Function de Supabase) en cuanto están definidas
 * las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver `.env.example`).
 * En caso contrario cae al `mockProvider` para desarrollo local sin backend.
 */
const activeProvider: DashboardProvider = isHttpProviderConfigured
  ? httpProvider
  : mockProvider;

/** Nombre legible del origen de datos activo (para diagnósticos/UI). */
export const activeProviderName = isHttpProviderConfigured
  ? 'supabase'
  : 'mock';

export function fetchDashboard(
  period: Period,
  signal?: AbortSignal,
): Promise<DashboardSnapshot> {
  return activeProvider.fetchDashboard(period, signal);
}

/** Channels rendered, in display order. */
export const CHANNEL_ORDER: ChannelId[] = [
  'instagram',
  'facebook',
  'analytics',
  'adsense',
  'amazon',
];
