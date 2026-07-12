import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type PdfPopplerConvert = (
  file: string,
  opts: {
    format: string;
    out_dir: string;
    out_prefix: string;
    page: number;
    scale?: number;
  }
) => Promise<unknown>;

function loadPdfPoppler(): { convert: PdfPopplerConvert } {
  // pdf-poppler only supports win32/darwin; requiring it on linux calls process.exit(1).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("pdf-poppler") as { convert: PdfPopplerConvert };
}

/** pdfjs-dist is ESM-only; TS `module: commonjs` downlevels `import()` to `require()`, which breaks. */
async function loadPdfJsLegacy() {
  const load = new Function(
    "return import('pdfjs-dist/legacy/build/pdf.mjs')"
  ) as () => Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")>;
  return load();
}

export async function extractPdfTextPerPage(buffer: Buffer): Promise<string[]> {
  const pdfjs = await loadPdfJsLegacy();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
    disableFontFace: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(text);
  }
  return pages;
}

function pdfRasterDpi(): number {
  const v = Number(process.env.PDF_RASTER_DPI);
  return Number.isFinite(v) && v >= 72 && v <= 300 ? Math.floor(v) : 120;
}

function pdfRasterScaleTo(): number {
  const v = Number(process.env.PDF_RASTER_SCALE_TO);
  return Number.isFinite(v) && v >= 800 && v <= 2400 ? Math.floor(v) : 1400;
}

/**
 * Renders one PDF page to PNG.
 * Windows/macOS: bundled Poppler via `pdf-poppler` (pdftocairo).
 * Linux: system `pdftoppm` on PATH (pdf-poppler does not ship linux binaries).
 */
export async function renderPdfPageToPng(
  pdfBuffer: Buffer,
  pageIndex1Based: number
): Promise<Buffer> {
  console.log(`Platform: ${process.platform}`);
  console.log(`Page: ${pageIndex1Based}`);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "docp-pdf-"));
  const pdfPath = path.join(dir, "doc.pdf");
  await fs.writeFile(pdfPath, pdfBuffer);
  try {
    if (process.platform === "win32" || process.platform === "darwin") {
      console.log("Using pdf-poppler...");
      const { convert } = loadPdfPoppler();
      console.log("pdf-poppler loaded successfully");
      await convert(pdfPath, {
        format: "png",
        out_dir: dir,
        out_prefix: "page",
        page: pageIndex1Based,
        /** Readable width for vision OCR (pdftocairo -scale-to) */
        scale: pdfRasterScaleTo(),
      });
      console.log("Conversion complete");
      const entries = await fs.readdir(dir);
      console.log(`Files in dir: ${entries.join(', ')}`);
      const pngName = entries.find((n) => n.toLowerCase().endsWith(".png"));
      if (!pngName) {
        throw new Error(`pdf-poppler produced no PNG in ${dir}`);
      }
      return await fs.readFile(path.join(dir, pngName));
    }

    const outBase = path.join(dir, "page");
    await execFileAsync("pdftoppm", [
      "-png",
      "-r",
      String(pdfRasterDpi()),
      "-f",
      String(pageIndex1Based),
      "-l",
      String(pageIndex1Based),
      "-singlefile",
      pdfPath,
      outBase,
    ]);
    return await fs.readFile(`${outBase}.png`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
