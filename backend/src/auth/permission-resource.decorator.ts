import { SetMetadata } from "@nestjs/common";

export const PERMISSION_RESOURCE_KEY = "permission_resource";

export const PermissionResource = (resource: string) =>
  SetMetadata(PERMISSION_RESOURCE_KEY, resource);

