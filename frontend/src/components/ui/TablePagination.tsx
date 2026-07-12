import { ToolbarButton } from "./ToolbarButton";

export type TablePaginationProps = {
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
  readonly pageSizeOptions?: number[];
  readonly onPageSizeChange?: (size: number) => void;
};

function formatPaginationLabel(
  total: number,
  page: number,
  pageCount: number,
  rangeStart: number,
  rangeEnd: number,
): string {
  if (total === 0) return "0 rows";
  if (pageCount <= 1) {
    return `${total.toLocaleString()} row${total === 1 ? "" : "s"}`;
  }
  return `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()} row${
    total === 1 ? "" : "s"
  } · page ${page} of ${pageCount}`;
}

export function TablePagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
}: Readonly<TablePaginationProps>) {
  if (pageCount <= 1 && !onPageSizeChange) return null;

  const canPrev = page > 1;
  const canNext = page < pageCount;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const summary = formatPaginationLabel(total, page, pageCount, rangeStart, rangeEnd);
  const pageSizeSelectId = "table-pagination-page-size";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
      <p className="text-[10px] text-muted">{summary}</p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && pageSizeOptions && pageSizeOptions.length > 0 ? (
          <label htmlFor={pageSizeSelectId} className="flex items-center gap-1.5 text-[10px] font-medium text-ink-soft">
            Per page{" "}
            <select
              id={pageSizeSelectId}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-border bg-surface-raised px-2 py-1 text-xs text-ink"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {pageCount > 1 ? (
          <>
            <ToolbarButton variant="secondary" disabled={!canPrev} onClick={() => canPrev && onPageChange(page - 1)}>
              Previous
            </ToolbarButton>
            <ToolbarButton variant="secondary" disabled={!canNext} onClick={() => canNext && onPageChange(page + 1)}>
              Next
            </ToolbarButton>
          </>
        ) : null}
      </div>
    </div>
  );
}
