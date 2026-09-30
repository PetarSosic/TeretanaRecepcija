import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startVisibleInterval,
  type VisibilitySource,
} from "@/lib/visible-interval";

/** A stand-in for `document` whose visibility the test switches. */
class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  show(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

const MINUTE = 60_000;

describe("startVisibleInterval (D-85)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls every interval while the page is visible", () => {
    const page = new FakeDocument();
    const callback = vi.fn();
    startVisibleInterval(callback, 5 * MINUTE, page as VisibilitySource);

    vi.advanceTimersByTime(5 * MINUTE - 1);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10 * MINUTE);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("stays silent while hidden and calls at once on return", () => {
    const page = new FakeDocument();
    const callback = vi.fn();
    startVisibleInterval(callback, 5 * MINUTE, page as VisibilitySource);

    page.show("hidden");
    vi.advanceTimersByTime(60 * MINUTE);
    expect(callback).not.toHaveBeenCalled();

    page.show("visible");
    expect(callback).toHaveBeenCalledTimes(1);
    // The interval starts again from the return, not from the old schedule.
    vi.advanceTimersByTime(5 * MINUTE - 1);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("does not start while the page opens hidden", () => {
    const page = new FakeDocument();
    page.visibilityState = "hidden";
    const callback = vi.fn();
    startVisibleInterval(callback, 5 * MINUTE, page as VisibilitySource);

    vi.advanceTimersByTime(30 * MINUTE);
    expect(callback).not.toHaveBeenCalled();
  });

  it("stops for good once stopped", () => {
    const page = new FakeDocument();
    const callback = vi.fn();
    const stop = startVisibleInterval(
      callback,
      5 * MINUTE,
      page as VisibilitySource,
    );

    stop();
    vi.advanceTimersByTime(30 * MINUTE);
    page.show("hidden");
    page.show("visible");
    expect(callback).not.toHaveBeenCalled();
  });
});
