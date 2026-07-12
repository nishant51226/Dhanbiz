import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsAdminToUsers_1733158200000 implements MigrationInterface {
  name = "AddIsAdminToUsers_1733158200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("users"))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("users"))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS is_admin
    `);
  }
}

