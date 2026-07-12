import { useCallback, useEffect, useState } from "react";
import {
  createAdminNotificationGroup,
  deleteAdminNotificationGroup,
  fetchAdminNotificationGroup,
  fetchAdminNotificationGroups,
  patchAdminNotificationGroup,
  previewAdminNotificationGroup,
  previewAdminNotificationGroupDraft,
  type AdminNotificationGroupDetail,
  type AdminNotificationGroupListRow,
} from "../../api/client";
import {
  NotificationGroupMemberEditor,
  type NotificationGroupRuleDraft,
} from "./NotificationGroupMemberEditor";
import { notificationFieldClass } from "./notificationFieldStyles";

type NotificationGroupsPanelProps = {
  apiBase: string;
  authHeaders: () => HeadersInit;
  onGroupsChanged?: () => void;
};

type EditorState = {
  id: string | null;
  name: string;
  description: string;
  selectedUserIds: Set<string>;
  rules: NotificationGroupRuleDraft[];
};

function emptyEditor(): EditorState {
  return {
    id: null,
    name: "",
    description: "",
    selectedUserIds: new Set(),
    rules: [],
  };
}

export function NotificationGroupsPanel({
  apiBase,
  authHeaders,
  onGroupsChanged,
}: NotificationGroupsPanelProps) {
  const [groups, setGroups] = useState<AdminNotificationGroupListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(() => emptyEditor());
  const [busy, setBusy] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [memberEmailLabels, setMemberEmailLabels] = useState<Map<string, string>>(() => new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      setGroups(await fetchAdminNotificationGroups(apiBase, authHeaders()));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load groups");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditor(emptyEditor());
    setMemberEmailLabels(new Map());
    setPreviewCount(null);
    setEditorOpen(true);
    setErr("");
    setMsg("");
  };

  const openEdit = async (id: string) => {
    setBusy(true);
    setErr("");
    try {
      const detail: AdminNotificationGroupDetail = await fetchAdminNotificationGroup(
        apiBase,
        authHeaders(),
        id,
      );
      setMemberEmailLabels(new Map(detail.members.map((m) => [m.user_id, m.email])));
      setEditor({
        id: detail.id,
        name: detail.name,
        description: detail.description ?? "",
        selectedUserIds: new Set(detail.members.map((m) => m.user_id)),
        rules: detail.rules.map((r) => ({
          filter: r.filter,
          customer_id: r.customer_id,
          customer_name: r.customer_name,
        })),
      });
      setPreviewCount(detail.resolved_member_count);
      setEditorOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load group");
    } finally {
      setBusy(false);
    }
  };

  const closeEditor = () => {
    if (busy) return;
    setEditorOpen(false);
    setEditor(emptyEditor());
    setPreviewCount(null);
  };

  const runPreview = async () => {
    setPreviewCount(null);
    const body = {
      name: editor.name.trim() || "Preview",
      description: editor.description.trim() || null,
      user_ids: [...editor.selectedUserIds],
      rules: editor.rules.map((r) => ({
        filter: r.filter,
        customer_id: r.customer_id ?? null,
      })),
    };
    setBusy(true);
    setErr("");
    try {
      if (editor.id) {
        const res = await previewAdminNotificationGroup(apiBase, authHeaders(), editor.id);
        setPreviewCount(res.recipient_count);
      } else {
        const res = await previewAdminNotificationGroupDraft(apiBase, authHeaders(), body);
        setPreviewCount(res.recipient_count);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const saveGroup = async () => {
    if (!editor.name.trim()) {
      setErr("Enter a group name.");
      return;
    }
    if (editor.selectedUserIds.size === 0 && editor.rules.length === 0) {
      setErr("Add at least one recipient (by email, customer, or user type).");
      return;
    }
    const body = {
      name: editor.name.trim(),
      description: editor.description.trim() || null,
      user_ids: [...editor.selectedUserIds],
      rules: editor.rules.map((r) => ({
        filter: r.filter,
        customer_id: r.customer_id ?? null,
      })),
    };
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      if (editor.id) {
        await patchAdminNotificationGroup(apiBase, authHeaders(), editor.id, body);
        setMsg("Group updated.");
      } else {
        await createAdminNotificationGroup(apiBase, authHeaders(), body);
        setMsg("Group created.");
      }
      closeEditor();
      await load();
      onGroupsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (id: string) => {
    setBusy(true);
    setErr("");
    try {
      await deleteAdminNotificationGroup(apiBase, authHeaders(), id);
      setDeleteConfirmId(null);
      setMsg("Group deleted.");
      await load();
      onGroupsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            Save recipient lists (by email, customer, or role) and reuse them when sending broadcasts.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-md" onClick={openCreate}>
          New group
        </button>
      </div>

      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand">{msg}</p>
      ) : null}

      {loading ? <p className="text-sm text-muted">Loading groups…</p> : null}

      {!loading && groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          No custom groups yet. Create one to target the same users in future broadcasts.
        </p>
      ) : null}

      {!loading && groups.length > 0 ? (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li
              key={g.id}
              className="rounded-lg border border-border bg-surface-muted/30 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{g.name}</p>
                  {g.description ? <p className="mt-1 text-sm text-muted">{g.description}</p> : null}
                  <p className="mt-2 text-xs text-muted">
                    {g.resolved_member_count} recipient{g.resolved_member_count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-surface-muted"
                    onClick={() => void openEdit(g.id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteConfirmId(g.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {editorOpen ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={closeEditor} aria-hidden />
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-xl border border-border bg-surface-raised p-5 shadow-xl">
                <h2 className="text-lg font-bold text-ink">
                  {editor.id ? "Edit notification group" : "New notification group"}
                </h2>

                <div className="mt-4 space-y-4">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-ink">Name</span>
                    <input
                      className={notificationFieldClass}
                      value={editor.name}
                      onChange={(e) => setEditor((s) => ({ ...s, name: e.target.value }))}
                      placeholder="e.g. VIP clients"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-ink">Description (optional)</span>
                    <textarea
                      className={`${notificationFieldClass} min-h-[72px]`}
                      value={editor.description}
                      onChange={(e) => setEditor((s) => ({ ...s, description: e.target.value }))}
                      placeholder="Who is in this group?"
                    />
                  </label>

                  <NotificationGroupMemberEditor
                    apiBase={apiBase}
                    authHeaders={authHeaders}
                    selectedUserIds={editor.selectedUserIds}
                    onSelectedUserIdsChange={(next) =>
                      setEditor((s) => ({ ...s, selectedUserIds: next }))
                    }
                    rules={editor.rules}
                    onRulesChange={(next) => setEditor((s) => ({ ...s, rules: next }))}
                    selectedUserLabels={memberEmailLabels}
                  />

                  {previewCount !== null ? (
                    <p className="text-sm text-muted">
                      Resolved recipients: <strong className="text-ink">{previewCount}</strong>
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="btn btn-primary btn-md"
                      onClick={() => void saveGroup()}
                    >
                      {busy ? "Saving…" : "Save group"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-muted"
                      onClick={() => void runPreview()}
                    >
                      Preview count
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-ink"
                      onClick={closeEditor}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {deleteConfirmId ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={busy ? undefined : () => setDeleteConfirmId(null)}
            aria-hidden
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-5 shadow-xl">
              <p className="font-semibold text-ink">Delete this group?</p>
              <p className="mt-2 text-sm text-muted">Broadcast history is not affected. This cannot be undone.</p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                  onClick={() => void confirmDelete(deleteConfirmId)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
