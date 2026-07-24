/** Locale-aware formatting helpers (es-ES). */

const numberFmt = new Intl.NumberFormat('es-ES');
const currencyFmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});
const percentFmt = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 1,
});

/** Compact form for large counts: 12 400 → "12,4 K". */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${percentFmt.format(n / 1_000_000)} M`;
  if (n >= 1_000) return `${percentFmt.format(n / 1_000)} K`;
  return numberFmt.format(Math.round(n));
}

export function integer(n: number): string {
  return numberFmt.format(Math.round(n));
}

export function currency(n: number): string {
  return currencyFmt.format(n);
}

export function percent(n: number): string {
  return `${percentFmt.format(n)} %`;
}

export function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

/** Signed percentage change for the trend line, e.g. "+8,2 %". */
export function signedPercent(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '' : '';
  return `${sign}${percentFmt.format(n)} %`;
}
