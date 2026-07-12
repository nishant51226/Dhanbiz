import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Re-applies schema changes that could be skipped by early migrations guarded
 * when `users` / `user_roles` did not exist yet (see 1733158200000, 1733155200000).
 */
export class ApplySkippedEarlyGuardSchema1743462100000 implements MigrationInterface {
  name = "ApplySkippedEarlyGuardSchema1743462100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable("users")) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false
      `);
    }

    if (!(await queryRunner.hasTable("user_roles"))) {
      return;
    }

    if (await queryRunner.hasColumn("user_roles", "customer_id")) {
      await queryRunner.query(`
        WITH ranked AS (
          SELECT id,
                 user_id,
                 role_id,
                 customer_id,
                 ROW_NUMBER() OVER (PARTITION BY user_id, role_id ORDER BY created_at) AS rn
          FROM user_roles
        )
        DELETE FROM user_roles ur
        USING ranked r
        WHERE ur.id = r.id
          AND r.rn > 1
      `);

      await queryRunner.query(`
        DO $$
        DECLARE
          con RECORD;
        BEGIN
          FOR con IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'user_roles'::regclass
              AND pg_get_constraintdef(oid) LIKE '%customer_id%'
          LOOP
            EXECUTE 'ALTER TABLE user_roles DROP CONSTRAINT "' || con.conname || '"';
          END LOOP;

          IF EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'user_roles' AND indexname = 'uq_user_roles_user_role_customer'
          ) THEN
            EXECUTE 'DROP INDEX IF EXISTS "uq_user_roles_user_role_customer"';
          END IF;
        END$$;
      `);

      await queryRunner.query(`
        ALTER TABLE user_roles
        DROP COLUMN IF EXISTS customer_id
      `);
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'uq_user_roles_user_role'
        ) THEN
          CREATE UNIQUE INDEX uq_user_roles_user_role ON user_roles (user_id, role_id);
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // is_admin is not removed: it may come from AddUsers or this migration.

    if (!(await queryRunner.hasTable("user_roles"))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE user_roles
      ADD COLUMN IF NOT EXISTS customer_id uuid NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_user_roles_customer_id'
        ) THEN
          ALTER TABLE user_roles
          ADD CONSTRAINT "FK_user_roles_customer_id" FOREIGN KEY (customer_id)
          REFERENCES customers (id) ON DELETE CASCADE;
        END IF;
      END$$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'uq_user_roles_user_role'
        ) THEN
          DROP INDEX uq_user_roles_user_role;
        END IF;
      END$$;
    `);
  }
}
