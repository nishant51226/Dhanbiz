import { MigrationInterface, QueryRunner } from "typeorm";

export class SoftDeleteFolders1749440000000 implements MigrationInterface {
  name = "SoftDeleteFolders1749440000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "folders"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_folders_deleted_at"
      ON "folders" ("deleted_at")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_folders_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "folders" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
