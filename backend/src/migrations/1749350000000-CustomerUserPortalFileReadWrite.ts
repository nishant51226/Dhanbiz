import { MigrationInterface, QueryRunner } from "typeorm";

/** Adds `portal:file:write` to `customer_user` (keeps `portal:file:read`). */
export class CustomerUserPortalFileReadWrite1749350000000 implements MigrationInterface {
  name = "CustomerUserPortalFileReadWrite1749350000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;
    await queryRunner.query(`
      UPDATE "roles"
      SET
        "permissions" = '["portal:file:read","portal:file:write"]'::jsonb,
        "updated_at" = now()
      WHERE "name" = 'customer_user'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;
    await queryRunner.query(`
      UPDATE "roles"
      SET
        "permissions" = '["portal:file:read"]'::jsonb,
        "updated_at" = now()
      WHERE "name" = 'customer_user'
    `);
  }
}
