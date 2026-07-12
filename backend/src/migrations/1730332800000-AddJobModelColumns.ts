import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobModelColumns1730332800000 implements MigrationInterface {
  name = "AddJobModelColumns1730332800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "vision_model" character varying(256)`
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "structure_model" character varying(256)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "jobs" DROP COLUMN IF EXISTS "structure_model"
    `);
    await queryRunner.query(`
      ALTER TABLE "jobs" DROP COLUMN IF EXISTS "vision_model"
    `);
  }
}
