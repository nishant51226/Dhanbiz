import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import type { FilePreviewKind } from "../utils/filePreviewKind";

const MAX_PREVIEW_ROWS = 200;
const MAX_PREVIEW_COLS = 40;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === "," || ch === "\t")) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }

  row.push(cell);
  if (row.some((v) => v.length > 0)) rows.push(row);
  return rows;
}

function trimGrid(rows: string[][]): string[][] {
  return rows
    .slice(0, MAX_PREVIEW_ROWS)
    .map((row) => row.slice(0, MAX_PREVIEW_COLS));
}

function renderTable(rows: string[][], truncated: boolean) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">File is empty.</p>;
  }

  const colCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

  return (
    <div className="space-y-2">
      {truncated ? (
        <p className="text-xs text-muted">
          Showing the first {MAX_PREVIEW_ROWS} rows and {MAX_PREVIEW_COLS} columns.
        </p>
      ) : null}
      <div className="overflow-auto rounded-lg border border-border bg-surface-raised">
        <table className="min-w-full border-collapse text-left text-xs">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/60 last:border-b-0">
                {Array.from({ length: colCount }, (_, colIndex) => (
                  <td
                    key={colIndex}
                    className="max-w-[16rem] truncate whitespace-nowrap border-r border-border/40 px-2 py-1.5 font-mono text-ink last:border-r-0"
                    title={row[colIndex] ?? ""}
                  >
                    {row[colIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Props = {
  blob: Blob;
  kind: Extract<FilePreviewKind, "csv" | "spreadsheet" | "text">;
  fileName?: string;
};

export function TabularFilePreview({ blob, kind, fileName }: Props) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setErr("");
    setTruncated(false);

    (async () => {
      try {
        if (kind === "csv" || kind === "text") {
          const text = await blob.text();
          if (cancelled) return;
          const parsed = kind === "csv" ? parseCsv(text) : text.split(/\r?\n/).map((line) => [line]);
          setTruncated(parsed.length > MAX_PREVIEW_ROWS || parsed.some((row) => row.length > MAX_PREVIEW_COLS));
          setRows(trimGrid(parsed));
          return;
        }

        const buffer = await blob.arrayBuffer();
        if (cancelled) return;
        const workbook = XLSX.read(buffer, { type: "array", dense: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          setRows([]);
          return;
        }
        const sheet = workbook.Sheets[sheetName]!;
        const grid = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
          header: 1,
          defval: "",
          raw: false,
        });
        const asStrings = grid.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
        setTruncated(asStrings.length > MAX_PREVIEW_ROWS || asStrings.some((row) => row.length > MAX_PREVIEW_COLS));
        setRows(trimGrid(asStrings));
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not render preview");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob, kind, fileName]);

  if (err) {
    return <p className="text-sm text-red-400">{err}</p>;
  }
  if (!rows) {
    return <p className="text-sm text-muted">Loading preview…</p>;
  }
  return renderTable(rows, truncated);
}
