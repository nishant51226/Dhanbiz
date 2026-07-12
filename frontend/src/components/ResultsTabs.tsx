import { useState } from "react";
import type { ExtractResponse } from "../types/api";

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function flattenForGrid(data: unknown, path = ""): { key: string; value: string }[] {
  if (data === null || data === undefined) {
    return [{ key: path || "value", value: formatCell(data) }];
  }
  if (typeof data !== "object") {
    return [{ key: path || "value", value: formatCell(data) }];
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return [{ key: path || "[]", value: "(empty)" }];
    }
    const rows: { key: string; value: string }[] = [];
    for (let i = 0; i < data.length; i++) {
      const next = path ? `${path}[${i}]` : `[${i}]`;
      rows.push(...flattenForGrid(data[i], next));
    }
    return rows;
  }
  const rows: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const next = path ? `${path}.${k}` : k;
    if (v !== null && typeof v === "object") {
      rows.push(...flattenForGrid(v, next));
    } else {
      rows.push({ key: next, value: formatCell(v) });
    }
  }
  return rows;
}

function StructuredDataTable({ data }: { data: unknown }) {
  const rows = flattenForGrid(data);
  return (
    <div className="rounded-xl border border-border shadow-sm">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b border-brand/15 bg-brand/10">
          <tr>
            <th className="w-[36%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink/55">
              Field
            </th>
            <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink/55">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={`${row.key}-${i}`}
              className="border-b border-border-subtle odd:bg-surface-raised even:bg-surface-muted/70"
            >
              <td className="break-all px-3 py-2 align-top font-mono text-xs text-brand">{row.key}</td>
              <td className="whitespace-pre-wrap break-words px-3 py-2 align-top text-ink/90">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type ResultTab = "data" | "json" | "text" | "pages" | "diagnostics";

function DiagnosticLogPanel({ entries }: { entries: { at: string; phase: string; message: string; meta?: Record<string, unknown> }[] }) {
  return (
    <div className="space-y-2">
      {entries.map((e, i) => (
        <div
          key={`${e.at}-${e.phase}-${i}`}
          className="rounded-xl border border-border bg-surface-muted/50 px-3 py-2.5 text-xs"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-[10px] text-muted">{e.at}</span>
            <span className="rounded-md bg-brand/10 px-1.5 py-0.5 font-semibold text-brand">{e.phase}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-ink/90">{e.message}</p>
          {e.meta && Object.keys(e.meta).length > 0 ? (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-raised p-2 font-mono text-[10px] text-muted">
              {JSON.stringify(e.meta, null, 2)}
            </pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const tabBase =
  "rounded-t-lg border border-b-0 px-3 py-2 text-sm font-medium transition sm:px-4";
const tabInactive = "border-transparent text-muted hover:bg-surface-muted hover:text-ink";
const tabActive = "relative z-[1] border-border bg-surface-raised text-brand";

export function ResultsTabs({
  result,
  embedded,
  activeTab,
  onActiveTabChange,
  showTabs = true,
}: {
  result: ExtractResponse | null;
  embedded?: boolean;
  activeTab?: ResultTab;
  onActiveTabChange?: (tab: ResultTab) => void;
  showTabs?: boolean;
}) {
  const [internalActiveTab, setInternalActiveTab] = useState<ResultTab>("data");
  const selectedTab = activeTab ?? internalActiveTab;
  const setSelectedTab = onActiveTabChange ?? setInternalActiveTab;
  const hasData = result?.structured != null;
  const hasJson =
    result != null &&
    (result.structured != null || Boolean(result.structuredRaw?.trim()));
  const hasText = Boolean(result?.combinedText?.trim());
  const hasPages = (result?.pages?.length ?? 0) > 0;
  const hasDiagnostics = (result?.diagnosticLog?.length ?? 0) > 0;

  return (
    <div
      className={`flex w-full flex-col bg-surface-raised ${embedded ? "rounded-xl border border-border" : "min-h-[320px] border border-border"}`}
    >
      {showTabs ? (
        <div className="border-b border-border bg-surface-muted/90 px-3 pt-3 sm:px-5">
          <div className="-mb-px flex flex-wrap gap-0.5">
            {(
              [
                ["data", "Data", hasData],
                ["json", "JSON", hasJson],
                ["text", "Text", hasText],
                ["pages", "Pages", hasPages],
                ["diagnostics", "Diagnostics", hasDiagnostics],
              ] as const
            ).map(([id, label, has]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedTab(id)}
                className={`${tabBase} ${selectedTab === id ? tabActive : tabInactive} ${!has ? "opacity-55" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {selectedTab === "data" ? (
          hasData ? (
            <StructuredDataTable data={result!.structured} />
          ) : (
            <p className="text-sm text-muted">No structured data.</p>
          )
        ) : null}
        {selectedTab === "json" ? (
          <div className="space-y-3">
            {result?.structuredParseError ? (
              <p className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                JSON parse: {result.structuredParseError}
              </p>
            ) : null}
            {result?.structured != null ? (
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-muted p-4 font-mono text-xs text-ink/80">
                {JSON.stringify(result.structured, null, 2)}
              </pre>
            ) : result?.structuredRaw?.trim() ? (
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-muted p-4 font-mono text-xs text-ink/80">
                {result.structuredRaw}
              </pre>
            ) : (
              <p className="text-sm text-muted">No JSON output.</p>
            )}
          </div>
        ) : null}
        {selectedTab === "text" ? (
          result?.combinedText?.trim() ? (
            <pre className="whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-muted p-4 text-sm text-ink/90">
              {result.combinedText}
            </pre>
          ) : (
            <p className="text-sm text-muted">No combined text.</p>
          )
        ) : null}
        {selectedTab === "pages" ? (
          hasPages ? (
            <div className="space-y-2">
              {result!.pages!.map((p) => (
                <div
                  key={p.page}
                  className="rounded-xl border border-border bg-surface-muted/50 px-3 py-2.5 text-xs text-muted"
                >
                  <span className="font-semibold text-ink">Page {p.page}</span>
                  <span className="ml-2 rounded-md bg-brand/10 px-1.5 py-0.5 font-medium text-brand">
                    {p.source}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap text-muted">{p.preview}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No per-page traces.</p>
          )
        ) : null}
        {selectedTab === "diagnostics" ? (
          hasDiagnostics ? (
            <DiagnosticLogPanel entries={result!.diagnosticLog!} />
          ) : (
            <p className="text-sm text-muted">
              No diagnostic log yet. Entries appear while the job runs and after failure (checkpoints, API calls,
              recovery).
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}
