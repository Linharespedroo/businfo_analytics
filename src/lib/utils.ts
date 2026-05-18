import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const compactFmt = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fullFmt = new Intl.NumberFormat('pt-BR');
const pctFmt = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
});

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return compactFmt.format(n);
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return fullFmt.format(n);
}

export function fmtPct(n: number | null | undefined, alreadyPct = false): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return pctFmt.format(alreadyPct ? n / 100 : n);
}

export function fmtDelta(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${pctFmt.format(n)}`;
}

export function fmtDate(d: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('pt-BR', opts ?? { day: '2-digit', month: 'short' });
}

export function toCsv<T extends Record<string, unknown>>(rows: T[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => headers.map((h) => escape(r[h])).join(','));
  return [headers.join(','), ...body].join('\n');
}

export function downloadBlob(name: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
