import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerOnboardingData1743600000000 implements MigrationInterface {
  name = "AddCustomerOnboardingData1743600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "onboarding_data" jsonb NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "onboarding_data"`);
  }
}
