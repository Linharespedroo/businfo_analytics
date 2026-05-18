import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid place-items-center py-32 text-center">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Página não encontrada</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verifique a URL ou volte ao painel principal.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Ir ao painel
        </Link>
      </div>
    </div>
  );
}
