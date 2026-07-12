import { MigrationInterface, QueryRunner } from "typeorm";

export class CustomerDocumentsExportJobsNullableCustomer1750110000000 implements MigrationInterface {
  name = "CustomerDocumentsExportJobsNullableCustomer1750110000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_documents_export_jobs"
      ALTER COLUMN "customer_id" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "customer_documents_export_jobs" WHERE "customer_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_documents_export_jobs"
      ALTER COLUMN "customer_id" SET NOT NULL
    `);
  }
}
