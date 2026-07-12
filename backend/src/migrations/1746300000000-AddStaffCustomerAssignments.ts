import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStaffCustomerAssignments1746300000000 implements MigrationInterface {
  name = "AddStaffCustomerAssignments1746300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "staff_customer_assignments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "staff_user_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_customer_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_staff_customer_assignments_staff_customer" UNIQUE ("staff_user_id", "customer_id"),
        CONSTRAINT "FK_staff_customer_assignments_staff_user" FOREIGN KEY ("staff_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_staff_customer_assignments_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_staff_customer_assignments_staff_user_id" ON "staff_customer_assignments" ("staff_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_staff_customer_assignments_customer_id" ON "staff_customer_assignments" ("customer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_staff_customer_assignments_customer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_staff_customer_assignments_staff_user_id"`);
    await queryRunner.query(`DROP TABLE "staff_customer_assignments"`);
  }
}
