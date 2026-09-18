import { CircleAlert } from "lucide-react";

// Doc 06 §1: validation errors sit under the field; D-47 pairs them with an icon.
export function FieldError({
  id,
  children,
}: {
  id: string;
  children?: string;
}) {
  if (!children) return null;
  return (
    <p id={id} className="flex items-center gap-1.5 text-sm text-danger">
      <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}

export function FormError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger px-3 py-2 text-sm text-danger"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
