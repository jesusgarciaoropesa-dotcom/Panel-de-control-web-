import './KpiCard.css';
import '../components/ChannelCard.css'; // reuse .skeleton styles

/** Placeholder KPI tile shown during the initial load. */
export function KpiSkeleton() {
  return (
    <div className="kpi-card" aria-hidden="true">
      <div className="kpi-card__head">
        <span className="skeleton skeleton--xs" style={{ width: 16, height: 16 }} />
        <span className="skeleton skeleton--sm" />
      </div>
      <span className="skeleton skeleton--lg" />
      <span className="skeleton skeleton--md" />
    </div>
  );
}
