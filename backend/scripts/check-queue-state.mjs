import pg from "pg";

const jobId = process.argv[2] || "";
const url = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL_ADMIN or DATABASE_URL");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN");
await c.query("SET LOCAL app.is_admin = '1'");

if (jobId) {
  const job = await c.query(
    `SELECT id, status, percent_completed, pg_boss_job_id, updated_at, error,
            result->>'pipelineCheckpoint' AS checkpoint,
            jsonb_array_length(COALESCE(result->'financialDocuments', '[]'::jsonb)) AS fd_count,
            jsonb_array_length(COALESCE(result->'segments', '[]'::jsonb)) AS segment_count
     FROM jobs WHERE id = $1`,
    [jobId]
  );
  console.log("JOB:", JSON.stringify(job.rows[0] ?? null, 2));
}

const recent = await c.query(
  `SELECT id, status, percent_completed, pg_boss_job_id, updated_at,
          result->>'pipelineCheckpoint' AS checkpoint
   FROM jobs WHERE type = 'extraction'
   ORDER BY updated_at DESC LIMIT 8`
);
console.log("RECENT EXTRACTION JOBS:", JSON.stringify(recent.rows, null, 2));

const boss = await c.query(
  `SELECT id, name, state, created_on, started_on, completed_on
   FROM pgboss.job WHERE name = 'extraction' ORDER BY created_on DESC LIMIT 8`
);
console.log("PGBOSS extraction:", JSON.stringify(boss.rows, null, 2));

const proc = await c.query(
  `SELECT id, status, percent_completed, updated_at, result->>'pipelineCheckpoint' AS checkpoint
   FROM jobs WHERE type = 'extraction' AND status IN ('processing', 'queued')
   ORDER BY updated_at DESC LIMIT 10`
);
console.log("ACTIVE EXTRACTION JOBS:", JSON.stringify(proc.rows, null, 2));

await c.query("COMMIT");
await c.end();
