import {
  KP_MARK_HEIGHT,
  KP_MARK_PATH,
  KP_MARK_VIEWBOX,
  KP_MARK_WIDTH,
} from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * D-71: the KP mark. It always sits next to the gym name, which carries the meaning,
 * so the mark itself is decorative. Size it by height; the width follows.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={KP_MARK_VIEWBOX}
      width={KP_MARK_WIDTH}
      height={KP_MARK_HEIGHT}
      aria-hidden="true"
      focusable="false"
      className={cn("w-auto shrink-0 text-brand", className)}
    >
      <path fill="currentColor" d={KP_MARK_PATH} />
    </svg>
  );
}
