import { writeFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";

// TEST_PLAN.md JOB-03, JOB-04, JOB-05, JOB-07 and E2E-07: one real scheduled-job
// handler (doc 08 §8), run for ONE synthetic gym. `tests/e2e/test-plan-jobs.spec.ts` and
// `test-plan-medium-jobs.spec.ts` start this file with TEST_PLAN_JOB, TEST_PLAN_GYM and
// TEST_PLAN_OUT set; without them it is skipped, so `npm run test` never runs a job.
//
// A real handler acts on every gym whose time has come, which would close the working
// gym's shift, use up its members' reminders or resend its reports. Here `jobs_due` and
// the retry queue answer with the test gym alone; everything else — the Postgres job
// functions, the shift report, the backup, Resend — is the real thing against the hosted
// project (D-56). Each email's Resend id is kept, so its delivery can be read back.
vi.mock("server-only", () => ({}));

const scope = vi.hoisted(() => ({
  gym: process.env.TEST_PLAN_GYM ?? "",
  sent: [] as {
    to: string[];
    subject: string;
    text: string;
    attachments: { filename: string; size: number }[];
    id: string | null;
    error: string | null;
  }[],
}));

vi.mock("@/lib/supabase/admin", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase/admin")>();
  return {
    createAdminClient: () => {
      const client = original.createAdminClient();
      const rpc = client.rpc.bind(client) as (...args: unknown[]) => PromiseLike<{
        data: unknown;
        error: unknown;
      }>;
      client.rpc = ((name: string, ...rest: unknown[]) => {
        if (name === "jobs_due")
          return Promise.resolve({ data: [scope.gym], error: null });
        // JOB-07: the BR-118 retry queue spans every gym; keep only the test gym's shifts.
        if (name === "shifts_pending_email")
          return (async () => {
            const result = await rpc(name, ...rest);
            if (result.error) return result;
            const { data } = await client
              .from("shifts")
              .select("id")
              .eq("gym_id", scope.gym)
              .in("id", (result.data as string[] | null) ?? []);
            return { data: (data ?? []).map((row) => row.id as string), error: null };
          })();
        return rpc(name, ...rest);
      }) as typeof client.rpc;
      return client;
    },
  };
});

vi.mock("resend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("resend")>();
  class Recording extends actual.Resend {
    constructor(key?: string) {
      super(key);
      const send = this.emails.send.bind(this.emails);
      this.emails.send = (async (...args: Parameters<typeof send>) => {
        const result = await send(...args);
        const [payload] = args as unknown as [
          {
            to: string[];
            subject: string;
            text: string;
            attachments?: { filename: string; content: Buffer }[];
          },
        ];
        scope.sent.push({
          to: payload.to,
          subject: payload.subject,
          text: payload.text,
          attachments: (payload.attachments ?? []).map((file) => ({
            filename: file.filename,
            size: file.content.byteLength,
          })),
          id: result.data?.id ?? null,
          error: result.error?.name ?? null,
        });
        return result;
      }) as typeof send;
    }
  }
  return { ...actual, Resend: Recording };
});

const job = process.env.TEST_PLAN_JOB;
const out = process.env.TEST_PLAN_OUT;

it.skipIf(!job || !scope.gym || !out)(
  "runs one job handler for the test gym only",
  async () => {
    const { runJob, isJobName } = await import("@/lib/jobs");
    expect(isJobName(job!)).toBe(true);
    const report = await runJob(job as Parameters<typeof runJob>[0]);

    // Resend settles an email within seconds; read back what happened to each one.
    const { Resend } = await vi.importActual<typeof import("resend")>("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const emails = [];
    for (const email of scope.sent) {
      let event: string | null = null;
      for (let i = 0; email.id && i < 30 && event !== "delivered"; i++) {
        const { data } = await resend.emails.get(email.id);
        event = data?.last_event ?? null;
        if (event !== "delivered") await new Promise((r) => setTimeout(r, 2_000));
      }
      emails.push({
        to: email.to,
        subject: email.subject,
        text: email.text,
        attachments: email.attachments,
        error: email.error,
        lastEvent: event,
        // BR-163: the ZIP's password never travels with it.
        mentionsZipPassword: Boolean(
          process.env.BACKUP_ZIP_PASSWORD &&
            email.text.includes(process.env.BACKUP_ZIP_PASSWORD),
        ),
      });
    }
    await writeFile(out!, JSON.stringify({ report, emails }, null, 2));
  },
  180_000,
);
