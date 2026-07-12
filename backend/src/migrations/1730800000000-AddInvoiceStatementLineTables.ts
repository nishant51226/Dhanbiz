import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInvoiceStatementLineTables1730800000000 implements MigrationInterface {
  name = "AddInvoiceStatementLineTables1730800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "financial_document_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "vendor" character varying(512),
        "customer_name" character varying(512),
        "invoice_number" character varying(256),
        "invoice_date" character varying(64),
        "due_date" character varying(64),
        "currency" character varying(16),
        "subtotal" double precision,
        "tax" double precision,
        "total" double precision,
        "notes" text,
        "status" character varying(32) NOT NULL,
        "validation_json" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoices" PRIMARY KEY ("financial_document_id"),
        CONSTRAINT "FK_invoices_financial_document" FOREIGN KEY ("financial_document_id") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_invoices_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_customer" ON "invoices" ("customer_id")`);

    await queryRunner.query(`
      CREATE TABLE "invoice_lines" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "invoice_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "line_index" integer NOT NULL,
        "description" text,
        "quantity" double precision,
        "unit_price" double precision,
        "amount" double precision,
        "discount" double precision,
        "tax_amount" double precision,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoice_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoice_lines_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("financial_document_id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_invoice_lines_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_invoice_lines_customer" ON "invoice_lines" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoice_lines_invoice" ON "invoice_lines" ("invoice_id")`);

    await queryRunner.query(`
      CREATE TABLE "statements" (
        "financial_document_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "account_holder" character varying(512),
        "bank_name" character varying(512),
        "account_number" character varying(256),
        "period_start" character varying(64),
        "period_end" character varying(64),
        "currency" character varying(16),
        "opening_balance" double precision,
        "closing_balance" double precision,
        "notes" text,
        "status" character varying(32) NOT NULL,
        "validation_json" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_statements" PRIMARY KEY ("financial_document_id"),
        CONSTRAINT "FK_statements_financial_document" FOREIGN KEY ("financial_document_id") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_statements_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_statements_customer" ON "statements" ("customer_id")`);

    await queryRunner.query(`
      CREATE TABLE "statement_lines" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "statement_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "line_index" integer NOT NULL,
        "date" character varying(64),
        "description" text,
        "debit" double precision,
        "credit" double precision,
        "balance" double precision,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_statement_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_statement_lines_statement" FOREIGN KEY ("statement_id") REFERENCES "statements"("financial_document_id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_statement_lines_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_statement_lines_customer" ON "statement_lines" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_statement_lines_statement" ON "statement_lines" ("statement_id")`);

    await queryRunner.query(`ALTER TABLE "financial_documents" DROP COLUMN IF EXISTS "invoice_payload"`);
    await queryRunner.query(`ALTER TABLE "financial_documents" DROP COLUMN IF EXISTS "statement_payload"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "financial_documents" ADD COLUMN IF NOT EXISTS "invoice_payload" jsonb`);
    await queryRunner.query(`ALTER TABLE "financial_documents" ADD COLUMN IF NOT EXISTS "statement_payload" jsonb`);
    await queryRunner.query(`DROP TABLE "statement_lines"`);
    await queryRunner.query(`DROP TABLE "statements"`);
    await queryRunner.query(`DROP TABLE "invoice_lines"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
  }
}
