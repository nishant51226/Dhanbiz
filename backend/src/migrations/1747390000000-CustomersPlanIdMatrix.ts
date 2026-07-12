import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Store matrix `plans.id` on customers (`plan_id`); remove legacy FK to `subscription_plans`.
 * Copies existing `subscription_plan_id` into `plan_id` only when that UUID exists in `plans`.
 */
export class CustomersPlanIdMatrix1747390000000 implements MigrationInterface {
  name = "CustomersPlanIdMatrix1747390000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "plan_id" uuid NULL`);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD CONSTRAINT "FK_customers_plans"
      FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_customers_plan_id" ON "customers" ("plan_id")`);

    await queryRunner.query(`
      UPDATE "customers" c
      SET "plan_id" = c."subscription_plan_id"
      WHERE c."subscription_plan_id" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "plans" p WHERE p."id" = c."subscription_plan_id")
    `);

    await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "FK_customers_subscription_plan"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_subscription_plan_id"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "subscription_plan_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "subscription_plan_id" uuid NULL`);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD CONSTRAINT "FK_customers_subscription_plan"
      FOREIGN KEY ("subscription_plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_customers_subscription_plan_id" ON "customers" ("subscription_plan_id")`);

    await queryRunner.query(`
      UPDATE "customers" c
      SET "subscription_plan_id" = c."plan_id"
      WHERE c."plan_id" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "subscription_plans" sp WHERE sp."id" = c."plan_id")
    `);

    await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "FK_customers_plans"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_plan_id"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "plan_id"`);
  }
}
