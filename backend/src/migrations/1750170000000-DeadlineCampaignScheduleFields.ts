import { MigrationInterface, QueryRunner } from "typeorm";

export class DeadlineCampaignScheduleFields1750170000000 implements MigrationInterface {
  name = "DeadlineCampaignScheduleFields1750170000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "deadline_campaigns"
      ADD COLUMN IF NOT EXISTS "send_start_time" character varying(5) NOT NULL DEFAULT '09:00'
    `);
    await queryRunner.query(`
      ALTER TABLE "deadline_campaigns"
      ADD COLUMN IF NOT EXISTS "send_count_per_day" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "deadline_campaigns"
      ADD COLUMN IF NOT EXISTS "send_interval_hours" integer NOT NULL DEFAULT 4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "deadline_campaigns" DROP COLUMN IF EXISTS "send_interval_hours"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deadline_campaigns" DROP COLUMN IF EXISTS "send_count_per_day"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deadline_campaigns" DROP COLUMN IF EXISTS "send_start_time"`,
    );
  }
}
