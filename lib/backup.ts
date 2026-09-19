import "server-only";
import { PassThrough } from "node:stream";
import archiver from "archiver";
import zipEncrypted from "archiver-zip-encrypted";
import { sendEmail } from "@/lib/email/send";
import { formatDate } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { createAdminClient } from "@/lib/supabase/admin";

/** BR-163: the eight newest backups are kept. */
export const BACKUP_KEEP = 8;
/** BR-163 and AS-23: bigger than this and the email carries a note instead of the ZIP. */
export const BACKUP_ATTACHMENT_LIMIT = 35 * 1024 * 1024;

export type BackupManifest = {
  gym_id: string;
  gym_name: string;
  exported_at: string;
  schema_version: string | null;
  tables: { table: string; rows: number }[];
  total_rows: number;
};

export type BackupResult = {
  fileName: string;
  path: string;
  size: number;
  emailed: boolean;
  manifest: BackupManifest;
};

/**
 * BR-163: one CSV cell. Every value is quoted, because a member's name, an expense
 * description or a void reason may hold a comma, a quote or a line break. `null` is
 * written as a bare empty field, which is how the restore script tells it apart from an
 * empty string.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * BR-163: one table as CSV, UTF-8 with a header row and CRLF line ends. Dates and
 * timestamps arrive from `to_json` already in ISO form (`yyyy-mm-dd`, ISO 8601 UTC).
 */
export function toCsv(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  const header = columns.map(csvCell).join(",");
  const body = rows.map((row) =>
    columns.map((column) => csvCell(row[column])).join(","),
  );
  return [header, ...body, ""].join("\r\n");
}

// The plugin registers itself in archiver's format list, which is global to the process
// and throws on a second registration; a backup may run many times in one server.
let formatRegistered = false;
function registerZipFormat(): void {
  if (formatRegistered) return;
  archiver.registerFormat("zip-encrypted", zipEncrypted);
  formatRegistered = true;
}

/**
 * BR-163 and AS-22: one AES-256 encrypted ZIP holding the files. The password protects
 * members' personal data and the readable staff passwords of D-59 on their way through
 * email, so an empty password is refused rather than silently producing a plain ZIP.
 */
export async function zipEncryptedArchive(
  files: { name: string; content: string | Buffer }[],
  password: string,
): Promise<Buffer> {
  if (!password) throw new Error("BACKUP_ZIP_PASSWORD is not set");
  registerZipFormat();

  const archive = archiver.create("zip-encrypted", {
    zlib: { level: 9 },
    encryptionMethod: "aes256",
    password,
  } as unknown as archiver.ArchiverOptions);

  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    sink.on("data", (chunk: Buffer) => chunks.push(chunk));
    sink.on("end", () => resolve(Buffer.concat(chunks)));
    sink.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(sink);
  for (const file of files) archive.append(file.content, { name: file.name });
  await archive.finalize();
  return done;
}

/** BR-163: `kpfitness-backup-<yyyy-mm-dd>.zip`. */
export function backupFileName(runDate: string): string {
  return `kpfitness-backup-${runDate}.zip`;
}

/** Doc 08 §7: the email that carries the backup, or says where to find it instead. */
export function backupEmail(
  manifest: BackupManifest,
  runDate: string,
  attached: boolean,
) {
  const body = me.backup.emailBody
    .replace("{tables}", String(manifest.tables.length))
    .replace("{rows}", String(manifest.total_rows));
  return {
    subject: me.backup.emailSubject
      .replace("{gym}", manifest.gym_name)
      .replace("{date}", formatDate(runDate)),
    text: attached
      ? body
      : `${body}\n\n${me.backup.tooLarge.replace("{file}", backupFileName(runDate))}`,
  };
}

/**
 * BR-163: export every table of the gym as CSV, add `manifest.json`, pack the lot into an
 * AES-256 ZIP, upload it to the private `backups` bucket, keep only the eight newest, and
 * email it to `backup_emails`. The caller records the attempt around this call; anything
 * that goes wrong is thrown, so the attempt is recorded as failed and tried again later.
 */
export async function createBackup(
  gymId: string,
  runDate: string,
): Promise<BackupResult> {
  const admin = createAdminClient();
  const password = process.env.BACKUP_ZIP_PASSWORD;
  if (!password) throw new Error("BACKUP_ZIP_PASSWORD is not set");

  const { data: tables, error: tablesError } = await admin.rpc("backup_tables");
  const tableNames = (tables ?? []) as { table_name: string }[];
  if (tablesError || !tableNames.length)
    throw new Error(`backup_tables: ${tablesError?.message ?? "no tables"}`);

  const { data: gym } = await admin
    .from("gyms")
    .select("name")
    .eq("id", gymId)
    .maybeSingle<{ name: string }>();

  const files: { name: string; content: string | Buffer }[] = [];
  const counts: { table: string; rows: number }[] = [];
  let total = 0;

  for (const { table_name: table } of tableNames) {
    const { data: rows, error } = await admin.rpc("backup_table_rows", {
      p_gym: gymId,
      p_table: table,
    });
    if (error) throw new Error(`backup_table_rows ${table}: ${error.message}`);
    const list = (rows ?? []) as Record<string, unknown>[];

    // An empty table still gets its header, so a restore knows the shape of the file.
    let columns = list.length ? Object.keys(list[0]) : [];
    if (!columns.length) {
      const { data: schema, error: schemaError } = await admin.rpc(
        "backup_table_columns",
        { p_table: table },
      );
      if (schemaError)
        throw new Error(
          `backup_table_columns ${table}: ${schemaError.message}`,
        );
      columns = (schema ?? []) as string[];
    }

    files.push({ name: `${table}.csv`, content: toCsv(list, columns) });
    counts.push({ table, rows: list.length });
    total += list.length;
  }

  const { data: version, error: versionError } = await admin.rpc(
    "backup_schema_version",
  );
  if (versionError)
    throw new Error(`backup_schema_version: ${versionError.message}`);

  const manifest: BackupManifest = {
    gym_id: gymId,
    gym_name: gym?.name ?? "",
    exported_at: new Date().toISOString(),
    schema_version: (version as string | null) ?? null,
    tables: counts,
    total_rows: total,
  };
  files.push({
    name: "manifest.json",
    content: JSON.stringify(manifest, null, 2),
  });

  const zip = await zipEncryptedArchive(files, password);
  const fileName = backupFileName(runDate);
  const path = `${gymId}/${fileName}`;
  const upload = await admin.storage
    .from("backups")
    .upload(path, zip, { contentType: "application/zip", upsert: true });
  if (upload.error) throw new Error(`backup upload: ${upload.error.message}`);

  await pruneBackups(admin, gymId);

  const { data: settings } = await admin
    .from("gym_settings")
    .select("backup_emails")
    .eq("gym_id", gymId)
    .maybeSingle<{ backup_emails: string[] }>();

  const attached = zip.byteLength <= BACKUP_ATTACHMENT_LIMIT;
  const email = backupEmail(manifest, runDate, attached);
  const sent = await sendEmail({
    to: settings?.backup_emails ?? [],
    subject: email.subject,
    text: email.text,
    attachments: attached ? [{ filename: fileName, content: zip }] : undefined,
  });

  return {
    fileName,
    path,
    size: zip.byteLength,
    emailed: sent === "sent",
    manifest,
  };
}

/** BR-163: after a successful upload, only the eight newest files of the gym stay. */
async function pruneBackups(
  admin: ReturnType<typeof createAdminClient>,
  gymId: string,
): Promise<void> {
  // The names end in the run date, so the newest sort first.
  const { data: files } = await admin.storage
    .from("backups")
    .list(gymId, { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (!files) return;
  const old = files.slice(BACKUP_KEEP).map((file) => `${gymId}/${file.name}`);
  if (old.length) await admin.storage.from("backups").remove(old);
}
