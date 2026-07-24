import type { LucideIcon } from 'lucide-react';
import type { Metric } from '../data/types';
import { TrendBadge } from './TrendBadge';
import './KpiCard.css';

interface KpiCardProps {
  icon: LucideIcon;
  metric: Metric;
}

/** Top-row KPI tile: icon + uppercase label, big value, variation line. */
export function KpiCard({ icon: Icon, metric }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <div className="kpi-card__head">
        <Icon size={16} strokeWidth={2} className="kpi-card__icon" aria-hidden="true" />
        <span className="kpi-card__label">{metric.label}</span>
      </div>
      <div className="kpi-card__value">{metric.value}</div>
      {metric.changePct !== undefined && (
        <TrendBadge changePct={metric.changePct} caption="vs. periodo anterior" />
      )}
    </div>
  );
}
