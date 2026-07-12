import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddPlansIsActive1747350000000 implements MigrationInterface {
  name = "AddPlansIsActive1747350000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "plans" ADD "is_active" boolean NOT NULL DEFAULT true`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN "is_active"`);
  }
}
