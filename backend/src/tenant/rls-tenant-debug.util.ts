/** RLS / tenant debug logs are always enabled (`[RLS_TENANT_DEBUG]`). `RLS_TENANT_DEBUG` in `.env` is ignored. */
export function isRlsTenantDebugEnabled(): boolean {
  return true;
}
