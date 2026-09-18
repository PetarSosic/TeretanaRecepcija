import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-10 w-full rounded-lg border bg-card px-3 py-2 text-sm disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
