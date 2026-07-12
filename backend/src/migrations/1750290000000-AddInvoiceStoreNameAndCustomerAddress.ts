import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddInvoiceStoreNameAndCustomerAddress1750290000000 implements MigrationInterface {
  name = "AddInvoiceStoreNameAndCustomerAddress1750290000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD COLUMN "store_name" character varying(512),
      ADD COLUMN "customer_address" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      DROP COLUMN "store_name",
      DROP COLUMN "customer_address"
    `);
  }
}
