import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager } from "typeorm";
import { Repository } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { DOCUMENT_ASSIGNEE_PERMISSION } from "../auth/document-assignee.permission.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { Customer } from "../entities/customer.entity.js";

/** Practice staff with any of these permissions receive every customer by default. */
export const STAFF_AUTO_CUSTOMER_ACCESS_PERMISSIONS = [
  "customer:read",
  "customer:write",
  DOCUMENT_ASSIGNEE_PERMISSION,
] as const;

function staffHasAutoCustomerAccess(perms: readonly string[]): boolean {
  return STAFF_AUTO_CUSTOMER_ACCESS_PERMISSIONS.some((p) => perms.includes(p));
}

/**
 * Practice staff with customer/library access are assigned every non-archived
 * customer (all account_status values) so the Customers directory stays in sync.
 */
@Injectable()
export class StaffCustomerAssignmentSyncService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    private readonly permissions: PermissionsService,
  ) {}

  async syncAllCustomersForPracticeStaffIfPermitted(user: AuthUser | undefined): Promise<void> {
    if (!user || user.isAdmin || user.customerId) return;
    const perms = await this.permissions.listEffectivePermissions(user.userId);
    if (!staffHasAutoCustomerAccess(perms)) return;
    await this.customers.query(
      `
      INSERT INTO staff_customer_assignments (id, staff_user_id, customer_id, created_at, updated_at)
      SELECT gen_random_uuid(), $1, c.id, NOW(), NOW()
      FROM customers c
      WHERE c.deleted_at IS NULL
      ON CONFLICT (staff_user_id, customer_id) DO NOTHING
      `,
      [user.userId],
    );
  }

  /**
   * When a customer is created, grant access to practice staff who should receive
   * every customer automatically (customer:read, customer:write, document:assignee),
   * and staff who already had every other customer explicitly assigned.
   */
  async assignNewCustomerToPracticeStaff(customerId: string, manager?: EntityManager): Promise<void> {
    const run = async (em: EntityManager) => {
      await em.query(
        `
        INSERT INTO staff_customer_assignments (id, staff_user_id, customer_id, created_at, updated_at)
        SELECT gen_random_uuid(), eligible.staff_user_id, $1::uuid, NOW(), NOW()
        FROM (
          SELECT DISTINCT u.id AS staff_user_id
          FROM users u
          INNER JOIN user_roles ur ON ur.user_id = u.id
          INNER JOIN roles r ON r.id = ur.role_id
          WHERE u.customer_id IS NULL
            AND COALESCE(u.is_admin, false) = false
            AND r.role_type = 'staff'
            AND (
              r.permissions @> '["customer:read"]'::jsonb
              OR r.permissions @> '["customer:write"]'::jsonb
              OR r.permissions @> '["document:assignee"]'::jsonb
            )

          UNION

          SELECT sca.staff_user_id
          FROM staff_customer_assignments sca
          INNER JOIN users u ON u.id = sca.staff_user_id
            AND u.customer_id IS NULL
            AND COALESCE(u.is_admin, false) = false
          WHERE sca.customer_id <> $1::uuid
          GROUP BY sca.staff_user_id
          HAVING COUNT(DISTINCT sca.customer_id) = (
            SELECT COUNT(*)::int
            FROM customers c
            WHERE c.deleted_at IS NULL
              AND c.id <> $1::uuid
          )
        ) eligible
        ON CONFLICT (staff_user_id, customer_id) DO NOTHING
        `,
        [customerId],
      );
    };

    if (manager) {
      await run(manager);
      return;
    }
    await this.customers.manager.transaction(run);
  }
}
