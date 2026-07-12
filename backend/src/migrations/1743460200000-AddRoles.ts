import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRoles1743460200000 implements MigrationInterface {
  name = "AddRoles1743460200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(128) NOT NULL,
        "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roles" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_roles_name" ON "roles" ("name")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_roles_name"`);
    await queryRunner.query(`DROP TABLE "roles"`);
  }
}

