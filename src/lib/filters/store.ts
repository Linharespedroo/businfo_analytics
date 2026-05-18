'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DateRangePreset = '7d' | '14d' | '30d' | '90d' | 'custom';

export interface FiltersState {
  preset: DateRangePreset;
  startDate: string | null;
  endDate: string | null;
  cidades: string[];
  orgaos: string[];
  linhas: string[];

  setPreset: (p: DateRangePreset) => void;
  setRange: (start: string | null, end: string | null) => void;
  setCidades: (c: string[]) => void;
  setOrgaos: (o: string[]) => void;
  setLinhas: (l: string[]) => void;
  reset: () => void;
}

const initial = {
  preset: '30d' as DateRangePreset,
  startDate: null,
  endDate: null,
  cidades: [] as string[],
  orgaos: [] as string[],
  linhas: [] as string[],
};

export const useFilters = create<FiltersState>()(
  persist(
    (set) => ({
      ...initial,
      setPreset: (preset) => set({ preset }),
      setRange: (startDate, endDate) => set({ startDate, endDate, preset: 'custom' }),
      setCidades: (cidades) => set({ cidades }),
      setOrgaos: (orgaos) => set({ orgaos }),
      setLinhas: (linhas) => set({ linhas }),
      reset: () => set(initial),
    }),
    { name: 'businfo-analytics-filters' }
  )
);

export function presetDays(p: DateRangePreset): number {
  switch (p) {
    case '7d':
      return 7;
    case '14d':
      return 14;
    case '30d':
      return 30;
    case '90d':
      return 90;
    case 'custom':
      return 30;
  }
}
