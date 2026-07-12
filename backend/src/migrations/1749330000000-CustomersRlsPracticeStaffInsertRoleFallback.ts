import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Some staff logins carry `users.customer_id` (e.g. legacy / home-org linkage) while JWT `cid`
 * may still be null, or the prior policy's `EXISTS (users.customer_id IS NULL)` is too strict for
 * manager/accountant rows. Allow `customers` INSERT when `app.customer_id` is unset and the
 * actor either has no org row (`users.customer_id` null) or holds a manager/accountant role.
 * Portal sessions always set `app.customer_id`, so they cannot satisfy the first clause.
 */
export class CustomersRlsPracticeStaffInsertRoleFallback1749330000000 implements MigrationInterface {
  name = "CustomersRlsPracticeStaffInsertRoleFallback1749330000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("customers"))) return;

    await queryRunner.query(`DROP POLICY IF EXISTS "customers_rls_practice_staff_insert" ON "customers"`);

    await queryRunner.query(`
      CREATE POLICY customers_rls_practice_staff_insert ON "customers"
      FOR INSERT
      WITH CHECK (
        (NULLIF(current_setting('app.customer_id', true), '')) IS NULL
        AND (NULLIF(current_setting('app.user_id', true), '')) IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM "users" u
            WHERE u."id" = (NULLIF(current_setting('app.user_id', true), ''))::uuid
              AND u."customer_id" IS NULL
          )
          OR EXISTS (
            SELECT 1
            FROM "user_roles" ur
            INNER JOIN "roles" r ON r."id" = ur."role_id"
            WHERE ur."user_id" = (NULLIF(current_setting('app.user_id', true), ''))::uuid
              AND lower(r."name") IN ('manager', 'accountant')
          )
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("customers"))) return;

    await queryRunner.query(`DROP POLICY IF EXISTS "customers_rls_practice_staff_insert" ON "customers"`);

    await queryRunner.query(`
      CREATE POLICY customers_rls_practice_staff_insert ON "customers"
      FOR INSERT
      WITH CHECK (
        (NULLIF(current_setting('app.customer_id', true), '')) IS NULL
        AND (NULLIF(current_setting('app.user_id', true), '')) IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "users" u
          WHERE u."id" = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND u."customer_id" IS NULL
        )
      )
    `);
  }
}
