import { SetMetadata } from "@nestjs/common";
import { REQUIRED_ANY_PERMISSIONS_KEY, REQUIRED_PERMISSION_KEY } from "./permissions.constants";

export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);

/** User must have at least one of the listed permissions (OR). See `PermissionsGuard`. */
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(REQUIRED_ANY_PERMISSIONS_KEY, permissions);

