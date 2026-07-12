import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Seed baseline roles used by current staff/customer workflow:
 * - manager
 * - accountant
 * - customer_admin
 * - customer_user
 */
export class SeedManagerAccountantAndCustomerRoles1747000000000 implements MigrationInterface {
  name = "SeedManagerAccountantAndCustomerRoles1747000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
      SELECT
        '91b74271-0b39-4d8f-a8d3-5f6ed2a8b1c1',
        'manager',
        '[]'::jsonb,
        now(),
        now()
      WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'manager')
    `);

    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
      SELECT
        '1c7dfb3d-7af4-4cc7-b1c5-6c8e357f3f11',
        'accountant',
        '[]'::jsonb,
        now(),
        now()
      WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'accountant')
    `);

    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
      SELECT
        '3bd35f16-8f4b-4f4b-a97f-2ec2bba0c821',
        'customer_admin',
        '[]'::jsonb,
        now(),
        now()
      WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'customer_admin')
    `);

    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at")
      SELECT
        '4a6f0c23-2f7e-4a9f-8bd9-0b4ef27be772',
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;
    await queryRunner.query(`
      DELETE FROM "roles"
      WHERE "name" IN ('manager', 'accountant', 'customer_admin', 'customer_user')
    `);
  }
}
