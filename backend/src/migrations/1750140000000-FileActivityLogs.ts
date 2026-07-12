import { MigrationInterface, QueryRunner } from "typeorm";

export class FileActivityLogs1750140000000 implements MigrationInterface {
  name = "FileActivityLogs1750140000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "file_activity_action" AS ENUM (
        'uploaded',
        'viewed',
        'downloaded',
        'deleted',
        'assignees_updated',
        'job_created',
        'job_processing',
        'job_completed',
        'job_failed',
        'job_cancelled'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "file_activity_actor_kind" AS ENUM ('staff', 'portal', 'system')
    `);

    await queryRunner.query(`
      CREATE TABLE "file_activity_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "document_id" uuid,
        "file_id" uuid,
        "job_id" uuid,
        "action" "file_activity_action" NOT NULL,
        "actor_user_id" uuid,
        "actor_kind" "file_activity_actor_kind" NOT NULL,
        "summary" character varying(512) NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "ip_address" character varying(64),
        "user_agent" character varying(512),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_file_activity_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_file_activity_logs_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_file_activity_logs_document" FOREIGN KEY ("document_id")
          REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_file_activity_logs_file" FOREIGN KEY ("file_id")
          REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_file_activity_logs_job" FOREIGN KEY ("job_id")
          REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_file_activity_logs_actor" FOREIGN KEY ("actor_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_file_activity_logs_document_created" ON "file_activity_logs" ("document_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_file_activity_logs_file_created" ON "file_activity_logs" ("file_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_file_activity_logs_customer_created" ON "file_activity_logs" ("customer_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_file_activity_logs_action_created" ON "file_activity_logs" ("action", "created_at" DESC)`,
    );

    await queryRunner.query(`ALTER TABLE "file_activity_logs" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "file_activity_logs" FORCE ROW LEVEL SECURITY`);

    await queryRunner.query(`
      CREATE POLICY file_activity_logs_select_admin ON "file_activity_logs"
      FOR SELECT
      USING (current_setting('app.is_admin', true) = '1')
    `);

    await queryRunner.query(`
      CREATE POLICY file_activity_logs_insert_tenant ON "file_activity_logs"
      FOR INSERT
      WITH CHECK (
        current_setting('app.is_admin', true) = '1'
        OR customer_id = (NULLIF(current_setting('app.customer_id', true), ''))::uuid
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "file_activity_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "file_activity_actor_kind"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "file_activity_action"`);
  }
}
