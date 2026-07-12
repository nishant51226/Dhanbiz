type Option = { value: string; label: string };

type Props = {
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  sortValue: string;
  sortOptions: Option[];
  onSortChange: (value: string) => void;
  filterValue?: string;
  filterOptions?: Option[];
  onFilterChange?: (value: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
};

export function ListControls({
  searchValue = "",
  searchPlaceholder = "Search",
  onSearchChange,
  sortValue,
  sortOptions,
  onSortChange,
  filterValue = "",
  filterOptions,
  onFilterChange,
  page,
  pageCount,
  onPageChange,
}: Props) {
  const canPrev = page > 1;
  const canNext = page < pageCount;

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-3 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        {onSearchChange ? (
          <label className="min-w-[220px] flex-1">
            <span className="mb-1 block text-xs font-medium text-muted">Search</span>
            <input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-muted shadow-inner focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </label>
        ) : null}
        {filterOptions && onFilterChange ? (
          <label className="min-w-[180px]">
            <span className="mb-1 block text-xs font-medium text-muted">Filter</span>
            <select
              value={filterValue}
              onChange={(e) => onFilterChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink shadow-inner focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              {filterOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="min-w-[180px]">
          <span className="mb-1 block text-xs font-medium text-muted">Sort</span>
          <select
            value={sortValue}
            onChange={(e) => onSortChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink shadow-inner focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => canPrev && onPageChange(page - 1)}
            disabled={!canPrev}
            className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-ink-soft disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-xs text-muted">
            Page {page} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => canNext && onPageChange(page + 1)}
            disabled={!canNext}
            className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-ink-soft disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
