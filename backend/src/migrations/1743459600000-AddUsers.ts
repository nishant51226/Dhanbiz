import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUsers1743459600000 implements MigrationInterface {
  name = "AddUsers1743459600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(320) NOT NULL,
        "password_hash" text NOT NULL,
        "customer_id" uuid NULL,
        "phone_number" varchar(32),
        "is_admin" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "FK_users_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_users_customer_id" ON "users" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_customer_id"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}

