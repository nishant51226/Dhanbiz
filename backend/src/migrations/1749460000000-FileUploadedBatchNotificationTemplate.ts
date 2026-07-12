import type { MigrationInterface, QueryRunner } from "typeorm";

/** Prefer {{uploadSummary}} so one notification can describe multi-file uploads. */
export class FileUploadedBatchNotificationTemplate1749460000000 implements MigrationInterface {
  name = "FileUploadedBatchNotificationTemplate1749460000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "notification_event_configs"
      SET
        "title_template" = 'Files uploaded',
        "body_template" = '{{uploadSummary}} uploaded for {{customerName}}.',
        "available_placeholders" = '["customerName","fileName","fileCount","uploadSummary","customerId","fileId"]'::jsonb
      WHERE "event_key" = 'file.uploaded'
        AND "body_template" = 'A new file was uploaded for {{customerName}}.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "notification_event_configs"
      SET
        "title_template" = 'New file uploaded',
        "body_template" = 'A new file was uploaded for {{customerName}}.',
        "available_placeholders" = '["customerName","fileName","customerId","fileId"]'::jsonb
      WHERE "event_key" = 'file.uploaded'
        AND "body_template" = '{{uploadSummary}} uploaded for {{customerName}}.'
    `);
  }
}
