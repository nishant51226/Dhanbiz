import { MigrationInterface, QueryRunner } from "typeorm";

/** No-op migration for exercising the migration runner; remove when no longer needed. */
export class DummyTestMigration1743900000000 implements MigrationInterface {
  name = "DummyTestMigration1743900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT 1`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT 1`);
  }
}
