import { mkdir, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// The AES reader is plain JS, shared with the restore script.
import { readEncryptedZip } from "../../scripts/zip-aes.mjs";
import {
  adminClient,
  createTestCatalog,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
} from "../e2e/fixtures";

// M-11, US-28.1 (BR-163): one real weekly backup against the hosted project (D-56) —
// export, encrypted ZIP, upload to the private bucket, and pruning to the newest eight.
//
// It calls `createBackup` rather than the job handler, because the handler only acts on a
// gym whose local day is Sunday after 03:00 and no timezone satisfies that on most days
// of the week. What the handler adds — who is due, the three attempts, and the once-a-day
// guard — is proved in `supabase/tests/0011_jobs.test.sql`.
//
// EMAIL_FROM is not set for this run, so BR-161 skips the send: no test can ever mail a
// gym's data to anyone.
vi.mock("server-only", () => ({}));
delete process.env.EMAIL_FROM;

const { createBackup } = await import("@/lib/backup");

const RUN_DATE = "2026-09-20";
/** The eight backups already in the bucket, oldest first (AC3). */
const OLDER = [
  "2026-09-01",
  "2026-09-02",
  "2026-09-03",
  "2026-09-04",
  "2026-09-05",
  "2026-09-06",
  "2026-09-07",
  "2026-09-08",
];

let gymId: string;

/**
 * A gym with something in every kind of table, so the ZIP and the restore that follows
 * are made to carry dates, timestamps, money, booleans, nulls, arrays and the identity
 * key of `audit_log` — not just an empty schema.
 */
async function fillGym(staffId: string): Promise<void> {
  const admin = adminClient();
  const fail = (step: string, error: { message: string } | null) => {
    if (error) throw new Error(`Backup fixture ${step}: ${error.message}`);
  };

  const shift = await admin
    .from("shifts")
    .insert({ gym_id: gymId, staff_id: staffId })
    .select("id")
    .single<{ id: string }>();
  fail("shift", shift.error);

  const batch = await admin
    .from("card_batches")
    .insert({ gym_id: gymId, quantity: 2, created_by: staffId })
    .select("id")
    .single<{ id: string }>();
  fail("card batch", batch.error);

  const codes = [
    `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    `8${Math.floor(100000000 + Math.random() * 899999999)}`,
  ];
  fail(
    "cards",
    (
      await admin.from("cards").insert(
        codes.map((code) => ({
          gym_id: gymId,
          code,
          batch_id: batch.data!.id,
        })),
      )
    ).error,
  );

  const counter = await admin
    .from("member_counters")
    .insert({ gym_id: gymId, last_number: 1 })
    .select("gym_id");
  fail("member counter", counter.error);

  const member = await admin
    .from("members")
    .insert({
      gym_id: gymId,
      member_number: 1,
      first_name: "Đurđa",
      last_name: "Čučković",
      phone: "+38267000999",
      email: "rezerva@pgtap.invalid",
      date_of_birth: "1990-01-01",
      created_by: staffId,
    })
    .select("id")
    .single<{ id: string }>();
  fail("member", member.error);

  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("gym_id", gymId)
    .limit(1)
    .single<{ id: string }>();

  const membership = await admin
    .from("memberships")
    .insert({
      gym_id: gymId,
      member_id: member.data!.id,
      plan_id: plan!.id,
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      start_reason: "Počinje danas",
      covers_gym: true,
      covers_group: false,
      covers_personal: false,
      created_by: staffId,
      shift_id: shift.data!.id,
    })
    .select("id")
    .single<{ id: string }>();
  fail("membership", membership.error);

  fail(
    "payment",
    (
      await admin.from("payments").insert({
        gym_id: gymId,
        kind: "membership",
        membership_id: membership.data!.id,
        member_id: member.data!.id,
        plan_id: plan!.id,
        quantity: 1,
        amount: "30.00",
        method: "cash",
        paid_on: "2026-09-01",
        created_by: staffId,
        shift_id: shift.data!.id,
      })
    ).error,
  );

  fail(
    "visit",
    (
      await admin.from("visits").insert({
        gym_id: gymId,
        member_id: member.data!.id,
        membership_id: membership.data!.id,
        visit_type: "gym",
        checked_in_by: staffId,
        shift_id: shift.data!.id,
      })
    ).error,
  );

  const category = await admin
    .from("expense_categories")
    .insert({ gym_id: gymId, name: "Potrošni materijal" })
    .select("id")
    .single<{ id: string }>();
  fail("expense category", category.error);

  fail(
    "expense",
    (
      await admin.from("expenses").insert({
        gym_id: gymId,
        spent_on: "2026-09-02",
        category_id: category.data!.id,
        description: "Sredstva za čišćenje",
        amount: "13.50",
        method: "cash",
        paid_from_till: true,
        created_by: staffId,
        shift_id: shift.data!.id,
      })
    ).error,
  );

  const { data: product } = await admin
    .from("products")
    .select("id")
    .eq("gym_id", gymId)
    .limit(1)
    .single<{ id: string }>();

  fail(
    "stock movement",
    (
      await admin.from("stock_movements").insert({
        gym_id: gymId,
        product_id: product!.id,
        type: "in",
        quantity: 24,
        unit_cost: "0.30",
        paid_from_till: false,
        created_by: staffId,
      })
    ).error,
  );
}

beforeAll(async () => {
  expect(
    process.env.BACKUP_ZIP_PASSWORD,
    "BACKUP_ZIP_PASSWORD must be set in .env.local",
  ).toBeTruthy();
  gymId = await createTestGym(`backup-${suffix()}`);
  const owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "Integracija Vlasnik kopije",
    password: "rezervna12345",
  });
  await createTestCatalog(gymId);
  await fillGym(owner.id);
});

afterAll(async () => {
  if (gymId) await deleteTestGym(gymId);
});

describe("US-28.1: the weekly backup", () => {
  it("exports every table, encrypts it, stores it and keeps only eight", async () => {
    const admin = adminClient();
    const password = process.env.BACKUP_ZIP_PASSWORD!;

    // AC3: eight are already there, so this run makes nine.
    for (const day of OLDER) {
      const put = await admin.storage
        .from("backups")
        .upload(`${gymId}/kpfitness-backup-${day}.zip`, Buffer.from("PK"), {
          contentType: "application/zip",
          upsert: true,
        });
      expect(put.error).toBeNull();
    }

    const result = await createBackup(gymId, RUN_DATE);

    expect(result.fileName).toBe(`kpfitness-backup-${RUN_DATE}.zip`);
    expect(result.path).toBe(`${gymId}/kpfitness-backup-${RUN_DATE}.zip`);
    expect(result.size).toBeGreaterThan(0);
    // BR-161: without EMAIL_FROM nothing is sent, so nothing is claimed to be.
    expect(result.emailed).toBe(false);
    expect(result.manifest.gym_id).toBe(gymId);
    expect(result.manifest.schema_version).toMatch(/^\d{4}$/);
    expect(result.manifest.tables.length).toBeGreaterThan(20);

    // AC3: nine went in, eight stay, and the oldest is the one that went.
    const { data: files } = await admin.storage.from("backups").list(gymId);
    const names = (files ?? []).map((file) => file.name).sort();
    expect(names).toHaveLength(8);
    expect(names).not.toContain("kpfitness-backup-2026-09-01.zip");
    expect(names).toContain(`kpfitness-backup-${RUN_DATE}.zip`);

    // AC2: the ZIP opens with the password, and with no other.
    const download = await admin.storage.from("backups").download(result.path);
    expect(download.error).toBeNull();
    const zip = Buffer.from(await download.data!.arrayBuffer());

    expect(() => readEncryptedZip(zip, "pogrešna-lozinka")).toThrow();
    const entries = readEncryptedZip(zip, password) as Map<string, Buffer>;

    const manifest = JSON.parse(entries.get("manifest.json")!.toString("utf8"));
    expect(manifest).toEqual(result.manifest);

    // AC2: one CSV per table, with the row count the manifest claims.
    for (const entry of manifest.tables as { table: string; rows: number }[]) {
      const csv = entries.get(`${entry.table}.csv`);
      expect(csv, `${entry.table}.csv is in the ZIP`).toBeTruthy();
      const lines = csv!.toString("utf8").trimEnd().split("\r\n");
      expect(lines.length - 1, `${entry.table} rows`).toBe(entry.rows);
    }

    // The gym's own row and its catalogue are really in there.
    expect(entries.get("gyms.csv")!.toString("utf8")).toContain(gymId);
    expect(
      (manifest.tables as { table: string; rows: number }[]).find(
        (entry) => entry.table === "plans",
      )!.rows,
    ).toBeGreaterThan(0);

    // Nothing of any other gym leaks into one gym's backup.
    const membersCsv = entries.get("members.csv")!.toString("utf8");
    for (const line of membersCsv.split("\r\n").slice(1).filter(Boolean))
      expect(line).toContain(gymId);

    // M-11's restore test reads this file; it outlives the gym, deleted next.
    await mkdir("test-results/backup", { recursive: true });
    await writeFile(`test-results/backup/${RUN_DATE}.zip`, zip);
  });
});
