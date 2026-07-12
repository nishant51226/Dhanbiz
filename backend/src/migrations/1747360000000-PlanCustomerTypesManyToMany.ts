import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Moves plan ↔ customer type from a single `plans.customer_type_id` column to
 * `plan_customer_type` so one matrix plan can apply to multiple customer types.
 */
export class PlanCustomerTypesManyToMany1747360000000 implements MigrationInterface {
  name = "PlanCustomerTypesManyToMany1747360000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "plan_customer_type" (
        "plan_id" uuid NOT NULL,
        "customer_type_id" uuid NOT NULL,
        CONSTRAINT "PK_plan_customer_type" PRIMARY KEY ("plan_id", "customer_type_id"),
        CONSTRAINT "FK_plan_customer_type_plan" FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_plan_customer_type_customer_type" FOREIGN KEY ("customer_type_id") REFERENCES "customer_type"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_plan_customer_type_customer_type_id" ON "plan_customer_type" ("customer_type_id")`,
    );

    await queryRunner.query(`
      INSERT INTO "plan_customer_type" ("plan_id", "customer_type_id")
      SELECT "id", "customer_type_id" FROM "plans"
    `);

    await queryRunner.query(`ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "UQ_plans_customer_type_name"`);
    await queryRunner.query(`ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "FK_plans_customer_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plans_customer_type_id"`);
    await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN "customer_type_id"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "plans" ADD "customer_type_id" uuid`);
    await queryRunner.query(`
      UPDATE "plans" p
      SET "customer_type_id" = sub."customer_type_id"
      FROM (
        SELECT DISTINCT ON ("plan_id") "plan_id", "customer_type_id"
        FROM "plan_customer_type"
        ORDER BY "plan_id", "customer_type_id"
      ) sub
      WHERE p.id = sub."plan_id"
    `);
    await queryRunner.query(`DROP TABLE "plan_customer_type"`);
    await queryRunner.query(`ALTER TABLE "plans" ALTER COLUMN "customer_type_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "plans" ADD CONSTRAINT "FK_plans_customer_type" FOREIGN KEY ("customer_type_id") REFERENCES "customer_type"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "plans" ADD CONSTRAINT "UQ_plans_customer_type_name" UNIQUE ("customer_type_id", "name")
    `);
    await queryRunner.query(`CREATE INDEX "IDX_plans_customer_type_id" ON "plans" ("customer_type_id")`);
  }
}
