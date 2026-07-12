import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `document:assignee` — practice staff who may be assigned to library documents / file tasks.
 * Replaces the legacy assignee picker filter on role name containing "accountant".
 */
export class AddDocumentAssigneePermission1750240000000 implements MigrationInterface {
  name = "AddDocumentAssigneePermission1750240000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = CASE
        WHEN COALESCE("permissions", '[]'::jsonb) @> '["document:assignee"]'::jsonb
        THEN "permissions"
        ELSE COALESCE("permissions", '[]'::jsonb) || '["document:assignee"]'::jsonb
      END,
      "updated_at" = now()
      WHERE "name" = 'accountant'
    `);

    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = CASE
        WHEN COALESCE("permissions", '[]'::jsonb) @> '["document:assignee"]'::jsonb
        THEN "permissions"
        ELSE COALESCE("permissions", '[]'::jsonb) || '["document:assignee"]'::jsonb
      END,
      "updated_at" = now()
      WHERE "role_type" = 'staff'
        AND COALESCE("permissions", '[]'::jsonb) @> '["job:read"]'::jsonb
        AND NOT (COALESCE("permissions", '[]'::jsonb) @> '["customer:write"]'::jsonb)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`
      UPDATE "roles" AS r
      SET "permissions" = (
        SELECT COALESCE(jsonb_agg(t.elem ORDER BY t.ord), '[]'::jsonb)
        FROM jsonb_array_elements_text(COALESCE(r.permissions, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
        WHERE t.elem <> 'document:assignee'
      ),
      "updated_at" = now()
      WHERE COALESCE(r.permissions, '[]'::jsonb) @> '["document:assignee"]'::jsonb
    `);
  }
}
