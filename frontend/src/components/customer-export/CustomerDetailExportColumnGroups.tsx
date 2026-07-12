import type { CustomerSummaryExportCatalogColumn } from "../../api/client";

type SummaryGroup = "account" | "business" | "contact" | "registryTax" | "agentOther";

const GROUP_META: Record<SummaryGroup, { title: string }> = {
  account: { title: "Account & status" },
  business: { title: "Business profile" },
  contact: { title: "Contact & addresses" },
  registryTax: { title: "Registry, VAT & filing" },
  agentOther: { title: "Agent, bank & authorisations" },
};

const GROUP_ORDER: SummaryGroup[] = ["account", "business", "contact", "registryTax", "agentOther"];

function groupForSummaryColumn(id: string): SummaryGroup {
  if (
    [
      "name",
      "customerId",
      "createdAt",
      "updatedAt",
      "annualTurnoverGbp",
      "subscriptionPlan",
      "planId",
      "portalUsers",
      "formStatus",
    ].includes(id)
  ) {
    return "account";
  }
  if (
    [
      "threeKRef",
      "entityType",
      "industryGroup",
      "joiningMonth",
      "numberOfStores",
      "clearance",
      "kycStatus",
      "servicesInPack",
      "director1Name",
    ].includes(id)
  ) {
    return "business";
  }
  if (id.startsWith("contact") || id.startsWith("registered") || id.startsWith("trading")) {
    return "contact";
  }
  if (
    [
      "companyStatus",
      "jurisdiction",
      "vatNumber",
      "vatRegDate",
      "vatQuarterEnd",
      "niNumber",
      "cisReference",
      "paye",
      "payeFrequency",
      "payeReference",
      "companyRegNo",
      "companyRegDate",
      "chEmail",
      "utr",
      "authCode",
      "yearEnd",
      "filingMonth",
      "accountsFilingDue",
      "confirmationStatement",
    ].includes(id)
  ) {
    return "registryTax";
  }
  return "agentOther";
}

type Props = {
  readonly catalog: CustomerSummaryExportCatalogColumn[];
  readonly visibleCatalog: CustomerSummaryExportCatalogColumn[];
  readonly selectedIds: ReadonlySet<string>;
  readonly filter: string;
  readonly busy: boolean;
  readonly onFilterChange: (value: string) => void;
  readonly onToggleId: (id: string) => void;
  readonly onSelectAll: () => void;
  readonly onClearAll: () => void;
};

export function CustomerDetailExportColumnGroups({
  catalog,
  visibleCatalog,
  selectedIds,
  filter,
  busy,
  onFilterChange,
  onToggleId,
  onSelectAll,
  onClearAll,
}: Props) {
  if (catalog.length === 0) return null;

  return (
    <div className="mt-6 space-y-6">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-ink">Columns</h4>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onSelectAll}
              className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onClearAll}
              className="text-xs font-semibold text-muted hover:underline disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
        <input
          type="search"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Search columns…"
          className="mt-2 w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink"
          disabled={busy}
        />
        <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
          {GROUP_ORDER.map((g) => {
            const cols = visibleCatalog.filter((c) => groupForSummaryColumn(c.id) === g);
            if (cols.length === 0) return null;
            return (
              <details key={g} open className="rounded-lg border border-border-subtle bg-surface-muted/20">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-muted/50">
                  {GROUP_META[g].title}
                  <span className="ml-2 font-normal text-muted">({cols.length})</span>
                </summary>
                <div className="grid gap-1 border-t border-border-subtle p-2 sm:grid-cols-2">
                  {cols.map((col) => (
                    <label
                      key={col.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(col.id)}
                        onChange={() => onToggleId(col.id)}
                        disabled={busy}
                        className="rounded border-border"
                      />
                      <span className="text-ink">{col.label}</span>
                    </label>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          {selectedIds.size} of {catalog.length} columns selected
        </p>
      </section>
    </div>
  );
}
