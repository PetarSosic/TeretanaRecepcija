import * as React from "react";
import { cn } from "@/lib/utils";

// Doc 08 §9: tables scroll inside their own container so pages never scroll sideways.
// `relative` matters: an absolutely positioned child (a visually hidden sr-only header)
// would otherwise escape the scroll container and widen the whole page.
export function TableWrapper({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-wrapper"
      className={cn("relative w-full overflow-x-auto", className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn("w-full caption-bottom border-collapse text-sm", className)}
      {...props}
    />
  );
}

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "border-b px-3 py-2 text-left font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("border-b px-3 py-2 align-middle", className)}
      {...props}
    />
  );
}
