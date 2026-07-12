import { MigrationInterface, QueryRunner } from "typeorm";

export class SubscriptionPlanBandsAndCustomerTurnover1745100000000 implements MigrationInterface {
  name = "SubscriptionPlanBandsAndCustomerTurnover1745100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      ADD COLUMN "turnover_min_gbp" numeric(15,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      ADD COLUMN "turnover_max_gbp" numeric(15,2) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      ADD COLUMN "sort_order" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN "annual_turnover_gbp" numeric(15,2) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN "subscription_plan_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD CONSTRAINT "FK_customers_subscription_plan"
      FOREIGN KEY ("subscription_plan_id") REFERENCES "subscription_plans"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_customers_subscription_plan_id" ON "customers" ("subscription_plan_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_subscription_plan_id"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "FK_customers_subscription_plan"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "subscription_plan_id"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "annual_turnover_gbp"`);
    await queryRunner.query(`ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "sort_order"`);
    await queryRunner.query(`ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "turnover_max_gbp"`);
    await queryRunner.query(`ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "turnover_min_gbp"`);
  }
}
