import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Customer library structure: typed folder trees (files / statements / invoices) and document rows per folder.
 * Migration only — no application code wired yet.
 */
export class AddCustomerFoldersAndDocuments1745500000000 implements MigrationInterface {
  name = "AddCustomerFoldersAndDocuments1745500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "folders_kind_enum" AS ENUM ('files', 'statements', 'invoices')
    `);
    await queryRunner.query(`
      CREATE TABLE "folders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(1024) NOT NULL,
        "parent_id" uuid,
        "type" "folders_kind_enum" NOT NULL,
        "customer_id" uuid NOT NULL,
        CONSTRAINT "PK_folders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_folders_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_folders_parent" FOREIGN KEY ("parent_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_folders_customer_type_parent" ON "folders" ("customer_id", "type", "parent_id")
    `);
    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "folder_id" uuid NOT NULL,
        "name" character varying(1024) NOT NULL,
        "file_url" character varying(4096) NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "PK_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_documents_folder" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_documents_folder_id" ON "documents" ("folder_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(`DROP TABLE "folders"`);
    await queryRunner.query(`DROP TYPE "folders_kind_enum"`);
  }
}
