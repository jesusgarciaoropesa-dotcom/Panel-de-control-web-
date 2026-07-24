import type { Series } from '../data/types';

interface SparklineProps {
  series: Series;
  width?: number;
  height?: number;
}

/**
 * Minimal SVG sparkline: a neutral-800 line with an accent end-point dot,
 * per the Modernist channel-card spec.
 */
export function Sparkline({ series, width = 160, height = 48 }: SparklineProps) {
  const { points } = series;
  if (points.length < 2) return null;

  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w;
    const y = pad + (1 - (p - min) / span) * h;
    return [x, y] as const;
  });

  const path = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');

  const [endX, endY] = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Tendencia del periodo"
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--color-neutral-800)"
        strokeWidth={2}
        strokeLinecap="square"
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={endX} cy={endY} r={3} fill="var(--color-accent-500)" />
    </svg>
  );
}
