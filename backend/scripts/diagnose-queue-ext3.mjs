import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
const c = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
await c.connect();
await c.query(`SELECT set_config('app.is_admin', 'true', true)`);

const counts = await c.query(`
  SELECT 'customers' AS t, COUNT(1)::int AS n FROM customers
  UNION ALL SELECT 'documents', COUNT(1)::int FROM documents
  UNION ALL SELECT 'files', COUNT(1)::int FROM files
  UNION ALL SELECT 'jobs_all', COUNT(1)::int FROM jobs
  UNION ALL SELECT 'jobs_not_deleted', COUNT(1)::int FROM jobs WHERE deleted_at IS NULL
  UNION ALL SELECT 'jobs_deleted', COUNT(1)::int FROM jobs WHERE deleted_at IS NOT NULL
`);

const policies = await c.query(`
  SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS qual
  FROM pg_policy WHERE polrelid = 'jobs'::regclass
`);

const activeNow = await c.query(`
  SELECT id, state, started_on, NOW()-started_on AS age, data->>'jobId' AS job_id
  FROM pgboss.job WHERE name='extraction' AND state='active'
`);

const subs = await c.query(`SELECT event, name, created_on, updated_on FROM pgboss.subscription`);

console.table(counts.rows);
console.log("\njobs RLS policies:");
for (const p of policies.rows) console.log(p.polname, p.polcmd, p.qual?.slice(0, 120));
console.log("\nactive pgboss now:");
console.table(activeNow.rows);
console.log("\nsubscriptions:", subs.rows.length);
console.table(subs.rows);

await c.end();
