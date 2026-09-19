"use client";

import { me } from "@/lib/i18n/me";

/**
 * Doc 06 §1: the last resort, for a failure in the root layout itself. It replaces the
 * whole document, so it carries its own html and body, and it uses no component of the
 * application — whatever broke may be one of them.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="sr-Latn-ME">
      <body
        style={{
          fontFamily: "Arial, Helvetica, sans-serif",
          background: "#f5f5f0",
          color: "#18372c",
          display: "grid",
          placeItems: "center",
          minHeight: "100svh",
          margin: 0,
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem" }}>{me.errors.unexpected}</h1>
          {error.digest ? (
            <p style={{ color: "#52655b", fontSize: "0.875rem" }}>
              {me.common.errorCode}: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1rem",
              background: "#244b3d",
              color: "#ffffff",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.625rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            {me.common.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
