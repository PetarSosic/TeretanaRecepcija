// BR-163 restore test (M-11) and the restore procedure of the production guide (M-13).
//
// It loads a weekly backup ZIP into a SEPARATE, EMPTY hosted Supabase project and
// compares the loaded row counts with `manifest.json`. D-56 forbids ever pointing this at
// the working gym project, so the target comes from RESTORE_TEST_DATABASE_URL alone and
// the script refuses to run when that host is the same as DATABASE_URL's.
//
// Usage:
//   node scripts/restore-backup.mjs --file <backup.zip>   restore a ZIP from disk
//   node scripts/restore-backup.mjs                       restore the newest backup in Storage
//
// Steps the script performs, in order:
//   1. refuse unless the target is a different host from the working project;
//   2. apply every migration to the target with `supabase db push`;
//   3. decrypt the ZIP with BACKUP_ZIP_PASSWORD and read the manifest;
//   4. empty the target's public tables;
//   5. create placeholder auth.users rows, because Supabase Auth is not in the backup;
//   6. load each CSV with triggers disabled, parents before children;
//   7. print a row-count comparison and exit non-zero on any mismatch.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readEncryptedZip } from "./zip-aes.mjs";

nextEnv.loadEnvConfig(process.cwd());

const target = process.env.RESTORE_TEST_DATABASE_URL;
const password = process.env.BACKUP_ZIP_PASSWORD;
if (!target) {
  console.error(
    "Set RESTORE_TEST_DATABASE_URL in .env.local: the separate, empty Supabase test project (D-56).",
  );
  process.exit(1);
}
if (!password) {
  console.error("Set BACKUP_ZIP_PASSWORD in .env.local.");
  process.exit(1);
}

// The guard that keeps a restore away from the gym's own data.
const host = (uri) => {
  try {
    return new URL(uri).host.toLowerCase();
  } catch {
    return "";
  }
};
if (!host(target)) {
  console.error("RESTORE_TEST_DATABASE_URL is not a valid connection URI.");
  process.exit(1);
}
if (
  process.env.DATABASE_URL &&
  host(target) === host(process.env.DATABASE_URL)
) {
  console.error(
    "REFUSED: RESTORE_TEST_DATABASE_URL points at the working gym project. A restore would overwrite real data (D-56).",
  );
  process.exit(1);
}

/** Step 3: the backup, either from disk or from the private `backups` bucket. */
async function loadZip() {
  const index = process.argv.indexOf("--file");
  if (index >= 0 && process.argv[index + 1]) {
    return readFile(process.argv[index + 1]);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Pass --file, or configure the working project's keys.");

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: folders } = await admin.storage.from("backups").list("");
  const gym = folders?.[0]?.name;
  if (!gym) throw new Error("The backups bucket is empty.");
  const { data: files } = await admin.storage
    .from("backups")
    .list(gym, { limit: 100, sortBy: { column: "name", order: "desc" } });
  const newest = files?.[0]?.name;
  if (!newest) throw new Error(`No backup in backups/${gym}.`);
  console.log(`Newest backup: ${gym}/${newest}`);
  const { data, error } = await admin.storage
    .from("backups")
    .download(`${gym}/${newest}`);
  if (error || !data) throw new Error(`download: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** BR-163: every field of the export is quoted, and a bare empty field is null. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else inQuotes = false;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      quoted = true;
    } else if (ch === ",") {
      row.push(quoted ? field : null);
      field = "";
      quoted = false;
    } else if (ch === "\n") {
      row.push(quoted ? field : null);
      rows.push(row);
      row = [];
      field = "";
      quoted = false;
    } else if (ch !== "\r") field += ch;
  }
  if (row.length || field) row.push(quoted ? field : null);
  if (row.length) rows.push(row);
  return rows;
}

/**
 * `audit_log.id` is GENERATED ALWAYS AS IDENTITY, which refuses a value of its own
 * unless the insert says so; a restore must keep the identifiers it is restoring.
 */
async function alwaysIdentityTables(client) {
  const { rows } = await client.query(`
    select distinct c.relname::text as table_name
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and a.attidentity = 'a'
  `);
  return new Set(rows.map((row) => row.table_name));
}

/**
 * An array column (`shift_report_emails`, `backup_emails`) leaves the export as JSON,
 * because that is what `to_json` makes of it; Postgres wants its own literal back, so
 * those cells are parsed and handed over as JavaScript arrays, which node-postgres knows
 * how to send.
 */
async function arrayColumns(client) {
  const { rows } = await client.query(`
    select c.relname::text as table_name, a.attname::text as column_name
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public' and c.relkind = 'r'
      and a.attnum > 0 and not a.attisdropped and t.typcategory = 'A'
  `);
  const byTable = new Map();
  for (const row of rows) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, new Set());
    byTable.get(row.table_name).add(row.column_name);
  }
  return byTable;
}

/** Parents before children, so no insert ever waits on a row that is not there yet. */
async function loadOrder(client) {
  const { rows } = await client.query(`
    select c.relname::text as table_name,
           coalesce(array_agg(distinct pc.relname::text)
                    filter (where pc.relname is not null and pc.relname <> c.relname), '{}') as parents
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_constraint f on f.conrelid = c.oid and f.contype = 'f'
    left join pg_class pc on pc.oid = f.confrelid
      and pc.relnamespace = n.oid
    where n.nspname = 'public' and c.relkind = 'r'
    group by c.relname
  `);

  const parents = new Map(rows.map((r) => [r.table_name, r.parents]));
  const ordered = [];
  const seen = new Set();
  const visit = (table, trail) => {
    if (seen.has(table) || trail.has(table)) return;
    trail.add(table);
    for (const parent of parents.get(table) ?? []) visit(parent, trail);
    trail.delete(table);
    seen.add(table);
    ordered.push(table);
  };
  for (const table of parents.keys()) visit(table, new Set());
  return ordered;
}

const zip = await loadZip();
const files = readEncryptedZip(zip, password);
const manifest = JSON.parse(files.get("manifest.json").toString("utf8"));
console.log(
  `Backup of ${manifest.gym_name}, schema ${manifest.schema_version}, ${manifest.tables.length} tables, ${manifest.total_rows} rows.`,
);

// Step 2: the schema. `supabase db push` is the same command the working project uses.
const require = createRequire(import.meta.url);
const cli = require.resolve("supabase/dist/supabase.js");
const push = spawnSync(
  process.execPath,
  [cli, "db", "push", "--db-url", target, "--include-all"],
  { stdio: "inherit" },
);
if (push.status !== 0) {
  console.error("Applying the migrations to the test project failed.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: target,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120000,
});
await client.connect();

let mismatches = 0;
try {
  const order = await loadOrder(client);
  const alwaysIdentity = await alwaysIdentityTables(client);
  const arrays = await arrayColumns(client);

  await client.query("begin");
  // Step 4: an empty target, so a second run of the test starts from the same place.
  await client.query(
    `truncate table ${order.map((t) => `public.${t}`).join(", ")} cascade`,
  );

  // Step 5: Supabase Auth is not part of the backup (BR-163), but `staff` points at it.
  const staffCsv = files.get("staff.csv");
  if (staffCsv) {
    const rows = parseCsv(staffCsv.toString("utf8"));
    const header = rows[0];
    const userColumn = header.indexOf("user_id");
    for (const row of rows.slice(1)) {
      await client.query(
        `insert into auth.users (instance_id, id, aud, role, email)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2)
         on conflict (id) do nothing`,
        [row[userColumn], `restored-${row[userColumn]}@example.invalid`],
      );
    }
  }

  // Step 6: the data. Triggers are off, so the audit log is restored as it was rather
  // than filled with the restore itself.
  for (const table of order)
    await client.query(`alter table public.${table} disable trigger user`);

  const loaded = new Map();
  for (const table of order) {
    const csv = files.get(`${table}.csv`);
    if (!csv) continue;
    const rows = parseCsv(csv.toString("utf8"));
    const header = rows[0] ?? [];
    const body = rows.slice(1);
    if (!header.length) continue;

    const columns = header.map((c) => `"${c}"`).join(", ");
    const overriding = alwaysIdentity.has(table)
      ? " overriding system value"
      : "";
    for (let start = 0; start < body.length; start += 200) {
      const chunk = body.slice(start, start + 200);
      const values = [];
      const params = [];
      const arrayColumnsHere = arrays.get(table) ?? new Set();
      chunk.forEach((row, rowIndex) => {
        values.push(
          `(${row.map((_, i) => `$${rowIndex * header.length + i + 1}`).join(", ")})`,
        );
        params.push(
          ...row.map((value, i) =>
            value !== null && arrayColumnsHere.has(header[i])
              ? JSON.parse(value)
              : value,
          ),
        );
      });
      await client.query(
        `insert into public.${table} (${columns})${overriding} values ${values.join(", ")}`,
        params,
      );
    }
    loaded.set(table, body.length);
  }

  // The identity counters must continue past the restored rows, or the first new record
  // would collide with one that came out of the backup.
  const { rows: sequences } = await client.query(`
    select c.relname::text as table_name, a.attname::text as column_name
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and a.attidentity in ('a', 'd')
  `);
  for (const sequence of sequences)
    await client.query(
      `select setval(pg_get_serial_sequence($1, $2),
                     coalesce((select max(${sequence.column_name}) from public.${sequence.table_name}), 1))`,
      [`public.${sequence.table_name}`, sequence.column_name],
    );

  for (const table of order)
    await client.query(`alter table public.${table} enable trigger user`);
  await client.query("commit");

  // Step 7: the comparison the acceptance criterion asks for (US-28.1 AC2).
  console.log("\nTable                     manifest   restored");
  for (const entry of manifest.tables) {
    const { rows } = await client.query(
      `select count(*)::int as n from public.${entry.table}`,
    );
    const actual = rows[0].n;
    const ok = actual === entry.rows;
    if (!ok) mismatches += 1;
    console.log(
      `${entry.table.padEnd(24)} ${String(entry.rows).padStart(8)} ${String(actual).padStart(10)} ${ok ? "" : "  MISMATCH"}`,
    );
  }
  console.log(
    mismatches
      ? `\n${mismatches} table(s) do not match the manifest.`
      : "\nEvery table matches the manifest.",
  );
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`Restore failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}

if (mismatches) process.exitCode = 1;
