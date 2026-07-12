import { MigrationInterface, QueryRunner } from "typeorm";

export class AllowGlobalFolderReadsForCustomerScope1749290000000 implements MigrationInterface {
  name = "AllowGlobalFolderReadsForCustomerScope1749290000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS "tenant_rls_isolation" ON "folders"`);
    await queryRunner.query(`
      CREATE POLICY tenant_rls_isolation ON "folders"
      FOR ALL
      USING (
        current_setting('app.is_admin', true) = '1'
        OR (
          "customer_id" IS NOT NULL
          AND "customer_id" = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
        )
        OR (
          "customer_id" IS NULL
          AND "is_global" = true
        )
      )
      WITH CHECK (
        current_setting('app.is_admin', true) = '1'
        OR (
          "customer_id" IS NOT NULL
          AND "customer_id" = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
        )
      )
    `);

    await queryRunner.query(`DROP POLICY IF EXISTS "staff_assignment_access" ON "folders"`);
    await queryRunner.query(`
      CREATE POLICY staff_assignment_access ON "folders"
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM staff_customer_assignments sca
          WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND folders.customer_id IS NOT NULL
            AND sca.customer_id = folders.customer_id
        )
        OR (
          folders.customer_id IS NULL
          AND folders.is_global = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM staff_customer_assignments sca
          WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND folders.customer_id IS NOT NULL
            AND sca.customer_id = folders.customer_id
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS "staff_assignment_access" ON "folders"`);
    await queryRunner.query(`
      CREATE POLICY staff_assignment_access ON "folders"
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM staff_customer_assignments sca
          WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND folders.customer_id IS NOT NULL
            AND sca.customer_id = folders.customer_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM staff_customer_assignments sca
          WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND folders.customer_id IS NOT NULL
            AND sca.customer_id = folders.customer_id
        )
      )
    `);

    await queryRunner.query(`DROP POLICY IF EXISTS "tenant_rls_isolation" ON "folders"`);
    await queryRunner.query(`
      CREATE POLICY tenant_rls_isolation ON "folders"
      FOR ALL
      USING (
        current_setting('app.is_admin', true) = '1'
        OR (
          "customer_id" IS NOT NULL
          AND "customer_id" = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
        )
      )
      WITH CHECK (
        current_setting('app.is_admin', true) = '1'
        OR (
          "customer_id" IS NOT NULL
          AND "customer_id" = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
        )
      )
    `);
  }
}
