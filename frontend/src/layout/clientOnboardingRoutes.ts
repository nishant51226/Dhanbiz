/** Staff “new / continue registration” wizard — long pages; keep chrome predictable. */
export function isClientOnboardingRoute(pathname: string): boolean {
  if (pathname === "/customers/new") return true;
  return /^\/customers\/[^/]+\/onboarding$/.test(pathname);
}
