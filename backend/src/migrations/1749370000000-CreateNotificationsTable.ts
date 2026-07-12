import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateNotificationsTable1749370000000 implements MigrationInterface {
  name = "CreateNotificationsTable1749370000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(200) NOT NULL,
        "body" text NOT NULL,
        "type" varchar(64) NOT NULL,
        "image_url" text,
        "data" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_type" ON "notifications" ("type")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_type"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
