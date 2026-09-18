"use client";

import { useActionState, useCallback, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FieldError, FormError } from "@/components/common/form-message";
import { useActionToast } from "@/components/common/use-action-toast";
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
import { Select } from "@/components/ui/select";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";
import type { AppRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import {
  createStaffUser,
  setStaffActive,
  setStaffPassword,
  updateStaffUser,
} from "../actions";

export type StaffRow = {
  id: string;
  full_name: string;
  username: string | null;
  email: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  /** D-59: present only when the signed-in user is an admin. */
  password?: string | null;
};

/**
 * P-03 (D-58): owner and admin rows are managed by an admin alone; AS-5 keeps managers
 * away from both. A row the caller may not manage shows no actions at all.
 */
function mayManage(callerRole: AppRole, targetRole: AppRole) {
  if (targetRole === "owner" || targetRole === "admin")
    return callerRole === "admin";
  return (
    callerRole === "admin" || callerRole === "owner" || callerRole === "manager"
  );
}

/** D-60: the caller's own row never offers deactivation. */
function mayDeactivate(row: StaffRow, callerStaffId: string) {
  return row.id !== callerStaffId;
}

export function UsersTable({
  rows,
  callerRole,
  callerStaffId,
}: {
  rows: StaffRow[];
  callerRole: AppRole;
  callerStaffId: string;
}) {
  // D-59: only an admin is ever sent the stored passwords.
  const showPasswords = callerRole === "admin";
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [resetting, setResetting] = useState<StaffRow | null>(null);
  // Stable callbacks: the toast effect keys on the action state plus this handler.
  const closeEdit = useCallback(() => setEditing(null), []);
  const closeReset = useCallback(() => setResetting(null), []);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {me.users.title}
        </h1>
        <Button onClick={() => setCreating(true)}>{me.users.create}</Button>
      </div>

      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.users.columnName}</Th>
              <Th>{me.users.columnLogin}</Th>
              <Th>{me.users.columnRole}</Th>
              <Th>{me.users.columnActive}</Th>
              {showPasswords ? <Th>{me.users.columnPassword}</Th> : null}
              <Th>{me.users.columnCreated}</Th>
              <Th>
                <span className="sr-only">{me.users.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td
                  colSpan={showPasswords ? 7 : 6}
                  className="text-muted-foreground"
                >
                  {me.users.empty}
                </Td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <Td className="font-medium">{row.full_name}</Td>
                  <Td>{row.username ?? row.email}</Td>
                  <Td>{me.roles[row.role]}</Td>
                  <Td>{row.is_active ? me.users.yes : me.users.no}</Td>
                  {showPasswords ? (
                    <Td>
                      <StoredPassword password={row.password} />
                    </Td>
                  ) : null}
                  <Td>{formatDate(row.created_at)}</Td>
                  <Td>
                    {mayManage(callerRole, row.role) ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(row)}
                        >
                          {me.users.edit}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setResetting(row)}
                        >
                          {me.users.newPassword}
                        </Button>
                        {mayDeactivate(row, callerStaffId) ? (
                          <ActiveButton row={row} />
                        ) : null}
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrapper>

      <CreateDialog
        callerRole={callerRole}
        open={creating}
        onOpenChange={setCreating}
      />
      <EditDialog row={editing} onClose={closeEdit} />
      <PasswordDialog row={resetting} onClose={closeReset} />
    </>
  );
}

function ActiveButton({ row }: { row: StaffRow }) {
  const [state, action, pending] = useActionState(setStaffActive, idleState);
  useActionToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="staffId" value={row.id} />
      <input
        type="hidden"
        name="active"
        value={row.is_active ? "false" : "true"}
      />
      <Button
        type="submit"
        variant={row.is_active ? "destructive" : "outline"}
        size="sm"
        disabled={pending}
      >
        {row.is_active ? me.users.deactivate : me.users.activate}
      </Button>
    </form>
  );
}

function CreateDialog({
  callerRole,
  open,
  onOpenChange,
}: {
  callerRole: AppRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, action, pending] = useActionState(createStaffUser, idleState);
  const [role, setRole] = useState<AppRole>("receptionist");
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useActionToast(state, close);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.users.createTitle}</DialogTitle>
        </DialogHeader>
        <form action={action} className="grid gap-4" noValidate>
          <FormError>{state.error}</FormError>
          <div className="grid gap-1.5">
            <Label htmlFor="role">{me.users.role}</Label>
            <Select
              id="role"
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as AppRole)}
            >
              <option value="receptionist">{me.roles.receptionist}</option>
              <option value="manager">{me.roles.manager}</option>
              {/* P-03 (D-58): only an admin creates owners and admins. */}
              {callerRole === "admin" ? (
                <>
                  <option value="owner">{me.roles.owner}</option>
                  <option value="admin">{me.roles.admin}</option>
                </>
              ) : null}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fullName">{me.users.fullName}</Label>
            <Input id="fullName" name="fullName" required />
            <FieldError id="fullName-error">
              {state.fieldErrors?.fullName}
            </FieldError>
          </div>
          {/* D-57: usernames for every role, an email for the admin. */}
          {role !== "admin" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="username">{me.users.username}</Label>
              <Input id="username" name="username" required />
              <p className="text-xs text-muted-foreground">
                {me.users.usernameHint}
              </p>
              <FieldError id="username-error">
                {state.fieldErrors?.username}
              </FieldError>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="email">{me.users.email}</Label>
              <Input id="email" name="email" type="email" required />
              <FieldError id="email-error">
                {state.fieldErrors?.email}
              </FieldError>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="password">{me.users.temporaryPassword}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
            <FieldError id="password-error">
              {state.fieldErrors?.password}
            </FieldError>
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
              {me.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  row,
  onClose,
}: {
  row: StaffRow | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(updateStaffUser, idleState);
  useActionToast(state, onClose);

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.users.editTitle}</DialogTitle>
        </DialogHeader>
        {row ? (
          <form action={action} className="grid gap-4" noValidate>
            <FormError>{state.error}</FormError>
            <input type="hidden" name="staffId" value={row.id} />
            <div className="grid gap-1.5">
              <Label htmlFor="edit-fullName">{me.users.fullName}</Label>
              <Input
                id="edit-fullName"
                name="fullName"
                defaultValue={row.full_name}
                required
              />
              <FieldError id="edit-fullName-error">
                {state.fieldErrors?.fullName}
              </FieldError>
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
                {me.common.save}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({
  row,
  onClose,
}: {
  row: StaffRow | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(setStaffPassword, idleState);
  useActionToast(state, onClose);

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby="password-description">
        <DialogHeader>
          <DialogTitle>{me.users.passwordTitle}</DialogTitle>
          <DialogDescription id="password-description">
            {me.users.passwordDescription}
          </DialogDescription>
        </DialogHeader>
        {row ? (
          <form action={action} className="grid gap-4" noValidate>
            <FormError>{state.error}</FormError>
            <input type="hidden" name="staffId" value={row.id} />
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">{me.users.temporaryPassword}</Label>
              <Input
                id="new-password"
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
              <FieldError id="new-password-error">
                {state.fieldErrors?.password}
              </FieldError>
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
                {me.common.save}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * D-59 and S-23: the stored password stays masked until the admin asks for it, so the
 * list cannot be read over someone's shoulder.
 */
function StoredPassword({ password }: { password?: string | null }) {
  const [visible, setVisible] = useState(false);
  if (!password)
    return <span className="text-muted-foreground">{me.users.noPassword}</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono">{visible ? password : "••••••••"}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? me.users.hidePassword : me.users.showPassword}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </span>
  );
}
