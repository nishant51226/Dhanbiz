import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Role for customer-portal logins (non-admin users tied to a single customer).
 * Permissions align with drive / jobs / financials routes used by the customer UI.
 */
export class SeedCustomerPortalRole1745200000000 implements MigrationInterface {
  name = "SeedCustomerPortalRole1745200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
      SELECT
        '7d8f9f2a-1b3c-4d6e-8a91-0c1d2e3f4a5b',
        'customer_portal',
        '["customer:read","job:read","job:update","invoice:read","statement:read"]'::jsonb,
        now(),
        now()
      WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'customer_portal')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;
    await queryRunner.query(`DELETE FROM "roles" WHERE "name" = 'customer_portal'`);
  }
}
