import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Drive file delete is for practice managers (and superadmin bypass) only.
 * Remove portal delete from customer portal roles.
 */
export class FileDeleteManagerAndAdminOnly1749420000000 implements MigrationInterface {
  name = "FileDeleteManagerAndAdminOnly1749420000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = (
        SELECT COALESCE(jsonb_agg(to_jsonb(elem)), '[]'::jsonb)
        FROM jsonb_array_elements_text("permissions") AS elem
        WHERE elem NOT IN ('portal:file:delete')
      ),
      "updated_at" = now()
      WHERE "name" IN ('customer_admin', 'customer_user')
    `);

    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = '[
        "customer:read",
        "customer:write",
        "document:assign",
        "file:read",
        "file:write",
        "file:delete",
        "job:create",
        "job:read",
        "job:update"
      ]'::jsonb,
      "updated_at" = now()
      WHERE "name" = 'manager'
    `);

    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = '["file:read", "job:read"]'::jsonb,
      "updated_at" = now()
      WHERE "name" = 'accountant'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = '[
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
