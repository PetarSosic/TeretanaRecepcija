"use client";

import { useState } from "react";
import { FieldError } from "@/components/common/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { ActionDialog } from "@/features/settings/components/action-dialog";
import type { Category } from "@/features/settings/components/categories-section";
import type { ActionState } from "@/lib/action-state";
import { formatDate, formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { saveRecurringExpense } from "../actions";

/** `fin_recurring_expenses` (D-93). Money is decimal text (BR-003). */
export type RecurringItem = {
  id: string;
  description: string;
  category_id: string;
  category_name: string;
  is_salary: boolean;
  amount: string;
  method: "cash" | "card" | null;
  /** yyyy-mm-dd, always the 1st of a month. */
  starts_on: string;
  is_active: boolean;
  last_posted: string | null;
  /** Something was posted, so the first month is fixed (BR-136). */
  has_postings: boolean;
};

export type RecurringOverview = {
  items: RecurringItem[];
  salary_total: string;
  other_total: string;
  total: string;
};

const METHOD_LABELS: Record<string, string> = {
  cash: me.finance.methodCash,
  card: me.finance.methodCard,
  none: me.finance.methodNone,
};

/** "2026-10-01" → "oktobar 2026". */
function monthLabel(date: string): string {
  const [year, month] = date.split("-");
  return `${me.finance.monthNames[Number(month) - 1]} ${year}`;
}

/** "2026-12" → "2027-01". */
function nextMonth(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return value === 12
    ? `${year + 1}-01`
    : `${year}-${String(value + 1).padStart(2, "0")}`;
}

/**
 * S-30 (D-93): the fixed expenses and salaries the owner described once and the app posts
 * as expenses on the 1st of every month (BR-136), with what they cost a month.
 */
export function RecurringScreen({
  overview,
  categories,
  thisMonth,
}: {
  overview: RecurringOverview;
  categories: Category[];
  /** yyyy-mm: the gym's current month (BR-001), the earliest a new one may start. */
  thisMonth: string;
}) {
  const [editing, setEditing] = useState<RecurringItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const active = overview.items.filter((item) => item.is_active);
  const inactive = overview.items.filter((item) => !item.is_active);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{me.finance.recurringTitle}</h2>
        <Button onClick={() => setCreating(true)}>
          {me.finance.recurringAdd}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {me.finance.recurringInfo}
      </p>

      <div className="grid gap-1">
        <p className="text-lg font-semibold tabular-nums">
          {me.finance.recurringMonthly.replace(
            "{amount}",
            formatMoney(overview.total),
          )}
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {me.finance.recurringSplit
            .replace("{salary}", formatMoney(overview.salary_total))
            .replace("{other}", formatMoney(overview.other_total))}
        </p>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {me.finance.recurringEmpty}
        </p>
      ) : (
        <RecurringTable items={active} onEdit={setEditing} />
      )}

      {inactive.length > 0 ? (
        <div className="grid gap-3">
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={showInactive}
              onClick={() => setShowInactive((shown) => !shown)}
            >
              {(showInactive
                ? me.finance.recurringHideInactive
                : me.finance.recurringShowInactive
              ).replace("{count}", String(inactive.length))}
            </Button>
          </div>
          {showInactive ? (
            <RecurringTable
              items={inactive}
              onEdit={setEditing}
              label={me.finance.recurringInactiveTitle}
              muted
            />
          ) : null}
        </div>
      ) : null}

      <ActionDialog
        title={editing ? me.finance.recurringEdit : me.finance.recurringAdd}
        description={me.finance.recurringInfo}
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        action={saveRecurringExpense}
      >
        {(state) => (
          <RecurringFields
            state={state}
            item={editing}
            categories={categories}
            thisMonth={thisMonth}
          />
        )}
      </ActionDialog>
    </div>
  );
}

function RecurringTable({
  items,
  onEdit,
  label,
  muted = false,
}: {
  items: RecurringItem[];
  onEdit: (item: RecurringItem) => void;
  label?: string;
  muted?: boolean;
}) {
  return (
    <TableWrapper>
      <Table aria-label={label}>
        <thead>
          <tr>
            <Th>{me.finance.recurringName}</Th>
            <Th>{me.finance.category}</Th>
            <Th className="text-right">{me.finance.amount}</Th>
            <Th>{me.finance.method}</Th>
            <Th>{me.finance.recurringStartsOn}</Th>
            <Th>{me.finance.recurringLastPosted}</Th>
            <Th>
              <span className="sr-only">{me.users.actions}</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className={muted ? "text-muted-foreground" : undefined}
            >
              <Td className="font-medium">{item.description}</Td>
              <Td>{item.category_name}</Td>
              <Td className="text-right tabular-nums whitespace-nowrap">
                {formatMoney(item.amount)}
              </Td>
              <Td>{METHOD_LABELS[item.method ?? "none"]}</Td>
              <Td className="whitespace-nowrap">
                {monthLabel(item.starts_on)}
              </Td>
              <Td className="whitespace-nowrap">
                {item.last_posted ? formatDate(item.last_posted) : "—"}
              </Td>
              <Td className="text-right">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`${me.users.edit} ${item.description}`}
                  onClick={() => onEdit(item)}
                >
                  {me.users.edit}
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrapper>
  );
}

/** BR-136: the fields of the fixed-expense form. */
function RecurringFields({
  state,
  item,
  categories,
  thisMonth,
}: {
  state: ActionState;
  item: RecurringItem | null;
  categories: Category[];
  thisMonth: string;
}) {
  // D-92: goods are never a fixed expense; they come in through Nova roba.
  const options = categories.filter(
    (category) => category.is_active && !category.is_system,
  );
  const startLocked = item?.has_postings ?? false;
  const startsOn = item ? item.starts_on.slice(0, 7) : nextMonth(thisMonth);

  return (
    <>
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <div className="grid gap-1.5">
        <Label htmlFor="recurring-description">
          {me.finance.recurringName}
        </Label>
        <Input
          id="recurring-description"
          name="description"
          defaultValue={item?.description ?? ""}
          required
        />
        <FieldError id="recurring-description-error">
          {state.fieldErrors?.description}
        </FieldError>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="recurring-category">{me.finance.category}</Label>
        <Select
          id="recurring-category"
          name="categoryId"
          defaultValue={item?.category_id ?? ""}
          required
        >
          <option value="">—</option>
          {options.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <FieldError id="recurring-category-error">
          {state.fieldErrors?.categoryId}
        </FieldError>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="recurring-amount">{me.finance.amount} (€)</Label>
          <Input
            id="recurring-amount"
            name="amount"
            inputMode="decimal"
            defaultValue={item ? item.amount.replace(".", ",") : ""}
            required
          />
          <FieldError id="recurring-amount-error">
            {state.fieldErrors?.amount}
          </FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="recurring-method">{me.finance.method}</Label>
          <Select
            id="recurring-method"
            name="method"
            defaultValue={item?.method ?? "none"}
          >
            <option value="none">{me.finance.methodNone}</option>
            <option value="card">{me.finance.methodCard}</option>
            <option value="cash">{me.finance.methodCash}</option>
          </Select>
          <FieldError id="recurring-method-error">
            {state.fieldErrors?.method}
          </FieldError>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="recurring-starts">{me.finance.recurringStartsOn}</Label>
        <Input
          id="recurring-starts"
          name="startsOn"
          type="month"
          min={startLocked ? undefined : thisMonth}
          defaultValue={startsOn}
          disabled={startLocked}
          required
          className="w-48"
        />
        {/* A disabled input sends nothing, so the fixed month goes with the form. */}
        {startLocked ? (
          <>
            <input type="hidden" name="startsOn" value={startsOn} />
            <p className="text-xs text-muted-foreground">
              {me.finance.recurringStartLocked}
            </p>
          </>
        ) : null}
        <FieldError id="recurring-starts-error">
          {state.fieldErrors?.startsOn}
        </FieldError>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={item?.is_active ?? true}
          className="size-4"
        />
        {me.settings.active}
      </label>
    </>
  );
}
