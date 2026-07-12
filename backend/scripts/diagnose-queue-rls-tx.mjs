import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const c = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
await c.connect();

async function adminQuery(sql, params = []) {
  await c.query("BEGIN");
  await c.query(`SET LOCAL app.is_admin = '1'`);
  await c.query(`SET LOCAL app.customer_id = ''`);
  await c.query(`SET LOCAL app.user_id = ''`);
  const r = await c.query(sql, params);
  await c.query("COMMIT");
  return r;
}

const summary = await adminQuery(`
  SELECT status::text, COUNT(1)::int c
  FROM jobs WHERE deleted_at IS NULL AND type='extraction'
  GROUP BY status ORDER BY status
`);

const pgboss = await c.query(`
  SELECT state, COUNT(1)::int c FROM pgboss.job
  WHERE name='extraction' GROUP BY state ORDER BY state
`);

const subs = await c.query(`SELECT event, name, created_on, updated_on FROM pgboss.subscription`);

const queuedDetail = await adminQuery(`
  SELECT j.id, j.status, j.percent_completed, j.pg_boss_job_id,
         j.result->>'pipelineCheckpoint' AS checkpoint, j.error,
         j.updated_at, COALESCE(f.name, d.name, d.original_name) AS doc_name,
         b.state AS pgboss_state, b.created_on, b.started_on,
         EXTRACT(EPOCH FROM (NOW() - COALESCE(b.started_on, b.created_on)))::int AS age_sec
  FROM jobs j
  LEFT JOIN files f ON f.id = j.file_id
  LEFT JOIN documents d ON d.id = j.document_id
  LEFT JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.deleted_at IS NULL AND j.type='extraction'
    AND j.status IN ('queued','processing')
  ORDER BY j.updated_at DESC
  LIMIT 25
`);

const createdPgboss = await adminQuery(`
  SELECT b.id AS pgboss_id, b.created_on,
         EXTRACT(EPOCH FROM (NOW() - b.created_on))::int AS age_sec,
         b.data->>'jobId' AS job_id, j.status, j.percent_completed,
         COALESCE(f.name, d.name, d.original_name) AS doc_name
  FROM pgboss.job b
  LEFT JOIN jobs j ON j.id::text = b.data->>'jobId' AND j.deleted_at IS NULL
  LEFT JOIN files f ON f.id = j.file_id
  LEFT JOIN documents d ON d.id = j.document_id
  WHERE b.name='extraction' AND b.state='created'
  ORDER BY b.created_on ASC
  LIMIT 20
`);

const activePgboss = await adminQuery(`
  SELECT b.id AS pgboss_id, b.started_on,
         EXTRACT(EPOCH FROM (NOW() - b.started_on))::int AS active_sec,
         b.data->>'jobId' AS job_id, j.status, j.percent_completed,
         COALESCE(f.name, d.name, d.original_name) AS doc_name
  FROM pgboss.job b
  LEFT JOIN jobs j ON j.id::text = b.data->>'jobId' AND j.deleted_at IS NULL
  LEFT JOIN files f ON f.id = j.file_id
  LEFT JOIN documents d ON d.id = j.document_id
  WHERE b.name='extraction' AND b.state='active'
`);

const mismatches = await adminQuery(`
  SELECT j.id, j.status, j.percent_completed, j.pg_boss_job_id,
         COALESCE(f.name, d.name, d.original_name) AS doc_name,
         b.state AS pgboss_state,
         CASE
           WHEN j.status='queued' AND (j.pg_boss_job_id IS NULL OR b.id IS NULL OR b.state NOT IN ('created','active','retry'))
             THEN 'queued_no_live_pgboss'
           WHEN j.status='queued' AND b.state='created' THEN 'waiting_pickup'
           WHEN j.status='queued' AND b.state='active' THEN 'pgboss_active_but_db_queued'
           WHEN j.status='processing' AND b.state IS DISTINCT FROM 'active' THEN 'processing_no_active_pgboss'
           ELSE 'ok'
         END AS issue
  FROM jobs j
  LEFT JOIN files f ON f.id = j.file_id
  LEFT JOIN documents d ON d.id = j.document_id
  LEFT JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.deleted_at IS NULL AND j.type='extraction'
    AND j.status IN ('queued','processing')
  ORDER BY issue DESC, j.updated_at DESC
`);

const recentFailed = await adminQuery(`
  SELECT j.id, j.percent_completed, j.processing_duration_ms, j.error,
         COALESCE(f.name, d.name, d.original_name) AS doc_name
  FROM jobs j
  LEFT JOIN files f ON f.id = j.file_id
  LEFT JOIN documents d ON d.id = j.document_id
  WHERE j.deleted_at IS NULL AND j.type='extraction' AND j.status='failed'
  ORDER BY j.updated_at DESC LIMIT 10
`);

const jobC06 = await adminQuery(`
  SELECT id, status, percent_completed, pg_boss_job_id, error,
         result->>'pipelineCheckpoint' AS checkpoint, processing_duration_ms
  FROM jobs WHERE id='c06e2c9a-40d0-4c6c-a9b0-512ab5a4dcfc'
`);

console.log("=== jobs by status ===");
console.table(summary.rows);
console.log("\n=== pgboss ===");
console.table(pgboss.rows);
console.log("\n=== worker subscriptions ===");
console.table(subs.rows);
console.log("\n=== queued/processing ===");
console.table(queuedDetail.rows);
console.log("\n=== mismatches ===");
console.table(mismatches.rows);
console.log("\n=== pgboss created ===");
console.table(createdPgboss.rows);
console.log("\n=== pgboss active ===");
console.table(activePgboss.rows);
console.log("\n=== recent failed ===");
for (const r of recentFailed.rows) {
  console.log(JSON.stringify({ doc: r.doc_name, pct: r.percent_completed, ms: r.processing_duration_ms, err: (r.error || "").slice(0, 150) }));
}
console.log("\n=== c06e2c9a from logs ===");
console.table(jobC06.rows);

await c.end();
