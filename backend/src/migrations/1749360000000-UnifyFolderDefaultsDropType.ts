import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One default folder per customer (and one global): `folder_defaults.type` removed.
 * Keeps the newest row per `customer_id` key (including NULL for global) before dropping `type`.
 */
export class UnifyFolderDefaultsDropType1749360000000 implements MigrationInterface {
  name = "UnifyFolderDefaultsDropType1749360000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL row_security = off`);
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(customer_id::text, '_GLOBAL_')
            ORDER BY updated_at DESC NULLS LAST, id
          ) AS rn
        FROM folder_defaults
      )
      DELETE FROM folder_defaults fd
      USING ranked r
      WHERE fd.id = r.id AND r.rn > 1
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_folder_defaults_type_customer"`);
    await queryRunner.query(`ALTER TABLE "folder_defaults" DROP COLUMN IF EXISTS "type"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_folder_defaults_customer" ON "folder_defaults" ("customer_id") WHERE "customer_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_folder_defaults_global" ON "folder_defaults" ((TRUE)) WHERE "customer_id" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_folder_defaults_global"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_folder_defaults_customer"`);
    await queryRunner.query(`
      ALTER TABLE "folder_defaults"
      ADD COLUMN IF NOT EXISTS "type" "folders_kind_enum" NOT NULL DEFAULT 'files'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_folder_defaults_type_customer"
      ON "folder_defaults" ("type", "customer_id")
    `);
    await queryRunner.query(`ALTER TABLE "folder_defaults" ALTER COLUMN "type" DROP DEFAULT`);
  }
}
