import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedDefaultAdminUser1743462150000 implements MigrationInterface {
  name = "SeedDefaultAdminUser1743462150000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("users"))) {
      return;
    }

    await queryRunner.query(`
      INSERT INTO "users" (
        "id",
        "email",
        "password_hash",
        "customer_id",
        "phone_number",
        "is_admin",
        "created_at",
        "updated_at"
      )
      VALUES (
        'b4f4e0b9-8895-445b-b67a-dd47a439fae3',
        'admin@example.com',
        '$2b$12$UIB6Ll.BR9w10TvpNknW9OsRFqtL/WD9GbksqCtSy/b.pQD2ll/ge',
        NULL,
        '+11234567890',
        true,
        '2026-04-01 12:11:24.271074',
        '2026-04-01 12:11:24.271074'
      )
      ON CONFLICT ("email") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("users"))) {
      return;
    }

    await queryRunner.query(`
      DELETE FROM "users"
      WHERE "id" = 'b4f4e0b9-8895-445b-b67a-dd47a439fae3'
    `);
  }
}
