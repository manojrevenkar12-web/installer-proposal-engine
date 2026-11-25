import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-[var(--radius-mark)] bg-sunk ${className}`} />;
}

export function ErrorState({ title, error, onRetry }: { title: string; error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div role="alert" className="rounded-[var(--radius-panel)] border border-alarm/40 bg-alarm-tint px-5 py-4">
      <p className="font-semibold text-alarm">{title}</p>
      <p className="mt-1 text-sm text-ink-2">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 rounded-[var(--radius-chip)] border border-alarm/50 px-3 py-1 text-sm font-medium text-alarm hover:bg-surface">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-dashed border-line px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-ink-2">{children}</div>}
    </div>
  );
}

/** Renders a query's three non-happy states the same way everywhere. */
export function QueryView<T>({ query, title, skeleton, isEmpty, empty, children }: {
  query: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  title: string;
  skeleton: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <div aria-busy="true" aria-label={`Loading ${title}`}>{skeleton}</div>;
  if (query.isError) return <ErrorState title={`Couldn't load ${title}`} error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data as T;
  if (isEmpty?.(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}
