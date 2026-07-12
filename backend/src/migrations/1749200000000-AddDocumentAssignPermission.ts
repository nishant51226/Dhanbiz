import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `document:assign` for managers only — who may set library document assignees.
 * Accountants keep `job:update` for job pipeline updates but must not assign documents.
 */
export class AddDocumentAssignPermission1749200000000 implements MigrationInterface {
  name = "AddDocumentAssignPermission1749200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = CASE
        WHEN COALESCE("permissions", '[]'::jsonb) @> '["document:assign"]'::jsonb
        THEN "permissions"
        ELSE COALESCE("permissions", '[]'::jsonb) || '["document:assign"]'::jsonb
      END,
      "updated_at" = now()
      WHERE "name" = 'manager'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    await queryRunner.query(`
      UPDATE "roles" AS r
      SET "permissions" = (
        SELECT COALESCE(jsonb_agg(t.elem ORDER BY t.ord), '[]'::jsonb)
        FROM jsonb_array_elements_text(COALESCE(r.permissions, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
        WHERE t.elem <> 'document:assign'
      ),
      "updated_at" = now()
      WHERE r."name" = 'manager'
    `);
  }
}
