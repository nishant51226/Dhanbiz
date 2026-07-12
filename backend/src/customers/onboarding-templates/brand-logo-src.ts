import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | undefined;

/** Embedded PNG data URL for the registration form header (Playwright PDF, no network fetch). */
export function getBrandLogoDataUrl(): string {
  if (cached) return cached;
  const pngPath = join(__dirname, "assets", "brand-logo.png");
  try {
    const buf = readFileSync(pngPath);
    cached = `data:image/png;base64,${buf.toString("base64")}`;
    return cached;
  } catch {
    return "/brand-logo.png";
  }
}
