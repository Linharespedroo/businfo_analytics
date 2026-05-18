'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/charts/page-header';
import { SectionCard } from '@/components/charts/section-card';
import { LoadingGrid } from '@/components/charts/loading-grid';
import { useBundle } from '@/lib/data/use-bundle';
import { useFilters } from '@/lib/filters/store';
import { filteredDaily } from '@/lib/analytics/filters';
import { detectAnomalies } from '@/lib/analytics/anomaly';
import { Badge } from '@/components/ui/badge';
import { fmtCompact, fmtDate, fmtDelta, fmtPct } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function InsightsPage() {
  const { data, isLoading } = useBundle();
  const filters = useFilters();
  if (isLoading || !data) return <LoadingGrid />;

  const daily = filteredDaily(data, filters);

  const anomaliasUsers = detectAnomalies(
    daily.map((d) => ({ date: d.date, value: d.users })),
    { window: 14, threshold: 2.5 }
  );
  const anomaliasBuscas = detectAnomalies(
    daily.map((d) => ({ date: d.date, value: d.buscas })),
    { window: 14, threshold: 2.5 }
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Insights Automáticos"
        description="Detecção estatística de anomalias e recomendações estratégicas."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data.insights.map((i) => (
          <article
            key={i.id}
            className={cn(
              'flex gap-3 rounded-xl border bg-card p-4',
              i.severity === 'positive' && 'border-emerald-500/30',
              i.severity === 'warn' && 'border-amber-500/30',
              i.severity === 'critical' && 'border-destructive/40'
            )}
          >
            <div
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-md',
                i.severity === 'positive' && 'bg-emerald-500/10 text-emerald-500',
                i.severity === 'warn' && 'bg-amber-500/10 text-amber-500',
                i.severity === 'critical' && 'bg-destructive/10 text-destructive',
                i.severity === 'info' && 'bg-primary/10 text-primary'
              )}
            >
              {i.severity === 'critical' ? (
                <AlertTriangle className="h-4 w-4" />
              ) : i.severity === 'warn' ? (
                <ArrowDownRight className="h-4 w-4" />
              ) : i.severity === 'positive' ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <Lightbulb className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{i.title}</h3>
                {i.delta != null && (
                  <Badge
                    variant={
                      i.delta >= 0 ? 'success' : 'destructive'
                    }
                  >
                    {fmtDelta(i.delta)}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{i.body}</p>
              {i.href && (
                <a
                  href={i.href}
                  className="mt-2 inline-block text-xs text-primary hover:underline"
                >
                  Ver detalhes →
                </a>
              )}
            </div>
          </article>
        ))}
      </div>

      <SectionCard
        title="Anomalias detectadas"
        description="z-score sobre janela móvel de 14 dias. Limiar |z| ≥ 2.5."
      >
        <ul className="space-y-2">
          {[
            ...anomaliasUsers.map((a) => ({ ...a, metric: 'Usuários ativos' })),
            ...anomaliasBuscas.map((a) => ({ ...a, metric: 'Buscas de linha' })),
          ]
            .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
            .slice(0, 12)
            .map((a, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md border p-2"
              >
                <div>
                  <div className="text-sm font-medium">
                    {a.metric} · {fmtDate(a.date)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Observado {fmtCompact(a.value)} · esperado ≈ {fmtCompact(a.expected)}
                  </div>
                </div>
                <Badge
                  variant={
                    a.severity === 'critical'
                      ? 'destructive'
                      : a.severity === 'warn'
                        ? 'warn'
                        : 'secondary'
                  }
                  className="gap-1"
                >
                  <Sparkles className="h-3 w-3" />
                  z = {a.z.toFixed(2)} · {fmtPct((a.value - a.expected) / Math.max(1, a.expected))}
                </Badge>
              </li>
            ))}
          {anomaliasUsers.length + anomaliasBuscas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma anomalia detectada no período. Ajuste os filtros ou amplie a janela.
            </p>
          )}
        </ul>
      </SectionCard>
    </div>
  );
}
