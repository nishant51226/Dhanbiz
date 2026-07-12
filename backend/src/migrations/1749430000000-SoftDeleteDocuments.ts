import { MigrationInterface, QueryRunner } from "typeorm";

export class SoftDeleteDocuments1749430000000 implements MigrationInterface {
  name = "SoftDeleteDocuments1749430000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_documents_deleted_at"
      ON "documents" ("deleted_at")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
