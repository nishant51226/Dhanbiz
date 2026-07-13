import { useEffect, useState } from "react";
import {
  createAdminFolder,
  fetchAdminDefaultAssignments,
  fetchAdminDefaultFolderCandidates,
  fetchAdminRestrictedAssignments,
  fetchAdminRestrictedFolderCandidates,
  fetchCustomers,
  setAdminDefaultFolder,
  setAdminRestrictedFolder,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { BRAND_LOGO_URL } from "../constants";
import type {
  AdminDefaultFolderAssignment,
  AdminDefaultFolderCandidate,
  AdminRestrictedFolderAssignment,
  AdminRestrictedFolderCandidate,
  Customer,
} from "../types/api";
import { formatCustomerDisplayLabel } from "../utils/portalCustomerProfile";
import { SearchableCustomerSelect } from "../components/SearchableCustomerSelect";

type FolderScope = "global" | "customer";
type FolderActionType = "create" | "default" | "restricted";

const FOLDER_ACTION_OPTIONS: { value: FolderActionType; label: string }[] = [
  { value: "create", label: "Create folder" },
  { value: "default", label: "Set default folder" },
  { value: "restricted", label: "Set restricted folder" },
];

const FOLDER_TYPE_HELP: Record<FolderActionType, string> = {
  create: "Create folders at global (platform) scope or for one or more customers.",
  default: "Choose one default folder for uploads when no folder is selected.",
  restricted:
    "Restricted folders are hidden from customer upload pickers. Staff can still upload; customers can browse files inside. A folder cannot be both default and restricted.",
};

const fieldLabelClass = "text-xs font-semibold uppercase tracking-wide text-muted";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink";

/** Staff workspace profile (placeholder until backed by API). */
export default function StaffSettingsBasicPage() {
  const { apiBase, authHeaders } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [name, setName] = useState("");
  const [folderScope, setFolderScope] = useState<FolderScope>("global");
  const [folderActionType, setFolderActionType] = useState<FolderActionType>("create");
  const [scope, setScope] = useState<FolderScope>("global");
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [defaultScope, setDefaultScope] = useState<FolderScope>("global");
  const [defaultCustomerId, setDefaultCustomerId] = useState("");
  const [defaultCandidates, setDefaultCandidates] = useState<AdminDefaultFolderCandidate[]>([]);
  const [defaultAssignments, setDefaultAssignments] = useState<AdminDefaultFolderAssignment[]>([]);
  const [matrixCandidates, setMatrixCandidates] = useState<Record<string, AdminDefaultFolderCandidate[]>>({});
  const [matrixBusyKey, setMatrixBusyKey] = useState<string>("");
  const [defaultFolderId, setDefaultFolderId] = useState("");
  const [defaultNewFolderName, setDefaultNewFolderName] = useState("");
  const [defaultBusy, setDefaultBusy] = useState(false);
  const [defaultMsg, setDefaultMsg] = useState("");
  const [restrictedScope, setRestrictedScope] = useState<FolderScope>("global");
  const [restrictedCustomerId, setRestrictedCustomerId] = useState("");
  const [restrictedCandidates, setRestrictedCandidates] = useState<AdminRestrictedFolderCandidate[]>([]);
  const [restrictedAssignments, setRestrictedAssignments] = useState<AdminRestrictedFolderAssignment[]>([]);
  const [restrictedMatrixCandidates, setRestrictedMatrixCandidates] = useState<
    Record<string, AdminRestrictedFolderCandidate[]>
  >({});
  const [restrictedMatrixBusyKey, setRestrictedMatrixBusyKey] = useState<string>("");
  const [restrictedFolderId, setRestrictedFolderId] = useState("");
  const [restrictedNewFolderName, setRestrictedNewFolderName] = useState("");
  const [restrictedBusy, setRestrictedBusy] = useState(false);
  const [restrictedMsg, setRestrictedMsg] = useState("");
  const [overviewSearch, setOverviewSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchCustomers(apiBase, authHeaders(), { activeOnly: true });
        if (!cancelled) setCustomers(list);
      } catch {
        if (!cancelled) setCustomers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders]);

  const handleFolderScopeChange = (next: FolderScope) => {
    setFolderScope(next);
    setScope(next);
    setDefaultScope(next);
    setRestrictedScope(next);
    if (next === "global") {
      setCustomerIds([]);
      setDefaultCustomerId("");
      setRestrictedCustomerId("");
    }
  };

  const folderActionBusy =
    folderActionType === "create" ? busy : folderActionType === "default" ? defaultBusy : restrictedBusy;

  const folderActionMsg =
    folderActionType === "create" ? msg : folderActionType === "default" ? defaultMsg : restrictedMsg;

  const runFolderPrimaryAction = () => {
    if (folderActionType === "create") void submitAdminFolder();
    else if (folderActionType === "default") void submitDefaultFolder();
    else void submitRestrictedFolder();
  };

  const folderPrimaryLabel =
    folderActionType === "create"
      ? busy
        ? "Creating…"
        : "Create"
      : folderActionType === "default"
        ? defaultBusy
          ? "Saving…"
          : "Set default"
        : restrictedBusy
          ? "Saving…"
          : "Set restricted";

  const submitAdminFolder = async () => {
    setMsg("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMsg("Folder name is required.");
      return;
    }
    if (scope === "customer" && customerIds.length === 0) {
      setMsg("Select at least one customer for customer-specific creation.");
      return;
    }
    setBusy(true);
    try {
      await createAdminFolder(apiBase, authHeaders(), {
        name: trimmedName,
        scope,
        customerIds: scope === "customer" ? customerIds : undefined,
      });
      setMsg(scope === "global" ? "Global folder created." : "Customer folder created.");
      setName("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not create entry");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (defaultScope === "customer" && !defaultCustomerId) {
      setDefaultCandidates([]);
      setDefaultFolderId("");
      return;
    }
    setDefaultMsg("");
    void (async () => {
      try {
        const rows = await fetchAdminDefaultFolderCandidates(apiBase, authHeaders(), {
          scope: defaultScope,
          customerId: defaultScope === "customer" ? defaultCustomerId : undefined,
        });
        if (cancelled) return;
        setDefaultCandidates(rows);
        const current = rows.find((r) => r.isCurrentDefault);
        setDefaultFolderId(current?.id ?? rows[0]?.id ?? "");
      } catch (e) {
        if (cancelled) return;
        setDefaultCandidates([]);
        setDefaultFolderId("");
        setDefaultMsg(e instanceof Error ? e.message : "Could not load folders");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, defaultScope, defaultCustomerId]);

  const refreshDefaultAssignments = async () => {
    const rows = await fetchAdminDefaultAssignments(apiBase, authHeaders());
    setDefaultAssignments(rows);
  };

  useEffect(() => {
    void refreshDefaultAssignments();
  }, [apiBase, authHeaders]);

  useEffect(() => {
    let cancelled = false;
    if (restrictedScope === "customer" && !restrictedCustomerId) {
      setRestrictedCandidates([]);
      setRestrictedFolderId("");
      return;
    }
    setRestrictedMsg("");
    void (async () => {
      try {
        const rows = await fetchAdminRestrictedFolderCandidates(apiBase, authHeaders(), {
          scope: restrictedScope,
          customerId: restrictedScope === "customer" ? restrictedCustomerId : undefined,
        });
        if (cancelled) return;
        setRestrictedCandidates(rows);
        const current = rows.find((r) => r.isCurrentRestricted);
        setRestrictedFolderId(current?.id ?? rows[0]?.id ?? "");
      } catch (e) {
        if (cancelled) return;
        setRestrictedCandidates([]);
        setRestrictedFolderId("");
        setRestrictedMsg(e instanceof Error ? e.message : "Could not load restricted folders");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, restrictedScope, restrictedCustomerId]);

  const refreshRestrictedAssignments = async () => {
    const rows = await fetchAdminRestrictedAssignments(apiBase, authHeaders());
    setRestrictedAssignments(rows);
  };

  useEffect(() => {
    void refreshRestrictedAssignments();
  }, [apiBase, authHeaders]);

  const submitRestrictedFolder = async () => {
    setRestrictedMsg("");
    if (restrictedScope === "customer" && !restrictedCustomerId) {
      setRestrictedMsg("Select a customer.");
      return;
    }
    if (!restrictedFolderId) {
      setRestrictedMsg("Select a restricted folder.");
      return;
    }
    setRestrictedBusy(true);
    try {
      await setAdminRestrictedFolder(apiBase, authHeaders(), {
        scope: restrictedScope,
        folderId: restrictedFolderId,
        customerId: restrictedScope === "customer" ? restrictedCustomerId : undefined,
      });
      setRestrictedMsg("Restricted folder updated.");
      await refreshRestrictedAssignments();
      const rows = await fetchAdminRestrictedFolderCandidates(apiBase, authHeaders(), {
        scope: restrictedScope,
        customerId: restrictedScope === "customer" ? restrictedCustomerId : undefined,
      });
      setRestrictedCandidates(rows);
    } catch (e) {
      setRestrictedMsg(e instanceof Error ? e.message : "Could not update restricted folder");
    } finally {
      setRestrictedBusy(false);
    }
  };

  const createFolderForRestrictedScope = async () => {
    setRestrictedMsg("");
    const nm = restrictedNewFolderName.trim();
    if (!nm) {
      setRestrictedMsg("Enter folder name.");
      return;
    }
    if (restrictedScope === "customer" && !restrictedCustomerId) {
      setRestrictedMsg("Select a customer first.");
      return;
    }
    setRestrictedBusy(true);
    try {
      await createAdminFolder(apiBase, authHeaders(), {
        name: nm,
        scope: restrictedScope,
        customerIds: restrictedScope === "customer" ? [restrictedCustomerId] : undefined,
        isRestricted: true,
      });
      const rows = await fetchAdminRestrictedFolderCandidates(apiBase, authHeaders(), {
        scope: restrictedScope,
        customerId: restrictedScope === "customer" ? restrictedCustomerId : undefined,
      });
      setRestrictedCandidates(rows);
      const created = rows.find((r) => r.name === nm);
      if (created) setRestrictedFolderId(created.id);
      setRestrictedNewFolderName("");
      setRestrictedMsg(
        restrictedScope === "customer" ? "Customer restricted folder created." : "Global restricted folder created.",
      );
      await refreshRestrictedAssignments();
    } catch (e) {
      setRestrictedMsg(e instanceof Error ? e.message : "Could not create restricted folder");
    } finally {
      setRestrictedBusy(false);
    }
  };

  const ensureRestrictedMatrixCandidates = async (
    scope: "global" | "customer",
    customerId: string | null,
  ): Promise<AdminRestrictedFolderCandidate[]> => {
    const key = matrixKey(scope, customerId);
    if (restrictedMatrixCandidates[key]) return restrictedMatrixCandidates[key];
    const rows = await fetchAdminRestrictedFolderCandidates(apiBase, authHeaders(), {
      scope,
      customerId: scope === "customer" ? customerId ?? undefined : undefined,
    });
    setRestrictedMatrixCandidates((prev) => ({ ...prev, [key]: rows }));
    return rows;
  };

  const updateRestrictedFromMatrix = async (
    scope: "global" | "customer",
    customerId: string | null,
    folderId: string,
  ) => {
    const key = matrixKey(scope, customerId);
    setRestrictedMatrixBusyKey(key);
    setRestrictedMsg("");
    try {
      await setAdminRestrictedFolder(apiBase, authHeaders(), {
        scope,
        folderId,
        customerId: scope === "customer" ? customerId ?? undefined : undefined,
      });
      await refreshRestrictedAssignments();
      const rows = await fetchAdminRestrictedFolderCandidates(apiBase, authHeaders(), {
        scope,
        customerId: scope === "customer" ? customerId ?? undefined : undefined,
      });
      setRestrictedMatrixCandidates((prev) => ({ ...prev, [key]: rows }));
    } catch (e) {
      setRestrictedMsg(e instanceof Error ? e.message : "Could not update restricted folder");
    } finally {
      setRestrictedMatrixBusyKey("");
    }
  };

  const ensureMatrixRow = async (scope: "global" | "customer", customerId: string | null) => {
    await Promise.all([
      ensureMatrixCandidates(scope, customerId),
      ensureRestrictedMatrixCandidates(scope, customerId),
    ]);
  };

  const folderScopeLabel = (isGlobal: boolean, inherited?: boolean) => {
    if (inherited) return "(Inherited global)";
    return isGlobal ? "(Global)" : "(Customer)";
  };

  const globalAssignment = defaultAssignments.find((a) => a.scope === "global");
  const globalRestrictedAssignment = restrictedAssignments.find((a) => a.scope === "global");

  const overviewSearchNorm = overviewSearch.trim().toLowerCase();
  const filteredOverviewCustomers =
    overviewSearchNorm.length === 0
      ? customers
      : customers.filter((c) => {
          const label = formatCustomerDisplayLabel(c).toLowerCase();
          const name = (c.name ?? "").trim().toLowerCase();
          return label.includes(overviewSearchNorm) || name.includes(overviewSearchNorm);
        });

  const submitDefaultFolder = async () => {
    setDefaultMsg("");
    if (defaultScope === "customer" && !defaultCustomerId) {
      setDefaultMsg("Select a customer.");
      return;
    }
    if (!defaultFolderId) {
      setDefaultMsg("Select a folder.");
      return;
    }
    setDefaultBusy(true);
    try {
      await setAdminDefaultFolder(apiBase, authHeaders(), {
        scope: defaultScope,
        folderId: defaultFolderId,
        customerId: defaultScope === "customer" ? defaultCustomerId : undefined,
      });
      setDefaultMsg("Default folder updated.");
      await refreshDefaultAssignments();
      const rows = await fetchAdminDefaultFolderCandidates(apiBase, authHeaders(), {
        scope: defaultScope,
        customerId: defaultScope === "customer" ? defaultCustomerId : undefined,
      });
      setDefaultCandidates(rows);
    } catch (e) {
      setDefaultMsg(e instanceof Error ? e.message : "Could not update default");
    } finally {
      setDefaultBusy(false);
    }
  };

  const createFolderForDefaultScope = async () => {
    setDefaultMsg("");
    const nm = defaultNewFolderName.trim();
    if (!nm) {
      setDefaultMsg("Enter folder name.");
      return;
    }
    if (defaultScope === "customer" && !defaultCustomerId) {
      setDefaultMsg("Select a customer first.");
      return;
    }
    setDefaultBusy(true);
    try {
      await createAdminFolder(apiBase, authHeaders(), {
        name: nm,
        scope: defaultScope,
        customerIds: defaultScope === "customer" ? [defaultCustomerId] : undefined,
      });
      const rows = await fetchAdminDefaultFolderCandidates(apiBase, authHeaders(), {
        scope: defaultScope,
        customerId: defaultScope === "customer" ? defaultCustomerId : undefined,
      });
      setDefaultCandidates(rows);
      const created = rows.find((r) => r.name === nm);
      if (created) setDefaultFolderId(created.id);
      setDefaultNewFolderName("");
      setDefaultMsg(defaultScope === "customer" ? "Customer folder created." : "Global folder created.");
      await refreshDefaultAssignments();
    } catch (e) {
      setDefaultMsg(e instanceof Error ? e.message : "Could not create folder");
    } finally {
      setDefaultBusy(false);
    }
  };

  const matrixKey = (scope: "global" | "customer", customerId: string | null) =>
    scope === "global" ? "global" : `customer:${customerId}`;

  const ensureMatrixCandidates = async (
    scope: "global" | "customer",
    customerId: string | null,
  ): Promise<AdminDefaultFolderCandidate[]> => {
    const key = matrixKey(scope, customerId);
    if (matrixCandidates[key]) return matrixCandidates[key];
    const rows = await fetchAdminDefaultFolderCandidates(apiBase, authHeaders(), {
      scope,
      customerId: scope === "customer" ? customerId ?? undefined : undefined,
    });
    setMatrixCandidates((prev) => ({ ...prev, [key]: rows }));
    return rows;
  };

  const updateDefaultFromMatrix = async (
    scope: "global" | "customer",
    customerId: string | null,
    folderId: string,
  ) => {
    const key = matrixKey(scope, customerId);
    setMatrixBusyKey(key);
    setDefaultMsg("");
    try {
      await setAdminDefaultFolder(apiBase, authHeaders(), {
        scope,
        folderId,
        customerId: scope === "customer" ? customerId ?? undefined : undefined,
      });
      await refreshDefaultAssignments();
      const rows = await fetchAdminDefaultFolderCandidates(apiBase, authHeaders(), {
        scope,
        customerId: scope === "customer" ? customerId ?? undefined : undefined,
      });
      setMatrixCandidates((prev) => ({ ...prev, [key]: rows }));
    } catch (e) {
      setDefaultMsg(e instanceof Error ? e.message : "Could not update default");
    } finally {
      setMatrixBusyKey("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Basic information</h1>
        <p className="mt-1 text-sm text-muted">Practice identity and defaults shown across the staff admin experience.</p>
      </div>

      <section className="rounded-xl border border-border bg-surface-raised p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Workspace</h2>
        <div className="mt-4 flex flex-wrap items-start gap-4">
          <img
            src={BRAND_LOGO_URL}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded-xl border border-border object-contain"
          />
          <dl className="min-w-0 flex-1 space-y-3 text-sm">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Practice name</dt>
              <dd className="mt-0.5 font-medium text-ink">Dhanbiz Accounting Services Pvt Ltd</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Environment</dt>
              <dd className="mt-0.5 text-muted">Staff admin — document intake and extraction</dd>
            </div>
          </dl>
        </div>
        <p className="mt-6 text-xs text-muted">
          Additional fields (registered address, VAT, billing contacts) can be wired here when your API exposes them.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Folders</h2>
        <p className="mt-1 text-xs text-muted">
          Create folders or assign default and restricted folders at global or customer scope.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className={fieldLabelClass}>Scope</span>
            <select
              value={folderScope}
              onChange={(e) => handleFolderScopeChange(e.target.value as FolderScope)}
              className={controlClass}
            >
              <option value="global">Global</option>
              <option value="customer">Customer-specific</option>
            </select>
          </label>
          <label>
            <span className={fieldLabelClass}>Type</span>
            <select
              value={folderActionType}
              onChange={(e) => setFolderActionType(e.target.value as FolderActionType)}
              className={controlClass}
            >
              {FOLDER_ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {folderScope === "customer" && folderActionType === "create" ? (
            <div className="sm:col-span-2">
              <span className={fieldLabelClass}>Customers</span>
              <div className="mt-1">
                <SearchableCustomerSelect
                  multiple
                  customers={customers}
                  value={customerIds}
                  onChange={setCustomerIds}
                  placeholder="Search customers…"
                  getOptionLabel={(c) => formatCustomerDisplayLabel(c as Customer)}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {customerIds.length} customer{customerIds.length === 1 ? "" : "s"} selected
              </p>
            </div>
          ) : null}

          {folderScope === "customer" && folderActionType === "default" ? (
            <label className="sm:col-span-2">
              <span className={fieldLabelClass}>Customer</span>
              <div className="mt-1">
                <SearchableCustomerSelect
                  customers={customers}
                  value={defaultCustomerId}
                  onChange={setDefaultCustomerId}
                  placeholder="Search customers…"
                  getOptionLabel={(c) => formatCustomerDisplayLabel(c as Customer)}
                  required
                />
              </div>
            </label>
          ) : null}

          {folderScope === "customer" && folderActionType === "restricted" ? (
            <label className="sm:col-span-2">
              <span className={fieldLabelClass}>Customer</span>
              <div className="mt-1">
                <SearchableCustomerSelect
                  customers={customers}
                  value={restrictedCustomerId}
                  onChange={setRestrictedCustomerId}
                  placeholder="Search customers…"
                  getOptionLabel={(c) => formatCustomerDisplayLabel(c as Customer)}
                  required
                />
              </div>
            </label>
          ) : null}

          {folderActionType === "create" ? (
            <label className="sm:col-span-2">
              <span className={fieldLabelClass}>Folder name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={controlClass}
                placeholder="e.g. VAT"
              />
            </label>
          ) : null}

          {folderActionType === "default" ? (
            <>
              <label className="sm:col-span-2">
                <span className={fieldLabelClass}>Folder</span>
                <select
                  value={defaultFolderId}
                  onChange={(e) => setDefaultFolderId(e.target.value)}
                  className={controlClass}
                >
                  <option value="">Select folder</option>
                  {defaultCandidates.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className={fieldLabelClass}>
                  New {folderScope === "customer" ? "customer" : "global"} folder
                </span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={defaultNewFolderName}
                    onChange={(e) => setDefaultNewFolderName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink"
                    placeholder="Folder name"
                  />
                  <button
                    type="button"
                    onClick={() => void createFolderForDefaultScope()}
                    disabled={defaultBusy}
                    className="h-10 shrink-0 rounded-lg border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </label>
            </>
          ) : null}

          {folderActionType === "restricted" ? (
            <>
              <label className="sm:col-span-2">
                <span className={fieldLabelClass}>Restricted folder</span>
                <select
                  value={restrictedFolderId}
                  onChange={(e) => setRestrictedFolderId(e.target.value)}
                  className={controlClass}
                >
                  <option value="">Select folder</option>
                  {restrictedCandidates
                    .filter((f) => f.id !== defaultCandidates.find((d) => d.isCurrentDefault)?.id)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className={fieldLabelClass}>
                  New {folderScope === "customer" ? "customer" : "global"} restricted folder
                </span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={restrictedNewFolderName}
                    onChange={(e) => setRestrictedNewFolderName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink"
                    placeholder="Folder name"
                  />
                  <button
                    type="button"
                    onClick={() => void createFolderForRestrictedScope()}
                    disabled={restrictedBusy}
                    className="h-10 shrink-0 rounded-lg border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </label>
            </>
          ) : null}
        </div>

        <p className="mt-3 text-xs text-muted">{FOLDER_TYPE_HELP[folderActionType]}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runFolderPrimaryAction}
            disabled={folderActionBusy}
            className="btn btn-primary btn-md-fixed"
          >
            {folderPrimaryLabel}
          </button>
          {folderActionMsg ? <p className="text-sm text-muted">{folderActionMsg}</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Folder assignments overview</h2>
        <p className="mt-1 text-xs text-muted">
          One default and one restricted folder per customer (platform row is the global fallback). A folder cannot be
          both default and restricted.
        </p>
        {defaultMsg || restrictedMsg ? (
          <p className="mt-2 text-sm text-muted">{defaultMsg || restrictedMsg}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 sm:max-w-md">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Search customers</span>
            <input
              type="search"
              value={overviewSearch}
              onChange={(e) => setOverviewSearch(e.target.value)}
              placeholder="Filter by customer name or registration…"
              className="mt-1 w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink"
            />
          </label>
          {overviewSearch.trim() ? (
            <p className="pb-2 text-xs text-muted">
              {filteredOverviewCustomers.length} of {customers.length} customer
              {customers.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface-input text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Who</th>
                <th className="px-3 py-2">Default folder</th>
                <th className="px-3 py-2">Restricted folder</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="px-3 py-2 font-medium text-ink">Platform (global fallback)</td>
                <td className="px-3 py-2 align-top">
                  <select
                    className="w-full min-w-[10rem] max-w-md rounded border border-border bg-surface-input px-2 py-1 text-xs text-ink"
                    value={globalAssignment?.folderId ?? ""}
                    onFocus={() => {
                      void ensureMatrixRow("global", null);
                    }}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      void updateDefaultFromMatrix("global", null, v);
                    }}
                    disabled={matrixBusyKey === matrixKey("global", null)}
                  >
                    {!globalAssignment ? (
                      <option value="">Select folder</option>
                    ) : (
                      <>
                        <option value={globalAssignment.folderId}>
                          {globalAssignment.folderName} (Global)
                        </option>
                        <option value="">Change folder…</option>
                      </>
                    )}
                    {(matrixCandidates[matrixKey("global", null)] ?? [])
                      .filter((o) => o.id !== globalRestrictedAssignment?.folderId)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} {o.isGlobal ? "(Global)" : "(Customer)"}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="px-3 py-2 align-top">
                  <select
                    className="w-full min-w-[10rem] max-w-md rounded border border-border bg-surface-input px-2 py-1 text-xs text-ink"
                    value={globalRestrictedAssignment?.folderId ?? ""}
                    onFocus={() => {
                      void ensureMatrixRow("global", null);
                    }}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      void updateRestrictedFromMatrix("global", null, v);
                    }}
                    disabled={restrictedMatrixBusyKey === matrixKey("global", null)}
                  >
                    {!globalRestrictedAssignment ? (
                      <option value="">Select folder</option>
                    ) : (
                      <>
                        <option value={globalRestrictedAssignment.folderId}>
                          {globalRestrictedAssignment.folderName} (Global)
                        </option>
                        <option value="">Change folder…</option>
                      </>
                    )}
                    {(restrictedMatrixCandidates[matrixKey("global", null)] ?? [])
                      .filter((o) => o.id !== globalAssignment?.folderId)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} {o.isGlobal ? "(Global)" : "(Customer)"}
                        </option>
                      ))}
                  </select>
                </td>
              </tr>
              {customers.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-muted" colSpan={3}>
                    No customers loaded.
                  </td>
                </tr>
              ) : filteredOverviewCustomers.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-muted" colSpan={3}>
                    No customers match &ldquo;{overviewSearch.trim()}&rdquo;.
                  </td>
                </tr>
              ) : (
                filteredOverviewCustomers.map((row) => {
                  const key = matrixKey("customer", row.id);
                  const customerDefault = defaultAssignments.find(
                    (a) => a.scope === "customer" && a.customerId === row.id,
                  );
                  const inheritedDefault = !customerDefault && Boolean(globalAssignment);
                  const currentDefault = customerDefault ?? (inheritedDefault ? globalAssignment : undefined);
                  const customerRestricted = restrictedAssignments.find(
                    (a) => a.scope === "customer" && a.customerId === row.id,
                  );
                  const inheritedRestricted = !customerRestricted && Boolean(globalRestrictedAssignment);
                  const currentRestricted =
                    customerRestricted ?? (inheritedRestricted ? globalRestrictedAssignment : undefined);
                  const defaultOpts = (matrixCandidates[key] ?? []).filter(
                    (o) => o.id !== currentRestricted?.folderId,
                  );
                  const restrictedOpts = (restrictedMatrixCandidates[key] ?? []).filter(
                    (o) => o.id !== currentDefault?.folderId,
                  );
                  return (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2">{formatCustomerDisplayLabel(row)}</td>
                      <td className="px-3 py-2 align-top">
                        <select
                          className="w-full min-w-[10rem] max-w-md rounded border border-border bg-surface-input px-2 py-1 text-xs text-ink"
                          value={currentDefault?.folderId ?? ""}
                          onFocus={() => {
                            void ensureMatrixRow("customer", row.id);
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            void updateDefaultFromMatrix("customer", row.id, v);
                          }}
                          disabled={matrixBusyKey === key}
                        >
                          {currentDefault && defaultOpts.every((o) => o.id !== currentDefault.folderId) ? (
                            <option value={currentDefault.folderId}>
                              {currentDefault.folderName}{" "}
                              {folderScopeLabel(currentDefault.folderIsGlobal, inheritedDefault)}
                            </option>
                          ) : null}
                          <option value="">{currentDefault ? "Change folder…" : "Select folder"}</option>
                          {defaultOpts.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name} {o.isGlobal ? "(Global)" : "(Customer)"}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <select
                          className="w-full min-w-[10rem] max-w-md rounded border border-border bg-surface-input px-2 py-1 text-xs text-ink"
                          value={currentRestricted?.folderId ?? ""}
                          onFocus={() => {
                            void ensureMatrixRow("customer", row.id);
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            void updateRestrictedFromMatrix("customer", row.id, v);
                          }}
                          disabled={restrictedMatrixBusyKey === key}
                        >
                          {currentRestricted && restrictedOpts.every((o) => o.id !== currentRestricted.folderId) ? (
                            <option value={currentRestricted.folderId}>
                              {currentRestricted.folderName}{" "}
                              {folderScopeLabel(currentRestricted.folderIsGlobal, inheritedRestricted)}
                            </option>
                          ) : null}
                          <option value="">{currentRestricted ? "Change folder…" : "Select folder"}</option>
                          {restrictedOpts.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name} {o.isGlobal ? "(Global)" : "(Customer)"}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
