import { MigrationInterface, QueryRunner } from "typeorm";

/** Remove approximate backfill where started_at was set to created_at (inflates duration). */
export class FixJobTimingBackfill1750270000000 implements MigrationInterface {
  name = "FixJobTimingBackfill1750270000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "jobs"
      SET "started_at" = NULL, "completed_at" = NULL
      WHERE "started_at" IS NOT NULL
        AND "started_at" = "created_at"
        AND "status" IN ('completed', 'failed', 'cancelled')
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    /* Cannot restore cleared backfill values */
  }
}
