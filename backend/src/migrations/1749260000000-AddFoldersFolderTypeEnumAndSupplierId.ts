import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `folders` extension:
 * - `folder_type`: enum FILE | INVOICES | STATEMENT (staff-facing casing).
 * - `supplier_id`: optional link to `suppliers`.
 *
 * Note: legacy `folders.type` (`folders_kind_enum`: files | statements | invoices) remains;
 * `folder_type` is backfilled from it for existing rows.
 */
export class AddFoldersFolderTypeEnumAndSupplierId1749260000000 implements MigrationInterface {
  name = "AddFoldersFolderTypeEnumAndSupplierId1749260000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL row_security = off`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public' AND t.typname = 'folders_folder_type_enum'
        ) THEN
          CREATE TYPE "folders_folder_type_enum" AS ENUM ('FILE', 'INVOICES', 'STATEMENT');
        END IF;
      END$$
    `);
    await queryRunner.query(`
      ALTER TABLE "folders"
      ADD COLUMN IF NOT EXISTS "folder_type" "folders_folder_type_enum"
    `);
    await queryRunner.query(`ALTER TABLE "folders" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      UPDATE "folders"
      SET "folder_type" = CASE COALESCE("type"::text, '')
        WHEN 'invoices' THEN 'INVOICES'::"folders_folder_type_enum"
        WHEN 'statements' THEN 'STATEMENT'::"folders_folder_type_enum"
        ELSE 'FILE'::"folders_folder_type_enum"
      END
    `);
    await queryRunner.query(`
      UPDATE "folders"
      SET "folder_type" = 'FILE'::"folders_folder_type_enum"
      WHERE "folder_type" IS NULL
    `);
    await queryRunner.query(`
      DO $$
      DECLARE n int;
      BEGIN
        SELECT COUNT(*)::int INTO n FROM "folders" WHERE "folder_type" IS NULL;
        IF n > 0 THEN
          RAISE EXCEPTION 'AddFoldersFolderTypeEnumAndSupplierId: % folders still have NULL folder_type after backfill', n;
        END IF;
      END$$
    `);
    await queryRunner.query(`
      ALTER TABLE "folders"
      ALTER COLUMN "folder_type" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "folders"
      ADD COLUMN IF NOT EXISTS "supplier_id" uuid
    `);
    await queryRunner.query(`ALTER TABLE "suppliers" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_folders_supplier') THEN
          ALTER TABLE "folders"
          ADD CONSTRAINT "FK_folders_supplier"
          FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END$$
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_folders_supplier_id" ON "folders" ("supplier_id")`);
    await queryRunner.query(`ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "folders" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "suppliers" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_folders_supplier_id"`);
    await queryRunner.query(`ALTER TABLE "folders" DROP CONSTRAINT IF EXISTS "FK_folders_supplier"`);
    await queryRunner.query(`ALTER TABLE "folders" DROP COLUMN IF EXISTS "supplier_id"`);
    await queryRunner.query(`ALTER TABLE "folders" DROP COLUMN IF EXISTS "folder_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "folders_folder_type_enum"`);
    await queryRunner.query(`ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY`);
  }
}
