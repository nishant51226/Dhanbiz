import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInvoiceLineItemsDescription1750120000000 implements MigrationInterface {
  name = "AddInvoiceLineItemsDescription1750120000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD COLUMN "line_items_description" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      DROP COLUMN "line_items_description"
    `);
  }
}
