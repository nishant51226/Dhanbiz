/** Read a nested value from onboarding JSON using dot-separated keys. */
export function readOnboardingDotPath(
  data: Record<string, unknown> | null | undefined,
  dotPath: string,
): unknown {
  if (!data || typeof data !== "object") return undefined;
  const parts = dotPath.split(".").filter(Boolean);
  let cur: unknown = data;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
      continue;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function readOnboardingDotPathString(
  data: Record<string, unknown> | null | undefined,
  dotPath: string,
): string {
  const cur = readOnboardingDotPath(data, dotPath);
  if (cur === null || cur === undefined) return "";
  if (Array.isArray(cur)) return cur.map((item) => String(item)).filter(Boolean).join(", ");
  if (typeof cur === "boolean") return cur ? "true" : "false";
  if (typeof cur === "number" && Number.isFinite(cur)) return String(cur);
  return typeof cur === "string" ? cur : "";
}

/** Write a string leaf at a dot path (creates intermediate objects/arrays as needed). */
export function setOnboardingDotPath(
  data: Record<string, unknown>,
  dotPath: string,
  value: string,
): Record<string, unknown> {
  const next = structuredClone(data);
  const parts = dotPath.split(".").filter(Boolean);
  if (parts.length === 0) return next;

  let cur: Record<string, unknown> | unknown[] = next;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const isIndex = /^\d+$/.test(key);
    if (Array.isArray(cur)) {
      const idx = Number(key);
      const existing = cur[idx];
      if (!existing || typeof existing !== "object") {
        cur[idx] = isIndex && /^\d+$/.test(parts[i + 1] ?? "") ? [] : {};
      }
      cur = cur[idx] as Record<string, unknown> | unknown[];
      continue;
    }
    const record = cur as Record<string, unknown>;
    const existing = record[key];
    if (!existing || typeof existing !== "object") {
      record[key] = /^\d+$/.test(parts[i + 1] ?? "") ? [] : {};
    }
    cur = record[key] as Record<string, unknown> | unknown[];
  }

  const leafKey = parts[parts.length - 1]!;
  const trimmed = value.trim();

  if (Array.isArray(cur)) {
    const idx = Number(leafKey);
    if (trimmed === "") {
      delete cur[idx];
      return next;
    }
    const prev = cur[idx];
    if (typeof prev === "number") {
      const n = Number(trimmed.replace(/,/g, ""));
      cur[idx] = Number.isFinite(n) ? n : trimmed;
    } else if (typeof prev === "boolean") {
      cur[idx] = trimmed === "true" || trimmed.toLowerCase() === "yes";
    } else {
      cur[idx] = trimmed;
    }
    return next;
  }

  const record = cur as Record<string, unknown>;
  if (trimmed === "") {
    delete record[leafKey];
    return next;
  }

  const prev = record[leafKey];
  if (Array.isArray(prev) || leafKey === "sic_codes") {
    record[leafKey] = trimmed
      .split(/,\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
  } else if (typeof prev === "number") {
    const n = Number(trimmed.replace(/,/g, ""));
    record[leafKey] = Number.isFinite(n) ? n : trimmed;
  } else if (typeof prev === "boolean") {
    record[leafKey] = trimmed === "true" || trimmed.toLowerCase() === "yes";
  } else {
    record[leafKey] = trimmed;
  }
  return next;
}
