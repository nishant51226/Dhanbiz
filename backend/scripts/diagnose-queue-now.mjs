import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query(`SELECT set_config('app.is_admin', '1', true)`);

const summary = await c.query(`
  SELECT status::text, COUNT(1)::int c
  FROM jobs WHERE deleted_at IS NULL AND type='extraction'
  GROUP BY status ORDER BY status
`);

const pgboss = await c.query(`
  SELECT state, COUNT(1)::int c FROM pgboss.job
  WHERE name='extraction' GROUP BY state ORDER BY state
`);

const subs = await c.query(`SELECT event, name, created_on, updated_on FROM pgboss.subscription`);

const queuedDetail = await c.query(`
  SELECT j.id, j.status, j.percent_completed, j.pg_boss_job_id, j.error,
         j.result->>'pipelineCheckpoint' AS checkpoint,
         j.updated_at, f.name AS file_name,
         b.state AS pgboss_state, b.created_on, b.started_on,
         NOW() - COALESCE(b.started_on, b.created_on) AS age
  FROM jobs j
  LEFT JOIN files f ON f.id = j.file_id
  LEFT JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.deleted_at IS NULL AND j.type='extraction'
    AND j.status IN ('queued','processing')
  ORDER BY j.updated_at DESC
  LIMIT 20
`);

const stuck12 = await c.query(`
  SELECT j.id, j.status, j.percent_completed, j.pg_boss_job_id,
         j.result->>'pipelineCheckpoint' AS checkpoint,
         f.name, b.state AS pgboss_state
  FROM jobs j
  LEFT JOIN files f ON f.id = j.file_id
  LEFT JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.deleted_at IS NULL AND j.percent_completed >= 12
    AND j.status = 'queued'
  LIMIT 10
`);

const createdPgboss = await c.query(`
  SELECT b.id, b.state, b.created_on, NOW()-b.created_on AS age,
         b.data->>'jobId' AS job_id, j.status, j.percent_completed, f.name AS file_name
  FROM pgboss.job b
  LEFT JOIN jobs j ON j.id::text = b.data->>'jobId'
  LEFT JOIN files f ON f.id = j.file_id
  WHERE b.name='extraction' AND b.state='created'
  ORDER BY b.created_on ASC
  LIMIT 15
`);

const activePgboss = await c.query(`
  SELECT b.id, b.started_on, NOW()-b.started_on AS age,
         b.data->>'jobId' AS job_id, j.status, j.percent_completed, f.name AS file_name
  FROM pgboss.job b
  LEFT JOIN jobs j ON j.id::text = b.data->>'jobId'
  LEFT JOIN files f ON f.id = j.file_id
  WHERE b.name='extraction' AND b.state='active'
`);

const recentFailed = await c.query(`
  SELECT j.id, j.percent_completed, j.error, j.processing_duration_ms,
         f.name AS file_name, j.updated_at
  FROM jobs j
  LEFT JOIN files f ON f.id = j.file_id
  WHERE j.deleted_at IS NULL AND j.type='extraction' AND j.status='failed'
  ORDER BY j.updated_at DESC LIMIT 8
`);

const jobC06 = await c.query(`
  SELECT id, status, percent_completed, pg_boss_job_id, error,
         result->>'pipelineCheckpoint' AS checkpoint, processing_duration_ms, updated_at
  FROM jobs WHERE id='c06e2c9a-40d0-4c6c-a9b0-512ab5a4dcfc'
`);

console.log("=== jobs by status ===");
console.table(summary.rows);
console.log("\n=== pgboss extraction ===");
console.table(pgboss.rows);
console.log("\n=== subscriptions (workers) ===");
console.table(subs.rows);
console.log("\n=== queued/processing ===");
console.table(queuedDetail.rows);
console.log("\n=== queued at 12%+ ===");
console.table(stuck12.rows);
console.log("\n=== pgboss created (waiting pickup) ===");
console.table(createdPgboss.rows);
console.log("\n=== pgboss active ===");
console.table(activePgboss.rows);
console.log("\n=== recent failed ===");
for (const r of recentFailed.rows) {
  console.log(JSON.stringify({ name: r.file_name, pct: r.percent_completed, ms: r.processing_duration_ms, err: r.error?.slice(0, 120) }));
}
console.log("\n=== job c06e2c9a (from logs) ===");
console.table(jobC06.rows);

await c.end();
