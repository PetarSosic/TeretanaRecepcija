"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { FormError, FormNotice } from "@/components/common/form-message";
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
import { idleState } from "@/lib/action-state";
import { me } from "@/lib/i18n/me";
import { loginWithUsernameOrEmail, requestPasswordReset } from "../actions";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(
    loginWithUsernameOrEmail,
    idleState,
  );

  return (
    <div className="grid gap-4">
      <FormNotice>{notice}</FormNotice>
      <form action={action} className="grid gap-4" noValidate>
        <FormError>{state.error}</FormError>
        <div className="grid gap-1.5">
          <Label htmlFor="identifier">{me.login.identifier}</Label>
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            autoFocus
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">{me.login.password}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          {me.login.submit}
        </Button>
      </form>
      <ResetDialog />
    </div>
  );
}

function ResetDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    idleState,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        className="justify-self-center text-sm underline"
        onClick={() => setOpen(true)}
      >
        {me.login.forgot}
      </Button>
      <DialogContent aria-describedby="reset-description">
        <DialogHeader>
          <DialogTitle>{me.login.resetTitle}</DialogTitle>
          <DialogDescription id="reset-description">
            {me.login.resetDescription}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4" noValidate>
          <FormError>{state.error}</FormError>
          <FormNotice>{state.success}</FormNotice>
          <div className="grid gap-1.5">
            <Label htmlFor="reset-identifier">{me.users.email}</Label>
            <Input
              id="reset-identifier"
              name="identifier"
              type="email"
              autoComplete="email"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {me.common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : null}
              {me.login.resetSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
