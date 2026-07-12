import { MigrationInterface, QueryRunner } from "typeorm";

/** Soft-delete support: `deleted_at` on `files` and `jobs` (same pattern as deactivating catalogue rows). */
export class SoftDeleteFilesAndJobs1749410000000 implements MigrationInterface {
  name = "SoftDeleteFilesAndJobs1749410000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "files"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_files_deleted_at"
      ON "files" ("deleted_at")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_jobs_deleted_at"
      ON "jobs" ("deleted_at")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jobs_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN IF EXISTS "deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_files_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "files" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
