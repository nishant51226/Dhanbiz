import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
const c = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
await c.connect();

const deleted = await c.query(`SELECT COUNT(1)::int AS n FROM jobs WHERE deleted_at IS NOT NULL`);
const allJobs = await c.query(`SELECT COUNT(1)::int AS n FROM jobs`);
const rls = await c.query(`
  SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class WHERE relname = 'jobs'
`);
const jobId = await c.query(`SELECT id, status, deleted_at, pg_boss_job_id FROM jobs WHERE id = $1`, [
  "3e8be1d9-35a4-490e-b9ec-e1ef5714fab3",
]);

const pgbossAll = await c.query(`
  SELECT state, COUNT(1)::int AS count FROM pgboss.job WHERE name='extraction' GROUP BY state ORDER BY state
`);
const created = await c.query(`
  SELECT id, created_on, NOW()-created_on AS age, data
  FROM pgboss.job WHERE name='extraction' AND state='created' ORDER BY created_on LIMIT 15
`);

const subCols = await c.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='pgboss' AND table_name='subscription' ORDER BY ordinal_position
`);
let subs = [];
if (subCols.rows.length) {
  const cols = subCols.rows.map((r) => r.column_name).join(", ");
  subs = (await c.query(`SELECT ${cols} FROM pgboss.subscription LIMIT 20`)).rows;
}

const recentPgboss = await c.query(`
  SELECT id, state, created_on, started_on, completed_on, data->>'jobId' AS job_id
  FROM pgboss.job WHERE name='extraction'
  ORDER BY created_on DESC LIMIT 15
`);

console.log("deleted jobs:", deleted.rows[0]);
console.log("all jobs (incl soft-deleted):", allJobs.rows[0]);
console.log("jobs RLS:", rls.rows[0]);
console.log("lookup job 3e8be1d9:", jobId.rows);
console.log("\npgboss extraction counts:");
console.table(pgbossAll.rows);
console.log("\ncreated (waiting pickup):", created.rows.length);
for (const r of created.rows) console.log(JSON.stringify({ id: r.id, age: r.age, jobId: r.data?.jobId }));
console.log("\nsubscription columns:", subCols.rows.map((r) => r.column_name));
console.log("\nsubscriptions:", subs);
console.log("\nrecent pgboss extraction:");
console.table(recentPgboss.rows);

await c.end();
