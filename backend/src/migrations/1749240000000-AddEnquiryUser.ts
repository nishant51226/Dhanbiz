import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEnquiryUser1749240000000 implements MigrationInterface {
  name = "AddEnquiryUser1749240000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "enquiry_user" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "full_name" character varying(255) NOT NULL,
        "interest" character varying(500) NOT NULL,
        "phone" character varying(50) NOT NULL,
        "country_code" character varying(16) NOT NULL,
        "email" character varying(255) NOT NULL,
        CONSTRAINT "PK_enquiry_user" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_enquiry_user_email" ON "enquiry_user" ("email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_enquiry_user_email"`);
    await queryRunner.query(`DROP TABLE "enquiry_user"`);
  }
}
