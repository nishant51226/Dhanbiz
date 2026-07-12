import { MigrationInterface, QueryRunner } from "typeorm";

export class EnableRlsPolicies_1733159400000 implements MigrationInterface {
  name = "EnableRlsPolicies_1733159400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Helper blocks to create idempotent policies
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

    // Admin bypass OR tenant match (customer_id tables)
    const defAll = `
      FOR ALL
      USING (
        current_setting('app.is_admin', true) = '1'
        OR customer_id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
      )
      WITH CHECK (
        current_setting('app.is_admin', true) = '1'
        OR customer_id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
      )
    `;
    // Customers table (id is the tenant key) — reads only
    const defCustomers = `
      FOR SELECT
      USING (
        current_setting('app.is_admin', true) = '1'
        OR id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
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
    ];

    // Enable + force RLS everywhere
    await queryRunner.query(`ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "customers" FORCE ROW LEVEL SECURITY`);
    await createIfNotExists("customers", "tenant_rls_isolation", defCustomers);

    for (const t of customerIdTables) {
      await queryRunner.query(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY`);
      await createIfNotExists(t, "tenant_rls_isolation", defAll);
    }
  }

  // We intentionally keep RLS on; down would require dropping policies.
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: avoid dropping security policies in down migration
  }
}

