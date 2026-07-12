import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1730246400000 implements MigrationInterface {
  name = "InitSchema1730246400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(512) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "files_type_enum" AS ENUM ('folder', 'file')
    `);
    await queryRunner.query(`
      CREATE TABLE "files" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "parent_id" uuid,
        "type" "files_type_enum" NOT NULL,
        "name" character varying(1024) NOT NULL,
        "mime_type" character varying(256),
        "size_bytes" bigint,
        "storage_relative_path" character varying(2048),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_files" PRIMARY KEY ("id"),
        CONSTRAINT "FK_files_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_files_parent" FOREIGN KEY ("parent_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_files_customer_parent" ON "files" ("customer_id", "parent_id")`);
    await queryRunner.query(`
      CREATE TYPE "jobs_type_enum" AS ENUM ('extraction')
    `);
    await queryRunner.query(`
      CREATE TYPE "jobs_status_enum" AS ENUM ('queued', 'processing', 'completed', 'failed')
    `);
    await queryRunner.query(`
      CREATE TABLE "jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "file_id" uuid NOT NULL,
        "type" "jobs_type_enum" NOT NULL,
        "status" "jobs_status_enum" NOT NULL DEFAULT 'queued'::jobs_status_enum,
        "percent_completed" smallint NOT NULL DEFAULT 0,
        "result" jsonb,
        "error" text,
        "pg_boss_job_id" character varying(128),
        "vision_prompt" text,
        "structure_prompt" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_jobs_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_jobs_file" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "jobs"`);
    await queryRunner.query(`DROP TYPE "jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE "jobs_type_enum"`);
    await queryRunner.query(`DROP INDEX "IDX_files_customer_parent"`);
    await queryRunner.query(`DROP TABLE "files"`);
    await queryRunner.query(`DROP TYPE "files_type_enum"`);
    await queryRunner.query(`DROP TABLE "customers"`);
  }
}
