import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobAiProvider1730600000000 implements MigrationInterface {
  name = "AddJobAiProvider1730600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "ai_provider" character varying(32)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN IF EXISTS "ai_provider"`);
  }
}
