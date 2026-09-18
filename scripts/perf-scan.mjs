// M-07 "done when" (doc 09) and doc 08 §9: scan_card p95 ≤ 300 ms with 3,000 members and
// 150,000 visits. Everything is generated inside one transaction on the hosted database
// and rolled back at the end (D-56), so no row survives the run.
//
// Usage: npm run perf:scan [-- <migration files to apply first, for a dry run>]
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { connect } from "./pg-client.mjs";

const MEMBERS = 3000;
const VISITS = 150000;
const SCANS = 300;

const client = await connect();
if (!client) {
  console.error("Scan benchmark BLOCKED: set DATABASE_URL in .env.local.");
  process.exit(1);
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
};

try {
  await client.query("BEGIN");
  // Generating the data takes longer than the 30 s the shared client allows a statement.
  await client.query("set local statement_timeout = 0");
  for (const file of process.argv.slice(2))
    await client.query(
      await readFile(resolve("supabase/migrations", file), "utf8"),
    );

  const started = performance.now();
  await client.query(`
    insert into auth.users (id, email) values ('99999999-0000-0000-0000-00000000a001', null);
    insert into gyms (id, name) values ('99999999-0000-0000-0000-00000000b001', 'Perf');
    insert into gym_settings (gym_id) values ('99999999-0000-0000-0000-00000000b001');
    insert into staff (id, gym_id, user_id, role, full_name, username)
    values ('99999999-0000-0000-0000-00000000c001', '99999999-0000-0000-0000-00000000b001',
            '99999999-0000-0000-0000-00000000a001', 'receptionist', 'Perf', 'perf.recepcija');
    insert into shifts (gym_id, staff_id)
    values ('99999999-0000-0000-0000-00000000b001', '99999999-0000-0000-0000-00000000c001');
    insert into trainers (id, gym_id, full_name)
    values ('99999999-0000-0000-0000-00000000d001', '99999999-0000-0000-0000-00000000b001', 'Perf Trener');
    insert into programs (id, gym_id, name, kind)
    values ('99999999-0000-0000-0000-00000000e001', '99999999-0000-0000-0000-00000000b001', 'Perf Grupni', 'group');
    insert into trainer_programs (gym_id, trainer_id, program_id)
    values ('99999999-0000-0000-0000-00000000b001', '99999999-0000-0000-0000-00000000d001',
            '99999999-0000-0000-0000-00000000e001');
    insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                       covers_gym, covers_group, group_session_limit, requires_trainer) values
      ('99999999-0000-0000-0000-00000000f001', '99999999-0000-0000-0000-00000000b001',
       'Perf Mjesečna', 'gym', 1, 'month', 79, true, false, null, false),
      ('99999999-0000-0000-0000-00000000f002', '99999999-0000-0000-0000-00000000b001',
       'Perf G+T', 'combo', 1, 'month', 99, true, true, 12, true);
    insert into card_batches (id, gym_id, quantity, created_by)
    values ('99999999-0000-0000-0000-000000010001', '99999999-0000-0000-0000-00000000b001', 100,
            '99999999-0000-0000-0000-00000000c001');

    insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                         date_of_birth, created_by)
    select gen_random_uuid(), '99999999-0000-0000-0000-00000000b001', n, 'Perf', 'Član ' || n,
           '+382' || (60000000 + n), 'perf' || n || '@perf.invalid', '1990-01-01',
           '99999999-0000-0000-0000-00000000c001'
    from generate_series(1, ${MEMBERS}) n;

    insert into cards (gym_id, code, batch_id, status, member_id, assigned_at)
    select gym_id, '8' || lpad(member_number::text, 9, '0'),
           '99999999-0000-0000-0000-000000010001', 'active', id, now()
    from members where gym_id = '99999999-0000-0000-0000-00000000b001';

    -- Twelve months of history per member, the current month running; every third member
    -- holds a G+T so S-03a's options are computed as well as the plain gym path.
    insert into memberships (gym_id, member_id, plan_id, trainer_id, start_date, end_date,
                             start_reason, covers_gym, covers_group, covers_personal,
                             group_session_limit, is_backdated, created_by)
    select m.gym_id, m.id,
           case when m.member_number % 3 = 0 then '99999999-0000-0000-0000-00000000f002'::uuid
                else '99999999-0000-0000-0000-00000000f001'::uuid end,
           case when m.member_number % 3 = 0 then '99999999-0000-0000-0000-00000000d001'::uuid end,
           current_date - (k * 30 + 10), current_date - (k * 30 - 20), 'perf',
           true, m.member_number % 3 = 0, false,
           case when m.member_number % 3 = 0 then 12 end, true,
           '99999999-0000-0000-0000-00000000c001'
    from members m, generate_series(0, 11) k
    where m.gym_id = '99999999-0000-0000-0000-00000000b001';

    insert into visits (gym_id, member_id, membership_id, visit_type, checked_in_at,
                        checked_out_at, checked_in_by, is_backdated)
    select '99999999-0000-0000-0000-00000000b001', m.id, null, 'gym',
           now() - (v % 365) * interval '1 day' - interval '2 hours',
           now() - (v % 365) * interval '1 day' - interval '1 hour',
           '99999999-0000-0000-0000-00000000c001', true
    from generate_series(1, ${VISITS}) v
    join members m on m.gym_id = '99999999-0000-0000-0000-00000000b001'
                  and m.member_number = (v % ${MEMBERS}) + 1;

    analyze members; analyze cards; analyze memberships; analyze visits;
  `);
  console.log(
    `Generated ${MEMBERS} members and ${VISITS} visits in ${((performance.now() - started) / 1000).toFixed(1)} s`,
  );

  // Server time, measured inside Postgres, excludes the network.
  await client.query(`
    create function pg_temp.time_scan(p_code text) returns numeric language plpgsql as $$
    declare t timestamptz := clock_timestamp();
    begin
      perform scan_card(p_code);
      return extract(epoch from clock_timestamp() - t) * 1000;
    end $$;
  `);
  await client.query(
    `set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-00000000a001"}'`,
  );
  await client.query("set local role authenticated");

  const server = [];
  const roundTrip = [];
  for (let i = 0; i < SCANS; i++) {
    // Distinct members: every scan is a full check-in, the heaviest path.
    const code = `8${String(((i * 7919) % MEMBERS) + 1).padStart(9, "0")}`;
    const t = performance.now();
    const { rows } = await client.query("select pg_temp.time_scan($1) as ms", [
      code,
    ]);
    roundTrip.push(performance.now() - t);
    server.push(Number(rows[0].ms));
  }
  const fmt = (values) =>
    `p50 ${percentile(values, 50).toFixed(1)} ms, p95 ${percentile(values, 95).toFixed(1)} ms, max ${Math.max(...values).toFixed(1)} ms`;
  console.log(`scan_card server time (${SCANS} scans): ${fmt(server)}`);
  console.log(`scan_card round trip from this machine: ${fmt(roundTrip)}`);
  const p95 = percentile(server, 95);
  console.log(
    p95 <= 300 ? "PASS: p95 ≤ 300 ms (doc 08 §9)" : "FAIL: p95 > 300 ms",
  );
  if (p95 > 300) process.exitCode = 1;
} catch (error) {
  console.error(`Scan benchmark failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.query("ROLLBACK");
  await client.end();
}
