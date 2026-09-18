"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Pencil, TriangleAlert } from "lucide-react";
import { FieldError } from "@/components/common/form-message";
import {
  MethodButtons,
  type PaymentMethod,
} from "@/components/common/method-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  formatDate,
  formatMoney,
  parseDateInput,
  parseMoneyInput,
} from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { previewMembership, type MembershipPreview } from "../actions";
import type { SaleCatalog, SalePlan } from "../catalog";

export type TrainerDefaults = Partial<Record<"group" | "personal", string>>;

/** BR-023: the program kind whose trainers a plan of this kind may take. */
function trainerKind(kind: SalePlan["kind"]): "group" | "personal" {
  return kind === "personal" ? "personal" : "group";
}

function moneyOrNull(value: string): string | null {
  try {
    return /^\d{1,8}([.,]\d{1,2})?$/.test(value.trim())
      ? parseMoneyInput(value)
      : null;
  } catch {
    return null;
  }
}

/**
 * The S-08 fields, in the order doc 06 gives them; S-05 embeds the same fields for the
 * first membership. The start date and last valid day come from the database
 * (BR-051, BR-052) through previewMembership before anything is saved (US-08.1 AC2).
 */
export function MembershipFields({
  catalog,
  memberId,
  defaultPlanId,
  trainerDefaults = {},
  fieldErrors = {},
  idPrefix,
}: {
  catalog: SaleCatalog;
  memberId: string | null;
  defaultPlanId?: string;
  trainerDefaults?: TrainerDefaults;
  fieldErrors?: Record<string, string>;
  idPrefix: string;
}) {
  const initialPlan = catalog.plans.find((plan) => plan.id === defaultPlanId);
  const [planId, setPlanId] = useState(initialPlan?.id ?? "");
  const [trainerId, setTrainerId] = useState(
    initialPlan ? (trainerDefaults[trainerKind(initialPlan.kind)] ?? "") : "",
  );
  const [sessions, setSessions] = useState("");
  const [amount, setAmount] = useState("");
  const [editingAmount, setEditingAmount] = useState(false);
  const [startText, setStartText] = useState("");
  const [editingStart, setEditingStart] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [preview, setPreview] = useState<MembershipPreview | null>(null);
  const [loading, startLoading] = useTransition();
  const request = useRef(0);

  const plan = catalog.plans.find((candidate) => candidate.id === planId);
  const isPersonal = plan?.kind === "personal";
  const trainers = plan
    ? catalog.trainers.filter((trainer) => trainer[trainerKind(plan.kind)])
    : [];
  const override = editingStart ? parseDateInput(startText) : null;

  // US-08.1 AC2: recompute whenever the plan or the owner's start date changes. Only the
  // newest answer is kept, so a slow reply never overwrites a later choice.
  useEffect(() => {
    if (!planId) return;
    const current = ++request.current;
    startLoading(async () => {
      const result = await previewMembership({
        memberId,
        planId,
        startOverride: override,
      });
      if (current === request.current) setPreview(result);
    });
  }, [memberId, planId, override]);

  function choosePlan(id: string) {
    const next = catalog.plans.find((candidate) => candidate.id === id);
    setPlanId(id);
    setPreview(null);
    setEditingAmount(false);
    setAmount("");
    // BR-058: suggest the trainer of the member's latest membership of the same kind,
    // but only if they may still be chosen (BR-023, BR-025).
    const suggested = next
      ? trainerDefaults[trainerKind(next.kind)]
      : undefined;
    setTrainerId(
      suggested &&
        next &&
        catalog.trainers.some(
          (trainer) =>
            trainer.id === suggested && trainer[trainerKind(next.kind)],
        )
        ? suggested
        : "",
    );
  }

  const amountValue = isPersonal
    ? moneyOrNull(amount)
    : editingAmount
      ? moneyOrNull(amount)
      : (plan?.price ?? null);
  const methodLabel = method
    ? method === "cash"
      ? me.memberships.cash
      : me.memberships.card
    : "—";

  return (
    <div className="grid gap-4">
      <input type="hidden" name="planKind" value={plan?.kind ?? ""} />
      <input
        type="hidden"
        name="requiresTrainer"
        value={String(plan?.requires_trainer ?? false)}
      />

      {/* 1. Vrsta članarine */}
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-plan`}>{me.memberships.plan}</Label>
        <Select
          id={`${idPrefix}-plan`}
          name="planId"
          value={planId}
          onChange={(event) => choosePlan(event.target.value)}
          aria-invalid={Boolean(fieldErrors.planId)}
          aria-describedby={`${idPrefix}-plan-error`}
        >
          <option value="" disabled>
            {me.memberships.planPlaceholder}
          </option>
          {catalog.plans.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} ·{" "}
              {option.price === null
                ? me.memberships.personalPrice
                : formatMoney(option.price)}
            </option>
          ))}
        </Select>
        <FieldError id={`${idPrefix}-plan-error`}>
          {fieldErrors.planId ?? fieldErrors.planKind}
        </FieldError>
      </div>

      {/* 2. Trener (BR-058, filtered by BR-023) */}
      {plan?.requires_trainer ? (
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-trainer`}>
            {me.memberships.trainer}
          </Label>
          <Select
            id={`${idPrefix}-trainer`}
            name="trainerId"
            value={trainerId}
            onChange={(event) => setTrainerId(event.target.value)}
            aria-invalid={Boolean(fieldErrors.trainerId)}
            aria-describedby={`${idPrefix}-trainer-error`}
          >
            <option value="" disabled>
              {me.memberships.trainerPlaceholder}
            </option>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.full_name}
              </option>
            ))}
          </Select>
          <FieldError id={`${idPrefix}-trainer-error`}>
            {fieldErrors.trainerId}
          </FieldError>
        </div>
      ) : null}

      {/* 3. Broj termina (Personalni only, BR-059) */}
      {isPersonal ? (
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-sessions`}>
            {me.memberships.sessions}
          </Label>
          <Input
            id={`${idPrefix}-sessions`}
            name="sessions"
            inputMode="numeric"
            value={sessions}
            onChange={(event) => setSessions(event.target.value)}
            aria-invalid={Boolean(fieldErrors.sessions)}
            aria-describedby={`${idPrefix}-sessions-error`}
          />
          <FieldError id={`${idPrefix}-sessions-error`}>
            {fieldErrors.sessions}
          </FieldError>
        </div>
      ) : null}

      {/* 4. Iznos: entered for Personalni, list price otherwise (BR-059) */}
      {plan ? (
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-amount`}>{me.memberships.amount}</Label>
          {isPersonal || editingAmount ? (
            <Input
              id={`${idPrefix}-amount`}
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={Boolean(fieldErrors.amount)}
              aria-describedby={`${idPrefix}-amount-hint ${idPrefix}-amount-error`}
            />
          ) : (
            <div className="flex items-center gap-2">
              <output
                id={`${idPrefix}-amount`}
                className="flex h-10 flex-1 items-center rounded-lg border bg-muted px-3 text-sm"
              >
                {plan.price === null ? "—" : formatMoney(plan.price)}
              </output>
              {catalog.isOwner ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={me.memberships.editAmount}
                  title={me.memberships.editAmount}
                  onClick={() => {
                    setAmount(plan.price?.replace(".", ",") ?? "");
                    setEditingAmount(true);
                  }}
                >
                  <Pencil aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          )}
          {isPersonal ? (
            <p
              id={`${idPrefix}-amount-hint`}
              className="text-sm text-muted-foreground"
            >
              {me.memberships.amountHint.replace(
                "{min}",
                formatMoney(catalog.personalMin),
              )}
            </p>
          ) : null}
          <FieldError id={`${idPrefix}-amount-error`}>
            {fieldErrors.amount}
          </FieldError>
        </div>
      ) : null}

      {/* 5. Početak and Važi do (BR-051, BR-052) */}
      {plan ? (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-start`}>
                {me.memberships.start}
              </Label>
              {editingStart ? (
                <Input
                  id={`${idPrefix}-start`}
                  name="startOverride"
                  placeholder={me.members.datePlaceholder}
                  value={startText}
                  onChange={(event) => setStartText(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.startOverride)}
                  aria-describedby={`${idPrefix}-start-error`}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <output
                    id={`${idPrefix}-start`}
                    className="flex h-10 flex-1 items-center rounded-lg border bg-muted px-3 text-sm"
                  >
                    {preview ? formatDate(preview.startDate) : "—"}
                  </output>
                  {catalog.isOwner && preview ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={me.memberships.editStart}
                      title={me.memberships.editStart}
                      onClick={() => {
                        setStartText(formatDate(preview.startDate));
                        setEditingStart(true);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">
                {me.memberships.until}
              </span>
              <output
                aria-label={me.memberships.until}
                className="flex h-10 items-center rounded-lg border bg-muted px-3 text-sm"
              >
                {loading ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : preview ? (
                  formatDate(preview.endDate)
                ) : (
                  "—"
                )}
              </output>
            </div>
          </div>
          <FieldError id={`${idPrefix}-start-error`}>
            {fieldErrors.startOverride}
          </FieldError>
          {preview ? (
            <p className="text-sm text-muted-foreground">{preview.reason}</p>
          ) : null}
          {preview?.warning ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {preview.warning}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 6. Način plaćanja (BR-090) */}
      <MethodButtons
        idPrefix={idPrefix}
        value={method}
        onChange={setMethod}
        error={fieldErrors.method}
      />

      {/* 7. Summary line */}
      {plan && preview ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">
          {plan.name} · {formatDate(preview.startDate)}–
          {formatDate(preview.endDate)} ·{" "}
          {amountValue ? formatMoney(amountValue) : "—"} · {methodLabel}
        </p>
      ) : null}
    </div>
  );
}
