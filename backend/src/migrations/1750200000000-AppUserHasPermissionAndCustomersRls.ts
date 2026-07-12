import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Permission-based RLS helper: unions permissions from all assigned roles for app.user_id.
 */
export class AppUserHasPermissionAndCustomersRls1750200000000 implements MigrationInterface {
  name = "AppUserHasPermissionAndCustomersRls1750200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS app`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION app.user_has_permission(p_key text)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT COALESCE(
          (
            SELECT bool_or(r.permissions @> to_jsonb(ARRAY[lower(trim(p_key))]))
            FROM user_roles ur
            INNER JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = (NULLIF(current_setting('app.user_id', true), ''))::uuid
          ),
          false
        );
      $$;
    `);

    await queryRunner.query(`GRANT USAGE ON SCHEMA app TO customer_app`);
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION app.user_has_permission(text) TO customer_app`);

    if (!(await queryRunner.hasTable("customers"))) return;

    await queryRunner.query(`DROP POLICY IF EXISTS "customers_rls_practice_staff_insert" ON "customers"`);

    await queryRunner.query(`
      CREATE POLICY customers_rls_practice_staff_insert ON "customers"
      FOR INSERT
      WITH CHECK (
        (NULLIF(current_setting('app.customer_id', true), '')) IS NULL
        AND (NULLIF(current_setting('app.user_id', true), '')) IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM "users" u
            WHERE u."id" = (NULLIF(current_setting('app.user_id', true), ''))::uuid
              AND u."customer_id" IS NULL
          )
          OR app.user_has_permission('customer:write')
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable("customers")) {
      await queryRunner.query(`DROP POLICY IF EXISTS "customers_rls_practice_staff_insert" ON "customers"`);

      await queryRunner.query(`
        CREATE POLICY customers_rls_practice_staff_insert ON "customers"
        FOR INSERT
        WITH CHECK (
          (NULLIF(current_setting('app.customer_id', true), '')) IS NULL
          AND (NULLIF(current_setting('app.user_id', true), '')) IS NOT NULL
          AND (
            EXISTS (
              SELECT 1 FROM "users" u
              WHERE u."id" = (NULLIF(current_setting('app.user_id', true), ''))::uuid
                AND u."customer_id" IS NULL
            )
            OR EXISTS (
              SELECT 1
              FROM "user_roles" ur
              INNER JOIN "roles" r ON r."id" = ur."role_id"
              WHERE ur."user_id" = (NULLIF(current_setting('app.user_id', true), ''))::uuid
                AND lower(r."name") IN ('manager', 'accountant')
            )
          )
        )
      `);
    }

    await queryRunner.query(`DROP FUNCTION IF EXISTS app.user_has_permission(text)`);
  }
}
