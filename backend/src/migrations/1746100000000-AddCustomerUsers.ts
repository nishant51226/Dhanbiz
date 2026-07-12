import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerUsers1746100000000 implements MigrationInterface {
  name = "AddCustomerUsers1746100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customer_users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customer_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customer_users_customer_user" UNIQUE ("customer_id", "user_id"),
        CONSTRAINT "FK_customer_users_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_customer_users_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_customer_users_role" FOREIGN KEY ("role_id")
          REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_customer_users_customer_id" ON "customer_users" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_customer_users_user_id" ON "customer_users" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_customer_users_role_id" ON "customer_users" ("role_id")`);

    await queryRunner.query(`
      INSERT INTO "customer_users" ("customer_id", "user_id", "role_id", "is_active", "created_at", "updated_at")
      SELECT u.customer_id, u.id, sub.role_id, true, NOW(), NOW()
      FROM "users" u
      INNER JOIN LATERAL (
        SELECT ur.role_id
        FROM "user_roles" ur
        LEFT JOIN "roles" r ON r.id = ur.role_id
        WHERE ur.user_id = u.id
        ORDER BY CASE WHEN r.name = 'customer_portal' THEN 0 ELSE 1 END, ur.created_at ASC
        LIMIT 1
      ) sub ON true
      WHERE u.customer_id IS NOT NULL AND u.is_admin = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customer_users_role_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customer_users_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customer_users_customer_id"`);
    await queryRunner.query(`DROP TABLE "customer_users"`);
  }
}
