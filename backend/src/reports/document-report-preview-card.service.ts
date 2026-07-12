import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import type { DocumentEntity } from "../entities/document.entity.js";
import { resolveDocumentMime } from "./document-report-file.util.js";

function fileTypeBadge(name: string, mime: string): string {
  const ext = (name.split(".").pop() ?? "").toUpperCase().slice(0, 5);
  if (ext) return ext;
  if (mime.includes("word")) return "DOC";
  if (mime.includes("sheet") || mime.includes("excel")) return "XLS";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "PPT";
  return "FILE";
}

function humanMime(mime: string): string {
  if (mime.includes("wordprocessing")) return "Word document";
  if (mime.includes("spreadsheet")) return "Excel workbook";
  if (mime.includes("presentation")) return "PowerPoint";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Image";
  return mime || "File";
}

function formatBytes(sizeBytes: string | null): string {
  const n = sizeBytes ? Number(sizeBytes) : NaN;
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function buildCardHtml(doc: DocumentEntity, folderPath: string): string {
  const mime = resolveDocumentMime(doc);
  const badge = fileTypeBadge(doc.name, mime);
  const safeName = doc.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeFolder = folderPath.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    width: 640px;
    height: 480px;
    font-family: "Segoe UI", system-ui, Arial, sans-serif;
    background: linear-gradient(145deg, #eef2f7 0%, #f8fafc 55%, #e8edf4 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    width: 560px;
    background: #fff;
    border: 1px solid #cbd5e1;
    border-radius: 14px;
    padding: 28px 32px;
    box-shadow: 0 8px 28px rgba(15, 23, 42, 0.1);
  }
  .badge {
    display: inline-block;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #fff;
    background: #2563eb;
    padding: 6px 12px;
    border-radius: 6px;
    margin-bottom: 14px;
  }
  .name {
    font-size: 22px;
    font-weight: 650;
    color: #0f172a;
    line-height: 1.35;
    word-break: break-word;
  }
  .meta {
    margin-top: 18px;
    font-size: 14px;
    color: #475569;
    line-height: 1.65;
  }
  .meta strong { color: #334155; font-weight: 600; }
  .hint {
    margin-top: 22px;
    padding: 14px 16px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 10px;
    font-size: 13px;
    color: #1e3a8a;
    line-height: 1.5;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">${badge}</div>
    <div class="name">${safeName}</div>
    <div class="meta">
      <div><strong>Folder:</strong> ${safeFolder || "Unfiled"}</div>
      <div><strong>Size:</strong> ${formatBytes(doc.sizeBytes)}</div>
      <div><strong>Type:</strong> ${humanMime(mime)}</div>
    </div>
    <div class="hint">This is a preview card. Use <strong>Download file</strong> in the row above to open the full document.</div>
  </div>
</body>
</html>`;
}

@Injectable()
export class DocumentReportPreviewCardService implements OnModuleDestroy {
  private readonly log = new Logger(DocumentReportPreviewCardService.name);
  private browser: Browser | null = null;

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        /* ignore */
      }
      this.browser = null;
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  /** Renders a PNG “file card” for types that cannot be embedded directly (docx, xlsx, etc.). */
  async renderCardPng(doc: DocumentEntity, folderPath: string): Promise<Buffer | null> {
    try {
      const html = buildCardHtml(doc, folderPath);
      const browser = await this.getBrowser();
      const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
      try {
        await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
        const png = await page.screenshot({ type: "png", fullPage: false });
        return Buffer.from(png);
      } finally {
        await page.close();
      }
    } catch (err) {
      this.log.warn(`Preview card failed for doc=${doc.id}: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}
