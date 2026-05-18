'use client';

import { useQuery } from '@tanstack/react-query';
import { loadBundle } from './client';

export function useBundle() {
  return useQuery({
    queryKey: ['bundle'],
    queryFn: loadBundle,
    staleTime: 1000 * 60 * 60, // 1h — pipeline corre diário
    gcTime: 1000 * 60 * 60 * 4,
    refetchOnWindowFocus: false,
  });
}
