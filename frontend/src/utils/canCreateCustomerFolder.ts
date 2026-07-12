/** Manual folder creation: practice staff and superadmin only (not portal customer_admin / customer_user). */
export function canCreateCustomerFolder(input: {
  authRequired: boolean | null;
  isAdmin: boolean;
  jwtCustomerId: string | null;
}): boolean {
  if (!input.authRequired) return true;
  if (input.isAdmin) return true;
  return !input.jwtCustomerId;
}
