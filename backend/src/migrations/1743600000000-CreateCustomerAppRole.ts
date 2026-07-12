import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCustomerAppRole_1743600000000 implements MigrationInterface {
  name = "CreateCustomerAppRole_1743600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Create or update the application role (no RLS bypass, least privilege)
    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'customer_app') THEN
    CREATE ROLE customer_app LOGIN
      PASSWORD 'ai_customer_app'
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      INHERIT;
  ELSE
    ALTER ROLE customer_app LOGIN PASSWORD 'ai_customer_app';
  END IF;
END$$;
    `);

    // 2) Allow connecting to the current database
    await queryRunner.query(`
DO $$
DECLARE
  db TEXT := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', db, 'customer_app');
END$$;
    `);

    // 3) Runtime DML + sequence usage on public schema objects
    await queryRunner.query(`
GRANT USAGE ON SCHEMA public TO customer_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO customer_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO customer_app;
    `);

    // 4) Default privileges for future objects created by the migration owner
    await queryRunner.query(`
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO customer_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO customer_app;
    `);

    // 5) Ensure access to typeorm_migrations if it already exists
    await queryRunner.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'typeorm_migrations'
  ) THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.typeorm_migrations TO customer_app;
  END IF;
END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best-effort revoke grants and drop the role
    await queryRunner.query(`
DO $$
DECLARE
  db TEXT := current_database();
BEGIN
  BEGIN
    EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM %I', db, 'customer_app');
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    REVOKE USAGE ON SCHEMA public FROM customer_app;
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM customer_app;
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM customer_app;
  EXCEPTION WHEN others THEN NULL;
  END;
END$$;
    `);

    await queryRunner.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'customer_app') THEN
    DROP ROLE customer_app;
  END IF;
END$$;
    `);
  }
}

