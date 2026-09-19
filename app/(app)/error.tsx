"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { me } from "@/lib/i18n/me";

/**
 * Doc 06 §1: an unexpected error shows one sentence and offers another try. Doc 08 §9:
 * it is logged with its digest — the identifier that matches the server log — and never
 * with the message, which could carry a member's data.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`Screen failed: ${error.digest ?? "no digest"}`);
  }, [error]);

  return (
    <div className="mx-auto grid max-w-md gap-4 py-12 text-center">
      <h1 className="text-xl font-semibold">{me.errors.unexpected}</h1>
      {error.digest ? (
        <p className="text-sm text-muted-foreground">
          {me.common.errorCode}: {error.digest}
        </p>
      ) : null}
      <div>
        <Button onClick={reset}>{me.common.retry}</Button>
      </div>
    </div>
  );
}
