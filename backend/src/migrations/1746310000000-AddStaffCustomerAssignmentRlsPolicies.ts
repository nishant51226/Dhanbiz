import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Enables manager-style scoped access using `staff_customer_assignments`.
 * Policies remain additive to existing tenant/admin policies.
 */
export class AddStaffCustomerAssignmentRlsPolicies1746310000000 implements MigrationInterface {
  name = "AddStaffCustomerAssignmentRlsPolicies1746310000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const createIfNotExists = async (table: string, policy: string, definition: string) => {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = '${table}' AND policyname = '${policy}'
          ) THEN
            EXECUTE $POLICY$
              CREATE POLICY ${policy} ON "${table}"
              ${definition}
            $POLICY$;
          END IF;
        END$$;
      `);
    };

    const assignmentCheckForCustomerId = `
      EXISTS (
        SELECT 1
        FROM staff_customer_assignments sca
        WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
          AND sca.customer_id = customer_id
      )
    `;

    const assignmentCheckForCustomerPk = `
      EXISTS (
        SELECT 1
        FROM staff_customer_assignments sca
        WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
          AND sca.customer_id = id
      )
    `;

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
      await createIfNotExists(
        table,
        "staff_assignment_access",
        `
          FOR ALL
          USING (${assignmentCheckForCustomerId})
          WITH CHECK (${assignmentCheckForCustomerId})
        `,
      );
    }

    await createIfNotExists(
      "customers",
      "staff_assignment_select_access",
      `
        FOR SELECT
        USING (${assignmentCheckForCustomerPk})
      `,
    );

    await createIfNotExists(
      "customers",
      "staff_assignment_update_access",
      `
        FOR UPDATE
        USING (${assignmentCheckForCustomerPk})
        WITH CHECK (${assignmentCheckForCustomerPk})
      `,
    );

    await createIfNotExists(
      "documents",
      "staff_assignment_access",
      `
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
      `,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op by design to avoid unintentionally relaxing RLS.
  }
}
