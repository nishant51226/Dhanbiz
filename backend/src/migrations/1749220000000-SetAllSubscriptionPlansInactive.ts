import type { MigrationInterface, QueryRunner } from "typeorm";

/** Sets every legacy `subscription_plans` row to inactive. */
export class SetAllSubscriptionPlansInactive1749220000000 implements MigrationInterface {
  name = "SetAllSubscriptionPlansInactive1749220000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("subscription_plans"))) return;
    const table = await queryRunner.getTable("subscription_plans");
    if (!table?.findColumnByName("is_active")) return;
    await queryRunner.query(`UPDATE "subscription_plans" SET "is_active" = false`);
  }

  public async down(): Promise<void> {
    // No-op: prior per-row active flags are not recoverable.
  }
}
