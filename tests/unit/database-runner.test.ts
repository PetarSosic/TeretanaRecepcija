import { expect, it } from "vitest";
import { validateTap } from "../../scripts/validate-tap.mjs";

it("D-56 accepts a completed pgTAP plan", () => {
  expect(validateTap(["1..2", "ok 1 - first", "ok 2 - second"]).ok).toBe(true);
});
it.each([
  [],
  ["1..0"],
  ["1..2", "ok 1 - incomplete"],
  ["1..1", "not ok 1 - failed"],
  ["1..1", "ok 1", "Bail out!"],
  ["1..2", "ok 1", "ok 1"],
])(
  "D-56 fails closed on incomplete or failed database output (%j)",
  (...chunks) => {
    expect(validateTap(chunks).ok).toBe(false);
  },
);
