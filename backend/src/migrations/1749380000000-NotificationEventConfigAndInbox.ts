import { MigrationInterface, QueryRunner } from "typeorm";

export class NotificationEventConfigAndInbox1749380000000 implements MigrationInterface {
  name = "NotificationEventConfigAndInbox1749380000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_type"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);

    await queryRunner.query(`
      CREATE TABLE "notification_event_configs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "event_key" varchar(64) NOT NULL,
        "label" varchar(128) NOT NULL,
        "description" text,
        "trigger_type" varchar(16) NOT NULL DEFAULT 'event',
        "title_template" varchar(200) NOT NULL,
        "body_template" text NOT NULL,
        "image_url_template" text,
        "default_link_url" varchar(2048),
        "is_enabled" boolean NOT NULL DEFAULT true,
        "push_enabled" boolean NOT NULL DEFAULT true,
        "in_app_enabled" boolean NOT NULL DEFAULT true,
        "available_placeholders" jsonb NOT NULL DEFAULT '[]',
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_event_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_event_configs_event_key" UNIQUE ("event_key"),
        CONSTRAINT "CHK_notification_event_configs_trigger_type"
          CHECK ("trigger_type" IN ('event', 'manual'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_event_audiences" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "event_config_id" uuid NOT NULL,
        "audience_type" varchar(48) NOT NULL,
        "role_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_event_audiences" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notification_event_audiences_config" FOREIGN KEY ("event_config_id")
          REFERENCES "notification_event_configs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_notification_event_audiences_role" FOREIGN KEY ("role_id")
          REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "CHK_notification_event_audiences_type" CHECK (
          "audience_type" IN (
            'context_customer_portal_users',
            'context_customer_admins',
            'context_practice_staff_on_customer',
            'all_portal_users',
            'role',
            'all_practice_staff_with_role'
          )
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_event_audiences_config" ON "notification_event_audiences" ("event_config_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "event_config_id" uuid,
        "event_key" varchar(64),
        "name" varchar(200) NOT NULL,
        "body" text NOT NULL,
        "type" varchar(64) NOT NULL,
        "image_url" text,
        "data" jsonb NOT NULL DEFAULT '{}',
        "read_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_notifications_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_user_notifications_event_config" FOREIGN KEY ("event_config_id")
          REFERENCES "notification_event_configs"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_notifications_user_created" ON "user_notifications" ("user_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_notifications_user_unread" ON "user_notifications" ("user_id") WHERE "read_at" IS NULL`,
    );

    await queryRunner.query(`
      INSERT INTO "notification_event_configs" (
        "event_key", "label", "description", "trigger_type",
        "title_template", "body_template", "available_placeholders", "sort_order"
      ) VALUES
      (
        'file.uploaded',
        'File uploaded',
        'Fires when a file is uploaded to a customer library or portal.',
        'event',
        'New file uploaded',
        'A new file was uploaded for {{customerName}}.',
        '["customerName","fileName","customerId","fileId"]'::jsonb,
        10
      ),
      (
        'customer.created',
        'Customer created',
        'Fires when a new customer record is created.',
        'event',
        'New customer',
        'Customer {{customerName}} was created.',
        '["customerName","customerId"]'::jsonb,
        20
      )
      ON CONFLICT ("event_key") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "notification_event_audiences" ("event_config_id", "audience_type", "role_id")
      SELECT c.id, 'context_customer_portal_users', NULL
      FROM "notification_event_configs" c
      WHERE c."event_key" = 'file.uploaded'
        AND NOT EXISTS (
          SELECT 1 FROM "notification_event_audiences" a
          WHERE a."event_config_id" = c.id AND a."audience_type" = 'context_customer_portal_users'
        )
    `);

    await queryRunner.query(`
      INSERT INTO "notification_event_audiences" ("event_config_id", "audience_type", "role_id")
      SELECT c.id, 'all_practice_staff_with_role', r.id
      FROM "notification_event_configs" c
      CROSS JOIN "roles" r
      WHERE c."event_key" = 'customer.created'
        AND r."name" = 'manager'
        AND NOT EXISTS (
          SELECT 1 FROM "notification_event_audiences" a
          WHERE a."event_config_id" = c.id
            AND a."audience_type" = 'all_practice_staff_with_role'
            AND a."role_id" = r.id
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_notifications_user_unread"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_notifications_user_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_notifications"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notification_event_audiences_config"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_event_audiences"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "notification_event_configs"`);

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
}
