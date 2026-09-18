import * as React from "react";
import { cn } from "@/lib/utils";

// D-47: every field has a label bound with htmlFor.
export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  );
}
