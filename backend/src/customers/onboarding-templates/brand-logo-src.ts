import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | undefined;

/** Embedded SVG data URL for the registration form header (Playwright PDF, no network fetch). */
export function getBrandLogoDataUrl(): string {
  if (cached) return cached;
  const svgPath = join(__dirname, "assets", "brand-logo.svg");
  try {
    const buf = readFileSync(svgPath);
    cached = `data:image/svg+xml;base64,${buf.toString("base64")}`;
    return cached;
  } catch {
    return "/brand-logo.svg";
  }
}
