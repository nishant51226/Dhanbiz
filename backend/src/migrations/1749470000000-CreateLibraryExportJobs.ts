import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateLibraryExportJobs1749470000000 implements MigrationInterface {
  name = "CreateLibraryExportJobs1749470000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "library_export_jobs_status_enum" AS ENUM ('queued', 'processing', 'completed', 'failed')
    `);

    await queryRunner.query(`
      CREATE TABLE "library_export_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "requested_by_user_id" uuid NOT NULL,
        "status" "library_export_jobs_status_enum" NOT NULL DEFAULT 'queued',
        "filters" jsonb NOT NULL DEFAULT '{}',
        "s3_key" varchar(4096),
        "zip_file_name" varchar(512),
        "file_count" int NOT NULL DEFAULT 0,
        "error" text,
        "pg_boss_job_id" varchar(128),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_library_export_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_library_export_jobs_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_library_export_jobs_user" FOREIGN KEY ("requested_by_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_library_export_jobs_customer" ON "library_export_jobs" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_library_export_jobs_requested_by" ON "library_export_jobs" ("requested_by_user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "library_export_jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "library_export_jobs_status_enum"`);
  }
}
