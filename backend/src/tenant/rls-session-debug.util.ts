import type { QueryRunner } from "typeorm";

/**
 * Opt-in Postgres RLS session diagnostics. Set in `.env`:
 *
 * `DOC_PARSER_RLS_DEBUG=1`
 *
 * Logs `[RLS-SESSION-DEBUG]` lines (GUC snapshot, optional `pg_policies` for `customers` INSERT).
 */
export function isRlsSessionDebugEnabled(): boolean {
  const v = (process.env.DOC_PARSER_RLS_DEBUG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Snapshot of `app.*` GUCs as seen on this `QueryRunner`'s connection (inside the open transaction). */
export async function logRlsSessionSnapshot(qr: QueryRunner, context: string): Promise<void> {
  if (!isRlsSessionDebugEnabled()) return;
  try {
    const rows = await qr.query(`
      SELECT
        current_setting('app.is_admin', true) AS app_is_admin,
        current_setting('app.customer_id', true) AS app_customer_id,
        current_setting('app.user_id', true) AS app_user_id,
        current_setting('row_security', true) AS row_security,
        pg_backend_pid() AS backend_pid
    `);
    // eslint-disable-next-line no-console
    console.warn(`[RLS-SESSION-DEBUG] ${context}`, rows?.[0] ?? rows);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[RLS-SESSION-DEBUG] ${context} snapshot failed`, e);
  }
}

/** Lists `pg_policies` rows for `customers` INSERT (verifies `customers_rls_admin_insert` exists). */
export async function logCustomersInsertPolicies(qr: QueryRunner, context: string): Promise<void> {
  if (!isRlsSessionDebugEnabled()) return;
  try {
    const rows = await qr.query(`
      SELECT policyname, permissive::text AS permissive, cmd, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'customers' AND cmd = 'INSERT'
      ORDER BY policyname
    `);
    // eslint-disable-next-line no-console
    console.warn(`[RLS-SESSION-DEBUG] ${context} pg_policies(customers,INSERT)`, rows);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[RLS-SESSION-DEBUG] ${context} pg_policies query failed`, e);
  }
}
