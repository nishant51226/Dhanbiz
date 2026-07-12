import { MigrationInterface, QueryRunner } from "typeorm";

export class FilesAndDocumentsS3Key1746200000000 implements MigrationInterface {
  name = "FilesAndDocumentsS3Key1746200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "files"
      ADD COLUMN IF NOT EXISTS "s3_key" character varying(4096)
    `);
    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN IF NOT EXISTS "s3_key" character varying(4096)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "s3_key"`);
    await queryRunner.query(`ALTER TABLE "files" DROP COLUMN IF EXISTS "s3_key"`);
  }
}
