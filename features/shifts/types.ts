// The JSON of shift_report_json and shift_summary (migration 0017). Money arrives as
// JSON numbers from numeric(10,2); it is turned into decimal text before formatting.

export type ShiftTotals = {
  cash_income: number;
  card_income: number;
  till_expenses: number;
  expected_cash: number;
  counted_cash: number | null;
  /** null when the cash was not counted (BR-115). */
  difference: number | null;
};

/** D-54: all a manager receives. */
export type ShiftTotalsOnly = Pick<
  ShiftTotals,
  "cash_income" | "card_income" | "till_expenses" | "expected_cash"
>;

export type ShiftReport = {
  shift: {
    id: string;
    gym_id: string;
    gym_name: string;
    staff_id: string;
    staff_name: string;
    started_at: string;
    closed_at: string | null;
    close_type: "manual" | "takeover" | "auto" | null;
    closed_by_name: string | null;
    email_status: "not_sent" | "pending" | "sent" | "failed";
  };
  totals: ShiftTotals;
  counts: {
    payments: number;
    day_passes: number;
    sales: number;
    voided: number;
  };
  payments: {
    created_at: string;
    member: string | null;
    kind: "membership" | "day_pass" | "card_replacement";
    quantity: number;
    plan: string | null;
    method: "cash" | "card";
    amount: number;
    entered_by: string;
  }[];
  day_passes: { method: "cash" | "card"; quantity: number; total: number }[];
  card_replacements: { count: number; total: number };
  sales: {
    created_at: string;
    product: string;
    quantity: number;
    method: "cash" | "card";
    amount: number;
  }[];
  till_expenses: {
    created_at: string;
    category: string;
    description: string;
    amount: number;
    entered_by: string;
  }[];
  voided: {
    created_at: string;
    record: "payment" | "sale" | "expense";
    description: string;
    amount: number;
    reason: string;
    voided_by: string | null;
  }[];
  open_visits: number;
};

/** BR-003: a numeric from JSON as the decimal text formatMoney expects. */
export function money(value: number | string | null | undefined): string {
  return Number(value ?? 0).toFixed(2);
}
