'use client';

import * as React from 'react';
import { CalendarRange, Filter, X } from 'lucide-react';
import { useBundle } from '@/lib/data/use-bundle';
import { useFilters, type DateRangePreset } from '@/lib/filters/store';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '14d', label: '14d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

export function GlobalFilters() {
  const { data } = useBundle();
  const f = useFilters();
  const totalChips =
    f.cidades.length + f.orgaos.length + f.linhas.length;

  return (
    <div className="flex items-center gap-2">
      <div className="hidden sm:flex items-center gap-1 rounded-md border bg-card p-0.5 text-xs">
        <CalendarRange className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => f.setPreset(p.value)}
            className={cn(
              'rounded px-2 py-1 transition-colors',
              f.preset === p.value
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {totalChips > 0 && (
              <Badge variant="default" className="ml-1">
                {totalChips}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-3">
            <FilterMultiSelect
              label="Cidades"
              options={data?.meta.cidades ?? []}
              value={f.cidades}
              onChange={f.setCidades}
            />
            <FilterMultiSelect
              label="Órgãos"
              options={data?.meta.orgaos ?? []}
              value={f.orgaos}
              onChange={f.setOrgaos}
            />
            <FilterMultiSelect
              label="Linhas"
              options={(data?.topLinhas ?? []).slice(0, 60).map((l) => l.linha)}
              value={f.linhas}
              onChange={f.setLinhas}
            />
            <div className="flex justify-between pt-1">
              <Button size="sm" variant="ghost" onClick={f.reset}>
                Limpar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <ActiveChips />
    </div>
  );
}

function ActiveChips() {
  const f = useFilters();
  const chips: { label: string; on: () => void }[] = [
    ...f.cidades.map((c) => ({
      label: `Cidade: ${c}`,
      on: () => f.setCidades(f.cidades.filter((x) => x !== c)),
    })),
    ...f.orgaos.map((o) => ({
      label: `Órgão: ${o}`,
      on: () => f.setOrgaos(f.orgaos.filter((x) => x !== o)),
    })),
    ...f.linhas.map((l) => ({
      label: `Linha: ${l}`,
      on: () => f.setLinhas(f.linhas.filter((x) => x !== l)),
    })),
  ];

  if (!chips.length) return null;

  return (
    <div className="hidden md:flex items-center gap-1 max-w-[40vw] overflow-x-auto">
      {chips.slice(0, 4).map((c, i) => (
        <button
          key={i}
          onClick={c.on}
          className="flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs hover:bg-accent"
        >
          {c.label}
          <X className="h-3 w-3" />
        </button>
      ))}
      {chips.length > 4 && (
        <span className="text-xs text-muted-foreground">+{chips.length - 4}</span>
      )}
    </div>
  );
}

function FilterMultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [q, setQ] = React.useState('');
  const filtered = React.useMemo(
    () =>
      options
        .filter((o) => o && o.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 50),
    [options, q]
  );
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        {value.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            limpar
          </button>
        )}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Buscar ${label.toLowerCase()}...`}
        className="mb-1 w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <p className="text-[11px] text-muted-foreground">Sem resultados.</p>
        )}
        {filtered.map((o) => {
          const checked = value.includes(o);
          return (
            <label
              key={o}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-0.5 text-xs hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(checked ? value.filter((x) => x !== o) : [...value, o])
                }
              />
              <span className="truncate">{o}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
