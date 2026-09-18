import { describe, expect, it } from "vitest";
import { me } from "@/lib/i18n/me";
import { moneyActionState } from "@/lib/money-action";

// BR-092 and F-27 AC2: when a money action may be attempted, and what it says when it
// may not. Every money button in the app asks this one function.
describe("BR-092: a money action needs an open shift", () => {
  it("is allowed with an open shift and a connection", () => {
    expect(moneyActionState({ hasOpenShift: true, isOffline: false })).toEqual({
      disabled: false,
    });
  });

  it("is refused with no open shift, and says so", () => {
    expect(moneyActionState({ hasOpenShift: false, isOffline: false })).toEqual(
      {
        disabled: true,
        reason: "Nema otvorene smjene. Recepcioner mora biti prijavljen.",
      },
    );
  });

  it("uses the exact doc 08 §5 wording", () => {
    expect(
      moneyActionState({ hasOpenShift: false, isOffline: false }).reason,
    ).toBe(me.errors.E_NO_OPEN_SHIFT);
  });
});

describe("F-27 AC2: offline disables saving", () => {
  it("is refused while offline even with an open shift", () => {
    const state = moneyActionState({ hasOpenShift: true, isOffline: true });
    expect(state.disabled).toBe(true);
    expect(state.reason).toBe(me.offline.banner);
  });

  it("reports the connection first when both are wrong", () => {
    // Nothing can be saved without a connection, so that is the useful message.
    expect(
      moneyActionState({ hasOpenShift: false, isOffline: true }).reason,
    ).toBe(me.offline.banner);
  });
});
