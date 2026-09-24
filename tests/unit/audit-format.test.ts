import { describe, expect, it } from "vitest";
import {
  auditChanges,
  auditReferences,
  auditSubject,
  type AuditLookups,
  type AuditRow,
} from "@/features/finance/audit-format";

// N-21 (FIN-14, S-21): the audit log speaks the screens' language — field names, values
// and names instead of database columns and ids.
const lookups: AuditLookups = {
  staff: new Map([["s1", "Ana Anić"]]),
  members: new Map([["m1", "#12 Marko Marković"]]),
  plans: new Map([["p1", "Mjesečna"]]),
  trainers: new Map([["t1", "Tamara"]]),
  categories: new Map([["c1", "Kirija"]]),
  products: new Map([["x1", "Voda"]]),
};

function row(
  table: string,
  action: AuditRow["action"],
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): AuditRow {
  return {
    id: 1,
    table_name: table,
    row_id: "r1",
    action,
    old_data: oldData,
    new_data: newData,
    changed_by: "s1",
    changed_at: "2026-09-24T08:00:00Z",
  };
}

const lines = (entry: AuditRow) =>
  auditChanges(entry, lookups).map((c) =>
    entry.action === "insert"
      ? `${c.label}: ${c.after}`
      : `${c.label}: ${c.before} → ${c.after}`,
  );

describe("auditChanges (N-21)", () => {
  it("names a payment's fields, translates the method and hides keys and bookkeeping", () => {
    const payment = row("payments", "insert", null, {
      id: "r1",
      gym_id: "g1",
      kind: "membership",
      membership_id: "ms1",
      member_id: "m1",
      plan_id: "p1",
      quantity: 1,
      amount: 79,
      method: "cash",
      paid_on: "2026-09-24",
      note: null,
      is_backdated: false,
      created_by: "s1",
      shift_id: "sh1",
      created_at: "2026-09-24T08:00:00Z",
      voided_at: null,
      voided_by: null,
      void_reason: null,
    });
    expect(lines(payment)).toEqual([
      "Vrsta: Članarina",
      "Član: #12 Marko Marković",
      "Plan: Mjesečna",
      "Količina: 1",
      "Iznos: 79,00 €",
      "Način plaćanja: Gotovina",
      "Datum uplate: 24.09.2026",
      "Naknadni unos: Ne",
    ]);
    expect(auditSubject(payment, lookups)).toBe(
      "Mjesečna – #12 Marko Marković",
    );
  });

  it("shows an edit as old → new, and a void as its reason alone", () => {
    const edit = row(
      "members",
      "update",
      {
        member_number: 12,
        first_name: "Marko",
        last_name: "Marković",
        date_of_birth: "1990-01-01",
        updated_at: "a",
      },
      {
        member_number: 12,
        first_name: "Marko",
        last_name: "Marković",
        date_of_birth: "1995-03-15",
        updated_at: "b",
      },
    );
    expect(lines(edit)).toEqual(["Datum rođenja: 01.01.1990 → 15.03.1995"]);
    expect(auditSubject(edit, lookups)).toBe("#12 Marko Marković");

    const voided = row(
      "expenses",
      "void",
      {
        category_id: "c1",
        description: "septembar",
        amount: 300,
        voided_at: null,
        voided_by: null,
        void_reason: null,
      },
      {
        category_id: "c1",
        description: "septembar",
        amount: 300,
        voided_at: "2026-09-24T09:00:00Z",
        voided_by: "s1",
        void_reason: "Dupli unos",
      },
    );
    expect(lines(voided)).toEqual(["Razlog poništavanja: — → Dupli unos"]);
    expect(auditSubject(voided, lookups)).toBe("Kirija: septembar");
  });

  it("reads plan kinds, percentages, units, times, lists and the logo", () => {
    expect(
      lines(
        row("plans", "insert", null, {
          name: "G+T",
          kind: "combo",
          duration_value: 1,
          duration_unit: "month",
          price: "99.00",
        }),
      ),
    ).toEqual([
      "Naziv: G+T",
      "Vrsta: Grupni + teretana",
      "Trajanje: 1",
      "Jedinica trajanja: mjeseci",
      "Cijena: 99,00 €",
    ]);
    expect(
      lines(
        row(
          "plan_finance",
          "update",
          { plan_id: "p1", trainer_share_pct: "70.00" },
          { plan_id: "p1", trainer_share_pct: "75.50" },
        ),
      ),
    ).toEqual(["Udio trenera: 70 % → 75,5 %"]);
    expect(
      lines(
        row(
          "gym_settings",
          "update",
          {
            gym_id: "g1",
            auto_close_time: "23:00:00",
            shift_report_emails: ["a@x.me"],
            logo_path: null,
          },
          {
            gym_id: "g1",
            auto_close_time: "22:30:00",
            shift_report_emails: ["a@x.me", "b@x.me"],
            logo_path: "g1/logo.png",
          },
        ),
      ),
    ).toEqual([
      "Automatsko zaključivanje: 23:00 → 22:30",
      "Primaoci izvještaja smjene: a@x.me → a@x.me, b@x.me",
      "Logo: — → postavljen",
    ]);
  });

  it("says (nepoznato) for an id it cannot name, and names stock and day passes", () => {
    const sale = row("stock_movements", "insert", null, {
      product_id: "x9",
      type: "out",
      quantity: 2,
      unit_price: 1.5,
      method: "card",
    });
    expect(lines(sale)).toContain("Proizvod: (nepoznato)");
    expect(lines(sale)).toContain("Promet: Prodaja");
    expect(auditSubject(sale, lookups)).toBe("Prodaja: (nepoznato) × 2");
    expect(
      auditSubject(
        row("payments", "insert", null, { kind: "day_pass", quantity: 3 }),
        lookups,
      ),
    ).toBe("Dnevna karta × 3");
  });

  it("collects every referenced id once", () => {
    const ids = auditReferences([
      row(
        "payments",
        "update",
        { member_id: "m1", plan_id: "p1" },
        { member_id: "m1", plan_id: "p2" },
      ),
      row("expenses", "insert", null, { category_id: "c1", trainer_id: "t1" }),
    ]);
    expect([...ids.members]).toEqual(["m1"]);
    expect([...ids.plans].sort()).toEqual(["p1", "p2"]);
    expect([...ids.categories]).toEqual(["c1"]);
    expect([...ids.trainers]).toEqual(["t1"]);
  });
});
