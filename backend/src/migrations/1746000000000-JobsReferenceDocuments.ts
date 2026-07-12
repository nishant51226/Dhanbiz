import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Jobs (and extraction persistence) can reference `documents.id` instead of `files.id`.
 * Portal uploads store the binary once under `documents.file_url`; legacy jobs keep `file_id`.
 */
export class JobsReferenceDocuments1746000000000 implements MigrationInterface {
  name = "JobsReferenceDocuments1746000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" ADD "document_id" uuid`);
    await queryRunner.query(`ALTER TABLE "financial_documents" ADD "document_id" uuid`);
    await queryRunner.query(`ALTER TABLE "extraction_segments" ADD "document_id" uuid`);

    await queryRunner.query(`
      UPDATE "jobs" j
      SET "document_id" = d.id
      FROM "documents" d
      WHERE j."document_id" IS NULL
        AND j."file_id" IS NOT NULL
        AND d.metadata ? 'fileId'
        AND (d.metadata->>'fileId')::uuid = j."file_id"
    `);

    await queryRunner.query(`
      UPDATE "financial_documents" fd
      SET "document_id" = j."document_id"
      FROM "jobs" j
      WHERE fd."job_id" = j.id
        AND j."document_id" IS NOT NULL
        AND fd."document_id" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "extraction_segments" es
      SET "document_id" = j."document_id"
      FROM "jobs" j
      WHERE es."job_id" = j.id
        AND j."document_id" IS NOT NULL
        AND es."document_id" IS NULL
    `);

    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "file_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "financial_documents" ALTER COLUMN "file_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "extraction_segments" ALTER COLUMN "file_id" DROP NOT NULL`);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD CONSTRAINT "FK_jobs_document" FOREIGN KEY ("document_id") REFERENCES "documents"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "financial_documents"
      ADD CONSTRAINT "FK_financial_documents_document" FOREIGN KEY ("document_id") REFERENCES "documents"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "extraction_segments"
      ADD CONSTRAINT "FK_extraction_segments_document" FOREIGN KEY ("document_id") REFERENCES "documents"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "jobs" ADD CONSTRAINT "CHK_jobs_file_or_document"
      CHECK ("file_id" IS NOT NULL OR "document_id" IS NOT NULL)
    `);
    await queryRunner.query(`
      ALTER TABLE "financial_documents" ADD CONSTRAINT "CHK_financial_documents_file_or_document"
      CHECK ("file_id" IS NOT NULL OR "document_id" IS NOT NULL)
    `);
    await queryRunner.query(`
      ALTER TABLE "extraction_segments" ADD CONSTRAINT "CHK_extraction_segments_file_or_document"
      CHECK ("file_id" IS NOT NULL OR "document_id" IS NOT NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "extraction_segments" DROP CONSTRAINT IF EXISTS "CHK_extraction_segments_file_or_document"`
    );
    await queryRunner.query(
      `ALTER TABLE "financial_documents" DROP CONSTRAINT IF EXISTS "CHK_financial_documents_file_or_document"`
    );
    await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "CHK_jobs_file_or_document"`);

    await queryRunner.query(`ALTER TABLE "extraction_segments" DROP CONSTRAINT IF EXISTS "FK_extraction_segments_document"`);
    await queryRunner.query(`ALTER TABLE "financial_documents" DROP CONSTRAINT IF EXISTS "FK_financial_documents_document"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "FK_jobs_document"`);

    await queryRunner.query(`UPDATE "extraction_segments" SET "document_id" = NULL`);
    await queryRunner.query(`UPDATE "financial_documents" SET "document_id" = NULL`);
    await queryRunner.query(`UPDATE "jobs" SET "document_id" = NULL`);

    await queryRunner.query(`ALTER TABLE "extraction_segments" DROP COLUMN IF EXISTS "document_id"`);
    await queryRunner.query(`ALTER TABLE "financial_documents" DROP COLUMN IF EXISTS "document_id"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN IF EXISTS "document_id"`);

    await queryRunner.query(`ALTER TABLE "extraction_segments" ALTER COLUMN "file_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "financial_documents" ALTER COLUMN "file_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "file_id" SET NOT NULL`);
  }
}
