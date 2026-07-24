import { Activity } from 'lucide-react';
import type { Period } from '../data/types';
import './Nav.css';

interface NavProps {
  period: Period;
  onPeriodChange: (p: Period) => void;
  live: boolean;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
];

/** Top nav: brand left; segmented period selector + live indicator right. */
export function Nav({ period, onPeriodChange, live }: NavProps) {
  return (
    <nav className="nav">
      <div className="nav__brand">
        <span className="nav__brand-mark">/</span>
        <span className="nav__brand-name">Panel de Control</span>
      </div>

      <div className="nav__controls">
        <div className="segmented" role="group" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`segmented__option ${
                period === p.value ? 'segmented__option--active' : ''
              }`}
              aria-pressed={period === p.value}
              onClick={() => onPeriodChange(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className={`live ${live ? 'live--on' : 'live--idle'}`} aria-live="polite">
          <span className="live__dot" aria-hidden="true" />
          <Activity size={14} strokeWidth={2.25} aria-hidden="true" />
          <span className="live__label">{live ? 'Actualizando' : 'En vivo'}</span>
        </div>
      </div>
    </nav>
  );
}
