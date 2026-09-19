"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { me } from "@/lib/i18n/me";

// Doc 06 §1: S-01 and S-01b get the same treatment as the rest of the application.
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`Auth screen failed: ${error.digest ?? "no digest"}`);
  }, [error]);

  return (
    <div className="grid gap-4 text-center">
      <h1 className="text-xl font-semibold">{me.errors.unexpected}</h1>
      <div>
        <Button onClick={reset}>{me.common.retry}</Button>
      </div>
    </div>
  );
}
