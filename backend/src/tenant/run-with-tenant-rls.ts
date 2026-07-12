import type { DataSource, EntityManager, QueryRunner } from "typeorm";
import {
  isRlsSessionDebugEnabled,
  logCustomersInsertPolicies,
  logRlsSessionSnapshot,
} from "./rls-session-debug.util";

/**
 * Runs work on a **fresh** pooled connection with its own top-level transaction so Postgres
 * session variables used by RLS (`app.*`) apply to the same connection as `fn` (avoids nested
 * transaction / savepoint issues when callers are already inside {@link RlsTenantInterceptor}'s
 * `runInTransaction`).
 *
 * For **admin** traffic we prefer `SET LOCAL app.is_admin = '1'` over `set_config(..., true)`:
 * some drivers / poolers do not keep transaction-local `set_config` aligned with subsequent
 * INSERTs on the same `QueryRunner`.
 */
async function withDedicatedQueryRunner<T>(
  dataSource: DataSource,
  applyGucs: (qr: QueryRunner) => Promise<void>,
  fn: (manager: EntityManager) => Promise<T>,
  debugContext?: string,
): Promise<T> {
  const tag = (debugContext ?? "withDedicatedQueryRunner").trim() || "withDedicatedQueryRunner";
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await applyGucs(queryRunner);
    if (isRlsSessionDebugEnabled()) {
      await logRlsSessionSnapshot(queryRunner, `${tag}:afterApplyGucs`);
      await logCustomersInsertPolicies(queryRunner, `${tag}:afterApplyGucs`);
    }
    const result = await fn(queryRunner.manager);
    if (isRlsSessionDebugEnabled()) {
      await logRlsSessionSnapshot(queryRunner, `${tag}:afterFnBeforeCommit`);
    }
    await queryRunner.commitTransaction();
    return result;
  } catch (err) {
    await queryRunner.rollbackTransaction();
    if (isRlsSessionDebugEnabled()) {
      // Aborted txn cannot run further SQL on the same connection; use a fresh runner for policy listing.
      // eslint-disable-next-line no-console
      console.warn(`[RLS-SESSION-DEBUG] ${tag}:error`, err instanceof Error ? err.message : err);
      const qr2 = dataSource.createQueryRunner();
      await qr2.connect();
      try {
        await logCustomersInsertPolicies(qr2, `${tag}:afterRollback`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[RLS-SESSION-DEBUG] ${tag}:afterRollback policy probe failed`, e);
      } finally {
        await qr2.release();
      }
    }
    throw err;
  } finally {
    await queryRunner.release();
  }
}

/**
 * Runs `fn` inside a transaction with Postgres session GUCs used by RLS policies
 * (`tenant_rls_isolation` in migrations). Background workers do not pass through
 * {@link RlsTenantInterceptor}, so any write to `customer_id`-scoped tables must
 * use this (or equivalent) on the same connection as the writes.
 */
export async function runWithTenantRls<T>(
  dataSource: DataSource,
  customerId: string,
  fn: (manager: EntityManager) => Promise<T>
): Promise<T> {
  const tenantId = customerId.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)
  ) {
    throw new Error("runWithTenantRls: customerId must be a UUID");
  }
  return withDedicatedQueryRunner(
    dataSource,
    async (qr) => {
      /** Match {@link runWithAdminRls}: SET LOCAL keeps GUCs aligned with INSERT under RLS on this connection. */
      await qr.query(`SET LOCAL app.is_admin = '0'`);
      await qr.query(`SET LOCAL app.customer_id = '${tenantId}'`);
      await qr.query(`SET LOCAL app.user_id = ''`);
    },
    fn,
    "runWithTenantRls",
  );
}

/**
 * Same as request-scoped admin traffic: `app.is_admin = 1` clears RLS for writes to
 * `files`, `jobs`, etc. Use for background work that is not tied to a tenant JWT
 * (e.g. {@link CustomersService.bootstrapCustomerS3RootFiles} after customer create).
 */
export async function runWithAdminRls<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
  debugContext?: string,
): Promise<T> {
  return withDedicatedQueryRunner(
    dataSource,
    async (qr) => {
      await qr.query(`SET LOCAL app.is_admin = '1'`);
      await qr.query(`SET LOCAL app.customer_id = ''`);
      await qr.query(`SET LOCAL app.user_id = ''`);
    },
    fn,
    debugContext ?? "runWithAdminRls",
  );
}
