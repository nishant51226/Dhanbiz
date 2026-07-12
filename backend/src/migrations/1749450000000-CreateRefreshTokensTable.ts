import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRefreshTokensTable1749450000000 implements MigrationInterface {
  name = "CreateRefreshTokensTable1749450000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" varchar(64) NOT NULL,
        "family_id" uuid NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        "replaced_by_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_refresh_tokens_replaced_by" FOREIGN KEY ("replaced_by_id")
          REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_family_id" ON "refresh_tokens" ("family_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_refresh_tokens_token_hash_active" ON "refresh_tokens" ("token_hash") WHERE "revoked_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_refresh_tokens_token_hash_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_family_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_user_id"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
