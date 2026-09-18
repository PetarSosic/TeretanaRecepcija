import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import pg from "pg";

/**
 * A verified TLS connection to the hosted Postgres database (D-56).
 *
 * Supabase serves Postgres from its own private root CA, which Node does not trust by
 * default, so the public certificate is committed and pinned here instead of turning
 * certificate verification off.
 */
export async function connect() {
  nextEnv.loadEnvConfig(process.cwd());
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const ca = await readFile(
    resolve("scripts/certs/supabase-prod-ca-2021.crt"),
    "utf8",
  );
  const client = new pg.Client({
    connectionString,
    ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
  });
  await client.connect();
  return client;
}
