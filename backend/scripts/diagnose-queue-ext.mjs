import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url });
await c.connect();

const who = await c.query(`SELECT current_user, current_database()`);
console.log("=== DB ===");
console.log(who.rows[0]);

const jobTotals = await c.query(`
  SELECT COUNT(1)::int AS total FROM jobs WHERE deleted_at IS NULL
`);
console.log("\n=== jobs total (not deleted) ===");
console.log(jobTotals.rows[0]);

const byStatus = await c.query(`
  SELECT type::text, status::text, COUNT(1)::int AS count
  FROM jobs WHERE deleted_at IS NULL
  GROUP BY type, status ORDER BY type, status
`);
console.log("\n=== jobs by type/status ===");
console.table(byStatus.rows);

const pgbossLive = await c.query(`
  SELECT id, state, created_on, started_on, completed_on, data
  FROM pgboss.job
  WHERE name = 'extraction' AND state IN ('created', 'active', 'retry')
  ORDER BY created_on DESC
  LIMIT 20
`);
console.log("\n=== pgboss live extraction ===");
for (const r of pgbossLive.rows) {
  console.log(
    JSON.stringify({
      id: r.id,
      state: r.state,
      created: r.created_on,
      started: r.started_on,
      jobId: r.data?.jobId,
      customerId: r.data?.customerId,
    }),
  );
}

const activeDetail = await c.query(`
  SELECT b.id AS pgboss_id, b.state, b.started_on, NOW() - b.started_on AS active_for,
         j.id AS job_id, j.status, j.percent_completed, j.updated_at
  FROM pgboss.job b
  LEFT JOIN jobs j ON j.pg_boss_job_id = b.id::text AND j.deleted_at IS NULL
  WHERE b.name = 'extraction' AND b.state = 'active'
`);
console.log("\n=== active pg-boss + app job join ===");
console.table(activeDetail.rows);

const mismatch = await c.query(`
  SELECT j.id, j.status, j.pg_boss_job_id, j.percent_completed, j.updated_at,
         b.state AS pgboss_state,
         CASE
           WHEN j.status = 'queued' AND (j.pg_boss_job_id IS NULL OR b.id IS NULL OR b.state NOT IN ('created','active','retry'))
             THEN 'queued_without_live_pgboss'
           WHEN j.status = 'processing' AND (j.pg_boss_job_id IS NULL OR b.state IS DISTINCT FROM 'active')
             THEN 'processing_without_active_pgboss'
           ELSE NULL
         END AS issue
  FROM jobs j
  LEFT JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.type = 'extraction' AND j.deleted_at IS NULL
    AND j.status IN ('queued', 'processing')
  ORDER BY j.updated_at DESC
`);
console.log("\n=== queued/processing extraction jobs ===");
console.table(mismatch.rows);

const subs = await c.query(`
  SELECT name, event, options, created_on, updated_on
  FROM pgboss.subscription
  ORDER BY updated_on DESC NULLS LAST
  LIMIT 20
`).catch((e) => ({ rows: [{ error: e.message }] }));

console.log("\n=== pgboss subscriptions (workers) ===");
console.table(subs.rows);

const version = await c.query(`SELECT version FROM pgboss.version LIMIT 1`).catch(() => ({ rows: [] }));
console.log("\n=== pgboss version ===");
console.log(version.rows[0] ?? "n/a");

await c.end();
