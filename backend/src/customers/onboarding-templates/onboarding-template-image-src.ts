import { readFileSync } from "node:fs";
import { join } from "node:path";

let hmrcCached: string | undefined;
let directDebitCached: string | undefined;

function readBinaryDataUrl(filename: string, mime: string): string {
  const assetPath = join(__dirname, "assets", filename);
  try {
    const buf = readFileSync(assetPath);
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

function readSvgDataUrl(filename: string): string {
  const svgPath = join(__dirname, "assets", filename);
  try {
    const svg = readFileSync(svgPath, "utf8");
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return "";
  }
}

/** Embedded PNG data URL for HMRC 64-8 header (Playwright PDF, no network fetch). */
export function getHmrcLogoDataUrl(): string {
  if (hmrcCached) return hmrcCached;
  hmrcCached = readBinaryDataUrl("hmrc-logo.png", "image/png") || "/hmrc-logo.png";
  return hmrcCached;
}

/** Embedded SVG data URL for Direct Debit header (Playwright PDF, no network fetch). */
export function getDirectDebitLogoDataUrl(): string {
  if (directDebitCached) return directDebitCached;
  directDebitCached = readSvgDataUrl("direct-debit-logo.svg") || "/direct-debit-logo.svg";
  return directDebitCached;
}
