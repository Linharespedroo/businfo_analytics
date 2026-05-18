'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bus,
  Compass,
  Heart,
  LayoutDashboard,
  MapPin,
  Menu,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';
import { GlobalFilters } from './global-filters';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/', label: 'Visão Executiva', icon: LayoutDashboard },
  { href: '/linhas', label: 'Linhas', icon: Bus },
  { href: '/favoritos', label: 'Favoritos', icon: Heart },
  { href: '/paradas', label: 'Paradas', icon: MapPin },
  { href: '/geo', label: 'Geoanálise', icon: Compass },
  { href: '/localizacao', label: 'Localização', icon: Search },
  { href: '/usuarios', label: 'Usuários', icon: Users },
  { href: '/insights', label: 'Insights', icon: Sparkles },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transform border-r bg-card/60 backdrop-blur transition-transform md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground shadow">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">BusInfo</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              analytics
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t p-3 text-[11px] text-muted-foreground">
          <p>
            Dados: <span className="font-mono">GA4 · BigQuery · Neon</span>
          </p>
          <p className="mt-1">Atualização diária via GitHub Actions</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <Button
            size="icon"
            variant="ghost"
            className="md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Abrir navegação"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <GlobalFilters />
          <div className="flex-1" />
          <ThemeToggle />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
