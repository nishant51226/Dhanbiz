import { Link } from "react-router-dom";
import type { TokenBurnPageRow, TokenBurnReport } from "../../types/api";

function formatInt(n: number): string {
  return n.toLocaleString();
}

function formatCost(amount: number | null, currency: string | null): string {
  if (amount == null) return "—";
  const cur = currency ?? "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  } catch {
    return `${amount.toFixed(4)} ${cur}`;
  }
}

function fileLabel(row: { fileName: string | null; jobId: string }): string {
  if (row.fileName?.trim()) return row.fileName.trim();
  return `Job ${row.jobId.slice(0, 8)}…`;
}

type Props = {
  rows: TokenBurnPageRow[];
  report: TokenBurnReport;
};

export function TokenBurnPageTable({ rows, report }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No page-level AI usage in this period.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-[11px] font-bold uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2 text-right">Page</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2 text-right">Input</th>
              <th className="px-3 py-2 text-right">Output</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Calls</th>
              <th className="px-3 py-2 text-right">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.jobId}:${row.fileId ?? "none"}:${row.pageNumber}`}
                className="border-b border-border/60 last:border-0"
              >
                <td className="px-3 py-2">
                  {row.fileId ? (
                    <Link
                      to={`/customers/${row.customerId}/files/${row.fileId}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {fileLabel(row)}
                    </Link>
                  ) : (
                    <Link to={`/jobs/${row.jobId}`} className="font-medium text-brand hover:underline">
                      {fileLabel(row)}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{row.pageNumber}</td>
                <td className="px-3 py-2 text-ink">{row.customerName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.inputTokens)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.outputTokens)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.totalTokens)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.executionCount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCost(row.estimatedCost, row.currency ?? report.totals.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
}
