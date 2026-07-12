import type { DataSource, EntityManager } from "typeorm";
import { DOCUMENT_ASSIGNEE_PERMISSION } from "./document-assignee.permission.js";

/** True when a practice (non-portal) user holds `permissionKey` on any staff role. */
export async function practiceStaffHasPermission(
  db: DataSource | EntityManager,
  userId: string,
  permissionKey: string,
): Promise<boolean> {
  const key = permissionKey.trim().toLowerCase();
  if (!key) return false;
  const rows = (await db.query(
    `SELECT 1 AS one
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1
       AND u.customer_id IS NULL
       AND r.role_type = 'staff'
       AND r.permissions @> $2::jsonb
     LIMIT 1`,
    [userId, JSON.stringify([key])],
  )) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Practice staff who should only see library documents/jobs explicitly assigned to them.
 * Assignee-only roles: `document:assignee` without `customer:read` or `customer:write`.
 */
export async function practiceStaffUsesAssignedDocumentScope(
  db: DataSource | EntityManager,
  userId: string,
): Promise<boolean> {
  const hasAssignee = await practiceStaffHasPermission(db, userId, DOCUMENT_ASSIGNEE_PERMISSION);
  if (hasAssignee) {
    const [hasCustomerRead, hasCustomerWrite] = await Promise.all([
      practiceStaffHasPermission(db, userId, "customer:read"),
      practiceStaffHasPermission(db, userId, "customer:write"),
    ]);
    return !hasCustomerRead && !hasCustomerWrite;
  }

  const rows = (await db.query(`SELECT 1 AS one FROM document_assignees WHERE user_id = $1 LIMIT 1`, [
    userId,
  ])) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}