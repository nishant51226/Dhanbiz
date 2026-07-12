import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Enforce only 4 roles and their latest permission sets:
 * - manager: customers + files + jobs
 * - accountant: files + jobs (read/write)
 * - customer_admin: portal files + portal settings
 * - customer_user: portal files (read + write)
 */
export class EnforceFourRolesAndPermissions1747100000000 implements MigrationInterface {
  name = "EnforceFourRolesAndPermissions1747100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
      SELECT
        '6cb7a4b8-99b8-4ae8-ab62-6f09b9091c01',
        'manager',
        '[]'::jsonb,
        now(),
        now()
      WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'manager')
    `);

    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
      SELECT
        '4c7cbf2d-fb08-47d0-b2d1-1f4fbd8bc902',
        'accountant',
        '[]'::jsonb,
        now(),
        now()
      WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'accountant')
    `);

    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
      SELECT
        '9cd2f09f-5d24-4bfe-8f95-8010c18f8f03',
        'customer_admin',
        '[]'::jsonb,
        now(),
        now()
      WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'customer_admin')
    `);

    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
      SELECT
        '37f3f5b1-4b53-4bd3-a4f3-8a86f8d8fe04',
        'customer_user',
        '[]'::jsonb,
        now(),
        now()
      WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'customer_user')
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
      SET "permissions" = '[
        "file:read",
        "file:write",
        "job:read",
        "job:update"
      ]'::jsonb,
      "updated_at" = now()
      WHERE "name" = 'accountant'
    `);

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

    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = '[
        "portal:file:read",
        "portal:file:write"
      ]'::jsonb,
      "updated_at" = now()
      WHERE "name" = 'customer_user'
    `);

    if (await queryRunner.hasTable("user_roles")) {
      await queryRunner.query(`
        DELETE FROM "user_roles"
        WHERE "role_id" IN (
          SELECT "id"
          FROM "roles"
          WHERE "name" NOT IN ('manager', 'accountant', 'customer_admin', 'customer_user')
        )
      `);
    }

    await queryRunner.query(`
      DELETE FROM "roles"
      WHERE "name" NOT IN ('manager', 'accountant', 'customer_admin', 'customer_user')
    `);
  }

  public async down(): Promise<void> {
    // Intentionally no-op: this migration enforces current role policy.
  }
}
