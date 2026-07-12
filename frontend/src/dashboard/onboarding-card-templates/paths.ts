/** Read a nested value from onboarding / form JSON using dot-separated keys. */
export function getOnboardingDotPath(data: Record<string, unknown> | null | undefined, dotPath: string): string {
  if (!data || typeof data !== "object") return "—";
  const parts = dotPath.split(".").filter(Boolean);
  let cur: unknown = data;
  for (const p of parts) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return "—";
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur === null || cur === undefined) return "—";
  if (typeof cur === "object") return JSON.stringify(cur);
  return String(cur);
}
