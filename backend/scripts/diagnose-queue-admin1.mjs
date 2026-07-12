import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
const c = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
await c.connect();
await c.query(`SELECT set_config('app.is_admin', '1', true)`);

const counts = await c.query(`
  SELECT 'customers' t, COUNT(1)::int n FROM customers
  UNION ALL SELECT 'jobs', COUNT(1)::int FROM jobs WHERE deleted_at IS NULL
  UNION ALL SELECT 'queued', COUNT(1)::int FROM jobs WHERE deleted_at IS NULL AND status='queued'
  UNION ALL SELECT 'processing', COUNT(1)::int FROM jobs WHERE deleted_at IS NULL AND status='processing'
`);
const byStatus = await c.query(`
  SELECT type::text, status::text, COUNT(1)::int c
  FROM jobs WHERE deleted_at IS NULL GROUP BY 1,2 ORDER BY 1,2
`);
const live = await c.query(`
  SELECT j.id, j.status, j.percent_completed, j.pg_boss_job_id, j.updated_at,
         b.state AS pgboss_state, b.created_on, b.started_on
  FROM jobs j
  LEFT JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.deleted_at IS NULL AND j.type='extraction'
    AND j.status IN ('queued','processing')
  ORDER BY j.updated_at DESC
  LIMIT 30
`);
const pgboss = await c.query(`
  SELECT state, COUNT(1)::int c FROM pgboss.job WHERE name='extraction' GROUP BY state
`);

console.table(counts.rows);
console.table(byStatus.rows);
console.log("queued/processing detail:");
console.table(live.rows);
console.log("pgboss:");
console.table(pgboss.rows);
await c.end();
