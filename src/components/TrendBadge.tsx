import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { signedPercent } from '../data/format';
import './TrendBadge.css';

interface TrendBadgeProps {
  changePct: number;
  /** Optional trailing context, e.g. "vs. periodo anterior". */
  caption?: string;
}

/**
 * Variation line: trend icon + signed percentage.
 * Up = positive/green, down = accent/red, flat = neutral.
 */
export function TrendBadge({ changePct, caption }: TrendBadgeProps) {
  const direction = changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat';
  const Icon =
    direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;

  return (
    <span className={`trend trend--${direction}`}>
      <Icon size={14} strokeWidth={2.25} aria-hidden="true" />
      <span className="trend__value">{signedPercent(changePct)}</span>
      {caption && <span className="trend__caption">{caption}</span>}
    </span>
  );
}
