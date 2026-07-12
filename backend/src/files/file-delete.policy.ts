import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import type { PermissionsService } from "../auth/permissions.service";

/** Drive soft-delete: superadmin or practice users with `file:delete` (not portal users). */
export async function assertCanDeleteDriveFiles(
  user: AuthUser | undefined,
  permissions: PermissionsService,
): Promise<void> {
  if (!user?.userId) {
    throw new ForbiddenException("Unauthorized");
  }
  if (user.isAdmin) {
    return;
  }
  if (user.customerId) {
    throw new ForbiddenException("Only practice staff with file delete permission can delete drive files");
  }
  const allowed = await permissions.hasPermission(user.userId, user.customerId, "file:delete");
  if (!allowed) {
    throw new ForbiddenException("Only practice staff with file delete permission can delete drive files");
  }
}
