import ExcelJS from "exceljs";

/**
 * Flatten nested JSON into dot/bracket paths → string values for a single-row export.
 */
export function flattenCustomerExportPayload(data: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};

  if (data === null || data === undefined) {
    if (prefix) out[prefix] = "";
    return out;
  }

  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    out[prefix || "value"] = String(data);
    return out;
  }

  if (data instanceof Date) {
    out[prefix || "value"] = data.toISOString();
    return out;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      if (prefix) out[prefix] = "";
      return out;
    }
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const p = prefix ? `${prefix}[${i}]` : `[${i}]`;
      Object.assign(out, flattenCustomerExportPayload(item, p));
    }
    return out;
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      if (prefix) out[prefix] = "";
      return out;
    }
    for (const [k, v] of entries) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v === null || v === undefined) {
        out[p] = "";
      } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[p] = String(v);
      } else if (v instanceof Date) {
        out[p] = v.toISOString();
      } else if (Array.isArray(v) || (typeof v === "object" && v !== null)) {
        Object.assign(out, flattenCustomerExportPayload(v, p));
      } else {
        out[p] = String(v);
      }
    }
    return out;
  }

  out[prefix || "value"] = String(data);
  return out;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Preserves request order; skips keys not present on `flat` and duplicates.
 */
export function resolveCustomerExportColumnOrder(
  flat: Record<string, string>,
  requestedOrder: string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of requestedOrder) {
    if (typeof k !== "string" || seen.has(k)) continue;
    seen.add(k);
    if (Object.prototype.hasOwnProperty.call(flat, k)) {
      out.push(k);
    }
  }
  return out;
}

export function buildCustomerExportCsv(flat: Record<string, string>, columnOrder?: string[]): Buffer {
  const keys =
    columnOrder && columnOrder.length > 0
      ? columnOrder
      : Object.keys(flat).sort((a, b) => a.localeCompare(b, "en"));
  const header = keys.map((k) => escapeCsvCell(k)).join(",");
  const row = keys.map((k) => escapeCsvCell(flat[k] ?? "")).join(",");
  const body = `\uFEFF${header}\n${row}\n`;
  return Buffer.from(body, "utf-8");
}

export async function buildCustomerExportXlsx(flat: Record<string, string>, columnOrder?: string[]): Promise<Buffer> {
  const keys =
    columnOrder && columnOrder.length > 0
      ? columnOrder
      : Object.keys(flat).sort((a, b) => a.localeCompare(b, "en"));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Customer", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow(keys);
  sheet.addRow(keys.map((k) => flat[k] ?? ""));
  sheet.getRow(1).font = { bold: true };
  keys.forEach((key, colIdx) => {
    const col = sheet.getColumn(colIdx + 1);
    col.width = Math.min(48, Math.max(12, Math.ceil(key.length * 0.12) + 4));
  });
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

export function exportFilenameBase(
  customerName: string | null | undefined,
  customerId: string | null | undefined,
): string {
  const slug = (customerName ?? "")
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  const shortId = (customerId ?? "").replace(/-/g, "").slice(0, 8) || "unknown";
  const base = slug ? `${slug}_${shortId}` : `customer_${shortId}`;
  return base || `customer_${shortId}`;
}

export function buildTabularExportCsv(headers: string[], rows: string[][]): Buffer {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) => r.map((c) => escapeCsvCell(c ?? "")).join(",")),
  ];
  const body = `\uFEFF${lines.join("\n")}\n`;
  return Buffer.from(body, "utf-8");
}

export async function buildTabularExportXlsx(headers: string[], rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Customers", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow(headers);
  for (const r of rows) {
    sheet.addRow(r);
  }
  sheet.getRow(1).font = { bold: true };
  const maxCols = Math.max(headers.length, ...rows.map((r) => r.length));
  for (let i = 0; i < maxCols; i++) {
    const label = headers[i] ?? "";
    const col = sheet.getColumn(i + 1);
    col.width = Math.min(48, Math.max(12, Math.ceil(label.length * 0.12) + 4));
  }
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

export function customersListExportFilenameBase(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `customers_export_${y}${m}${day}`;
}
