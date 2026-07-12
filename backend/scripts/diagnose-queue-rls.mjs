import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
const c = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
await c.connect();

const bypass = await c.query(`
  SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
`);

await c.query(`SELECT set_config('app.is_admin', 'true', true)`);

const withAdmin = await c.query(`
  SELECT COUNT(1)::int AS total FROM jobs WHERE deleted_at IS NULL
`);
const byStatus = await c.query(`
  SELECT type::text, status::text, COUNT(1)::int AS count
  FROM jobs WHERE deleted_at IS NULL GROUP BY type, status ORDER BY 1,2
`);

const queued = await c.query(`
  SELECT j.id, j.status, j.percent_completed, j.pg_boss_job_id, j.updated_at,
         b.state AS pgboss_state, b.created_on, b.started_on,
         NOW() - COALESCE(b.started_on, b.created_on) AS wait_age
  FROM jobs j
  LEFT JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.type = 'extraction' AND j.deleted_at IS NULL
    AND j.status IN ('queued', 'processing')
  ORDER BY j.updated_at DESC
  LIMIT 30
`);

const staleCreated = await c.query(`
  SELECT j.id, j.status, j.pg_boss_job_id, b.state, b.created_on,
         NOW() - b.created_on AS age
  FROM jobs j
  INNER JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.type = 'extraction' AND j.status = 'queued' AND j.deleted_at IS NULL
    AND b.name = 'extraction' AND b.state = 'created'
  ORDER BY b.created_on ASC
`);

const zombie = await c.query(`
  SELECT j.id, j.status, j.percent_completed, j.pg_boss_job_id, j.updated_at,
         b.state, b.started_on, NOW() - b.started_on AS active_age
  FROM jobs j
  INNER JOIN pgboss.job b ON b.id::text = j.pg_boss_job_id
  WHERE j.type = 'extraction' AND j.deleted_at IS NULL
    AND j.status = 'processing' AND b.state = 'active'
`);

const orphanActive = await c.query(`
  SELECT b.id, b.state, b.started_on, NOW()-b.started_on AS active_age, b.data
  FROM pgboss.job b
  WHERE b.name='extraction' AND b.state='active'
    AND NOT EXISTS (
      SELECT 1 FROM jobs j WHERE j.pg_boss_job_id = b.id::text AND j.deleted_at IS NULL
    )
`);

console.log("role:", bypass.rows[0]);
console.log("jobs with app.is_admin=true:", withAdmin.rows[0]);
console.table(byStatus.rows);
console.log("\n=== queued/processing ===");
console.table(queued.rows);
console.log("\n=== queued + pgboss created ===");
console.table(staleCreated.rows);
console.log("\n=== processing + pgboss active ===");
console.table(zombie.rows);
console.log("\n=== orphan pgboss active (no jobs row) ===");
for (const r of orphanActive.rows) {
  console.log(JSON.stringify({ id: r.id, active_age: r.active_age, jobId: r.data?.jobId }));
}

await c.end();
