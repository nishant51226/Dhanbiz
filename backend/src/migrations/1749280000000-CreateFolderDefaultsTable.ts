import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFolderDefaultsTable1749280000000 implements MigrationInterface {
  name = "CreateFolderDefaultsTable1749280000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL row_security = off`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "folder_defaults" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "type" "folders_kind_enum" NOT NULL,
        "customer_id" uuid NULL,
        "folder_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_folder_defaults_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_folder_defaults_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_folder_defaults_folder" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_folder_defaults_type_customer"
      ON "folder_defaults" ("type", "customer_id")
    `);
    await queryRunner.query(`ALTER TABLE "folders" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      INSERT INTO "folder_defaults" ("type", "customer_id", "folder_id")
      SELECT f."type", NULL, f."id"
      FROM "folders" f
      WHERE f."is_default" = true AND f."customer_id" IS NULL
      ON CONFLICT ("type", "customer_id") DO UPDATE SET
        "folder_id" = EXCLUDED."folder_id",
        "updated_at" = now()
    `);
    await queryRunner.query(`ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "folders" FORCE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_folder_defaults_type_customer"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "folder_defaults"`);
  }
}
