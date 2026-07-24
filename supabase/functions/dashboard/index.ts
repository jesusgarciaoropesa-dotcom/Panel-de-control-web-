/**
 * Edge Function: `dashboard`
 * ---------------------------------------------------------------------------
 * Único punto que el navegador consume: `GET /functions/v1/dashboard?period=7d`.
 * Devuelve un DashboardSnapshot ya normalizado, aplicando la capa de caché
 * (panel.snapshots, TTL 10 min) para no exceder cuotas de las APIs de canal.
 *
 * Estado de las integraciones:
 *   - Google Analytics (GA4): REAL cuando están definidas las variables de
 *     entorno GA_PROPERTY_ID y GA_SERVICE_ACCOUNT_JSON (ver README →
 *     "Conectar Google Analytics"). Si no, cae a datos de demostración.
 *   - Instagram / Facebook / AdSense / Amazon: demo por ahora (pendiente OAuth).
 *
 * Los secretos (clave de la cuenta de servicio) viven solo en el entorno de la
 * función, nunca en el navegador ni en git.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

type Period = '7d' | '30d';

// --- helpers de formato (es-ES) -------------------------------------------
const nf = new Intl.NumberFormat('es-ES');
const cf = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});
const pf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

const compact = (n: number) =>
  n >= 1_000_000
    ? `${pf.format(n / 1_000_000)} M`
    : n >= 1_000
      ? `${pf.format(n / 1_000)} K`
      : nf.format(Math.round(n));
const integer = (n: number) => nf.format(Math.round(n));
const currency = (n: number) => cf.format(n);
const percent = (n: number) => `${pf.format(n)} %`;
const duration = (s: number) =>
  `${Math.floor(s / 60)}m ${Math.round(s % 60).toString().padStart(2, '0')}s`;

const metric = (label: string, value: string, changePct?: number) => ({
  label,
  value,
  changePct,
});

// ===========================================================================
// Google Analytics (GA4 Data API) vía cuenta de servicio
// ===========================================================================

/** base64url de una cadena. */
function b64url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url de bytes. */
function b64urlBytes(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Importa la clave privada PEM (PKCS#8) de la cuenta de servicio. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // `private_key` viene de JSON.parse, así que los saltos de línea ya son
  // reales; `\s+` los elimina junto al resto de espacios.
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** Obtiene un access token de Google firmando un JWT (flujo de cuenta de servicio). */
async function getGoogleAccessToken(
  clientEmail: string,
  privateKeyPem: string,
  scope: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64urlBytes(new Uint8Array(sig))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(
      `No se pudo autenticar con Google: ${data.error_description ?? data.error ?? res.status}`,
    );
  }
  return data.access_token as string;
}

interface GaMetric { name: string }
interface GaRow {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

async function runReport(
  token: string,
  propertyId: string,
  metrics: GaMetric[],
  startDate: string,
  endDate: string,
  withDate: boolean,
): Promise<GaRow[]> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: withDate ? [{ name: 'date' }] : [],
        metrics,
        orderBys: withDate
          ? [{ dimension: { dimensionName: 'date' } }]
          : undefined,
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Error GA4 (${res.status})`);
  }
  return (data.rows ?? []) as GaRow[];
}

interface GaConfig {
  propertyId: string;
  serviceAccount: { client_email: string; private_key: string };
}

/**
 * Resuelve la configuración de GA4 desde (1) variables de entorno o, si no,
 * (2) la tabla panel.integration_config. Devuelve `null` si no hay config.
 *
 * @param service cliente service_role para leer la tabla (o null para omitir).
 */
async function resolveGaConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any | null,
): Promise<GaConfig | null> {
  // 1) Variables de entorno (secretos de Supabase).
  const envProperty = Deno.env.get('GA_PROPERTY_ID');
  const envSa = Deno.env.get('GA_SERVICE_ACCOUNT_JSON');
  if (envProperty && envSa) {
    return { propertyId: envProperty, serviceAccount: JSON.parse(envSa) };
  }

  // 2) Tabla de configuración (config guardada en la base de datos).
  if (service) {
    const { data } = await service
      .schema('panel')
      .from('integration_config')
      .select('config')
      .eq('channel', 'analytics')
      .maybeSingle();
    const cfg = data?.config;
    if (cfg?.property_id && cfg?.service_account) {
      const sa =
        typeof cfg.service_account === 'string'
          ? JSON.parse(cfg.service_account)
          : cfg.service_account;
      return { propertyId: String(cfg.property_id), serviceAccount: sa };
    }
  }

  return null;
}

/**
 * Lee GA4 y devuelve el estado del canal `analytics` normalizado.
 * Devuelve `null` si no hay credenciales configuradas (→ usar demo).
 */
async function fetchAnalyticsChannel(
  period: Period,
  gaConfig: GaConfig | null,
): Promise<unknown | null> {
  if (!gaConfig) return null; // no configurado todavía

  const sa = gaConfig.serviceAccount;
  const propertyId = gaConfig.propertyId;
  const token = await getGoogleAccessToken(
    sa.client_email,
    sa.private_key,
    'https://www.googleapis.com/auth/analytics.readonly',
  );

  const days = period === '30d' ? 30 : 7;
  const metrics: GaMetric[] = [
    { name: 'sessions' },
    { name: 'screenPageViews' },
    { name: 'averageSessionDuration' },
    { name: 'bounceRate' },
  ];

  // Periodo actual, con serie diaria.
  const rows = await runReport(
    token,
    propertyId,
    metrics,
    `${days - 1}daysAgo`,
    'today',
    true,
  );

  let sessions = 0;
  let pageViews = 0;
  let durWeighted = 0;
  let bounceWeighted = 0;
  const labels: string[] = [];
  const points: number[] = [];
  for (const r of rows) {
    const d = r.dimensionValues[0]?.value ?? '';
    const s = Number(r.metricValues[0]?.value ?? 0);
    const pv = Number(r.metricValues[1]?.value ?? 0);
    const dur = Number(r.metricValues[2]?.value ?? 0);
    const br = Number(r.metricValues[3]?.value ?? 0);
    sessions += s;
    pageViews += pv;
    durWeighted += dur * s;
    bounceWeighted += br * s;
    if (d.length === 8) {
      labels.push(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
      points.push(s);
    }
  }
  const avgDuration = sessions ? durWeighted / sessions : 0;
  const bounceRate = sessions ? bounceWeighted / sessions : 0; // GA4: proporción 0–1

  // Periodo anterior (solo sesiones) para calcular la variación.
  let changePct: number | undefined;
  try {
    const prev = await runReport(
      token,
      propertyId,
      [{ name: 'sessions' }],
      `${days * 2 - 1}daysAgo`,
      `${days}daysAgo`,
      false,
    );
    const prevSessions = prev.reduce(
      (acc, r) => acc + Number(r.metricValues[0]?.value ?? 0),
      0,
    );
    if (prevSessions > 0) {
      changePct = ((sessions - prevSessions) / prevSessions) * 100;
    }
  } catch {
    /* la variación es opcional */
  }

  return {
    channel: {
      id: 'analytics',
      status: 'connected',
      lastSyncedAt: new Date().toISOString(),
      data: {
        primary: metric('Sesiones', compact(sessions), changePct),
        secondary: [
          metric('Páginas vistas', compact(pageViews)),
          metric('Duración', duration(avgDuration)),
          metric('Rebote', percent(bounceRate * 100)),
        ],
        series: { labels, points },
      },
    },
    sessions,
    changePct,
  };
}

// ===========================================================================
// Snapshot de demostración (resto de canales / fallback)
// ===========================================================================

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 0xffffffff);
}

function buildSeries(days: number, base: number, rng: () => number) {
  const labels: string[] = [];
  const points: number[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(d.toISOString().slice(0, 10));
    points.push(base * (1 + (days - 1 - i) * 0.01) * (0.85 + rng() * 0.3));
  }
  return { labels, points };
}

function buildSnapshot(period: Period): Record<string, unknown> {
  const rng = makeRng(Date.now());
  const days = period === '30d' ? 30 : 7;
  const scale = period === '30d' ? 4.1 : 1;
  const now = new Date().toISOString();

  const ig = {
    followers: Math.round(18420 * (1 + (rng() - 0.5) * 0.03)),
    reach: Math.round(52300 * scale * (0.9 + rng() * 0.2)),
    engagementRate: 4.8 * (0.9 + rng() * 0.2),
    posts: Math.round((period === '30d' ? 18 : 5) + rng() * 2),
  };
  const fb = {
    followers: Math.round(9650 * (1 + (rng() - 0.5) * 0.03)),
    reach: Math.round(31200 * scale * (0.9 + rng() * 0.2)),
    engagementRate: 2.9 * (0.9 + rng() * 0.2),
    posts: Math.round((period === '30d' ? 14 : 4) + rng() * 2),
  };
  const ga = {
    sessions: Math.round(24800 * scale * (0.9 + rng() * 0.2)),
    pageViews: Math.round(68400 * scale * (0.9 + rng() * 0.2)),
    avgDuration: 163 * (0.9 + rng() * 0.2),
    bounceRate: 42.6 * (0.95 + rng() * 0.1),
  };
  const ads = {
    earnings: (period === '30d' ? 1284 : 312) * (0.9 + rng() * 0.2),
    rpm: 4.62 * (0.95 + rng() * 0.1),
    clicks: Math.round(1840 * scale * (0.9 + rng() * 0.2)),
    impressions: Math.round(276000 * scale * (0.9 + rng() * 0.2)),
  };
  const amz = {
    commissions: (period === '30d' ? 486 : 118) * (0.9 + rng() * 0.2),
    clicks: Math.round(2140 * scale * (0.9 + rng() * 0.2)),
    conversion: 3.4 * (0.9 + rng() * 0.2),
    orders: Math.round(74 * scale * (0.9 + rng() * 0.2)),
  };

  const connected = (id: string, data: unknown) => ({
    id,
    status: 'connected',
    data,
    lastSyncedAt: now,
  });

  const totalRevenue = ads.earnings + amz.commissions;
  const totalAudience = ig.followers + fb.followers;
  const totalInteractions =
    ig.reach * (ig.engagementRate / 100) + fb.reach * (fb.engagementRate / 100);
  const adsShare = (ads.earnings / totalRevenue) * 100;
  const igVsFb = ig.engagementRate / fb.engagementRate;

  return {
    period,
    kpis: {
      totalRevenue: metric('Ingresos totales', currency(totalRevenue), 5.4),
      totalAudience: metric('Audiencia total', compact(totalAudience), 1.8),
      siteVisits: metric('Visitas al sitio', compact(ga.sessions), 6.1),
      totalInteractions: metric(
        'Interacciones totales',
        compact(totalInteractions),
        3.2,
      ),
    },
    channels: {
      instagram: connected('instagram', {
        primary: metric('Seguidores', compact(ig.followers), 2.4),
        secondary: [
          metric('Alcance', compact(ig.reach)),
          metric('Interacción', percent(ig.engagementRate)),
          metric('Posts', integer(ig.posts)),
        ],
        series: buildSeries(days, ig.reach / days, rng),
      }),
      facebook: connected('facebook', {
        primary: metric('Seguidores', compact(fb.followers), 0.9),
        secondary: [
          metric('Alcance', compact(fb.reach)),
          metric('Interacción', percent(fb.engagementRate)),
          metric('Posts', integer(fb.posts)),
        ],
        series: buildSeries(days, fb.reach / days, rng),
      }),
      analytics: connected('analytics', {
        primary: metric('Sesiones', compact(ga.sessions), 6.1),
        secondary: [
          metric('Páginas vistas', compact(ga.pageViews)),
          metric('Duración', duration(ga.avgDuration)),
          metric('Rebote', percent(ga.bounceRate)),
        ],
        series: buildSeries(days, ga.sessions / days, rng),
      }),
      adsense: connected('adsense', {
        primary: metric('Ingresos', currency(ads.earnings), 8.2),
        secondary: [
          metric('RPM', currency(ads.rpm)),
          metric('Clics', integer(ads.clicks)),
          metric('Impresiones', compact(ads.impressions)),
        ],
        series: buildSeries(days, ads.earnings / days, rng),
      }),
      amazon: connected('amazon', {
        primary: metric('Comisiones', currency(amz.commissions), -3.5),
        secondary: [
          metric('Clics', integer(amz.clicks)),
          metric('Conversión', percent(amz.conversion)),
          metric('Pedidos', integer(amz.orders)),
        ],
        series: buildSeries(days, amz.commissions / days, rng),
      }),
    },
    insights: [
      {
        id: 'adsense-share',
        text: `AdSense genera el ${percent(adsShare)} de tus ingresos totales este periodo.`,
      },
      {
        id: 'ig-engagement',
        text: `Instagram tiene ${igVsFb.toFixed(1)}× más interacción que Facebook — prioriza contenido allí.`,
      },
      {
        id: 'bounce-rate',
        text:
          ga.bounceRate > 45
            ? `El rebote (${percent(ga.bounceRate)}) está algo alto; revisa las páginas de entrada.`
            : `El rebote (${percent(ga.bounceRate)}) está en buen rango.`,
      },
    ],
    fetchedAt: now,
  };
}

/**
 * Construye el snapshot combinando datos reales (los disponibles) con demo.
 * Hoy: Google Analytics real si está configurado; el resto, demo.
 * TODO(integración real): añadir Instagram/Facebook (Meta Graph) y AdSense.
 */
async function buildRealSnapshot(
  period: Period,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any | null,
): Promise<Record<string, unknown>> {
  const snapshot = buildSnapshot(period);

  try {
    const gaConfig = await resolveGaConfig(service);
    const ga = await fetchAnalyticsChannel(period, gaConfig);
    if (ga) {
      const channels = snapshot.channels as Record<string, unknown>;
      channels.analytics = (ga as { channel: unknown }).channel;
      // La KPI "Visitas al sitio" pasa a reflejar las sesiones reales.
      const kpis = snapshot.kpis as Record<string, unknown>;
      const sessions = (ga as { sessions: number }).sessions;
      const changePct = (ga as { changePct?: number }).changePct;
      kpis.siteVisits = metric('Visitas al sitio', compact(sessions), changePct);
    }
  } catch (err) {
    // Configurado pero falló: mostramos el canal en estado de error (sin tumbar
    // el resto del panel), con el motivo para diagnóstico.
    const channels = snapshot.channels as Record<string, unknown>;
    channels.analytics = {
      id: 'analytics',
      status: 'error',
      error:
        err instanceof Error
          ? `Google Analytics: ${err.message}`
          : 'Error al leer Google Analytics.',
    };
  }

  return snapshot;
}

// ===========================================================================
// Handler
// ===========================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get('period') ?? '7d';
    const period: Period = raw === '30d' ? '30d' : '7d';
    if (raw !== '7d' && raw !== '30d') {
      return json({ error: "El parámetro 'period' debe ser '7d' o '30d'." }, 400);
    }

    // ¿Petición autenticada? Resolvemos el user_id desde el JWT.
    const authHeader = req.headers.get('Authorization') ?? '';
    let userId: string | null = null;
    if (authHeader.startsWith('Bearer ')) {
      const authClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await authClient.auth.getUser();
      userId = data.user?.id ?? null;
    }

    // Cliente service_role para leer config/caché (RLS lo permite solo a él).
    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Modo anónimo (sin login todavía): calcula y devuelve sin persistir.
    if (!userId) {
      return json(await buildRealSnapshot(period, service));
    }

    // Caché fresca → servir.
    const { data: cached } = await service
      .schema('panel')
      .from('snapshots')
      .select('data, fetched_at')
      .eq('user_id', userId)
      .eq('period', period)
      .maybeSingle();

    if (
      cached &&
      Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS
    ) {
      return json(cached.data);
    }

    // Stale o inexistente → re-sincronizar y cachear.
    const snapshot = await buildRealSnapshot(period, service);
    await service
      .schema('panel')
      .from('snapshots')
      .upsert(
        {
          user_id: userId,
          period,
          data: snapshot,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,period' },
      );

    return json(snapshot);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      500,
    );
  }
});
