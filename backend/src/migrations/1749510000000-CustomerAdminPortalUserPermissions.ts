import { MigrationInterface, QueryRunner } from "typeorm";

/** Lets `customer_admin` manage portal logins (list / invite / deactivate / delete). */
export class CustomerAdminPortalUserPermissions1749510000000 implements MigrationInterface {
  name = "CustomerAdminPortalUserPermissions1749510000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;
    await queryRunner.query(`
      UPDATE "roles"
      SET
        "permissions" = '[
          "portal:file:read",
          "portal:file:write",
          "portal:file:delete",
          "portal:settings:read",
          "portal:settings:write",
          "portal:user:read",
          "portal:user:write"
        ]'::jsonb,
        "updated_at" = now()
      WHERE "name" = 'customer_admin'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;
    await queryRunner.query(`
      UPDATE "roles"
      SET
        "permissions" = '[
          "portal:file:read",
          "portal:file:write",
          "portal:file:delete",
          "portal:settings:read",
          "portal:settings:write"
        ]'::jsonb,
        "updated_at" = now()
      WHERE "name" = 'customer_admin'
    `);
  }
}
