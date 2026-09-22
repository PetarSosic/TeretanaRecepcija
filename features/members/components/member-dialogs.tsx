"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { FieldError, FormError } from "@/components/common/form-message";
import {
  MethodButtons,
  type PaymentMethod,
} from "@/components/common/method-buttons";
import { MoneyButton } from "@/components/common/money-button";
import { useActionToast } from "@/components/common/use-action-toast";
import { useFormAction } from "@/components/common/use-form-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { anonymizeMember, replaceCard, updateMember } from "../actions";
import { CardScanField } from "./card-scan-field";
import { MemberFields, type MemberValues } from "./member-fields";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
};

function SubmitButton({
  pending,
  children,
  variant,
}: {
  pending: boolean;
  children: string;
  variant?: "destructive";
}) {
  return (
    <Button type="submit" disabled={pending} variant={variant}>
      {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

/** US-07.3 and BR-045: [Uredi podatke]. */
export function EditMemberDialog({
  defaults,
  ...props
}: DialogProps & { defaults: MemberValues }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{me.members.edit}</DialogTitle>
        </DialogHeader>
        {props.open ? (
          <EditForm
            memberId={props.memberId}
            defaults={defaults}
            onDone={() => props.onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  memberId,
  defaults,
  onDone,
}: {
  memberId: string;
  defaults: MemberValues;
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(updateMember);
  const close = useCallback(() => onDone(), [onDone]);
  useActionToast(state, close);
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <input type="hidden" name="memberId" value={memberId} />
      <FormError>{state.error}</FormError>
      <MemberFields
        idPrefix="edit"
        defaults={defaults}
        fieldErrors={state.fieldErrors}
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {me.common.cancel}
          </Button>
        </DialogClose>
        <SubmitButton pending={pending}>{me.common.save}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

/** US-07.4 and BR-046: the owner types the member number, then [Anonimiziraj trajno]. */
export function AnonymizeDialog({
  memberNumber,
  ...props
}: DialogProps & { memberNumber: number }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.members.anonymize}</DialogTitle>
          <DialogDescription>
            {me.members.anonymizeText.replace("{number}", String(memberNumber))}
          </DialogDescription>
        </DialogHeader>
        {props.open ? (
          <AnonymizeForm
            memberId={props.memberId}
            memberNumber={memberNumber}
            onDone={() => props.onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AnonymizeForm({
  memberId,
  memberNumber,
  onDone,
}: {
  memberId: string;
  memberNumber: number;
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(anonymizeMember);
  const close = useCallback(() => onDone(), [onDone]);
  useActionToast(state, close);
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="memberNumber" value={memberNumber} />
      <FormError>{state.error}</FormError>
      <div className="grid gap-2">
        <Label htmlFor="anonymize-confirmation">
          {me.members.anonymizeNumber}
        </Label>
        <Input
          id="anonymize-confirmation"
          name="confirmation"
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={Boolean(state.fieldErrors?.confirmation)}
          aria-describedby="anonymize-confirmation-error"
        />
        <FieldError id="anonymize-confirmation-error">
          {state.fieldErrors?.confirmation}
        </FieldError>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {me.common.cancel}
          </Button>
        </DialogClose>
        <SubmitButton pending={pending} variant="destructive">
          {me.members.anonymizeConfirm}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}

/**
 * S-09 (US-11.1): the fee and the method first, then [Nastavi] asks for the new empty
 * card. A card that is not empty shows its BR-070 message and the dialog stays open.
 */
export function LostCardDialog({
  fee,
  ...props
}: DialogProps & { fee: string }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{me.members.lostCard}</DialogTitle>
        </DialogHeader>
        {props.open ? (
          <LostCardForm
            memberId={props.memberId}
            fee={fee}
            onDone={() => props.onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LostCardForm({
  memberId,
  fee,
  onDone,
}: {
  memberId: string;
  fee: string;
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(replaceCard);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [step, setStep] = useState<"fee" | "scan">("fee");
  const [cardCode, setCardCode] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const close = useCallback(() => onDone(), [onDone]);
  useActionToast(state, close);

  // S-09 step 3: a valid scan completes the replacement; no further click is needed.
  useEffect(() => {
    if (cardCode) form.current?.requestSubmit();
  }, [cardCode]);

  return (
    <form ref={form} onSubmit={onSubmit} className="grid gap-4" noValidate>
      <input type="hidden" name="memberId" value={memberId} />
      <FormError>{state.error}</FormError>
      <p className="text-base font-medium">
        {me.members.lostCardFee.replace("{amount}", formatMoney(fee))}
      </p>
      {step === "fee" ? (
        <MethodButtons
          idPrefix="lost-card"
          value={method}
          onChange={setMethod}
          error={state.fieldErrors?.method}
        />
      ) : (
        <>
          <input type="hidden" name="method" value={method ?? ""} />
          <CardScanField
            id="lost-card-code"
            label={me.members.lostCardScan}
            autoFocus
            onChange={setCardCode}
            serverError={state.fieldErrors?.cardCode}
          />
        </>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {me.common.cancel}
          </Button>
        </DialogClose>
        {step === "fee" ? (
          <MoneyButton
            type="button"
            disabled={!method}
            onClick={() => setStep("scan")}
          >
            {me.members.lostCardContinue}
          </MoneyButton>
        ) : (
          <MoneyButton type="submit" disabled={pending || !cardCode}>
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            {me.common.save}
          </MoneyButton>
        )}
      </DialogFooter>
    </form>
  );
}
