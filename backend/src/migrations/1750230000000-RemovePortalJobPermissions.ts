import { MigrationInterface, QueryRunner } from "typeorm";

const REMOVED = ["portal:job:read", "portal:job:create", "portal:job:update"] as const;

/**
 * Portal users use `portal:file:*` for the document library — not staff-style jobs.
 * Drop deprecated `portal:job:*` keys from every role.
 */
export class RemovePortalJobPermissions1750230000000 implements MigrationInterface {
  name = "RemovePortalJobPermissions1750230000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    const inList = REMOVED.map((p) => `'${p}'`).join(", ");
    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = (
        SELECT COALESCE(jsonb_agg(to_jsonb(elem)), '[]'::jsonb)
        FROM jsonb_array_elements_text("permissions") AS elem
        WHERE elem NOT IN (${inList})
      ),
      "updated_at" = now()
      WHERE "permissions" ?| array[${REMOVED.map((p) => `'${p}'`).join(", ")}]
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: portal job permissions are intentionally retired.
  }
}
