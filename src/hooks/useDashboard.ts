import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDashboard } from '../data/api';
import type { DashboardSnapshot, Period } from '../data/types';

const POLL_INTERVAL_MS = 30_000; // production polling cadence for "En vivo"

interface UseDashboardResult {
  period: Period;
  setPeriod: (p: Period) => void;
  snapshot: DashboardSnapshot | null;
  /** True only on the very first load, when no snapshot exists yet. */
  isInitialLoading: boolean;
  /** True on background refreshes (period change / poll) with data present. */
  isRefreshing: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Owns period state and drives data loading + background polling.
 *
 * Polling here replaces the prototype's random 3s jitter: in production the
 * backend serves cached, real figures and we simply re-poll. Loading and error
 * states are surfaced so cards can render skeletons / retry affordances.
 */
export function useDashboard(initialPeriod: Period = '7d'): UseDashboardResult {
  const [period, setPeriodState] = useState<Period>(initialPeriod);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // Track the period each request targets, so a stale response can't overwrite
  // a newer one after the user switches the selector mid-flight.
  const periodRef = useRef(period);
  periodRef.current = period;

  const load = useCallback(
    async (targetPeriod: Period, background: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (background) setIsRefreshing(true);
      setError(null);

      try {
        const next = await fetchDashboard(targetPeriod, controller.signal);
        if (controller.signal.aborted) return;
        // Discard if the user has since changed the period.
        if (periodRef.current !== targetPeriod) return;
        setSnapshot(next);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar los datos.',
        );
      } finally {
        if (!controller.signal.aborted) setIsRefreshing(false);
      }
    },
    [],
  );

  // Load on period change (background if we already have data).
  useEffect(() => {
    load(period, snapshot !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // Background polling loop.
  useEffect(() => {
    const id = window.setInterval(() => {
      load(periodRef.current, true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Cancel any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const setPeriod = useCallback((p: Period) => setPeriodState(p), []);
  const refresh = useCallback(
    () => load(periodRef.current, snapshot !== null),
    [load, snapshot],
  );

  return {
    period,
    setPeriod,
    snapshot,
    isInitialLoading: snapshot === null && error === null,
    isRefreshing,
    error,
    refresh,
  };
}
