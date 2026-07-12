import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFoldersIsRestrictedAndFolderRestrictedTable1749490000000 implements MigrationInterface {
  name = "AddFoldersIsRestrictedAndFolderRestrictedTable1749490000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL row_security = off`);
    await queryRunner.query(`
      ALTER TABLE "folders"
      ADD COLUMN IF NOT EXISTS "is_restricted" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "folder_restricted" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NULL,
        "folder_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_folder_restricted_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_folder_restricted_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_folder_restricted_folder" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_folder_restricted_customer" ON "folder_restricted" ("customer_id") WHERE "customer_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_folder_restricted_global" ON "folder_restricted" ((TRUE)) WHERE "customer_id" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_folder_restricted_global"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_folder_restricted_customer"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "folder_restricted"`);
    await queryRunner.query(`ALTER TABLE "folders" DROP COLUMN IF EXISTS "is_restricted"`);
  }
}
