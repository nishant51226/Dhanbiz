import { useMemo, useState } from "react";
import type { Customer, CustomerAccountStatus } from "../../types/api";
import { CustomerAccountStatusChip } from "./CustomerAccountStatusChip";

export type CustomerAccessStatusFilter = "all" | CustomerAccountStatus;

function customerAssignmentStatus(status: Customer["accountStatus"]): CustomerAccountStatus {
  if (status === "active" || status === "inactive" || status === "proposed" || status === "draft") {
    return status;
  }
  return "draft";
}

type Props = {
  customers: Customer[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
  onBulkSet?: (ids: string[], on: boolean) => void;
  disabled?: boolean;
  idPrefix: string;
  /** Taller scroll area for large modals. */
  tall?: boolean;
};

export function CustomerAccessPicker({
  customers,
  selectedIds,
  onToggle,
  onBulkSet,
  disabled = false,
  idPrefix,
  tall = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerAccessStatusFilter>("all");

  const bulkSet = (ids: string[], on: boolean) => {
    if (ids.length === 0) return;
    if (onBulkSet) {
      onBulkSet(ids, on);
      return;
    }
    for (const id of ids) onToggle(id, on);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      const status = customerAssignmentStatus(c.accountStatus);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [customers, search, statusFilter]);

  const filteredSelectedCount = useMemo(
    () => filtered.filter((c) => selectedIds.has(c.id)).length,
    [filtered, selectedIds],
  );

  const filtersActive = search.trim().length > 0 || statusFilter !== "all";

  if (customers.length === 0) {
    return <p className="mt-2 text-xs text-muted">No customers found.</p>;
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1 text-xs font-medium text-ink">
          Search list
          <input
            type="search"
            value={search}
            disabled={disabled}
            placeholder="Filter by client name"
            onChange={(e) => setSearch(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
          />
        </label>
        <label className="block w-full shrink-0 text-xs font-medium text-ink sm:w-44">
          Show status
          <select
            value={statusFilter}
            disabled={disabled}
            onChange={(e) => setStatusFilter(e.target.value as CustomerAccessStatusFilter)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="proposed">Proposed</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {selectedIds.size} of {customers.length} selected · showing {filtered.length}
          {filteredSelectedCount > 0 ? (
            <span className="text-ink-soft"> · {filteredSelectedCount} in view</span>
          ) : null}
        </span>
        <div className="flex flex-wrap gap-2">
          {filtersActive ? (
            <button
              type="button"
              disabled={disabled || filtered.length === 0}
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
              className="font-semibold text-brand hover:underline disabled:opacity-50"
            >
              Clear filters
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled || filtered.length === 0}
            onClick={() => bulkSet(filtered.map((c) => c.id), true)}
            className="font-semibold text-brand hover:underline disabled:opacity-50"
          >
            Select shown
          </button>
          <button
            type="button"
            disabled={disabled || filteredSelectedCount === 0}
            onClick={() => bulkSet(filtered.map((c) => c.id), false)}
            className="font-semibold text-muted hover:text-ink disabled:opacity-50"
          >
            Clear shown
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface-muted/40">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_6.5rem] items-center gap-x-3 border-b border-border bg-surface-muted/80 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted">
          <span className="w-4" aria-hidden />
          <span>Customer</span>
          <span className="text-right">Status</span>
        </div>
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">No customers match the current filters.</p>
        ) : (
          <ul
            className={`divide-y divide-border-subtle overflow-y-auto ${
              tall ? "max-h-[min(55vh,28rem)]" : "max-h-[min(50vh,20rem)]"
            }`}
          >
            {filtered.map((c) => {
              const status = customerAssignmentStatus(c.accountStatus);
              return (
                <li key={c.id} className="grid grid-cols-[auto_minmax(0,1fr)_6.5rem] items-center gap-x-3 px-3 py-2.5">
                  <input
                    id={`${idPrefix}-${c.id}`}
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                    checked={selectedIds.has(c.id)}
                    disabled={disabled}
                    onChange={(e) => onToggle(c.id, e.target.checked)}
                  />
                  <label
                    htmlFor={`${idPrefix}-${c.id}`}
                    className="min-w-0 cursor-pointer truncate text-sm font-medium text-ink"
                    title={c.name}
                  >
                    {c.name}
                  </label>
                  <div className="flex justify-end">
                    <CustomerAccountStatusChip status={status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
