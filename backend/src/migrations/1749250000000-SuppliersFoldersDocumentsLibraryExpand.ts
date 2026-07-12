import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Library schema expansion:
 * - `suppliers` per customer (name + default flag).
 * - `folders`: optional tenant (`customer_id` nullable), `is_global`, `created_at`.
 * - `documents`: denormalized `customer_id`, optional `folder_id`, `supplier_id`, typed columns
 *   for MIME/size/dates; RLS policies updated for folderless rows and nullable folder customers.
 *
 * Backfill disables FORCE RLS on `documents` / `folders` / `jobs` so the migration role can
 * update every row; `CREATE TABLE suppliers` / supplier index use IF NOT EXISTS for safer re-runs.
 */
export class SuppliersAndDocumentsLibraryExpand1749250000000 implements MigrationInterface {
  name = "SuppliersAndDocumentsLibraryExpand1749250000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "suppliers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "name" character varying(1024) NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_suppliers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_suppliers_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_suppliers_customer_id" ON "suppliers" ("customer_id")`);

    await queryRunner.query(`
      ALTER TABLE "folders"
      ADD COLUMN IF NOT EXISTS "is_global" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "folders"
      ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`ALTER TABLE "folders" ALTER COLUMN "customer_id" DROP NOT NULL`);

    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "customer_id" uuid
    `);
    // FORCE RLS applies to the migration role; disable briefly so backfill/DELETE see all rows.
    await queryRunner.query(`ALTER TABLE "documents" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "folders" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "jobs" DISABLE ROW LEVEL SECURITY`);

    await queryRunner.query(`
      UPDATE "documents" d
      SET "customer_id" = f."customer_id"
      FROM "folders" f
      WHERE f."id" = d."folder_id" AND d."customer_id" IS NULL AND f."customer_id" IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "documents" d
      SET "customer_id" = j."customer_id"
      FROM (
        SELECT DISTINCT ON ("document_id") "document_id", "customer_id"
        FROM "jobs"
        WHERE "document_id" IS NOT NULL AND "customer_id" IS NOT NULL
        ORDER BY "document_id", "customer_id"::text
      ) j
      WHERE j."document_id" = d."id" AND d."customer_id" IS NULL
    `);
    await queryRunner.query(`
      DELETE FROM "documents" WHERE "customer_id" IS NULL
    `);
    await queryRunner.query(`
      DO $$
      DECLARE n int;
      BEGIN
        SELECT COUNT(*)::int INTO n FROM "documents" WHERE "customer_id" IS NULL;
        IF n > 0 THEN
          RAISE EXCEPTION 'SuppliersFoldersDocumentsLibraryExpand: % documents still have NULL customer_id after backfill', n;
        END IF;
      END$$
    `);
    await queryRunner.query(`
      ALTER TABLE "documents" ALTER COLUMN "customer_id" SET NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "documents" d
      SET "customer_id" = f."customer_id"
      FROM "folders" f
      INNER JOIN "customers" c ON c."id" = f."customer_id"
      WHERE f."id" = d."folder_id"
        AND f."customer_id" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "customers" dc WHERE dc."id" = d."customer_id")
    `);
    await queryRunner.query(`
      UPDATE "documents" d
      SET "customer_id" = sub."customer_id"
      FROM (
        SELECT DISTINCT ON (j."document_id") j."document_id", j."customer_id"
        FROM "jobs" j
        INNER JOIN "customers" c ON c."id" = j."customer_id"
        WHERE j."document_id" IS NOT NULL AND j."customer_id" IS NOT NULL
        ORDER BY j."document_id", j."customer_id"::text
      ) sub
      WHERE sub."document_id" = d."id"
        AND NOT EXISTS (SELECT 1 FROM "customers" dc WHERE dc."id" = d."customer_id")
    `);
    await queryRunner.query(`
      DELETE FROM "documents" d
      WHERE NOT EXISTS (SELECT 1 FROM "customers" c WHERE c."id" = d."customer_id")
    `);
    await queryRunner.query(`
      DO $$
      DECLARE n int;
      BEGIN
        SELECT COUNT(*)::int INTO n FROM "documents" d
        WHERE NOT EXISTS (SELECT 1 FROM "customers" c WHERE c."id" = d."customer_id");
        IF n > 0 THEN
          RAISE EXCEPTION 'SuppliersFoldersDocumentsLibraryExpand: % documents still reference missing customers after repair', n;
        END IF;
      END$$
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_documents_customer'
        ) THEN
          ALTER TABLE "documents"
          ADD CONSTRAINT "FK_documents_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END$$
    `);

    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "supplier_id" uuid
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_documents_supplier'
        ) THEN
          ALTER TABLE "documents"
          ADD CONSTRAINT "FK_documents_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END$$
    `);

    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "document_type" character varying(128) NOT NULL DEFAULT 'file'
    `);
    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "original_name" character varying(1024)
    `);
    await queryRunner.query(`UPDATE "documents" SET "original_name" = "name" WHERE "original_name" IS NULL`);

    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "mime_type" character varying(256)
    `);
    await queryRunner.query(`
      UPDATE "documents"
      SET "mime_type" = NULLIF(trim(metadata->>'mimeType'), '')
      WHERE ("mime_type" IS NULL OR "mime_type" = '')
        AND metadata ? 'mimeType'
    `);

    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "extension" character varying(32)
    `);
    await queryRunner.query(`
      UPDATE "documents"
      SET "extension" = LOWER(REVERSE(SPLIT_PART(REVERSE("name"), '.', 1)))
      WHERE ("extension" IS NULL OR "extension" = '') AND POSITION('.' IN "name") > 0
    `);

    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "size_bytes" bigint
    `);
    await queryRunner.query(`
      UPDATE "documents"
      SET "size_bytes" = NULLIF(trim(metadata->>'sizeBytes'), '')::bigint
      WHERE "size_bytes" IS NULL AND metadata ? 'sizeBytes'
        AND trim(metadata->>'sizeBytes') ~ '^[0-9]+$'
    `);

    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "document_date" date
    `);
    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    `);

    await queryRunner.query(`ALTER TABLE "documents" ALTER COLUMN "folder_id" DROP NOT NULL`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_customer_id" ON "documents" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_supplier_id" ON "documents" ("supplier_id")`);

    await queryRunner.query(`ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "jobs" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "folders" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "documents" FORCE ROW LEVEL SECURITY`);

    await queryRunner.query(`ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'suppliers' AND policyname = 'tenant_rls_isolation'
        ) THEN
          CREATE POLICY tenant_rls_isolation ON "suppliers"
          FOR ALL
          USING (
            current_setting('app.is_admin', true) = '1'
            OR "customer_id" = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
          )
          WITH CHECK (
            current_setting('app.is_admin', true) = '1'
            OR "customer_id" = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
          );
        END IF;
      END$$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'suppliers' AND policyname = 'staff_assignment_access'
        ) THEN
          CREATE POLICY staff_assignment_access ON "suppliers"
          FOR ALL
          USING (
            EXISTS (
              SELECT 1
              FROM staff_customer_assignments sca
              WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
                AND sca.customer_id = "suppliers"."customer_id"
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM staff_customer_assignments sca
              WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
                AND sca.customer_id = "suppliers"."customer_id"
            )
          );
        END IF;
      END$$;
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

    await queryRunner.query(`DROP POLICY IF EXISTS "tenant_rls_isolation" ON "documents"`);
    await queryRunner.query(`
      CREATE POLICY tenant_rls_isolation ON "documents"
      FOR ALL
      USING (
        current_setting('app.is_admin', true) = '1'
        OR "customer_id" = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
        OR EXISTS (
          SELECT 1 FROM folders f
          WHERE f.id = documents.folder_id
            AND f.customer_id IS NOT NULL
            AND f.customer_id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
        )
      )
      WITH CHECK (
        current_setting('app.is_admin', true) = '1'
        OR "customer_id" = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
        OR EXISTS (
          SELECT 1 FROM folders f
          WHERE f.id = documents.folder_id
            AND f.customer_id IS NOT NULL
            AND f.customer_id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
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
          FROM staff_customer_assignments sca
          WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND sca.customer_id = documents.customer_id
        )
        OR EXISTS (
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
          FROM staff_customer_assignments sca
          WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND sca.customer_id = documents.customer_id
        )
        OR EXISTS (
          SELECT 1
          FROM folders f
          INNER JOIN staff_customer_assignments sca ON sca.customer_id = f.customer_id
          WHERE f.id = documents.folder_id
            AND sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
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
    await queryRunner.query(`DROP POLICY IF EXISTS "staff_assignment_access" ON "documents"`);
    await queryRunner.query(`DROP POLICY IF EXISTS "tenant_rls_isolation" ON "documents"`);
    await queryRunner.query(`DROP POLICY IF EXISTS "staff_assignment_access" ON "folders"`);
    await queryRunner.query(`DROP POLICY IF EXISTS "tenant_rls_isolation" ON "folders"`);

    await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "FK_documents_supplier"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_supplier_id"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "supplier_id"`);

    await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "FK_documents_customer"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_customer_id"`);

    await queryRunner.query(`DROP POLICY IF EXISTS "staff_assignment_access" ON "suppliers"`);
    await queryRunner.query(`DROP POLICY IF EXISTS "tenant_rls_isolation" ON "suppliers"`);
    await queryRunner.query(`ALTER TABLE IF EXISTS "suppliers" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP TABLE IF EXISTS "suppliers"`);

    await queryRunner.query(`DELETE FROM "documents" WHERE "folder_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "documents" ALTER COLUMN "folder_id" SET NOT NULL`);

    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "created_at"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "uploaded_at"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "document_date"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "size_bytes"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "extension"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "mime_type"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "original_name"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "document_type"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "customer_id"`);

    await queryRunner.query(`ALTER TABLE "folders" ALTER COLUMN "customer_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "folders" DROP COLUMN IF EXISTS "created_at"`);
    await queryRunner.query(`ALTER TABLE "folders" DROP COLUMN IF EXISTS "is_global"`);

    await queryRunner.query(`
      CREATE POLICY tenant_rls_isolation ON "folders"
      FOR ALL
      USING (
        current_setting('app.is_admin', true) = '1'
        OR customer_id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
      )
      WITH CHECK (
        current_setting('app.is_admin', true) = '1'
        OR customer_id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
      )
    `);
    await queryRunner.query(`
      CREATE POLICY tenant_rls_isolation ON "documents"
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
    `);
    await queryRunner.query(`
      CREATE POLICY staff_assignment_access ON "folders"
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM staff_customer_assignments sca
          WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND sca.customer_id = folders.customer_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM staff_customer_assignments sca
          WHERE sca.staff_user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
            AND sca.customer_id = folders.customer_id
        )
      )
    `);
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
}
