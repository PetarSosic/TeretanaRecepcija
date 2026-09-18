import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatDuration,
  formatMoney,
  parseMoneyInput,
} from "@/lib/format";

describe("BR-001/002 dates and durations", () => {
  it("formats date-only values without a trailing dot or timezone shift", () => {
    expect(formatDate("2027-02-28")).toBe("28.02.2027");
  });
  it("uses Podgorica's date across UTC midnight", () => {
    expect(formatDateTime("2026-01-01T23:30:00Z")).toBe("02.01.2026 00:30");
  });
  it("handles the daylight-saving jump", () => {
    expect(formatTime("2026-03-29T00:30:00Z")).toBe("01:30");
    expect(formatTime("2026-03-29T01:30:00Z")).toBe("03:30");
  });
  it("rejects invalid and ambiguous dates", () => {
    expect(() => formatDate("2026-02-30")).toThrow();
    expect(() => formatTime("2026-09-18T08:30:00")).toThrow();
  });
  it("shows whole elapsed minutes", () => {
    expect(formatDuration(3661)).toBe("1h 1min");
    expect(formatDuration(0)).toBe("0h 0min");
    expect(() => formatDuration(-1)).toThrow();
  });
});

describe("BR-003 exact decimal money", () => {
  it.each([
    ["1234.50", "1.234,50 €"],
    ["-3", "-3,00 €"],
    ["0", "0,00 €"],
    ["1.005", "1,01 €"],
    ["-1.005", "-1,01 €"],
    ["999.999", "1.000,00 €"],
  ])("formats %s", (input, expected) => {
    expect(formatMoney(input)).toBe(expected);
  });
  it.each([
    ["79,50", "79.50"],
    [" 79.5 ", "79.50"],
    ["0.005", "0.01"],
    ["-0.004", "0.00"],
    ["99999999.99", "99999999.99"],
  ])("parses %s without float rounding", (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });
  it.each(["", "1,2.3", "1e2", "NaN", "Infinity", "99999999.995"])(
    "rejects %s",
    (input) => {
      expect(() => parseMoneyInput(input)).toThrow();
    },
  );
});
