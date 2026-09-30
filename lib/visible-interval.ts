import { useEffect, useRef } from "react";

/** The part of `document` the interval needs, so tests can pass a stand-in. */
export type VisibilitySource = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

/**
 * D-85: call `callback` every `ms` while the page is visible, not at all while it is
 * hidden (another tab, a minimised window, a locked screen), and once at once when it
 * becomes visible again, so a screen that was away is never left showing old data.
 * Returns the function that stops it.
 */
export function startVisibleInterval(
  callback: () => void,
  ms: number,
  source: VisibilitySource,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const start = () => {
    stop();
    timer = setInterval(callback, ms);
  };
  const onChange = () => {
    if (source.visibilityState === "visible") {
      callback();
      start();
    } else {
      stop();
    }
  };

  if (source.visibilityState === "visible") start();
  source.addEventListener("visibilitychange", onChange);
  return () => {
    stop();
    source.removeEventListener("visibilitychange", onChange);
  };
}

/** `startVisibleInterval` for a component; the latest `callback` is always the one called. */
export function useVisibleInterval(callback: () => void, ms: number): void {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  useEffect(
    () => startVisibleInterval(() => latest.current(), ms, document),
    [ms],
  );
}
