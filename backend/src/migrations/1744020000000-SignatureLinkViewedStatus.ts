import { MigrationInterface, QueryRunner } from "typeorm";

export class SignatureLinkViewedStatus1744020000000 implements MigrationInterface {
  name = "SignatureLinkViewedStatus1744020000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $block$
      BEGIN
        ALTER TYPE "customer_form_submission_status_enum" ADD VALUE 'signature_link_viewed';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
      $block$;
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot remove a single enum label safely.
  }
}
