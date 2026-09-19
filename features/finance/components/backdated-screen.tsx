"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { FieldError, FormError } from "@/components/common/form-message";
import { useActionToast } from "@/components/common/use-action-toast";
import { useFormAction } from "@/components/common/use-form-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";
import {
  saveBackdatedCardFee,
  saveBackdatedDayPasses,
  saveBackdatedMembership,
  saveBackdatedVisit,
} from "../actions";
import { MemberPicker, type PickableMember } from "./member-picker";

export type PlanOption = {
  id: string;
  name: string;
  kind: "gym" | "group" | "combo" | "personal" | "day_pass";
  requires_trainer: boolean;
  price: string | null;
};

export type TrainerOption = { id: string; full_name: string };
export type SlotOption = {
  id: string;
  label: string;
  trainer_id: string;
};

const TABS = [
  { id: "visit", label: me.finance.tabVisit },
  { id: "membership", label: me.finance.tabMembership },
  { id: "dayPasses", label: me.finance.tabDayPasses },
  { id: "cardFee", label: me.finance.tabCardFee },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** S-22 (F-23, BR-120): four forms, one banner, and never a shift. */
export function BackdatedScreen({
  members,
  plans,
  trainers,
  slots,
  today,
}: {
  members: PickableMember[];
  plans: PlanOption[];
  trainers: TrainerOption[];
  slots: SlotOption[];
  /** BR-001: gym_today, the newest date BR-120 allows. */
  today: string;
}) {
  const [tab, setTab] = useState<TabId>("visit");

  return (
    <div className="grid gap-6">
      <p className="rounded-lg border border-chart-2 bg-muted px-4 py-3 text-sm">
        {me.finance.backdatedBanner}
      </p>

      <div role="tablist" aria-label={me.finance.backdatedTitle} className="flex flex-wrap gap-1 border-b">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              tab === item.id
                ? "border-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "visit" ? (
        <VisitForm
          members={members}
          trainers={trainers}
          slots={slots}
          today={today}
        />
      ) : null}
      {tab === "membership" ? (
        <MembershipForm
          members={members}
          plans={plans}
          trainers={trainers}
          today={today}
        />
      ) : null}
      {tab === "dayPasses" ? <DayPassForm today={today} /> : null}
      {tab === "cardFee" ? (
        <CardFeeForm members={members} today={today} />
      ) : null}
    </div>
  );
}

function MethodField({ error }: { error?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="method">{me.finance.method}</Label>
      <Select id="method" name="method" defaultValue="cash" required>
        <option value="cash">{me.finance.methodCash}</option>
        <option value="card">{me.finance.methodCard}</option>
      </Select>
      <FieldError id="method-error">{error}</FieldError>
    </div>
  );
}

function SubmitRow({ pending }: { pending: boolean }) {
  return (
    <div>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : null}
        {me.common.save}
      </Button>
    </div>
  );
}

/** BR-083: member, date, both times, the type, and the trainer or slot when needed. */
function VisitForm({
  members,
  trainers,
  slots,
  today,
}: {
  members: PickableMember[];
  trainers: TrainerOption[];
  slots: SlotOption[];
  today: string;
}) {
  const [state, onSubmit, pending] = useFormAction(saveBackdatedVisit);
  const [type, setType] = useState<"gym" | "group" | "personal">("gym");
  const [trainerId, setTrainerId] = useState("");
  useActionToast(state);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <MemberPicker members={members} error={errors.memberId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="visit-date">{me.finance.date}</Label>
          <Input
            id="visit-date"
            name="date"
            type="date"
            max={today}
            defaultValue={today}
            required
          />
          <FieldError id="date-error">{errors.date}</FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="checkIn">{me.finance.checkInTime}</Label>
          <Input id="checkIn" name="checkIn" type="time" required />
          <FieldError id="checkIn-error">{errors.checkIn}</FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="checkOut">{me.finance.checkOutTime}</Label>
          <Input id="checkOut" name="checkOut" type="time" required />
          <FieldError id="checkOut-error">{errors.checkOut}</FieldError>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="visitType">{me.finance.visitType}</Label>
        <Select
          id="visitType"
          name="visitType"
          value={type}
          onChange={(event) => {
            setType(event.target.value as typeof type);
            setTrainerId("");
          }}
        >
          <option value="gym">{me.finance.typeGym}</option>
          <option value="group">{me.finance.typeGroup}</option>
          <option value="personal">{me.finance.typePersonal}</option>
        </Select>
      </div>

      {/* BR-078: a trainer belongs to a group or personal visit, never to a gym one. */}
      {type !== "gym" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="trainerId">{me.finance.trainer}</Label>
          <Select
            id="trainerId"
            name="trainerId"
            value={trainerId}
            onChange={(event) => setTrainerId(event.target.value)}
            required
          >
            <option value="">—</option>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.full_name}
              </option>
            ))}
          </Select>
          <FieldError id="trainerId-error">{errors.trainerId}</FieldError>
        </div>
      ) : null}

      {type === "group" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="slotId">{me.finance.classSlot}</Label>
          <Select id="slotId" name="slotId" defaultValue="">
            <option value="">{me.finance.noSlot}</option>
            {slots
              .filter((slot) => !trainerId || slot.trainer_id === trainerId)
              .map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.label}
                </option>
              ))}
          </Select>
        </div>
      ) : null}

      <SubmitRow pending={pending} />
    </form>
  );
}

/** BR-120: like S-08, with an editable start date and payment date. */
function MembershipForm({
  members,
  plans,
  trainers,
  today,
}: {
  members: PickableMember[];
  plans: PlanOption[];
  trainers: TrainerOption[];
  today: string;
}) {
  const [state, onSubmit, pending] = useFormAction(saveBackdatedMembership);
  const [planId, setPlanId] = useState("");
  useActionToast(state);
  const errors = state.fieldErrors ?? {};
  const plan = plans.find((item) => item.id === planId);

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <MemberPicker members={members} error={errors.memberId} />

      <div className="grid gap-1.5">
        <Label htmlFor="planId">{me.finance.plan}</Label>
        <Select
          id="planId"
          name="planId"
          value={planId}
          onChange={(event) => setPlanId(event.target.value)}
          required
        >
          <option value="">—</option>
          {plans.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <FieldError id="planId-error">{errors.planId}</FieldError>
      </div>

      {plan?.requires_trainer ? (
        <div className="grid gap-1.5">
          <Label htmlFor="membership-trainer">{me.finance.trainer}</Label>
          <Select id="membership-trainer" name="trainerId" required>
            <option value="">—</option>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.full_name}
              </option>
            ))}
          </Select>
          <FieldError id="trainerId-error">{errors.trainerId}</FieldError>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="amount">{me.finance.amount} (€)</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            defaultValue={plan?.price ?? ""}
            key={planId}
          />
          <FieldError id="amount-error">{errors.amount}</FieldError>
        </div>
        {/* BR-059: Personalni is the only plan that carries a session count. */}
        {plan?.kind === "personal" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="sessions">{me.finance.sessions}</Label>
            <Input id="sessions" name="sessions" inputMode="numeric" required />
            <FieldError id="sessions-error">{errors.sessions}</FieldError>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="paidOn">{me.finance.paidOn}</Label>
          <Input
            id="paidOn"
            name="paidOn"
            type="date"
            max={today}
            defaultValue={today}
            required
          />
          <FieldError id="paidOn-error">{errors.paidOn}</FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="startDate">{me.finance.startDate}</Label>
          <Input id="startDate" name="startDate" type="date" />
          <p className="text-xs text-muted-foreground">
            {me.finance.startDateHint}
          </p>
          <FieldError id="startDate-error">{errors.startDate}</FieldError>
        </div>
      </div>

      <MethodField error={errors.method} />
      <SubmitRow pending={pending} />
    </form>
  );
}

/** BR-100 and BR-120: day passes sold on a past day. */
function DayPassForm({ today }: { today: string }) {
  const [state, onSubmit, pending] = useFormAction(saveBackdatedDayPasses);
  useActionToast(state);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="quantity">{me.finance.quantity}</Label>
          <Input
            id="quantity"
            name="quantity"
            inputMode="numeric"
            defaultValue="1"
            required
          />
          <FieldError id="quantity-error">{errors.quantity}</FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dp-paidOn">{me.finance.paidOn}</Label>
          <Input
            id="dp-paidOn"
            name="paidOn"
            type="date"
            max={today}
            defaultValue={today}
            required
          />
          <FieldError id="paidOn-error">{errors.paidOn}</FieldError>
        </div>
      </div>
      <MethodField error={errors.method} />
      <SubmitRow pending={pending} />
    </form>
  );
}

/** BR-034 and BR-120: the replacement fee, taken on a past day. */
function CardFeeForm({
  members,
  today,
}: {
  members: PickableMember[];
  today: string;
}) {
  const [state, onSubmit, pending] = useFormAction(saveBackdatedCardFee);
  useActionToast(state);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <MemberPicker members={members} error={errors.memberId} />
      <div className="grid gap-1.5">
        <Label htmlFor="cf-paidOn">{me.finance.paidOn}</Label>
        <Input
          id="cf-paidOn"
          name="paidOn"
          type="date"
          max={today}
          defaultValue={today}
          required
        />
        <FieldError id="paidOn-error">{errors.paidOn}</FieldError>
      </div>
      <MethodField error={errors.method} />
      <SubmitRow pending={pending} />
    </form>
  );
}
