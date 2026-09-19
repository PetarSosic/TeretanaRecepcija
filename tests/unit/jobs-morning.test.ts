import { beforeEach, describe, expect, it, vi } from "vitest";

// M-11 "done when": the morning job sends exactly one email per qualifying membership,
// and with EMAIL_FROM unset (BR-161) it sends none and says so on the row. Which
// memberships qualify is decided in Postgres and proved in pgTAP; what is checked here is
// what the handler does with the list it gets back.
vi.mock("server-only", () => ({}));

const sendEmail = vi.fn();
vi.mock("@/lib/email/send", () => ({ sendEmail }));

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

const { runMorning } = await import("@/lib/jobs");

const GYM = "b0000000-0000-4000-8000-000000000001";
const reminders = [
  {
    membership_id: "40000000-0000-4000-8000-000000000001",
    email: "djurdja@example.invalid",
    first_name: "Đurđa",
    plan_name: "Mjesečna",
    gym_name: "KP Fitness",
    end_date: "2026-09-23",
  },
  {
    membership_id: "40000000-0000-4000-8000-000000000002",
    email: "zeljko@example.invalid",
    first_name: "Željko",
    plan_name: "Grupni",
    gym_name: "KP Fitness",
    end_date: "2026-09-23",
  },
];

function answerWith(outcome: string) {
  sendEmail.mockResolvedValue(outcome);
  rpc.mockImplementation(async (name: string) => {
    if (name === "jobs_due") return { data: [GYM], error: null };
    if (name === "job_expiring_memberships")
      return { data: { ran: true, reminders }, error: null };
    return { data: null, error: null };
  });
}

beforeEach(() => {
  sendEmail.mockReset();
  rpc.mockReset();
});

describe("BR-160: the morning job", () => {
  it("sends one email per membership and records each one", async () => {
    answerWith("sent");
    const report = await runMorning();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[0][0].to).toEqual(["djurdja@example.invalid"]);
    expect(sendEmail.mock.calls[0][0].subject).toBe(
      "Vaša članarina ističe 23.09.2026",
    );
    expect(sendEmail.mock.calls[0][0].text).toContain(
      'Vaša članarina "Mjesečna" u teretani KP Fitness važi do 23.09.2026.',
    );
    expect(sendEmail.mock.calls[1][0].to).toEqual(["zeljko@example.invalid"]);
    // No attachment and no HTML: the reminder is a plain letter (doc 08 §7).
    expect(sendEmail.mock.calls[1][0].attachments).toBeUndefined();

    const recorded = rpc.mock.calls.filter(
      (call) => call[0] === "record_expiry_notification",
    );
    expect(recorded).toHaveLength(2);
    expect(recorded[0][1]).toEqual({
      p_membership: reminders[0].membership_id,
      p_status: "sent",
      p_error: null,
    });
    expect(report.details[0]).toMatchObject({ sent: 2, failed: 0, skipped: 0 });
  });

  it("BR-161: with EMAIL_FROM unset nothing is sent and the row says not_sent", async () => {
    answerWith("skipped");
    const report = await runMorning();

    const recorded = rpc.mock.calls.filter(
      (call) => call[0] === "record_expiry_notification",
    );
    expect(recorded).toHaveLength(2);
    expect(recorded[0][1].p_status).toBe("not_sent");
    expect(report.details[0]).toMatchObject({ sent: 0, failed: 0, skipped: 2 });
  });

  it("records a rejected send as failed without stopping the others", async () => {
    answerWith("failed");
    const report = await runMorning();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const recorded = rpc.mock.calls.filter(
      (call) => call[0] === "record_expiry_notification",
    );
    expect(recorded.every((call) => call[1].p_status === "failed")).toBe(true);
    expect(report.details[0]).toMatchObject({ sent: 0, failed: 2, skipped: 0 });
  });

  it("does nothing when no gym is due", async () => {
    sendEmail.mockResolvedValue("sent");
    rpc.mockImplementation(async (name: string) =>
      name === "jobs_due"
        ? { data: [], error: null }
        : { data: null, error: null },
    );
    const report = await runMorning();

    expect(report.gyms).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
