import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminBroadcastRecipientCustomers,
  fetchAdminBroadcastRecipientUserFilters,
  fetchAdminBroadcastRecipientUsers,
  type AdminBroadcastRecipientCustomer,
  type AdminBroadcastRecipientUser,
  type AdminBroadcastRecipientUserFilter,
} from "../../api/client";
import { notificationFieldClass } from "./notificationFieldStyles";

export type NotificationGroupRuleDraft = {
  filter: string;
  customer_id?: string | null;
  customer_name?: string | null;
};

type AddMode = "email" | "customer" | "type";

type NotificationGroupMemberEditorProps = {
  apiBase: string;
  authHeaders: () => HeadersInit;
  selectedUserIds: Set<string>;
  onSelectedUserIdsChange: (next: Set<string>) => void;
  rules: NotificationGroupRuleDraft[];
  onRulesChange: (next: NotificationGroupRuleDraft[]) => void;
  /** Emails for chips when we only have ids (e.g. after loading saved group). */
  selectedUserLabels?: Map<string, string>;
};

function ruleKey(rule: NotificationGroupRuleDraft): string {
  return `${rule.filter}:${rule.customer_id ?? ""}`;
}

const PORTAL_CUSTOMER_FILTERS: { id: string; label: string }[] = [
  { id: "portal_all", label: "All portal users" },
  { id: "portal_admins", label: "Customer admins" },
  { id: "portal_users", label: "Portal users" },
];

export function NotificationGroupMemberEditor({
  apiBase,
  authHeaders,
  selectedUserIds,
  onSelectedUserIdsChange,
  rules,
  onRulesChange,
  selectedUserLabels,
}: NotificationGroupMemberEditorProps) {
  const [mode, setMode] = useState<AddMode>("email");
  const [filters, setFilters] = useState<AdminBroadcastRecipientUserFilter[]>([]);

  const [emailSearch, setEmailSearch] = useState("");
  const [emailUsers, setEmailUsers] = useState<AdminBroadcastRecipientUser[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [emailLabels, setEmailLabels] = useState<Map<string, string>>(() => new Map());

  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<AdminBroadcastRecipientCustomer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [pickedCustomer, setPickedCustomer] = useState<AdminBroadcastRecipientCustomer | null>(null);
  const [customerPortalFilter, setCustomerPortalFilter] = useState("portal_all");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchAdminBroadcastRecipientUserFilters(apiBase, authHeaders());
        setFilters(res.filters);
      } catch {
        setFilters([]);
      }
    })();
  }, [apiBase, authHeaders]);

  useEffect(() => {
    if (selectedUserLabels) {
      setEmailLabels(new Map(selectedUserLabels));
    }
  }, [selectedUserLabels]);

  const loadEmailUsers = useCallback(async () => {
    if (!emailSearch.trim()) {
      setEmailUsers([]);
      return;
    }
    setLoadingEmails(true);
    try {
      const list = await fetchAdminBroadcastRecipientUsers(apiBase, authHeaders(), emailSearch);
      setEmailUsers(list);
    } catch {
      setEmailUsers([]);
    } finally {
      setLoadingEmails(false);
    }
  }, [apiBase, authHeaders, emailSearch]);

  const loadCustomers = useCallback(async () => {
    if (!customerSearch.trim()) {
      setCustomers([]);
      return;
    }
    setLoadingCustomers(true);
    try {
      setCustomers(await fetchAdminBroadcastRecipientCustomers(apiBase, authHeaders(), customerSearch));
    } catch {
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, [apiBase, authHeaders, customerSearch]);

  useEffect(() => {
    if (mode !== "email") return;
    const t = window.setTimeout(() => void loadEmailUsers(), 300);
    return () => window.clearTimeout(t);
  }, [mode, loadEmailUsers]);

  useEffect(() => {
    if (mode !== "customer") return;
    const t = window.setTimeout(() => void loadCustomers(), 300);
    return () => window.clearTimeout(t);
  }, [mode, loadCustomers]);

  const toggleEmailUser = (user: AdminBroadcastRecipientUser) => {
    const next = new Set(selectedUserIds);
    if (next.has(user.id)) {
      next.delete(user.id);
    } else {
      next.add(user.id);
      setEmailLabels((prev) => new Map(prev).set(user.id, user.email));
    }
    onSelectedUserIdsChange(next);
  };

  const removeEmailUser = (userId: string) => {
    const next = new Set(selectedUserIds);
    next.delete(userId);
    onSelectedUserIdsChange(next);
  };

  const addCustomerRule = () => {
    if (!pickedCustomer) return;
    const draft: NotificationGroupRuleDraft = {
      filter: customerPortalFilter,
      customer_id: pickedCustomer.id,
      customer_name: pickedCustomer.name,
    };
    if (rules.some((r) => ruleKey(r) === ruleKey(draft))) return;
    onRulesChange([...rules, draft]);
    setPickedCustomer(null);
    setCustomerSearch("");
    setCustomers([]);
  };

  const toggleTypeRule = (filterId: string) => {
    const draft: NotificationGroupRuleDraft = { filter: filterId };
    const existing = rules.find((r) => r.filter === filterId && !r.customer_id);
    if (existing) {
      onRulesChange(rules.filter((r) => ruleKey(r) !== ruleKey(existing)));
    } else {
      onRulesChange([...rules, draft]);
    }
  };

  const removeRule = (rule: NotificationGroupRuleDraft) => {
    onRulesChange(rules.filter((r) => ruleKey(r) !== ruleKey(rule)));
  };

  const filterLabel = (id: string) => filters.find((f) => f.id === id)?.label ?? id;

  const typeFilters = filters.filter((f) => f.group === "practice" || f.group === "portal");

  const modeBtn = (id: AddMode, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setMode(id)}
      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
        mode === id
          ? "border-brand bg-brand/10 text-brand"
          : "border-border bg-surface-raised text-ink hover:bg-surface-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-muted/40 p-4">
      <div>
        <p className="text-sm font-medium text-ink">Add recipients</p>
        <p className="mt-1 text-xs text-muted">
          Pick people by email, everyone at a customer, or by role type (e.g. all managers).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {modeBtn("email", "By email")}
          {modeBtn("customer", "By customer")}
          {modeBtn("type", "By user type")}
        </div>
      </div>

      {mode === "email" ? (
        <div className="space-y-2">
          <input
            className={notificationFieldClass}
            value={emailSearch}
            onChange={(e) => setEmailSearch(e.target.value)}
            placeholder="Search by email…"
          />
          {!emailSearch.trim() ? (
            <p className="text-xs text-muted">Type an email address to find and tick users.</p>
          ) : loadingEmails ? (
            <p className="text-xs text-muted">Searching…</p>
          ) : emailUsers.length === 0 ? (
            <p className="text-xs text-muted">No users match that email.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface-raised p-2">
              {emailUsers.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer gap-2 rounded-md px-2 py-1.5 hover:bg-surface-muted">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border text-brand"
                      checked={selectedUserIds.has(u.id)}
                      onChange={() => toggleEmailUser(u)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{u.email}</span>
                      <span className="block text-xs text-muted">
                        {u.roleLabel ?? (u.kind === "portal" ? "Portal" : "Practice")}
                        {u.customerName ? ` · ${u.customerName}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {mode === "customer" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted">Add all portal users (or admins) for one customer organisation.</p>
          {pickedCustomer ? (
            <div className="space-y-3 rounded-lg border border-border bg-surface-raised p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand">
                  {pickedCustomer.name}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-muted hover:text-ink"
                  onClick={() => setPickedCustomer(null)}
                >
                  Change customer
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {PORTAL_CUSTOMER_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setCustomerPortalFilter(f.id)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                      customerPortalFilter === f.id
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border hover:bg-surface-muted"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={addCustomerRule}
              >
                Add to group
              </button>
            </div>
          ) : (
            <>
              <input
                className={notificationFieldClass}
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search customer name…"
              />
              {loadingCustomers ? (
                <p className="text-xs text-muted">Loading…</p>
              ) : customers.length === 0 ? (
                <p className="text-xs text-muted">
                  {customerSearch.trim() ? "No customers match." : "Type to search for a customer."}
                </p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface-raised p-2">
                  {customers.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPickedCustomer(c);
                          setCustomerSearch("");
                          setCustomers([]);
                        }}
                        className="w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-muted"
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}

      {mode === "type" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Include everyone with this role across the platform. Click again to remove.
          </p>
          <div className="flex flex-wrap gap-2">
            {typeFilters.map((f) => {
              const active = rules.some((r) => r.filter === f.id && !r.customer_id);
              return (
                <button
                  key={f.id}
                  type="button"
                  title={f.hint}
                  onClick={() => toggleTypeRule(f.id)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border bg-surface-raised text-ink hover:bg-surface-muted"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {(selectedUserIds.size > 0 || rules.length > 0) ? (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">In this group</p>
          <ul className="space-y-1.5">
            {[...selectedUserIds].map((id) => (
              <li
                key={`u-${id}`}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-ink">
                  {emailLabels.get(id) ?? selectedUserLabels?.get(id) ?? id}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-red-500 hover:underline"
                  onClick={() => removeEmailUser(id)}
                >
                  Remove
                </button>
              </li>
            ))}
            {rules.map((rule) => (
              <li
                key={ruleKey(rule)}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
              >
                <span className="min-w-0 text-ink">
                  {filterLabel(rule.filter)}
                  {rule.customer_name ? (
                    <span className="text-muted"> · {rule.customer_name}</span>
                  ) : rule.filter.startsWith("portal_") ? (
                    <span className="text-muted"> · all customers</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-red-500 hover:underline"
                  onClick={() => removeRule(rule)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="border-t border-border pt-3 text-xs text-muted">
          Nothing added yet — use one of the options above.
        </p>
      )}
    </div>
  );
}
