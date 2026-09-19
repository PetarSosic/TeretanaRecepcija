import { cn } from "@/lib/utils";

/**
 * Doc 06 §1: a placeholder for data that takes longer than about 300 ms. It carries no
 * text of its own — a screen reader is told the region is busy by the page that uses it —
 * and it never pretends to be a number, so nothing here can be mistaken for real data.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
    />
  );
}

/** The shape most screens load into: a heading, a row of cards, and a table. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="grid gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid gap-2">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
