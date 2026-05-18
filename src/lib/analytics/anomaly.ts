/**
 * Detecção de anomalias estatística simples (z-score sobre janela móvel).
 * Roda no client porque opera sobre o bundle já carregado — sem custo BQ.
 */
export interface AnomalyInput {
  date: string;
  value: number;
}

export interface AnomalyResult {
  date: string;
  value: number;
  expected: number;
  z: number;
  severity: 'info' | 'warn' | 'critical';
}

export function detectAnomalies(
  series: AnomalyInput[],
  { window = 14, threshold = 2.5 }: { window?: number; threshold?: number } = {}
): AnomalyResult[] {
  const out: AnomalyResult[] = [];
  for (let i = window; i < series.length; i++) {
    const win = series.slice(i - window, i).map((p) => p.value);
    const mean = win.reduce((a, b) => a + b, 0) / win.length;
    const variance =
      win.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, win.length - 1);
    const std = Math.sqrt(variance);
    if (std === 0) continue;
    const cur = series[i];
    const z = (cur.value - mean) / std;
    if (Math.abs(z) >= threshold) {
      out.push({
        date: cur.date,
        value: cur.value,
        expected: Math.round(mean),
        z,
        severity: Math.abs(z) >= 4 ? 'critical' : Math.abs(z) >= 3 ? 'warn' : 'info',
      });
    }
  }
  return out;
}
