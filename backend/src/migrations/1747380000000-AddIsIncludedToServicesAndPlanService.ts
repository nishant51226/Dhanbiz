import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `services` = feature catalogue (replaces legacy `features`); `is_included` flags default/catalogue semantics.
 * `plan_service.is_included` mirrors legacy `plan_features.is_included` (per plan).
 */
export class AddIsIncludedToServicesAndPlanService1747380000000 implements MigrationInterface {
  name = "AddIsIncludedToServicesAndPlanService1747380000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "services"
      ADD "is_included" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "plan_service"
      ADD "is_included" boolean NOT NULL DEFAULT true
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "plan_service" DROP COLUMN IF EXISTS "is_included"`);
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "is_included"`);
  }
}
