import { useMemo } from 'react';
import {
  DollarSign,
  Users,
  BarChart3,
  Heart,
  AlertTriangle,
} from 'lucide-react';
import { useDashboard } from './hooks/useDashboard';
import { CHANNEL_ORDER } from './data/api';
import type { ChannelState } from './data/types';
import { Nav } from './components/Nav';
import { KpiCard } from './components/KpiCard';
import { KpiSkeleton } from './components/KpiSkeleton';
import { ChannelCard } from './components/ChannelCard';
import { NotesCard } from './components/NotesCard';
import './App.css';

export default function App() {
  const {
    period,
    setPeriod,
    snapshot,
    isInitialLoading,
    isRefreshing,
    error,
    refresh,
  } = useDashboard('7d');

  const periodLabel = period === '7d' ? 'Últimos 7 días' : 'Últimos 30 días';

  // Loading placeholders for channel cards, in stable order.
  const loadingChannels = useMemo<ChannelState[]>(
    () => CHANNEL_ORDER.map((id) => ({ id, status: 'loading' as const })),
    [],
  );

  const channels = snapshot
    ? CHANNEL_ORDER.map((id) => snapshot.channels[id])
    : loadingChannels;

  return (
    <div className="app">
      <Nav period={period} onPeriodChange={setPeriod} live={isRefreshing} />

      <main className="content">
        <div className="content__head">
          <h1 className="content__title">Resumen · {periodLabel}</h1>
          <p className="content__subtitle">
            Todas tus métricas de audiencia e ingresos en una sola vista.
          </p>
        </div>

        {error && !snapshot ? (
          <GlobalError message={error} onRetry={refresh} />
        ) : (
          <>
            {/* KPI row */}
            <div className="kpi-grid">
              {isInitialLoading || !snapshot ? (
                <>
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                </>
              ) : (
                <>
                  <KpiCard icon={DollarSign} metric={snapshot.kpis.totalRevenue} />
                  <KpiCard icon={Users} metric={snapshot.kpis.totalAudience} />
                  <KpiCard icon={BarChart3} metric={snapshot.kpis.siteVisits} />
                  <KpiCard icon={Heart} metric={snapshot.kpis.totalInteractions} />
                </>
              )}
            </div>

            <hr className="hr" />

            {/* Channel grid */}
            <div className="channel-grid">
              {channels.map((state) => (
                <ChannelCard key={state.id} state={state} onRetry={refresh} />
              ))}
              {snapshot && <NotesCard insights={snapshot.insights} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function GlobalError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="global-error" role="alert">
      <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" />
      <div>
        <p className="global-error__title">No se pudo cargar el panel</p>
        <p className="global-error__message">{message}</p>
      </div>
      <button type="button" className="global-error__retry" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}
