import { describe, expect, it, vi } from "vitest";
// The AES reader is plain JS, shared with the restore script.
import { readEncryptedZip } from "../../scripts/zip-aes.mjs";
import type { BackupManifest } from "@/lib/backup";

// The backup module is server-only; under Vitest it is a plain module.
vi.mock("server-only", () => ({}));

const {
  backupEmail,
  backupFileName,
  toCsv,
  zipEncryptedArchive,
  BACKUP_KEEP,
  BACKUP_ATTACHMENT_LIMIT,
} = await import("@/lib/backup");
const { me } = await import("@/lib/i18n/me");

const PASSWORD = "lozinka-za-test-1234567890";

const manifest: BackupManifest = {
  gym_id: "b0000000-0000-4000-8000-000000000001",
  gym_name: "KP Fitness",
  exported_at: "2026-09-20T01:00:00.000Z",
  schema_version: "0019",
  tables: [
    { table: "members", rows: 2 },
    { table: "payments", rows: 3 },
  ],
  total_rows: 5,
};

describe("BR-163 CSV export", () => {
  it("quotes every value and writes null as an empty field", () => {
    const csv = toCsv(
      [
        {
          id: 1,
          name: 'Đurđa "Ćira" Čučković',
          note: "prvi red\ndrugi red",
          phone: null,
        },
      ],
      ["id", "name", "note", "phone"],
    );
    expect(csv).toBe(
      '"id","name","note","phone"\r\n' +
        '"1","Đurđa ""Ćira"" Čučković","prvi red\ndrugi red",\r\n',
    );
  });

  it("writes a header even when the table is empty", () => {
    expect(toCsv([], ["id", "gym_id"])).toBe('"id","gym_id"\r\n');
  });

  it("keeps an ISO date and timestamp as they come from the database", () => {
    const csv = toCsv(
      [{ start_date: "2026-09-20", created_at: "2026-09-20T01:00:00+00:00" }],
      ["start_date", "created_at"],
    );
    expect(csv).toContain('"2026-09-20","2026-09-20T01:00:00+00:00"');
  });
});

describe("BR-163 and AS-22: the encrypted ZIP", () => {
  it("opens with the password and holds every file", async () => {
    const zip = await zipEncryptedArchive(
      [
        { name: "members.csv", content: '"id"\r\n"1"\r\n' },
        { name: "manifest.json", content: JSON.stringify(manifest) },
      ],
      PASSWORD,
    );
    const files = readEncryptedZip(zip, PASSWORD) as Map<string, Buffer>;
    expect([...files.keys()].sort()).toEqual(["manifest.json", "members.csv"]);
    expect(files.get("members.csv")!.toString("utf8")).toBe('"id"\r\n"1"\r\n');
    expect(JSON.parse(files.get("manifest.json")!.toString("utf8"))).toEqual(
      manifest,
    );
  });

  it("refuses the wrong password (US-28.1 AC2)", async () => {
    const zip = await zipEncryptedArchive(
      [{ name: "members.csv", content: "x" }],
      PASSWORD,
    );
    expect(() => readEncryptedZip(zip, "pogrešna-lozinka")).toThrow(
      /Wrong password/,
    );
  });

  it("will not write an unencrypted archive", async () => {
    await expect(
      zipEncryptedArchive([{ name: "a.csv", content: "x" }], ""),
    ).rejects.toThrow(/BACKUP_ZIP_PASSWORD/);
  });

  it("survives the Montenegrin alphabet in the data", async () => {
    const content = '"ime"\r\n"Željko Šćepanović – čđ"\r\n';
    const zip = await zipEncryptedArchive(
      [{ name: "members.csv", content }],
      PASSWORD,
    );
    const files = readEncryptedZip(zip, PASSWORD) as Map<string, Buffer>;
    expect(files.get("members.csv")!.toString("utf8")).toBe(content);
  });
});

describe("BR-163: the backup email (doc 08 §7)", () => {
  it("names the file after the run date", () => {
    expect(backupFileName("2026-09-20")).toBe(
      "kpfitness-backup-2026-09-20.zip",
    );
  });

  it("states the gym, the date, the tables and the rows", () => {
    const email = backupEmail(manifest, "2026-09-20", true);
    expect(email.subject).toBe(
      "Sedmična rezervna kopija – KP Fitness – 20.09.2026",
    );
    expect(email.text).toBe(
      "U prilogu je sedmična rezervna kopija (2 tabela, 5 redova). Lozinka nije u ovom emailu.",
    );
  });

  it("says where the copy is when it is too big to attach (AS-23)", () => {
    const email = backupEmail(manifest, "2026-09-20", false);
    expect(email.text).toContain(
      "Kopija je prevelika za email i sačuvana je u Supabase Storage (backups/kpfitness-backup-2026-09-20.zip).",
    );
    expect(BACKUP_ATTACHMENT_LIMIT).toBe(35 * 1024 * 1024);
    expect(BACKUP_KEEP).toBe(8);
  });
});

describe("BR-160: the expiry reminder (doc 08 §7)", () => {
  it("uses the template of doc 08 §7 with the gym named twice", () => {
    const subject = me.expiry.emailSubject.replace("{date}", "23.09.2026");
    const body = me.expiry.emailBody
      .replaceAll("{name}", "Đurđa")
      .replaceAll("{plan}", "Mjesečna")
      .replaceAll("{gym}", "KP Fitness")
      .replaceAll("{date}", "23.09.2026");

    expect(subject).toBe("Vaša članarina ističe 23.09.2026");
    expect(body).toBe(
      "Poštovani/a Đurđa,\n\n" +
        'Vaša članarina "Mjesečna" u teretani KP Fitness važi do 23.09.2026.\n' +
        "Produžite je na recepciji kako biste nastavili bez prekida.\n\n" +
        "Vidimo se!\nKP Fitness\n",
    );
  });
});
