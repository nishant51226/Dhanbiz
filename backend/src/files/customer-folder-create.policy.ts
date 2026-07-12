import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";

/** Manual folder creation: practice staff and superadmin only (not portal customer_admin / customer_user). */
export function assertCanCreateCustomerFolder(user: AuthUser | undefined): void {
  if (!user?.userId) {
    throw new ForbiddenException("Unauthorized");
  }
  if (user.isAdmin) {
    return;
  }
  if (user.customerId) {
    throw new ForbiddenException("Only practice staff can create folders");
  }
}
