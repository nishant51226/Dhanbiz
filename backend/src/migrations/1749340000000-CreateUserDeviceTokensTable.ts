import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserDeviceTokensTable1749340000000 implements MigrationInterface {
  name = "CreateUserDeviceTokensTable1749340000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_device_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "firebase_token" text NOT NULL,
        "device_type" varchar(20),
        "device_id" text,
        "app_version" varchar(50),
        "is_active" boolean NOT NULL DEFAULT true,
        "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_device_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_device_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_device_tokens_user_id" ON "user_device_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_device_tokens_user_id_active" ON "user_device_tokens" ("user_id", "is_active")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_device_tokens_user_id_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_device_tokens_user_id"`);
    await queryRunner.query(`DROP TABLE "user_device_tokens"`);
  }
}
