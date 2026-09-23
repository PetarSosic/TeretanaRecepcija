"use client";

import { useState } from "react";
import { FieldError } from "@/components/common/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { savePlan } from "../catalog-actions";
import { ActionDialog } from "./action-dialog";

export type Plan = {
  id: string;
  name: string;
  kind: "gym" | "group" | "combo" | "personal" | "day_pass";
  duration_value: number | null;
  duration_unit: "day" | "month" | null;
  price: string | null;
  covers_gym: boolean;
  covers_group: boolean;
  covers_personal: boolean;
  gym_visit_limit: number | null;
  group_session_limit: number | null;
  requires_trainer: boolean;
  sort_order: number;
  is_active: boolean;
  gym_fixed_amount: string;
  trainer_share_pct: string | null;
};

const KIND_LABEL: Record<Plan["kind"], string> = {
  gym: me.settings.kindGym,
  group: me.settings.kindGroup,
  combo: me.settings.kindCombo,
  personal: me.settings.kindPersonal,
  day_pass: me.settings.kindDayPass,
};

function duration(plan: Plan) {
  if (plan.duration_value === null || plan.duration_unit === null) return "—";
  const unit =
    plan.duration_unit === "day"
      ? me.settings.durationUnitDay
      : me.settings.durationUnitMonth;
  return `${plan.duration_value} ${unit}`;
}

/** S-25. F-21 AC2: a plan is never deleted, only deactivated. */
export function PlansScreen({ plans }: { plans: Plan[] }) {
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {me.settings.plansTitle}
        </h1>
        <Button onClick={() => setCreating(true)}>{me.settings.addPlan}</Button>
      </div>
      {/* BR-004, spelled out on the screen as doc 06 requires. */}
      <p className="mb-4 text-sm text-muted-foreground">
        {me.settings.priceChangeNotice}
      </p>

      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.settings.planName}</Th>
              <Th>{me.settings.planKind}</Th>
              <Th>{me.settings.duration}</Th>
              <Th>{me.settings.price}</Th>
              <Th>{me.settings.limits}</Th>
              <Th>{me.settings.gymFixedAmount}</Th>
              <Th>{me.settings.trainerSharePct}</Th>
              <Th>{me.settings.active}</Th>
              <Th>
                <span className="sr-only">{me.users.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <Td className="font-medium">{plan.name}</Td>
                <Td>{KIND_LABEL[plan.kind]}</Td>
                <Td>{duration(plan)}</Td>
                <Td>{plan.price === null ? "—" : formatMoney(plan.price)}</Td>
                <Td>
                  {[
                    plan.gym_visit_limit
                      ? `${me.settings.gymVisitLimit}: ${plan.gym_visit_limit}`
                      : null,
                    plan.group_session_limit
                      ? `${me.settings.groupSessionLimit}: ${plan.group_session_limit}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </Td>
                <Td>{formatMoney(plan.gym_fixed_amount)}</Td>
                <Td>
                  {plan.trainer_share_pct === null
                    ? "—"
                    : `${Number(plan.trainer_share_pct)} %`}
                </Td>
                <Td>{plan.is_active ? me.users.yes : me.users.no}</Td>
                <Td className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(plan)}
                  >
                    {me.users.edit}
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrapper>

      <ActionDialog
        title={me.settings.addPlan}
        description={me.settings.priceChangeNotice}
        open={creating}
        onOpenChange={setCreating}
        action={savePlan}
      >
        {(state) => <PlanFields state={state} />}
      </ActionDialog>
      <ActionDialog
        title={me.settings.editPlan}
        description={me.settings.priceChangeNotice}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        action={savePlan}
      >
        {(state) =>
          editing ? <PlanFields state={state} plan={editing} /> : null
        }
      </ActionDialog>
    </>
  );
}

function PlanFields({
  state,
  plan,
}: {
  state: { fieldErrors?: Record<string, string> };
  plan?: Plan;
}) {
  const [kind, setKind] = useState<Plan["kind"]>(plan?.kind ?? "gym");

  return (
    <>
      <input type="hidden" name="id" value={plan?.id ?? ""} />
      <div className="grid gap-1.5">
        <Label htmlFor="plan-name">{me.settings.planName}</Label>
        <Input
          id="plan-name"
          name="name"
          defaultValue={plan?.name ?? ""}
          required
        />
        <FieldError id="plan-name-error">{state.fieldErrors?.name}</FieldError>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="plan-kind">{me.settings.planKind}</Label>
        {/* The kind is fixed after creation: sold memberships snapshot what it covers. */}
        <Select
          id="plan-kind"
          name={plan ? undefined : "kind"}
          value={kind}
          onChange={(event) => setKind(event.target.value as Plan["kind"])}
          disabled={Boolean(plan)}
        >
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        {plan ? <input type="hidden" name="kind" value={plan.kind} /> : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="plan-duration">{me.settings.duration}</Label>
          <Input
            id="plan-duration"
            name="durationValue"
            inputMode="numeric"
            defaultValue={plan?.duration_value ?? ""}
          />
          <FieldError id="plan-duration-error">
            {state.fieldErrors?.durationValue}
          </FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="plan-unit">&nbsp;</Label>
          {/* N-06: a day pass has no unit (BR-010), so "mjeseci" is only the default
              for other kinds; the key resets the choice when the kind changes. */}
          <Select
            key={kind === "day_pass" ? "none" : "unit"}
            id="plan-unit"
            name="durationUnit"
            defaultValue={
              plan
                ? (plan.duration_unit ?? "")
                : kind === "day_pass"
                  ? ""
                  : "month"
            }
          >
            <option value="">—</option>
            <option value="day">{me.settings.durationUnitDay}</option>
            <option value="month">{me.settings.durationUnitMonth}</option>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="plan-price">{me.settings.price}</Label>
        <Input
          id="plan-price"
          name="price"
          inputMode="decimal"
          defaultValue={plan?.price ?? ""}
        />
        <FieldError id="plan-price-error">
          {state.fieldErrors?.price}
        </FieldError>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{me.settings.covers}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="coversGym"
            defaultChecked={plan?.covers_gym}
            className="size-4"
          />
          {me.settings.coversGym}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="coversGroup"
            defaultChecked={plan?.covers_group}
            className="size-4"
          />
          {me.settings.coversGroup}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="coversPersonal"
            defaultChecked={plan?.covers_personal}
            className="size-4"
          />
          {me.settings.coversPersonal}
        </label>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="plan-gym-limit">{me.settings.gymVisitLimit}</Label>
          <Input
            id="plan-gym-limit"
            name="gymVisitLimit"
            inputMode="numeric"
            defaultValue={plan?.gym_visit_limit ?? ""}
          />
          {/* N-15: these three fields were refused without a message. */}
          <FieldError id="plan-gym-limit-error">
            {state.fieldErrors?.gymVisitLimit}
          </FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="plan-group-limit">
            {me.settings.groupSessionLimit}
          </Label>
          <Input
            id="plan-group-limit"
            name="groupSessionLimit"
            inputMode="numeric"
            defaultValue={plan?.group_session_limit ?? ""}
          />
          <FieldError id="plan-group-limit-error">
            {state.fieldErrors?.groupSessionLimit}
          </FieldError>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="plan-fixed">{me.settings.gymFixedAmount}</Label>
          <Input
            id="plan-fixed"
            name="gymFixedAmount"
            inputMode="decimal"
            defaultValue={plan?.gym_fixed_amount ?? "0"}
          />
          <FieldError id="plan-fixed-error">
            {state.fieldErrors?.gymFixedAmount}
          </FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="plan-share">{me.settings.trainerSharePct}</Label>
          <Input
            id="plan-share"
            name="trainerSharePct"
            inputMode="decimal"
            defaultValue={plan?.trainer_share_pct ?? ""}
          />
          <FieldError id="plan-share-error">
            {state.fieldErrors?.trainerSharePct}
          </FieldError>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="plan-sort">{me.settings.sortOrder}</Label>
        <Input
          id="plan-sort"
          name="sortOrder"
          inputMode="numeric"
          defaultValue={plan?.sort_order ?? 0}
        />
        <FieldError id="plan-sort-error">
          {state.fieldErrors?.sortOrder}
        </FieldError>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="requiresTrainer"
          defaultChecked={plan?.requires_trainer}
          className="size-4"
        />
        {me.settings.requiresTrainer}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={plan?.is_active ?? true}
          className="size-4"
        />
        {me.settings.active}
      </label>
    </>
  );
}
