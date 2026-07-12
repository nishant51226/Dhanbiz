import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Main row status is only `draft` (onboarding in progress, including DocuSeal in flight) or `completed` (active / done).
 * Legacy `pending_signature` / `signature_link_viewed` are folded back to `draft`; DocuSeal detail lives in `metadata`.
 */
export class FormSubmissionStatusDraftCompletedOnly1744030000000 implements MigrationInterface {
  name = "FormSubmissionStatusDraftCompletedOnly1744030000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "customer_form_submission"
      SET "status" = 'draft'::"customer_form_submission_status_enum"
      WHERE "status"::text IN ('pending_signature', 'signature_link_viewed')
    `);
  }

  public async down(): Promise<void> {
    // Cannot reliably restore previous status labels.
  }
}
