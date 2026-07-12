import { MigrationInterface, QueryRunner } from "typeorm";

export class NotificationGroups1750130000000 implements MigrationInterface {
  name = "NotificationGroups1750130000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_groups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(120) NOT NULL,
        "description" text,
        "created_by" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_groups" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_groups_name" UNIQUE ("name"),
        CONSTRAINT "FK_notification_groups_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_group_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "group_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_group_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_group_members_group_user" UNIQUE ("group_id", "user_id"),
        CONSTRAINT "FK_notification_group_members_group" FOREIGN KEY ("group_id")
          REFERENCES "notification_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_notification_group_members_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_group_members_group" ON "notification_group_members" ("group_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_group_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "group_id" uuid NOT NULL,
        "filter" character varying(32) NOT NULL,
        "customer_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_group_rules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notification_group_rules_group" FOREIGN KEY ("group_id")
          REFERENCES "notification_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_notification_group_rules_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "CHK_notification_group_rules_filter" CHECK (
          "filter" IN (
            'practice_admin',
            'practice_managers',
            'practice_accountants',
            'portal_admins',
            'portal_users',
            'portal_all'
          )
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_group_rules_group" ON "notification_group_rules" ("group_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_group_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_group_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_groups"`);
  }
}
