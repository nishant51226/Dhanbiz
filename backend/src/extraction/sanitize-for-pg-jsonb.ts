/**
 * PostgreSQL rejects json/jsonb string values that contain lone UTF-16 surrogates
 * (U+D800–U+DFFF) or U+0000 in some paths — the same text can appear in PDF extraction.
 * Recursively clean string fields so `jobs.result` and similar payloads persist safely.
 */
export function stripInvalidJsonStringChars(str: string): string {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 0) {
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          out += str[i] + str[i + 1];
          i++;
          continue;
        }
      }
      out += "\uFFFD";
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      out += "\uFFFD";
      continue;
    }
    out += str[i];
  }
  return out;
}

/** Deep-clone-ish walk: only copies plain objects and arrays; leaves numbers, bools, null. */
export function sanitizeStringsForPgJsonb<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (v === null || v === undefined) return v;
    if (typeof v === "string") {
      return stripInvalidJsonStringChars(v);
    }
    if (typeof v !== "object") {
      return v;
    }
    if (v instanceof Date) {
      return v.toISOString();
    }
    if (Array.isArray(v)) {
      return v.map((x) => walk(x));
    }
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = walk(o[k]);
    }
    return out;
  };
  return walk(value) as T;
}
