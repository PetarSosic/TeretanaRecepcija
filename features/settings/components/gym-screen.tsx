"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { FieldError, FormError } from "@/components/common/form-message";
import { useActionToast } from "@/components/common/use-action-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";
import { formatDateTime } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import {
  saveExpenseCategory,
  saveGymSettings,
  uploadLogo,
} from "../catalog-actions";
import { ActionDialog } from "./action-dialog";

export type GymSettings = {
  card_replacement_price: string;
  personal_min_price: string;
  expiry_reminder_days: number;
  auto_close_time: string;
  double_scan_seconds: number;
  shift_report_emails: string[];
  backup_emails: string[];
  logo_path: string | null;
};

/** BR-163: the newest attempt of the weekly backup, shown read-only on S-27. */
export type BackupStatus = {
  run_date: string;
  status: "running" | "success" | "failed";
  error: string | null;
  finished_at: string | null;
  started_at: string;
};

export type Category = {
  id: string;
  name: string;
  is_salary: boolean;
  is_system: boolean;
  is_active: boolean;
};

/** S-27, plus the BR-131 category management the owner reaches from here. */
export function GymScreen({
  settings,
  categories,
  logoUrl,
  backup,
}: {
  settings: GymSettings;
  categories: Category[];
  logoUrl: string | null;
  backup: BackupStatus | null;
}) {
  return (
    <div className="grid gap-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {me.settings.gymTitle}
      </h1>
      <SettingsForm settings={settings} />
      <BackupLine backup={backup} />
      <LogoSection logoUrl={logoUrl} />
      <CategoriesSection categories={categories} />
    </div>
  );
}

/** S-27 read-only info (BR-163): when the last backup ran and how it went. */
function BackupLine({ backup }: { backup: BackupStatus | null }) {
  if (!backup)
    return (
      <p className="text-sm text-muted-foreground">
        {me.settings.lastBackupNever}
      </p>
    );

  const status =
    backup.status === "success"
      ? me.settings.backupSuccess
      : backup.status === "running"
        ? me.settings.backupRunning
        : me.settings.backupFailed.replace(
            "{error}",
            backup.error ?? me.settings.backupUnknownError,
          );

  return (
    <p className="text-sm text-muted-foreground">
      {me.settings.lastBackup
        .replace(
          "{date}",
          formatDateTime(backup.finished_at ?? backup.started_at),
        )
        .replace("{status}", status)}
    </p>
  );
}

function SettingsForm({ settings }: { settings: GymSettings }) {
  const [state, action, pending] = useActionState(saveGymSettings, idleState);
  useActionToast(state);

  return (
    <section>
      <form action={action} className="grid max-w-xl gap-4" noValidate>
        <FormError>{state.error}</FormError>
        <Field
          id="cardReplacementPrice"
          label={me.settings.cardReplacementPrice}
          defaultValue={settings.card_replacement_price}
          error={state.fieldErrors?.cardReplacementPrice}
          inputMode="decimal"
        />
        <Field
          id="personalMinPrice"
          label={me.settings.personalMinPrice}
          defaultValue={settings.personal_min_price}
          error={state.fieldErrors?.personalMinPrice}
          inputMode="decimal"
        />
        <Field
          id="expiryReminderDays"
          label={me.settings.expiryReminderDays}
          defaultValue={String(settings.expiry_reminder_days)}
          error={state.fieldErrors?.expiryReminderDays}
          inputMode="numeric"
        />
        <Field
          id="autoCloseTime"
          label={me.settings.autoCloseTime}
          defaultValue={settings.auto_close_time.slice(0, 5)}
          error={state.fieldErrors?.autoCloseTime}
          type="time"
        />
        <Field
          id="doubleScanSeconds"
          label={me.settings.doubleScanSeconds}
          defaultValue={String(settings.double_scan_seconds)}
          error={state.fieldErrors?.doubleScanSeconds}
          inputMode="numeric"
        />
        <EmailField
          id="shiftReportEmails"
          label={me.settings.shiftReportEmails}
          value={settings.shift_report_emails}
          error={state.fieldErrors?.shiftReportEmails}
        />
        <EmailField
          id="backupEmails"
          label={me.settings.backupEmails}
          value={settings.backup_emails}
          error={state.fieldErrors?.backupEmails}
        />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            {me.common.save}
          </Button>
        </div>
      </form>
    </section>
  );
}

function Field({
  id,
  label,
  defaultValue,
  error,
  ...props
}: {
  id: string;
  label: string;
  defaultValue: string;
  error?: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-error`}
        {...props}
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

function EmailField({
  id,
  label,
  value,
  error,
}: {
  id: string;
  label: string;
  value: string[];
  error?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={id}
        rows={Math.max(2, value.length)}
        defaultValue={value.join("\n")}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-error`}
        className="flex w-full rounded-lg border bg-card px-3 py-2 text-sm"
      />
      <p className="text-xs text-muted-foreground">{me.settings.emailsHint}</p>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

/** US-21.1: PNG or JPG of at most 1 MB. */
function LogoSection({ logoUrl }: { logoUrl: string | null }) {
  const [state, action, pending] = useActionState(uploadLogo, idleState);
  useActionToast(state);

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{me.settings.logo}</h2>
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={me.settings.logo}
          width={160}
          height={160}
          unoptimized
          className="mb-3 h-20 w-auto rounded-lg border bg-card object-contain p-2"
        />
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          {me.settings.logoMissing}
        </p>
      )}
      <form action={action} className="grid max-w-xl gap-2">
        <Label htmlFor="logo">{me.settings.logoUpload}</Label>
        <input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg"
          required
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">{me.settings.logoHint}</p>
        <FieldError id="logo-error">{state.fieldErrors?.logo}</FieldError>
        <div>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            {me.settings.logoUpload}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** BR-131: add, rename, deactivate; never delete, and never deactivate a system one. */
function CategoriesSection({ categories }: { categories: Category[] }) {
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{me.settings.categories}</h2>
        <Button onClick={() => setCreating(true)}>
          {me.settings.addCategory}
        </Button>
      </div>
      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.settings.categoryName}</Th>
              <Th>{me.settings.active}</Th>
              <Th>
                <span className="sr-only">{me.users.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <Td className="font-medium">
                  {category.name}
                  {category.is_system ? (
                    <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {me.settings.systemCategory}
                    </span>
                  ) : null}
                  {category.is_salary ? (
                    <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {me.settings.salaryCategory}
                    </span>
                  ) : null}
                </Td>
                <Td>{category.is_active ? me.users.yes : me.users.no}</Td>
                <Td className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(category)}
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
        title={me.settings.addCategory}
        open={creating}
        onOpenChange={setCreating}
        action={saveExpenseCategory}
      >
        {(state) => <CategoryFields state={state} />}
      </ActionDialog>
      <ActionDialog
        title={me.settings.editCategory}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        action={saveExpenseCategory}
      >
        {(state) =>
          editing ? <CategoryFields state={state} category={editing} /> : null
        }
      </ActionDialog>
    </section>
  );
}

function CategoryFields({
  state,
  category,
}: {
  state: { fieldErrors?: Record<string, string> };
  category?: Category;
}) {
  return (
    <>
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <div className="grid gap-1.5">
        <Label htmlFor="category-name">{me.settings.categoryName}</Label>
        <Input
          id="category-name"
          name="name"
          defaultValue={category?.name ?? ""}
          required
        />
        <FieldError id="category-name-error">
          {state.fieldErrors?.name}
        </FieldError>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={category?.is_active ?? true}
          disabled={category?.is_system}
          className="size-4"
        />
        {me.settings.active}
      </label>
      {/* BR-131: a system category stays active, so its checkbox is fixed. */}
      {category?.is_system ? (
        <input type="hidden" name="isActive" value="true" />
      ) : null}
    </>
  );
}
