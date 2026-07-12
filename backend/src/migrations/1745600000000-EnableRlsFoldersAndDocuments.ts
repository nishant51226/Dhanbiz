import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Row-level security for customer-scoped library tables (matches `files` / `jobs` policies).
 */
export class EnableRlsFoldersAndDocuments1745600000000 implements MigrationInterface {
  name = "EnableRlsFoldersAndDocuments1745600000000";

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

    const defFolders = `
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

    const defDocuments = `
      FOR ALL
      USING (
        current_setting('app.is_admin', true) = '1'
        OR EXISTS (
          SELECT 1 FROM folders f
          WHERE f.id = documents.folder_id
            AND f.customer_id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
        )
      )
      WITH CHECK (
        current_setting('app.is_admin', true) = '1'
        OR EXISTS (
          SELECT 1 FROM folders f
          WHERE f.id = documents.folder_id
            AND f.customer_id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
        )
      )
    `;

    await queryRunner.query(`ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "folders" FORCE ROW LEVEL SECURITY`);
    await createIfNotExists("folders", "tenant_rls_isolation", defFolders);

    await queryRunner.query(`ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "documents" FORCE ROW LEVEL SECURITY`);
    await createIfNotExists("documents", "tenant_rls_isolation", defDocuments);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentional no-op: avoid weakening RLS in rollback.
  }
}
