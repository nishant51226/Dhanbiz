// src/migrations/AddSubscriptionPlanTable1745000000000.ts

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSubscriptionPlanTable1745000000000 implements MigrationInterface {
  name = "AddSubscriptionPlanTable1745000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create subscription_plans table only - no seed data
    await queryRunner.query(`
      CREATE TABLE "subscription_plans" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "code" character varying NOT NULL UNIQUE,
        "description" text,
        "price" decimal(10,2) NOT NULL DEFAULT 0,
        "billing_cycle" character varying NOT NULL DEFAULT 'monthly',
        "features" jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscription_plans" PRIMARY KEY ("id")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "subscription_plans"`);
  }
}