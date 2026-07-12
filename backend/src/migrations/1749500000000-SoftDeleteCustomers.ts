import { MigrationInterface, QueryRunner } from "typeorm";

/** Soft-delete support for draft customer archive (`deleted_at` on `customers`). */
export class SoftDeleteCustomers1749500000000 implements MigrationInterface {
  name = "SoftDeleteCustomers1749500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customers_deleted_at"
      ON "customers" ("deleted_at")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
