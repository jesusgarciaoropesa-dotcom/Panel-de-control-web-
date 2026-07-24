/**
 * Mock data provider.
 *
 * Stands in for the real backend during development. It produces plausible,
 * internally consistent numbers per period and shapes them exactly like the
 * normalized domain models the UI expects, so swapping in the real
 * `httpProvider` requires no UI changes.
 *
 * The prototype's 3-second random "jitter" is intentionally NOT reproduced as
 * a data source here — live updates in production come from polling the
 * backend (see `useDashboard`), not from client-side randomness. This provider
 * does add a tiny per-call wobble only so the demo's "En vivo" indicator has
 * something to reflect.
 */

import type { DashboardProvider } from './api';
import type {
  ChannelData,
  ChannelId,
  ChannelState,
  DashboardSnapshot,
  Insight,
  KpiSummary,
  Metric,
  Period,
  Series,
} from './types';
import { compact, currency, duration, integer, percent } from './format';

// --- deterministic pseudo-random so numbers are stable within a session ---
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Small live wobble applied on each fetch so "En vivo" has visible effect. */
function wobble(base: number, rng: () => number, amplitude = 0.015): number {
  return base * (1 + (rng() - 0.5) * 2 * amplitude);
}

function buildSeries(days: number, base: number, rng: () => number): Series {
  const labels: string[] = [];
  const points: number[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(d.toISOString().slice(0, 10));
    const trend = 1 + (days - 1 - i) * 0.01; // gentle upward drift
    points.push(base * trend * (0.85 + rng() * 0.3));
  }
  return { labels, points };
}

function metric(label: string, value: string, changePct?: number): Metric {
  return { label, value, changePct };
}

/** Numbers behind the whole snapshot — the "raw" figures we also format. */
interface Figures {
  ig: { followers: number; reach: number; engagementRate: number; posts: number };
  fb: { followers: number; reach: number; engagementRate: number; posts: number };
  ga: { sessions: number; pageViews: number; avgDuration: number; bounceRate: number };
  ads: { earnings: number; rpm: number; clicks: number; impressions: number };
  amz: { commissions: number; clicks: number; conversion: number; orders: number };
}

function computeFigures(period: Period, rng: () => number): Figures {
  const scale = period === '30d' ? 4.1 : 1; // ~monthly vs weekly volume
  return {
    ig: {
      followers: Math.round(wobble(18420, rng)),
      reach: Math.round(wobble(52300 * scale, rng)),
      engagementRate: wobble(4.8, rng),
      posts: Math.round((period === '30d' ? 18 : 5) + rng() * 2),
    },
    fb: {
      followers: Math.round(wobble(9650, rng)),
      reach: Math.round(wobble(31200 * scale, rng)),
      engagementRate: wobble(2.9, rng),
      posts: Math.round((period === '30d' ? 14 : 4) + rng() * 2),
    },
    ga: {
      sessions: Math.round(wobble(24800 * scale, rng)),
      pageViews: Math.round(wobble(68400 * scale, rng)),
      avgDuration: wobble(163, rng),
      bounceRate: wobble(42.6, rng),
    },
    ads: {
      earnings: wobble(period === '30d' ? 1284 : 312, rng),
      rpm: wobble(4.62, rng),
      clicks: Math.round(wobble(1840 * scale, rng)),
      impressions: Math.round(wobble(276000 * scale, rng)),
    },
    amz: {
      commissions: wobble(period === '30d' ? 486 : 118, rng),
      clicks: Math.round(wobble(2140 * scale, rng)),
      conversion: wobble(3.4, rng),
      orders: Math.round(wobble(74 * scale, rng)),
    },
  };
}

function buildChannels(
  period: Period,
  f: Figures,
  rng: () => number,
): Record<ChannelId, ChannelState> {
  const days = period === '30d' ? 30 : 7;
  const now = new Date().toISOString();

  const connected = (id: ChannelId, data: ChannelData): ChannelState => ({
    id,
    status: 'connected',
    data,
    lastSyncedAt: now,
  });

  return {
    instagram: connected('instagram', {
      primary: metric('Seguidores', compact(f.ig.followers), 2.4),
      secondary: [
        metric('Alcance', compact(f.ig.reach)),
        metric('Interacción', percent(f.ig.engagementRate)),
        metric('Posts', integer(f.ig.posts)),
      ],
      series: buildSeries(days, f.ig.reach / days, rng),
    }),
    facebook: connected('facebook', {
      primary: metric('Seguidores', compact(f.fb.followers), 0.9),
      secondary: [
        metric('Alcance', compact(f.fb.reach)),
        metric('Interacción', percent(f.fb.engagementRate)),
        metric('Posts', integer(f.fb.posts)),
      ],
      series: buildSeries(days, f.fb.reach / days, rng),
    }),
    analytics: connected('analytics', {
      primary: metric('Sesiones', compact(f.ga.sessions), 6.1),
      secondary: [
        metric('Páginas vistas', compact(f.ga.pageViews)),
        metric('Duración', duration(f.ga.avgDuration)),
        metric('Rebote', percent(f.ga.bounceRate)),
      ],
      series: buildSeries(days, f.ga.sessions / days, rng),
    }),
    adsense: connected('adsense', {
      primary: metric('Ingresos', currency(f.ads.earnings), 8.2),
      secondary: [
        metric('RPM', currency(f.ads.rpm)),
        metric('Clics', integer(f.ads.clicks)),
        metric('Impresiones', compact(f.ads.impressions)),
      ],
      series: buildSeries(days, f.ads.earnings / days, rng),
    }),
    amazon: connected('amazon', {
      primary: metric('Comisiones', currency(f.amz.commissions), -3.5),
      secondary: [
        metric('Clics', integer(f.amz.clicks)),
        metric('Conversión', percent(f.amz.conversion)),
        metric('Pedidos', integer(f.amz.orders)),
      ],
      series: buildSeries(days, f.amz.commissions / days, rng),
    }),
  };
}

function buildKpis(f: Figures): KpiSummary {
  const totalRevenue = f.ads.earnings + f.amz.commissions;
  const totalAudience = f.ig.followers + f.fb.followers;
  const totalInteractions =
    f.ig.reach * (f.ig.engagementRate / 100) +
    f.fb.reach * (f.fb.engagementRate / 100);

  return {
    totalRevenue: metric('Ingresos totales', currency(totalRevenue), 5.4),
    totalAudience: metric('Audiencia total', compact(totalAudience), 1.8),
    siteVisits: metric('Visitas al sitio', compact(f.ga.sessions), 6.1),
    totalInteractions: metric(
      'Interacciones totales',
      compact(totalInteractions),
      3.2,
    ),
  };
}

/** Insights derived from the figures — mirrors the prototype's "Notas rápidas". */
function buildInsights(f: Figures): Insight[] {
  const totalRevenue = f.ads.earnings + f.amz.commissions;
  const adsShare = (f.ads.earnings / totalRevenue) * 100;
  const igVsFb = f.ig.engagementRate / f.fb.engagementRate;

  return [
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
        f.ga.bounceRate > 45
          ? `El rebote (${percent(f.ga.bounceRate)}) está algo alto; revisa las páginas de entrada.`
          : `El rebote (${percent(f.ga.bounceRate)}) está en buen rango.`,
    },
  ];
}

async function fetchDashboard(
  period: Period,
  signal?: AbortSignal,
): Promise<DashboardSnapshot> {
  // Simulate network latency; respect cancellation.
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, 450);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

  const rng = makeRng(Date.now());
  const figures = computeFigures(period, rng);

  return {
    period,
    kpis: buildKpis(figures),
    channels: buildChannels(period, figures, rng),
    insights: buildInsights(figures),
    fetchedAt: new Date().toISOString(),
  };
}

export const mockProvider: DashboardProvider = { fetchDashboard };
