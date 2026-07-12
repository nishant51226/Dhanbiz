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

const failed = await adminQuery(`
  SELECT j.id, j.status, j.percent_completed, j.error,
         j.document_id, j.file_id,
         f.name AS file_name, f.s3_key AS file_s3_key,
         f.storage_relative_path AS file_local,
         d.name AS doc_name, d.s3_key AS doc_s3_key, d.file_url AS doc_file_url,
         d.original_name
  FROM jobs j
  LEFT JOIN files f ON f.id = j.file_id
  LEFT JOIN documents d ON d.id = j.document_id
  WHERE j.deleted_at IS NULL
    AND j.status = 'failed'
    AND j.error ILIKE '%specified key does not exist%'
  ORDER BY j.updated_at DESC
  LIMIT 12
`);

console.log("=== failed with S3 key missing ===");
for (const r of failed.rows) {
  console.log(JSON.stringify({
    job: r.id,
    pct: r.percent_completed,
    fileId: r.file_id,
    docId: r.document_id,
    name: r.doc_name || r.file_name || r.original_name,
    file_s3: r.file_s3_key,
    file_local: r.file_local,
    doc_s3: r.doc_s3_key,
    doc_url: r.doc_file_url,
    err: r.error,
  }, null, 0));
}

await c.end();
