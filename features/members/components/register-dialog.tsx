"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, TriangleAlert } from "lucide-react";
import { FormError } from "@/components/common/form-message";
import { MoneyButton } from "@/components/common/money-button";
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
import type { SaleCatalog } from "@/features/memberships/catalog";
import { MembershipFields } from "@/features/memberships/components/membership-fields";
import { me } from "@/lib/i18n/me";
import {
  findDuplicates,
  registerMember,
  type Duplicate,
  type RegisteredMember,
} from "../actions";
import { CardScanField } from "./card-scan-field";
import { MemberFields } from "./member-fields";

/**
 * S-05, opened by scanning an empty card on S-03 (BR-070) or from [Novi član]
 * (US-06.1 AC4): the card, the member, the first membership and "Prijavi odmah", saved
 * in one transaction (AC2). When the success notice is closed, `onRegistered` receives
 * the result so the check-in dialog (S-03b/c/d) can follow.
 */
export function RegisterDialog({
  open,
  onOpenChange,
  catalog,
  initialCard,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: SaleCatalog;
  initialCard?: string;
  onRegistered?: (member: RegisteredMember) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[92svh] overflow-y-auto sm:max-w-2xl"
      >
        {open ? (
          <RegisterForm
            catalog={catalog}
            initialCard={initialCard}
            onDone={(member) => {
              onOpenChange(false);
              if (member) onRegistered?.(member);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RegisterForm({
  catalog,
  initialCard,
  onDone,
}: {
  catalog: SaleCatalog;
  initialCard?: string;
  onDone: (member: RegisteredMember | null) => void;
}) {
  const [state, onSubmit, pending] = useFormAction(registerMember);
  const [cardCode, setCardCode] = useState<string | null>(initialCard ?? null);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [, startChecking] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  // BR-043: checked when the phone or email field loses focus; a warning, never a block.
  function checkDuplicates() {
    const data = new FormData(form.current ?? undefined);
    const phone = String(data.get("phone") ?? "");
    const email = String(data.get("email") ?? "");
    startChecking(async () =>
      setDuplicates(await findDuplicates(phone, email)),
    );
  }

  // S-05 "After success": the member number and the name to write on the card.
  if (state.data) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{me.members.createdTitle}</DialogTitle>
          <DialogDescription className="text-base text-foreground">
            {me.members.created
              .replace("{number}", String(state.data.memberNumber))
              .replace("{name}", state.data.fullName)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            autoFocus
            onClick={() => onDone(state.data ?? null)}
          >
            {me.common.close}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const saveDisabled = pending || !cardCode;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{me.members.registerTitle}</DialogTitle>
      </DialogHeader>
      <form ref={form} onSubmit={onSubmit} className="grid gap-6" noValidate>
        <FormError>{state.error}</FormError>

        <section className="grid gap-3" aria-labelledby="register-card-title">
          <h3 id="register-card-title" className="font-semibold">
            {me.members.sectionCard}
          </h3>
          <CardScanField
            id="register-card"
            label={me.members.scanCard}
            autoFocus={!initialCard}
            initialCode={initialCard}
            onChange={setCardCode}
            serverError={state.fieldErrors?.cardCode}
          />
        </section>

        <section className="grid gap-3" aria-labelledby="register-member-title">
          <h3 id="register-member-title" className="font-semibold">
            {me.members.sectionMember}
          </h3>
          <MemberFields
            idPrefix="register"
            fieldErrors={state.fieldErrors}
            onContactBlur={checkDuplicates}
          />
          {duplicates.length ? (
            <div
              role="alert"
              className="grid gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <p className="flex items-start gap-2">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                {me.members.duplicateWarning}
              </p>
              <ul className="grid gap-1 pl-6">
                {duplicates.map((duplicate) => (
                  <li
                    key={duplicate.id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    #{duplicate.member_number} {duplicate.first_name}{" "}
                    {duplicate.last_name}
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/members/${duplicate.id}`}>
                        {me.members.openExisting}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="pl-6">
                <MoneyButton
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={saveDisabled}
                >
                  {me.members.saveAnyway}
                </MoneyButton>
              </div>
            </div>
          ) : null}
        </section>

        <section
          className="grid gap-3"
          aria-labelledby="register-membership-title"
        >
          <h3 id="register-membership-title" className="font-semibold">
            {me.members.sectionMembership}
          </h3>
          <MembershipFields
            idPrefix="register-sale"
            catalog={catalog}
            memberId={null}
            fieldErrors={state.fieldErrors}
          />
        </section>

        {/* S-05 item 4 and D-31: "Prijavi odmah", on by default. */}
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="checkInNow"
            defaultChecked
            className="size-4 accent-primary"
          />
          {me.reception.checkInNow}
        </label>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {me.common.cancel}
            </Button>
          </DialogClose>
          <MoneyButton type="submit" disabled={saveDisabled}>
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            {me.common.save}
          </MoneyButton>
        </DialogFooter>
      </form>
    </>
  );
}
