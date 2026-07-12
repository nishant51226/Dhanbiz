import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFoldersIsDefault1749270000000 implements MigrationInterface {
  name = "AddFoldersIsDefault1749270000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "is_default" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_folders_default_customer_type" ON "folders" ("customer_id", "type") WHERE "is_default" = true AND "customer_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_folders_default_global_type" ON "folders" ("type") WHERE "is_default" = true AND "customer_id" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_folders_default_global_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_folders_default_customer_type"`);
    await queryRunner.query(`ALTER TABLE "folders" DROP COLUMN IF EXISTS "is_default"`);
  }
}
