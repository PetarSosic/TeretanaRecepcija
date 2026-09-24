import "server-only";
import { money, type ShiftReport } from "@/features/shifts/types";
import { sendEmail } from "@/lib/email/send";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { renderShiftReport } from "@/lib/pdf/shift-report";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReportOutcome = "sent" | "failed" | "not_sent";

/** Doc 08 §7: the attachment is `smjena-<yyyy-mm-dd>-<ime>.pdf`. */
export function reportFileName(report: ShiftReport): string {
  const date = formatDate(report.shift.started_at)
    .split(".")
    .reverse()
    .join("-");
  const name = report.shift.staff_name
    .normalize("NFD")
    // Combining accents left by NFD (č → c, š → s); đ has no decomposition, hence below.
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `smjena-${date}-${name || "recepcioner"}.pdf`;
}

/** BR-117: `Izvještaj smjene – <ime> – <dd.mm.yyyy> <HH:mm>–<HH:mm>` and the short body. */
export function reportEmail(report: ShiftReport) {
  const { shift, totals } = report;
  const from = formatTime(shift.started_at);
  const to = shift.closed_at ? formatTime(shift.closed_at) : "—";
  const date = formatDate(shift.started_at);
  return {
    subject: me.report.emailSubject
      .replace("{name}", shift.staff_name)
      .replace("{date}", date)
      .replace("{from}", from)
      .replace("{to}", to),
    text: me.report.emailBody
      .replace("{name}", shift.staff_name)
      .replace("{period}", `${date} ${from}–${to}`)
      .replace("{expected}", formatMoney(money(totals.expected_cash)))
      .replace(
        "{counted}",
        totals.counted_cash === null
          ? me.report.notCounted
          : formatMoney(money(totals.counted_cash)),
      ),
  };
}

/**
 * D-65 (OQ-6, decided 24.09.2026): the shift report goes to the addresses in the gym's
 * settings and always to every active owner who has an email, each address once.
 */
export function reportRecipients(
  listed: readonly string[],
  owners: readonly string[],
): string[] {
  const seen = new Set<string>();
  return [...listed, ...owners]
    .map((address) => address.trim())
    .filter((address) => {
      const key = address.toLowerCase();
      if (!address || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * BR-114 step 4 and BR-117/118: render the PDF, store it in `shift-reports`, email it to
 * `shift_report_emails` and the owners (D-65), and record the outcome on the shift. It runs after the shift is
 * already closed and never throws, so a report problem can never undo a close.
 *
 * The service role is used because the report holds every record of the shift (other
 * staff's expenses included) and the bucket is private to the owner (doc 07 §6), just as
 * the logo upload does; the caller has already closed the shift under its own session.
 */
export async function deliverShiftReport(
  shiftId: string,
): Promise<ReportOutcome> {
  const admin = createAdminClient();
  let path: string | null = null;
  let outcome: ReportOutcome = "failed";
  try {
    const { data, error } = await admin.rpc("shift_report_json", {
      p_shift: shiftId,
    });
    if (error || !data) throw new Error(`shift_report_json: ${error?.message}`);
    const report = data as ShiftReport;

    const pdf = await renderShiftReport(report);
    const target = `${report.shift.gym_id}/${report.shift.id}.pdf`;
    const upload = await admin.storage
      .from("shift-reports")
      .upload(target, pdf, { contentType: "application/pdf", upsert: true });
    if (upload.error) throw new Error(`report upload: ${upload.error.message}`);
    path = target;

    const [{ data: settings }, { data: owners }] = await Promise.all([
      admin
        .from("gym_settings")
        .select("shift_report_emails")
        .eq("gym_id", report.shift.gym_id)
        .maybeSingle<{ shift_report_emails: string[] }>(),
      admin
        .from("staff")
        .select("email")
        .eq("gym_id", report.shift.gym_id)
        .eq("role", "owner")
        .eq("is_active", true)
        .not("email", "is", null)
        .returns<{ email: string }[]>(),
    ]);
    const email = reportEmail(report);
    const sent = await sendEmail({
      to: reportRecipients(
        settings?.shift_report_emails ?? [],
        (owners ?? []).map((owner) => owner.email),
      ),
      subject: email.subject,
      text: email.text,
      attachments: [{ filename: reportFileName(report), content: pdf }],
    });
    // BR-161: a skipped email leaves the shift as not_sent.
    outcome =
      sent === "sent" ? "sent" : sent === "skipped" ? "not_sent" : "failed";
  } catch (error) {
    console.error(
      `Shift report ${shiftId} failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
    outcome = "failed";
  }

  const recorded = await admin.rpc("record_shift_report", {
    p_shift: shiftId,
    p_report_path: path,
    p_status: outcome,
  });
  if (recorded.error)
    console.error(`record_shift_report ${shiftId}: ${recorded.error.message}`);
  return outcome;
}
