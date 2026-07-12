import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerAccountStatus1748010000000 implements MigrationInterface {
  name = "AddCustomerAccountStatus1748010000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "customers_account_status_enum" AS ENUM ('draft', 'active', 'inactive', 'proposed')
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN "account_status" "customers_account_status_enum" NOT NULL DEFAULT 'draft'
    `);
    await queryRunner.query(`
      UPDATE "customers" SET "account_status" = 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "account_status"`);
    await queryRunner.query(`DROP TYPE "customers_account_status_enum"`);
  }
}
