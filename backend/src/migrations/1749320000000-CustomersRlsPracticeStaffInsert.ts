import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Practice staff (`users.customer_id` null) could not INSERT into `customers`: only
 * `customers_rls_admin_insert` existed. Align RLS with Nest `customer:write` for new customers.
 * Portal JWTs set `app.customer_id`; this policy requires it unset/empty so org-scoped users cannot insert.
 */
export class CustomersRlsPracticeStaffInsert1749320000000 implements MigrationInterface {
  name = "CustomersRlsPracticeStaffInsert1749320000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("customers"))) return;

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'customers_rls_practice_staff_insert'
        ) THEN
          CREATE POLICY customers_rls_practice_staff_insert ON "customers"
          FOR INSERT
          WITH CHECK (
            (NULLIF(current_setting('app.customer_id', true), '')) IS NULL
            AND (NULLIF(current_setting('app.user_id', true), '')) IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM users u
              WHERE u.id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
                AND u.customer_id IS NULL
            )
          );
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("customers"))) return;
    await queryRunner.query(`DROP POLICY IF EXISTS "customers_rls_practice_staff_insert" ON "customers"`);
  }
}
