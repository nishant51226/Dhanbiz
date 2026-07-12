import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFinancialExtractionEntities1730700000000 implements MigrationInterface {
  name = "AddFinancialExtractionEntities1730700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "financial_documents" (
        "id" uuid NOT NULL,
        "job_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "file_id" uuid NOT NULL,
        "doc_type" character varying(32) NOT NULL,
        "page_start" integer NOT NULL,
        "page_end" integer NOT NULL,
        "doc_status" character varying(32) NOT NULL,
        "invoice_payload" jsonb,
        "statement_payload" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_financial_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_financial_documents_job" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_financial_documents_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_financial_documents_file" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_financial_documents_customer" ON "financial_documents" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_financial_documents_job" ON "financial_documents" ("job_id")`);

    await queryRunner.query(`
      CREATE TABLE "extraction_segments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "job_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "file_id" uuid NOT NULL,
        "page_number" integer NOT NULL,
        "text" text NOT NULL DEFAULT '',
        "text_source" character varying(16) NOT NULL,
        "segment_kind" character varying(32),
        "classification" jsonb,
        "classification_raw" text,
        "extracted_data" jsonb,
        "extracted_raw" text,
        "extracted_parse_error" text,
        "segment_status" character varying(32) NOT NULL,
        "financial_document_id" uuid,
        "pipeline_segment_id" character varying(256) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_extraction_segments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_extraction_segments_job_page" UNIQUE ("job_id", "page_number"),
        CONSTRAINT "FK_extraction_segments_job" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_extraction_segments_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_extraction_segments_file" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_extraction_segments_financial_document" FOREIGN KEY ("financial_document_id") REFERENCES "financial_documents"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_extraction_segments_customer" ON "extraction_segments" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_extraction_segments_job" ON "extraction_segments" ("job_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "extraction_segments"`);
    await queryRunner.query(`DROP TABLE "financial_documents"`);
  }
}
