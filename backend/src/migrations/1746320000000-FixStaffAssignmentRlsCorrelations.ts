import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Fixes correlated subquery references in staff-assignment RLS policies.
 *
 * Previous policies used unqualified outer columns (`id`, `customer_id`) inside subqueries,
 * which could bind to inner `staff_customer_assignments` columns instead of target-table columns.
 */
export class FixStaffAssignmentRlsCorrelations1746320000000 implements MigrationInterface {
  name = "FixStaffAssignmentRlsCorrelations1746320000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const customerIdTables = [
      "files",
      "jobs",
      "invoices",
      "invoice_lines",
      "statements",
      "statement_lines",
      "financial_documents",
      "extraction_segments",
      "ai_executions",
      "folders",
    ];

    for (const table of customerIdTables) {
      await queryRunner.query(`DROP POLICY IF EXISTS "staff_assignment_access" ON "${table}"`);
      await queryRunner.query(`
        CREATE POLICY staff_assignment_access ON "${table}"
        FOR ALL
        USING (
          EXISTS (
            SELECT 1
            FROM staff_customer_assignments sca
            WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
              AND sca.customer_id = "${table}".customer_id
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM staff_customer_assignments sca
            WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
              AND sca.customer_id = "${table}".customer_id
          )
        )
      `);
    }

    await queryRunner.query(`DROP POLICY IF EXISTS "staff_assignment_select_access" ON "customers"`);
    await queryRunner.query(`DROP POLICY IF EXISTS "staff_assignment_update_access" ON "customers"`);
    await queryRunner.query(`
      CREATE POLICY staff_assignment_select_access ON "customers"
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM staff_customer_assignments sca
          WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND sca.customer_id = "customers".id
        )
      )
    `);
    await queryRunner.query(`
      CREATE POLICY staff_assignment_update_access ON "customers"
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM staff_customer_assignments sca
          WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND sca.customer_id = "customers".id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM staff_customer_assignments sca
          WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND sca.customer_id = "customers".id
        )
      )
    `);

    await queryRunner.query(`DROP POLICY IF EXISTS "staff_assignment_access" ON "documents"`);
    await queryRunner.query(`
      CREATE POLICY staff_assignment_access ON "documents"
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM folders f
          INNER JOIN staff_customer_assignments sca ON sca.customer_id = f.customer_id
          WHERE f.id = documents.folder_id
            AND sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM folders f
          INNER JOIN staff_customer_assignments sca ON sca.customer_id = f.customer_id
          WHERE f.id = documents.folder_id
            AND sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
        )
      )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op by design; avoid relaxing RLS in rollback.
  }
}
