import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDocumentAssignees1746330000000 implements MigrationInterface {
  name = "AddDocumentAssignees1746330000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "document_assignees" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "assigned_by_user_id" uuid,
        "assigned_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_assignees" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_document_assignees_document_user" UNIQUE ("document_id", "user_id"),
        CONSTRAINT "FK_document_assignees_document" FOREIGN KEY ("document_id")
          REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_document_assignees_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_document_assignees_assigned_by_user" FOREIGN KEY ("assigned_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_document_assignees_document_id" ON "document_assignees" ("document_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_document_assignees_user_id" ON "document_assignees" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_document_assignees_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_document_assignees_document_id"`);
    await queryRunner.query(`DROP TABLE "document_assignees"`);
  }
}
