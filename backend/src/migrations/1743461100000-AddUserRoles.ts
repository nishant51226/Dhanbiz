import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserRoles1743461100000 implements MigrationInterface {
  name = "AddUserRoles1743461100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_roles_user_role_customer" UNIQUE ("user_id", "role_id", "customer_id"),
        CONSTRAINT "FK_user_roles_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_user_roles_role" FOREIGN KEY ("role_id")
          REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_user_roles_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_user_roles_user_id" ON "user_roles" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_roles_role_id" ON "user_roles" ("role_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_roles_customer_id" ON "user_roles" ("customer_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_roles_customer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_roles_role_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_roles_user_id"`);
    await queryRunner.query(`DROP TABLE "user_roles"`);
  }
}

