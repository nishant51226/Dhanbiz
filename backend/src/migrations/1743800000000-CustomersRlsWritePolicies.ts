import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `customers` originally had RLS only FOR SELECT (tenant_rls_isolation).
 * INSERT/UPDATE then had no permissive policy, so every INSERT failed with
 * "new row violates row-level security policy" even for admins.
 *
 * These policies align with `app.is_admin` / `app.customer_id` set by RlsTenantInterceptor.
 */
export class CustomersRlsWritePolicies1743800000000 implements MigrationInterface {
  name = "CustomersRlsWritePolicies1743800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'customers_rls_admin_insert'
        ) THEN
          CREATE POLICY customers_rls_admin_insert ON "customers"
          FOR INSERT
          WITH CHECK (current_setting('app.is_admin', true) = '1');
        END IF;
      END$$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'customers_rls_update'
        ) THEN
          CREATE POLICY customers_rls_update ON "customers"
          FOR UPDATE
          USING (
            current_setting('app.is_admin', true) = '1'
            OR id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
          )
          WITH CHECK (
            current_setting('app.is_admin', true) = '1'
            OR id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
          );
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS "customers_rls_update" ON "customers"`);
    await queryRunner.query(`DROP POLICY IF EXISTS "customers_rls_admin_insert" ON "customers"`);
  }
}
