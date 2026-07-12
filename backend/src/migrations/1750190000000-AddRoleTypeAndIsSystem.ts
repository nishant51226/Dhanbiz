import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Role metadata for dynamic RBAC: staff vs portal assignment rules, protected system roles.
 */
export class AddRoleTypeAndIsSystem1750190000000 implements MigrationInterface {
  name = "AddRoleTypeAndIsSystem1750190000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`
      ALTER TABLE "roles"
      ADD COLUMN IF NOT EXISTS "role_type" varchar(16) NOT NULL DEFAULT 'staff'
    `);
    await queryRunner.query(`
      ALTER TABLE "roles"
      ADD COLUMN IF NOT EXISTS "is_system" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "roles"
      ADD COLUMN IF NOT EXISTS "description" varchar(512)
    `);

    await queryRunner.query(`
      UPDATE "roles"
      SET "role_type" = 'portal', "is_system" = true
      WHERE lower("name") IN ('customer_admin', 'customer_user')
    `);
    await queryRunner.query(`
      UPDATE "roles"
      SET "role_type" = 'staff', "is_system" = true
      WHERE lower("name") IN ('manager', 'accountant')
    `);
    await queryRunner.query(`
      UPDATE "roles"
      SET "role_type" = 'portal'
      WHERE lower("name") LIKE 'customer_%'
        AND lower("name") NOT IN ('customer_admin', 'customer_user')
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_roles_name" ON "roles" (lower("name"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`DROP INDEX IF EXISTS "uq_roles_name"`);

    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN IF EXISTS "description"`);
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN IF EXISTS "is_system"`);
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN IF EXISTS "role_type"`);
  }
}
