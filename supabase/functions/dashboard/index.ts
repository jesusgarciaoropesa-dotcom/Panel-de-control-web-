/**
 * Edge Function: `dashboard`
 * ---------------------------------------------------------------------------
 * Único punto que el navegador consume: `GET /functions/v1/dashboard?period=7d`.
 * Devuelve un DashboardSnapshot ya normalizado, aplicando la capa de caché
 * (panel.snapshots, TTL 10 min) para no exceder cuotas de las APIs de canal.
 *
 * Flujo:
 *   1. Si la petición está autenticada (JWT de Supabase) → usa ese user_id,
 *      sirve de caché si está fresca y, si no, re-sincroniza y cachea.
 *   2. Si no está autenticada → modo demo: calcula un snapshot al vuelo y NO
 *      persiste (útil mientras el frontend aún no tiene login).
 *
 * La sincronización real con Meta Graph / GA4 / AdSense va en `syncSnapshot()`,
 * donde hoy hay un cálculo de demostración marcado con TODO. Los tokens OAuth
 * viven en panel.connections y solo los lee esta función (service_role).
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

/**
 * Construye un snapshot normalizado.
 *
 * TODO(integración real): en lugar de calcular cifras de demostración, aquí se
 * leerían las conexiones OAuth de `panel.connections` y se llamaría a cada API
 * de canal (Instagram/Facebook via Meta Graph, GA4 Data API, AdSense Management
 * API), mapeando cada respuesta a esta misma forma. Amazon se toma de
 * `panel.amazon_imports` (carga manual). El resto de la función no cambia.
 */
function buildSnapshot(period: Period): unknown {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncSnapshot(_service: any, _userId: string, period: Period) {
  // TODO(integración real): leer panel.connections del usuario y llamar a las
  // APIs de canal server-side. Por ahora se calcula un snapshot de demostración.
  return buildSnapshot(period);
}

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

    // Modo demo (sin login todavía): calcula y devuelve sin persistir.
    if (!userId) {
      return json(buildSnapshot(period));
    }

    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Caché fresca → servir.
    const { data: cached } = await service
      .schema('panel')
      .from('snapshots')
      .select('data, fetched_at')
      .eq('user_id', userId)
      .eq('period', period)
      .maybeSingle();

    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
      return json(cached.data);
    }

    // Stale o inexistente → re-sincronizar y cachear.
    const snapshot = await syncSnapshot(service, userId, period);
    await service
      .schema('panel')
      .from('snapshots')
      .upsert(
        { user_id: userId, period, data: snapshot, fetched_at: new Date().toISOString() },
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
