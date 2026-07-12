import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPlanPricingFeaturesUserSubscription1747200000000 implements MigrationInterface {
  name = "AddPlanPricingFeaturesUserSubscription1747200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "plan" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "code" character varying NOT NULL,
        "description" text,
        "sort_order" integer NOT NULL DEFAULT 0,
        "billing_cycle" character varying NOT NULL DEFAULT 'monthly',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_plan_code" UNIQUE ("code"),
        CONSTRAINT "PK_plan" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "features" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        CONSTRAINT "UQ_features_code" UNIQUE ("code"),
        CONSTRAINT "PK_features" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "plan_pricing" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plan_id" uuid NOT NULL,
        "base_price" numeric(15,2) NOT NULL DEFAULT 0,
        "free_payee_users" integer NOT NULL DEFAULT 0,
        "per_extra_payee_cost" numeric(15,2) NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_plan_pricing_plan_id" UNIQUE ("plan_id"),
        CONSTRAINT "PK_plan_pricing" PRIMARY KEY ("id"),
        CONSTRAINT "FK_plan_pricing_plan" FOREIGN KEY ("plan_id") REFERENCES "plan"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_plan_pricing_plan_id" ON "plan_pricing" ("plan_id")`);

    await queryRunner.query(`
      CREATE TABLE "turnover_rules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plan_id" uuid NOT NULL,
        "min_turnover" numeric(15,2) NOT NULL DEFAULT 0,
        "max_turnover" numeric(15,2) NULL,
        CONSTRAINT "PK_turnover_rules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_turnover_rules_plan" FOREIGN KEY ("plan_id") REFERENCES "plan"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_turnover_rules_plan_id" ON "turnover_rules" ("plan_id")`);

    await queryRunner.query(`
      CREATE TABLE "plan_features" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plan_id" uuid NOT NULL,
        "feature_id" uuid NOT NULL,
        "is_included" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_plan_features_plan_feature" UNIQUE ("plan_id", "feature_id"),
        CONSTRAINT "PK_plan_features" PRIMARY KEY ("id"),
        CONSTRAINT "FK_plan_features_plan" FOREIGN KEY ("plan_id") REFERENCES "plan"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_plan_features_feature" FOREIGN KEY ("feature_id") REFERENCES "features"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_plan_features_plan_id" ON "plan_features" ("plan_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_plan_features_feature_id" ON "plan_features" ("feature_id")`);

    await queryRunner.query(`
      CREATE TABLE "user_subscription" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "plan_id" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'active',
        "start_date" TIMESTAMP WITH TIME ZONE NOT NULL,
        "end_date" TIMESTAMP WITH TIME ZONE NULL,
        "base_price" numeric(15,2) NOT NULL DEFAULT 0,
        "free_payee_limit" integer NOT NULL DEFAULT 0,
        "per_extra_payee_cost" numeric(15,2) NOT NULL DEFAULT 0,
        "payee_count" integer NOT NULL DEFAULT 0,
        "extra_payee_cost" numeric(15,2) NOT NULL DEFAULT 0,
        "extra_cost" numeric(15,2) NOT NULL DEFAULT 0,
        "total_cost" numeric(15,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_user_subscription" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_subscription_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_user_subscription_plan" FOREIGN KEY ("plan_id") REFERENCES "plan"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_user_subscription_customer_id" ON "user_subscription" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_subscription_plan_id" ON "user_subscription" ("plan_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_subscription_plan_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_subscription_customer_id"`);
    await queryRunner.query(`DROP TABLE "user_subscription"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plan_features_feature_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plan_features_plan_id"`);
    await queryRunner.query(`DROP TABLE "plan_features"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_turnover_rules_plan_id"`);
    await queryRunner.query(`DROP TABLE "turnover_rules"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plan_pricing_plan_id"`);
    await queryRunner.query(`DROP TABLE "plan_pricing"`);

    await queryRunner.query(`DROP TABLE "features"`);
    await queryRunner.query(`DROP TABLE "plan"`);
  }
}
