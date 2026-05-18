'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, downloadBlob, toCsv } from '@/lib/utils';

interface SectionCardProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  exportCsv?: () => readonly Record<string, unknown>[] | unknown[];
  exportName?: string;
  className?: string;
  children: React.ReactNode;
}

export function SectionCard({
  title,
  description,
  actions,
  exportCsv,
  exportName = 'export.csv',
  className,
  children,
}: SectionCardProps) {
  return (
    <Card className={cn('animate-fade-in', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-foreground text-sm font-semibold">
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="flex items-center gap-1.5">
          {actions}
          {exportCsv && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => {
                const rows = exportCsv() as Record<string, unknown>[];
                downloadBlob(exportName, toCsv(rows), 'text/csv;charset=utf-8');
              }}
            >
              <Download className="h-3 w-3" /> CSV
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
