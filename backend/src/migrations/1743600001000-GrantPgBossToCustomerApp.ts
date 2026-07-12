import { MigrationInterface, QueryRunner } from "typeorm";

export class GrantPgBossToCustomerApp_1743600001000 implements MigrationInterface {
  name = "GrantPgBossToCustomerApp_1743600001000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure pgboss schema exists (owned by the migration owner/admin)
    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pgboss') THEN
    EXECUTE 'CREATE SCHEMA pgboss';
  END IF;
END$$;
    `);

    // Allow the app role to create/use objects inside pgboss and perform DML
    await queryRunner.query(`
GRANT USAGE ON SCHEMA pgboss TO customer_app;
GRANT CREATE ON SCHEMA pgboss TO customer_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO customer_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO customer_app;
    `);

    // Default privileges for future objects created by the migration owner in pgboss
    await queryRunner.query(`
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO customer_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
  GRANT USAGE, SELECT ON SEQUENCES TO customer_app;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revoke permissions (keep schema intact)
    await queryRunner.query(`
REVOKE CREATE ON SCHEMA pgboss FROM customer_app;
REVOKE USAGE ON SCHEMA pgboss FROM customer_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss FROM customer_app;
REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss FROM customer_app;
    `);
  }
}

