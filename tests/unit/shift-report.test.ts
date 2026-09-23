import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShiftReport } from "@/features/shifts/types";

// The report modules are server-only; under Vitest they are plain modules.
vi.mock("server-only", () => ({}));

const { renderShiftReport, closeTypeLabel } =
  await import("@/lib/pdf/shift-report");
const { reportEmail, reportFileName } = await import("@/lib/shift-report");
const { sendEmail } = await import("@/lib/email/send");

/** E15, with a receptionist and a member whose names carry every Montenegrin letter. */
const report: ShiftReport = {
  shift: {
    id: "d0000000-0000-4000-8000-000000000001",
    gym_id: "b0000000-0000-4000-8000-000000000001",
    gym_name: "KP Fitness",
    staff_id: "c0000000-0000-4000-8000-000000000001",
    staff_name: "Đurđa Ćirić",
    started_at: "2026-09-18T06:00:00+00:00",
    closed_at: "2026-09-18T14:30:00+00:00",
    close_type: "manual",
    closed_by_name: "Đurđa Ćirić",
    email_status: "not_sent",
  },
  totals: {
    cash_income: 241.5,
    card_income: 51.5,
    till_expenses: 13.5,
    expected_cash: 228,
    counted_cash: 225,
    difference: -3,
  },
  counts: { payments: 1, day_passes: 20, sales: 1, voided: 1 },
  payments: [
    {
      created_at: "2026-09-18T07:15:00+00:00",
      member: "#12 Željko Šćepanović",
      kind: "card_replacement",
      quantity: 1,
      plan: null,
      method: "cash",
      amount: 37,
      entered_by: "Đurđa Ćirić",
    },
  ],
  day_passes: [{ method: "cash", quantity: 20, total: 200 }],
  card_replacements: { count: 1, total: 37 },
  sales: [
    {
      created_at: "2026-09-18T08:00:00+00:00",
      product: "Voda",
      quantity: 3,
      method: "cash",
      amount: 4.5,
    },
  ],
  till_expenses: [
    {
      created_at: "2026-09-18T09:00:00+00:00",
      category: "Potrošni materijal",
      description: "Sredstvo za čišćenje",
      amount: 13.5,
      entered_by: "Đurđa Ćirić",
    },
  ],
  voided: [
    {
      created_at: "2026-09-18T10:00:00+00:00",
      record: "payment",
      description: "Dnevna karta",
      amount: 10,
      reason: "Pogrešno uneseno",
      voided_by: "Đurđa Ćirić",
    },
  ],
  open_visits: 1,
};

/** Every Unicode code point the embedded fonts map glyphs to (their ToUnicode CMaps). */
function mappedCodePoints(pdf: Buffer): Set<number> {
  const text = pdf.toString("latin1");
  const points = new Set<number>();
  const stream = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (let match = stream.exec(text); match; match = stream.exec(text)) {
    let body: string;
    try {
      body = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      continue;
    }
    if (!body.includes("beginbfchar") && !body.includes("beginbfrange"))
      continue;
    for (const hex of body.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>/g))
      points.add(Number.parseInt(hex[2], 16));
    for (const range of body.matchAll(
      /<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>/g,
    )) {
      const [from, to, start] = [range[1], range[2], range[3]].map((value) =>
        Number.parseInt(value, 16),
      );
      for (let index = 0; index <= to - from; index++)
        points.add(start + index);
    }
  }
  return points;
}

describe("BR-117: the shift report PDF", () => {
  it("renders, with č ć š ž đ mapped to real glyphs of the embedded font", async () => {
    const pdf = await renderShiftReport(
      report,
      new Date("2026-09-18T14:31:00Z"),
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("NotoSans");
    const points = mappedCodePoints(pdf);
    // č ć š ž đ, and their capitals used in the names above.
    for (const letter of ["č", "ć", "š", "ž", "đ", "Đ", "Ć", "Ž", "Š"])
      expect(points, `glyph for ${letter}`).toContain(letter.codePointAt(0));
  }, 60_000);

  it("names how the shift ended", () => {
    // D-64: the name of whoever closed it, the owner from S-19 included.
    expect(closeTypeLabel(report.shift)).toBe("Zaključio/la Đurđa Ćirić");
    expect(
      closeTypeLabel({ ...report.shift, closed_by_name: "Matija Vojinović" }),
    ).toBe("Zaključio/la Matija Vojinović");
    expect(closeTypeLabel({ ...report.shift, closed_by_name: null })).toBe(
      "Zaključio/la recepcioner",
    );
    expect(
      closeTypeLabel({
        ...report.shift,
        close_type: "takeover",
        closed_by_name: "Ana",
      }),
    ).toBe("Preuzeo/la Ana");
    expect(closeTypeLabel({ ...report.shift, close_type: "auto" })).toBe(
      "Automatski",
    );
  });
});

describe("BR-117: the report email", () => {
  it("has the subject and body of doc 08 §7", () => {
    const email = reportEmail(report);
    expect(email.subject).toBe(
      "Izvještaj smjene – Đurđa Ćirić – 18.09.2026 08:00–16:30",
    );
    expect(email.text).toBe(
      "U prilogu je izvještaj smjene Đurđa Ćirić (18.09.2026 08:00–16:30). Očekivana gotovina: 228,00 €. Prebrojano: 225,00 €.",
    );
    expect(
      reportEmail({
        ...report,
        totals: { ...report.totals, counted_cash: null },
      }).text,
    ).toContain("Prebrojano: nije prebrojano.");
  });

  it("attaches smjena-<yyyy-mm-dd>-<ime>.pdf", () => {
    expect(reportFileName(report)).toBe("smjena-2026-09-18-durda-ciric.pdf");
  });
});

describe("BR-161: sending", () => {
  const saved = process.env.EMAIL_FROM;
  afterEach(() => {
    process.env.EMAIL_FROM = saved;
  });

  it("skips every email while EMAIL_FROM is not set", async () => {
    delete process.env.EMAIL_FROM;
    await expect(
      sendEmail({ to: ["a@example.invalid"], subject: "x", text: "y" }),
    ).resolves.toBe("skipped");
  });
});
