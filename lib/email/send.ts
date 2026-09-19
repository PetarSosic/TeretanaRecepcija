import "server-only";
import { Resend } from "resend";

export type EmailResult = "sent" | "failed" | "skipped";

/**
 * Doc 08 §7 and BR-161: every email leaves from EMAIL_FROM through Resend. Without
 * EMAIL_FROM (local development) nothing is sent and the skip is logged; a failure is
 * reported, never thrown, so the caller's work (closing a shift) always completes
 * (BR-118). No personal data is logged, only the outcome (doc 08 §9).
 */
export async function sendEmail(message: {
  to: string[];
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<EmailResult> {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.info("Email skipped: EMAIL_FROM is not set (BR-161)");
    return "skipped";
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      attachments: message.attachments,
    });
    if (error) {
      console.error(`Email failed: ${error.name}`);
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error(
      `Email failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
    return "failed";
  }
}
