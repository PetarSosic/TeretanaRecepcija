import "server-only";
import { createBackup } from "@/lib/backup";
import { sendEmail } from "@/lib/email/send";
import { formatDate } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { deliverShiftReport } from "@/lib/shift-report";
import { createAdminClient } from "@/lib/supabase/admin";

/** The four handlers of doc 08 §8, by the name in their URL. */
export const JOB_NAMES = [
  "nightly",
  "morning",
  "weekly-backup",
  "email-retry",
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export type JobReport = {
  job: JobName;
  gyms: number;
  details: Record<string, unknown>[];
};

export function isJobName(value: string): value is JobName {
  return (JOB_NAMES as readonly string[]).includes(value);
}

/** Doc 08 §8: the gyms whose local time has reached this job's schedule today. */
async function gymsDue(
  job: "nightly" | "morning" | "backup",
): Promise<string[]> {
  const { data, error } = await createAdminClient().rpc("jobs_due", {
    p_job: job,
  });
  if (error) throw new Error(`jobs_due ${job}: ${error.message}`);
  return (data ?? []) as string[];
}

/**
 * BR-162 nightly: automatic check-out (BR-082), automatic shift close (BR-116) and the
 * report of the shift it closed (BR-117). `job_nightly` is idempotent on its own, so a
 * second call on the same day reports `ran: false` and touches nothing.
 */
export async function runNightly(): Promise<JobReport> {
  const admin = createAdminClient();
  const gyms = await gymsDue("nightly");
  const details: Record<string, unknown>[] = [];

  for (const gym of gyms) {
    const { data, error } = await admin.rpc("job_nightly", { p_gym: gym });
    if (error) {
      details.push({ gym, error: error.message });
      continue;
    }
    const result = data as {
      ran: boolean;
      visits_closed?: number;
      shift_id?: string | null;
    };
    let report: string | undefined;
    if (result.ran && result.shift_id) {
      report = await deliverShiftReport(result.shift_id);
    }
    details.push({
      gym,
      ran: result.ran,
      visits_closed: result.visits_closed ?? 0,
      shift_id: result.shift_id ?? null,
      report: report ?? null,
    });
  }
  return { job: "nightly", gyms: gyms.length, details };
}

/**
 * BR-160 morning: one reminder per membership that ends in `expiry_reminder_days` days.
 * `job_expiring_memberships` has already written a notification row for each one, so a
 * failure here is recorded rather than retried: the membership is never picked again.
 */
export async function runMorning(): Promise<JobReport> {
  const admin = createAdminClient();
  const gyms = await gymsDue("morning");
  const details: Record<string, unknown>[] = [];

  for (const gym of gyms) {
    const { data, error } = await admin.rpc("job_expiring_memberships", {
      p_gym: gym,
    });
    if (error) {
      details.push({ gym, error: error.message });
      continue;
    }
    const result = data as {
      ran: boolean;
      reminders: {
        membership_id: string;
        email: string;
        first_name: string;
        plan_name: string;
        gym_name: string;
        end_date: string;
      }[];
    };

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const reminder of result.reminders ?? []) {
      const date = formatDate(reminder.end_date);
      const outcome = await sendEmail({
        to: [reminder.email],
        subject: me.expiry.emailSubject.replace("{date}", date),
        text: me.expiry.emailBody
          .replaceAll("{name}", reminder.first_name)
          .replaceAll("{plan}", reminder.plan_name)
          .replaceAll("{gym}", reminder.gym_name)
          .replaceAll("{date}", date),
      });
      // BR-161: without EMAIL_FROM nothing goes out, and the row says so.
      const status =
        outcome === "sent"
          ? "sent"
          : outcome === "skipped"
            ? "not_sent"
            : "failed";
      if (status === "sent") sent += 1;
      else if (status === "failed") failed += 1;
      else skipped += 1;

      const recorded = await admin.rpc("record_expiry_notification", {
        p_membership: reminder.membership_id,
        p_status: status,
        p_error: status === "failed" ? "Resend" : null,
      });
      if (recorded.error)
        console.error(`record_expiry_notification: ${recorded.error.message}`);
    }
    details.push({ gym, ran: result.ran, sent, failed, skipped });
  }
  return { job: "morning", gyms: gyms.length, details };
}

/**
 * BR-163 weekly backup. The attempt is claimed before any work, so a crash still counts
 * towards the three attempts of the day and a success closes the day through `job_runs`.
 */
export async function runWeeklyBackup(): Promise<JobReport> {
  const admin = createAdminClient();
  const gyms = await gymsDue("backup");
  const details: Record<string, unknown>[] = [];

  for (const gym of gyms) {
    const { data: run, error } = await admin.rpc("start_backup_run", {
      p_gym: gym,
    });
    if (error || !run) {
      details.push({ gym, error: error?.message ?? "start_backup_run" });
      continue;
    }
    const claimed = run as { id: string; run_date: string; attempt: number };

    try {
      const result = await createBackup(gym, claimed.run_date);
      await admin.rpc("finish_backup_run", {
        p_run: claimed.id,
        p_status: "success",
        p_path: result.path,
        p_size: result.size,
        p_emailed: result.emailed,
        p_error: null,
      });
      details.push({
        gym,
        attempt: claimed.attempt,
        status: "success",
        size: result.size,
        emailed: result.emailed,
        tables: result.manifest.tables.length,
        rows: result.manifest.total_rows,
      });
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : "unknown error";
      await admin.rpc("finish_backup_run", {
        p_run: claimed.id,
        p_status: "failed",
        p_path: null,
        p_size: null,
        p_emailed: false,
        p_error: message,
      });
      details.push({ gym, attempt: claimed.attempt, status: "failed" });
      console.error(`Backup ${gym} attempt ${claimed.attempt}: ${message}`);
    }
  }
  return { job: "weekly-backup", gyms: gyms.length, details };
}

/**
 * BR-118: send the shift reports whose email failed, at most five attempts each and no
 * more often than every fifteen minutes. Unlike the other three this job has no schedule
 * of its own and no `job_runs` row: it does whatever is waiting on every run.
 */
export async function runEmailRetry(): Promise<JobReport> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("shifts_pending_email");
  if (error) throw new Error(`shifts_pending_email: ${error.message}`);

  const details: Record<string, unknown>[] = [];
  for (const shift of (data ?? []) as string[]) {
    details.push({ shift, outcome: await deliverShiftReport(shift) });
  }
  return { job: "email-retry", gyms: 0, details };
}

export async function runJob(job: JobName): Promise<JobReport> {
  switch (job) {
    case "nightly":
      return runNightly();
    case "morning":
      return runMorning();
    case "weekly-backup":
      return runWeeklyBackup();
    case "email-retry":
      return runEmailRetry();
  }
}
