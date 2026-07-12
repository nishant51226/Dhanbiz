import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Ensures practice staff with customer/library access are assigned to every non-archived
 * customer (all account_status values), not only active rows.
 */
export class BackfillStaffCustomerAssignmentsAllStatuses1750250000000 implements MigrationInterface {
  name = "BackfillStaffCustomerAssignmentsAllStatuses1750250000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO staff_customer_assignments (id, staff_user_id, customer_id, created_at, updated_at)
      SELECT gen_random_uuid(), u.id, c.id, NOW(), NOW()
      FROM users u
      INNER JOIN user_roles ur ON ur.user_id = u.id
      INNER JOIN roles r ON r.id = ur.role_id
      INNER JOIN customers c ON c.deleted_at IS NULL
      WHERE u.customer_id IS NULL
        AND COALESCE(u.is_admin, false) = false
        AND r.role_type = 'staff'
        AND (
          r.permissions @> '["customer:read"]'::jsonb
          OR r.permissions @> '["customer:write"]'::jsonb
          OR r.permissions @> '["document:assignee"]'::jsonb
        )
      ON CONFLICT (staff_user_id, customer_id) DO NOTHING
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: do not remove assignment rows on rollback.
  }
}
