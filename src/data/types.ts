/**
 * Domain models for the multichannel dashboard.
 *
 * These types describe the *normalized* shape the UI consumes. Each provider
 * (see `providers/`) is responsible for mapping its raw API response — Meta
 * Graph, GA4 Data API, AdSense Management API, etc. — into these structures.
 */

export type Period = '7d' | '30d';

export type ChannelId =
  | 'instagram'
  | 'facebook'
  | 'analytics'
  | 'adsense'
  | 'amazon';

export type ChannelStatus =
  | 'connected'
  | 'disconnected'
  | 'loading'
  | 'error';

export type TrendDirection = 'up' | 'down' | 'flat';

/** A single value shown with its period-over-period variation. */
export interface Metric {
  label: string;
  /** Pre-formatted, human-readable value (e.g. "12,4 K", "1.284 €"). */
  value: string;
  /** Signed variation vs. the previous comparable period, as a percentage. */
  changePct?: number;
}

/** Time series feeding a sparkline. */
export interface Series {
  /** ISO date strings, one per point. */
  labels: string[];
  points: number[];
}

/** Normalized payload for a single channel card. */
export interface ChannelData {
  /** Headline metric rendered at 34px. */
  primary: Metric;
  /** The 3 secondary stats under the divider. */
  secondary: [Metric, Metric, Metric];
  /** Series for the header sparkline. */
  series: Series;
}

/** Per-channel envelope carrying status + freshness metadata. */
export interface ChannelState {
  id: ChannelId;
  status: ChannelStatus;
  data?: ChannelData;
  error?: string;
  /** Timestamp of the last successful real sync. */
  lastSyncedAt?: string;
}

/** The four top-row KPI tiles. */
export interface KpiSummary {
  totalRevenue: Metric;
  totalAudience: Metric;
  siteVisits: Metric;
  totalInteractions: Metric;
}

/** One auto-generated insight in the "Notas rápidas" card. */
export interface Insight {
  id: string;
  text: string;
}

/** Everything the dashboard needs for one period. */
export interface DashboardSnapshot {
  period: Period;
  kpis: KpiSummary;
  channels: Record<ChannelId, ChannelState>;
  insights: Insight[];
  fetchedAt: string;
}
