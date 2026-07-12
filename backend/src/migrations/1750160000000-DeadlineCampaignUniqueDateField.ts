import { MigrationInterface, QueryRunner } from "typeorm";

export class DeadlineCampaignUniqueDateField1750160000000 implements MigrationInterface {
  name = "DeadlineCampaignUniqueDateField1750160000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_deadline_campaigns_date_field_id"
      ON "deadline_campaigns" ("date_field_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_deadline_campaigns_date_field_id"`);
  }
}
