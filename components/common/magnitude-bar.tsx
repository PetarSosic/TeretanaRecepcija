import { cn } from "@/lib/utils";

/**
 * A one-hue bar whose length is `percent` of its row (US-17.1, US-20.1).
 *
 * N-25: doc 08 §9's policy allows no inline styles in production, so a server-rendered
 * `style="width: …"` is dropped by the browser and every bar was drawn at full width.
 * An SVG `width` attribute is not a style, so the policy leaves it alone.
 */
export function MagnitudeBar({
  percent,
  className,
}: {
  percent: number;
  /** The height and spacing, e.g. `mt-1 h-1.5`. */
  className?: string;
}) {
  const width = Math.min(Math.max(percent, 0), 100);
  return (
    <svg aria-hidden="true" className={cn("block w-full", className)}>
      <rect width={`${width}%`} height="100%" rx={3} fill="var(--chart-1)" />
    </svg>
  );
}
