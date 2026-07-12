import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobCancelledStatus1730500000000 implements MigrationInterface {
  name = "AddJobCancelledStatus1730500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'jobs_status_enum' AND e.enumlabel = 'cancelled'
        ) THEN
          ALTER TYPE jobs_status_enum ADD VALUE 'cancelled';
        END IF;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    /* PostgreSQL cannot remove enum values safely; leave as no-op */
  }
}
