import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL_ADMIN or DATABASE_URL");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url });
await c.connect();

const counts = await c.query(`
  SELECT name, state, COUNT(*)::int AS count
  FROM pgboss.job
  WHERE name = 'extraction'
  GROUP BY name, state
  ORDER BY state
`);
console.log("=== PGBOSS extraction by state ===");
console.table(counts.rows);

const activeJobs = await c.query(`
  SELECT j.id, j.status, j.percent_completed, j.pg_boss_job_id, j.updated_at,
         b.state AS pgboss_state, b.started_on, b.created_on,
         CASE
           WHEN j.status = 'queued' AND (j.pg_boss_job_id IS NULL OR b.id IS NULL OR b.state NOT IN ('created','active','retry'))
             THEN 'queued_without_live_pgboss'
           WHEN j.status = 'processing' AND (j.pg_boss_job_id IS NULL OR b.state IS DISTINCT FROM 'active')
             THEN 'processing_without_active_pgboss'
           WHEN j.status IN ('completed','failed','cancelled') AND b.state IN ('created','active','retry')
             THEN 'terminal_with_live_pgboss'
           ELSE NULL
         END AS issue
  FROM jobs j
  LEFT JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.type = 'extraction' AND j.deleted_at IS NULL
    AND j.status IN ('queued','processing')
  ORDER BY j.updated_at DESC
  LIMIT 25
`);
console.log("\n=== QUEUED/PROCESSING jobs + pg-boss ===");
for (const r of activeJobs.rows) {
  console.log(JSON.stringify(r, null, 0));
}

const staleCreated = await c.query(`
  SELECT j.id, j.status, j.pg_boss_job_id, b.state,
         b.created_on, NOW() - b.created_on AS age
  FROM jobs j
  INNER JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.type = 'extraction' AND j.status = 'queued' AND j.deleted_at IS NULL
    AND b.name = 'extraction' AND b.state = 'created'
  ORDER BY b.created_on ASC
  LIMIT 15
`);
console.log("\n=== QUEUED + pgboss created (waiting pickup) ===");
console.table(staleCreated.rows);

const processing = await c.query(`
  SELECT j.id, j.status, j.percent_completed, j.pg_boss_job_id, j.updated_at,
         b.state AS pgboss_state, b.started_on
  FROM jobs j
  LEFT JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.type = 'extraction' AND j.status = 'processing' AND j.deleted_at IS NULL
`);
console.log("\n=== PROCESSING jobs ===");
console.table(processing.rows);

const recentDone = await c.query(`
  SELECT j.id, j.status, j.percent_completed, j.updated_at
  FROM jobs j
  WHERE j.type = 'extraction' AND j.deleted_at IS NULL
  ORDER BY j.updated_at DESC
  LIMIT 10
`);
console.log("\n=== Recent 10 extraction jobs ===");
console.table(recentDone.rows);

await c.end();
