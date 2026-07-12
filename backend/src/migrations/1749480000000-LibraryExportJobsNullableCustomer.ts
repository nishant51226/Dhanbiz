import { MigrationInterface, QueryRunner } from "typeorm";

export class LibraryExportJobsNullableCustomer1749480000000 implements MigrationInterface {
  name = "LibraryExportJobsNullableCustomer1749480000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "library_export_jobs"
      ALTER COLUMN "customer_id" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "library_export_jobs" WHERE "customer_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "library_export_jobs"
      ALTER COLUMN "customer_id" SET NOT NULL
    `);
  }
}
