import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFilesMetadata1745400000000 implements MigrationInterface {
  name = "AddFilesMetadata1745400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "files"
      ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "files" DROP COLUMN IF EXISTS "metadata"
    `);
  }
}
