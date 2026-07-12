import { MigrationInterface, QueryRunner } from "typeorm";

export class CustomerFormSubmissionMetadata1744000000000 implements MigrationInterface {
  name = "CustomerFormSubmissionMetadata1744000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $block$
      BEGIN
        ALTER TYPE "customer_form_submission_status_enum" ADD VALUE 'pending_signature';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
      $block$;
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_form_submission"
      ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      DO $migrate$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'customer_form_submission'
            AND column_name = 'docuseal_submission_id'
        ) THEN
          UPDATE "customer_form_submission"
          SET "metadata" = jsonb_set(
            COALESCE("metadata", '{}'::jsonb),
            '{docuseal}',
            jsonb_build_object(
              'submissionId', "docuseal_submission_id",
              'status', 'pending_signature'
            ),
            true
          )
          WHERE "docuseal_submission_id" IS NOT NULL
            AND length(trim("docuseal_submission_id")) > 0;
        END IF;
      END $migrate$;
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_form_submission" DROP COLUMN IF EXISTS "docuseal_submission_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_form_submission" DROP COLUMN IF EXISTS "metadata"
    `);
    // PostgreSQL cannot easily remove a single enum label; leave enum value in place.
  }
}
