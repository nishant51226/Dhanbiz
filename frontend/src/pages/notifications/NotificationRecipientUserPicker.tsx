import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminBroadcastRecipientUsers,
  type AdminBroadcastRecipientUser,
} from "../../api/client";
import { notificationFieldClass } from "./notificationFieldStyles";

type NotificationRecipientUserPickerProps = {
  apiBase: string;
  authHeaders: () => HeadersInit;
  selectedUserIds: Set<string>;
  onChange: (next: Set<string>) => void;
};

/** Broadcast tab: pick specific users by email search only. */
export function NotificationRecipientUserPicker({
  apiBase,
  authHeaders,
  selectedUserIds,
  onChange,
}: NotificationRecipientUserPickerProps) {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminBroadcastRecipientUser[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!search.trim()) {
      setUsers([]);
      return;
    }
    setLoading(true);
    try {
      setUsers(await fetchAdminBroadcastRecipientUsers(apiBase, authHeaders(), search));
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, search]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-muted/40 p-3">
      <p className="text-sm font-medium text-ink">Search by email</p>
      <input
        className={notificationFieldClass}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Type an email address…"
      />
      {!search.trim() ? (
        <p className="text-xs text-muted">Search to find and tick individual users.</p>
      ) : loading ? (
        <p className="text-xs text-muted">Searching…</p>
      ) : users.length === 0 ? (
        <p className="text-xs text-muted">No users match.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface-raised p-2">
          {users.map((u) => (
            <li key={u.id}>
              <label className="flex cursor-pointer gap-2 rounded-md px-2 py-1.5 hover:bg-surface-muted">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border text-brand"
                  checked={selectedUserIds.has(u.id)}
                  onChange={() => {
                    const next = new Set(selectedUserIds);
                    if (next.has(u.id)) next.delete(u.id);
                    else next.add(u.id);
                    onChange(next);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{u.email}</span>
                  <span className="block text-xs text-muted">
                    {u.roleLabel ?? (u.kind === "portal" ? "Portal user" : "Practice")}
                    {u.customerName ? ` · ${u.customerName}` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {selectedUserIds.size > 0 ? (
        <p className="text-xs text-muted">{selectedUserIds.size} user(s) selected</p>
      ) : null}
    </div>
  );
}
