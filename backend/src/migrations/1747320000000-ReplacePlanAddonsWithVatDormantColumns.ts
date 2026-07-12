import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Replaces `plan_addons` (per-line addon_types/amount) with one row per plan:
 * VAT %, tax filing VAT flag, dormant flags/cost, extra employee cost.
 */
export class ReplacePlanAddonsWithVatDormantColumns1747320000000 implements MigrationInterface {
  name = "ReplacePlanAddonsWithVatDormantColumns1747320000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plan_addons_plan_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_addons"`);

    await queryRunner.query(`
      CREATE TABLE "plan_addons" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plan_id" uuid NOT NULL,
        "vat_percent" numeric(7,4) NOT NULL DEFAULT 0,
        "tax_filling_vat_enable" boolean NOT NULL DEFAULT false,
        "dormant_enable" boolean NOT NULL DEFAULT false,
        "dormant_cost" numeric(15,2) NOT NULL DEFAULT 0,
        "extra_employee_cost" numeric(15,2) NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_plan_addons_plan_id" UNIQUE ("plan_id"),
        CONSTRAINT "PK_plan_addons" PRIMARY KEY ("id"),
        CONSTRAINT "FK_plan_addons_plan" FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_plan_addons_plan_id" ON "plan_addons" ("plan_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plan_addons_plan_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_addons"`);

    await queryRunner.query(`
      CREATE TABLE "plan_addons" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plan_id" uuid NOT NULL,
        "addon_types" character varying NOT NULL,
        "amount" numeric(15,2) NOT NULL DEFAULT 0,
        "condition" text NULL,
        CONSTRAINT "PK_plan_addons" PRIMARY KEY ("id"),
        CONSTRAINT "FK_plan_addons_plan" FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_plan_addons_plan_id" ON "plan_addons" ("plan_id")`);
  }
}
