/** Drive file/folder delete: superadmin or `file:delete` permission. */
export function canDeleteDriveFiles(input: {
  authRequired: boolean | null;
  isAdmin: boolean;
  hasPermission: (permission: string) => boolean;
}): boolean {
  if (!input.authRequired) return true;
  if (input.isAdmin) return true;
  return input.hasPermission("file:delete");
}

/** Staff assignee-only: library document assignee without customer list access. */
export function staffSeesAssignedFilesOnly(input: {
  isAdmin: boolean;
  hasPermission: (permission: string) => boolean;
}): boolean {
  if (input.isAdmin) return false;
  return (
    input.hasPermission("document:assignee") &&
    !input.hasPermission("customer:read") &&
    !input.hasPermission("customer:write")
  );
}

/** Show "Assigned to me" filter for staff with library document assignee permission. */
export function shouldShowStaffAssigneeFilter(input: {
  isPortal: boolean;
  isAdmin: boolean;
  hasPermission: (permission: string) => boolean;
}): boolean {
  if (input.isPortal || input.isAdmin) return false;
  return input.hasPermission("document:assignee");
}
