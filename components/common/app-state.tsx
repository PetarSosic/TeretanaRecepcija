"use client";

import * as React from "react";
import { CircleAlert } from "lucide-react";
import { me } from "@/lib/i18n/me";

/**
 * What every screen needs to know before it offers a money action: whether a shift is
 * open (BR-092) and whether the browser can reach the server at all (F-27).
 */
type AppState = {
  hasOpenShift: boolean;
  isOffline: boolean;
  /** F-27 AC1: server actions report a network failure here; two in a row count. */
  reportNetworkFailure: () => void;
  reportNetworkSuccess: () => void;
};

const AppStateContext = React.createContext<AppState | null>(null);

export function useAppState(): AppState {
  const state = React.useContext(AppStateContext);
  if (!state) throw new Error("useAppState requires AppStateProvider");
  return state;
}

export function AppStateProvider({
  hasOpenShift,
  children,
}: {
  hasOpenShift: boolean;
  children: React.ReactNode;
}) {
  // navigator.onLine is only known in the browser; the first render assumes online so
  // the server and client markup agree.
  const [browserOffline, setBrowserOffline] = React.useState(false);
  const [failures, setFailures] = React.useState(0);

  React.useEffect(() => {
    const update = () => setBrowserOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // F-27 AC3: the banner clears within five seconds of the connection returning, which
  // the online event gives immediately; the failure counter is reset by the next
  // request that succeeds.
  const reportNetworkFailure = React.useCallback(
    () => setFailures((count) => count + 1),
    [],
  );
  const reportNetworkSuccess = React.useCallback(() => setFailures(0), []);

  const isOffline = browserOffline || failures >= 2;
  const value = React.useMemo(
    () => ({
      hasOpenShift,
      isOffline,
      reportNetworkFailure,
      reportNetworkSuccess,
    }),
    [hasOpenShift, isOffline, reportNetworkFailure, reportNetworkSuccess],
  );

  return (
    <AppStateContext.Provider value={value}>
      {isOffline ? <OfflineBanner /> : null}
      {children}
    </AppStateContext.Provider>
  );
}

/** F-27 AC1: a red banner across the top, with an icon as well as colour (D-47). */
function OfflineBanner() {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 bg-danger px-4 py-3 text-sm text-primary-foreground"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {me.offline.banner}
    </div>
  );
}
