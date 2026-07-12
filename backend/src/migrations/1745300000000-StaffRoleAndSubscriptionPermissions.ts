import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Staff (non-admin) operators: customer + jobs + financials + subscription plan management.
 * Customer portal role intentionally has no subscription_plan:* (see SeedCustomerPortalRole).
 */
export class StaffRoleAndSubscriptionPermissions1745300000000 implements MigrationInterface {
  name = "StaffRoleAndSubscriptionPermissions1745300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
      SELECT
        '8e9f0a1b-2c3d-5e6f-9a01-1d2e3f4a5b6c',
        'staff',
        '[
          "customer:read",
          "customer:write",
          "subscription_plan:read",
          "subscription_plan:write",
          "job:read",
          "job:update",
          "invoice:read",
          "statement:read"
        ]'::jsonb,
        now(),
        now()
      WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'staff')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;
    await queryRunner.query(`DELETE FROM "roles" WHERE "name" = 'staff'`);
  }
}
