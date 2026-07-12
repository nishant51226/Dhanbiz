import { MigrationInterface, QueryRunner } from "typeorm";

export class AllowNullUserRoleCustomerId1743462000000 implements MigrationInterface {
  name = "AllowNullUserRoleCustomerId1743462000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_roles" ALTER COLUMN "customer_id" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "user_roles"
      WHERE "customer_id" IS NULL
    `);
    await queryRunner.query(`ALTER TABLE "user_roles" ALTER COLUMN "customer_id" SET NOT NULL`);
  }
}

