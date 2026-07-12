import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Separate staff Reports access from `job:read`.
 * Backfill `report:read` onto roles that already had `job:read` so existing users keep reports.
 */
export class AddReportReadPermission1750210000000 implements MigrationInterface {
  name = "AddReportReadPermission1750210000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = "permissions" || '["report:read"]'::jsonb,
          "updated_at" = now()
      WHERE "permissions" @> '["job:read"]'::jsonb
        AND NOT ("permissions" @> '["report:read"]'::jsonb)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM jsonb_array_elements_text("permissions") AS elem
        WHERE elem <> 'report:read'
      ),
      "updated_at" = now()
      WHERE "permissions" @> '["report:read"]'::jsonb
    `);
  }
}
