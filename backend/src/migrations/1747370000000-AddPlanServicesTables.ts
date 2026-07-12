import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Catalogue `services` and join `plan_service` so matrix `plans` can reference many services.
 */
export class AddPlanServicesTables1747370000000 implements MigrationInterface {
  name = "AddPlanServicesTables1747370000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "services" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "description" text NULL,
        "price" numeric(15,2) NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_services" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_services_is_active" ON "services" ("is_active")`);

    await queryRunner.query(`
      CREATE TABLE "plan_service" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plan_id" uuid NOT NULL,
        "service_id" uuid NOT NULL,
        CONSTRAINT "PK_plan_service" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_plan_service_plan_id_service_id" UNIQUE ("plan_id", "service_id"),
        CONSTRAINT "FK_plan_service_plan" FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_plan_service_service" FOREIGN KEY ("service_id") REFERENCES "services"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_plan_service_plan_id" ON "plan_service" ("plan_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_plan_service_service_id" ON "plan_service" ("service_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plan_service_service_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plan_service_plan_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_service"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_services_is_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "services"`);
  }
}
