/**
 * Provider HTTP real: llama a la Edge Function `dashboard` de Supabase.
 *
 * El navegador solo habla con esta función (nunca con las APIs de canal). La
 * función mantiene los tokens OAuth y la caché server-side. Se envía la clave
 * pública (anon) como Bearer + apikey: es un JWT válido de rol `anon`, así la
 * plataforma acepta la petición (verify_jwt) y la función decide el modo.
 */

import type { DashboardProvider } from './api';
import type { DashboardSnapshot, Period } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const FUNCTION_NAME =
  (import.meta.env.VITE_DASHBOARD_FUNCTION as string | undefined) ?? 'dashboard';

/** True si hay configuración suficiente para usar el backend real. */
export const isHttpProviderConfigured = Boolean(SUPABASE_URL && ANON_KEY);

export const httpProvider: DashboardProvider = {
  async fetchDashboard(period: Period, signal?: AbortSignal): Promise<DashboardSnapshot> {
    if (!SUPABASE_URL || !ANON_KEY) {
      throw new Error(
        'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el entorno.',
      );
    }

    const url = `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}?period=${period}`;
    const res = await fetch(url, {
      method: 'GET',
      signal,
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
    });

    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.error ? `: ${body.error}` : '';
      } catch {
        /* respuesta no-JSON */
      }
      throw new Error(`Error ${res.status} al cargar el panel${detail}`);
    }

    return (await res.json()) as DashboardSnapshot;
  },
};
