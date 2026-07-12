import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Accountant staff: library/jobs visibility only — no uploads or job mutations.
 * Removes `file:write` (upload/edit paths), `job:update`, and `job:create` if present.
 * Permission model uses `file:read` / `file:write` / `file:delete` (there is no `file:create`).
 */
export class AccountantRoleReadOnlyFilesAndJobs1749310000000 implements MigrationInterface {
  name = "AccountantRoleReadOnlyFilesAndJobs1749310000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

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
        "file:read",
        "file:write",
        "job:read",
        "job:update"
      ]'::jsonb,
      "updated_at" = now()
      WHERE "name" = 'accountant'
    `);
  }
}
