import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobTimingColumns1750260000000 implements MigrationInterface {
  name = "AddJobTimingColumns1750260000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "jobs"
        ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      UPDATE "jobs"
      SET "started_at" = COALESCE("started_at", "updated_at", "created_at")
      WHERE "status" = 'processing' AND "started_at" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "jobs"
      SET "completed_at" = COALESCE("completed_at", "updated_at")
      WHERE "status" IN ('completed', 'failed', 'cancelled') AND "completed_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "jobs"
        DROP COLUMN IF EXISTS "completed_at",
        DROP COLUMN IF EXISTS "started_at"
    `);
  }
}
