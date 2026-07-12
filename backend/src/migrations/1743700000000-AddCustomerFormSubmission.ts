import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerFormSubmission1743700000000 implements MigrationInterface {
  name = "AddCustomerFormSubmission1743700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "customer_form_submission_status_enum" AS ENUM ('draft', 'completed')
    `);
    await queryRunner.query(`
      CREATE TABLE "customer_form_submission" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" "customer_form_submission_status_enum" NOT NULL DEFAULT 'draft'::customer_form_submission_status_enum,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customer_form_submission" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customer_form_submission_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_form_submission_customer_id" ON "customer_form_submission" ("customer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customer_form_submission_customer_id"`);
    await queryRunner.query(`DROP TABLE "customer_form_submission"`);
    await queryRunner.query(`DROP TYPE "customer_form_submission_status_enum"`);
  }
}
