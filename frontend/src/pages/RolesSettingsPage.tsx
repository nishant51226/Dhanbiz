import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  createAdminRole,
  deleteAdminRole,
  fetchAdminPermissionCatalog,
  fetchAdminRoles,
  patchAdminRole,
} from "../api/client";
import { PermissionInfoButton } from "../components/PermissionInfoButton";
import { useAuth } from "../auth/AuthContext";
import type { AdminRoleRow, PermissionCatalogEntry, RoleType } from "../types/api";
import {
  catalogById,
  crudColumnTooltipContent,
  matrixRowTooltipContent,
  permissionTooltipContent,
} from "../utils/permissionHelp";
import {
  applyColumnToggle,
  applyRowToggle,
  columnMasterState,
  filterPermissionsForRoleType,
  isMatrixCellChecked,
  isMatrixColumnApplicable,
  matrixCellPermissionKey,
  matrixPermissionIdsForRoleType,
  matrixRowDescription,
  matrixRowsForRoleType,
  permissionMatchesRoleType,
  rowMasterState,
  setMatrixCell,
  type CrudCol,
} from "../utils/rolesMatrix";
import { roleDisplayDescription } from "../utils/roleDescriptions";

/** At least one colon (e.g. `job:read`, `portal:dashboard:read`). */
const PERM_INPUT_RE = /^[a-z0-9_]+(:[a-z0-9_]+)+$/i;

const CRUD_COLS: CrudCol[] = ["create", "read", "update", "delete"];

/** Match `ListControls` / portal fields ? avoids default bright `input` on dark pages. */
const rolesTextFieldClass =
  "w-full rounded-lg border border-border bg-surface-input px-3 py-2 font-mono text-ink placeholder:text-muted shadow-inner focus:outline-none focus:ring-2 focus:ring-brand/30";

function groupCatalog(entries: PermissionCatalogEntry[]): Map<string, PermissionCatalogEntry[]> {
  const m = new Map<string, PermissionCatalogEntry[]>();
  for (const e of entries) {
    const g = e.group || "Other";
    if (!m.has(g)) m.set(g, []);
    m.get(g)!.push(e);
  }
  return m;
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" strokeLinejoin="round" />
      <path d="M9 12.5 11 14.5 15 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MasterCheckbox({
  state,
  onToggle,
  ariaLabel,
}: {
  state: "all" | "some" | "none" | "na";
  onToggle: () => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.indeterminate = state === "some";
  }, [state]);
  if (state === "na") {
    return <span className="inline-block w-4" aria-hidden />;
  }
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "all"}
      onChange={onToggle}
      aria-label={ariaLabel}
      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
    />
  );
}

export default function RolesSettingsPage() {
  const { apiBase, authHeaders } = useAuth();

  const [catalog, setCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [baselineName, setBaselineName] = useState("");
  const [baselinePerms, setBaselinePerms] = useState<Set<string>>(new Set());

  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleType, setNewRoleType] = useState<RoleType>("staff");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [extraCustomInput, setExtraCustomInput] = useState("");
  const [otherPermSearch, setOtherPermSearch] = useState("");
  const [roleListSearch, setRoleListSearch] = useState("");
  const [roleListTypeFilter, setRoleListTypeFilter] = useState<"all" | RoleType>("all");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [baselineDescription, setBaselineDescription] = useState("");
  const [customPermErr, setCustomPermErr] = useState("");

  const selectedRole = useMemo(() => roles.find((r) => r.id === selectedId) ?? null, [roles, selectedId]);
  const editRoleType = selectedRole?.roleType ?? "staff";

  const matrixRows = useMemo(() => matrixRowsForRoleType(editRoleType), [editRoleType]);
  const matrixIds = useMemo(() => matrixPermissionIdsForRoleType(editRoleType), [editRoleType]);

  const catalogByGroup = useMemo(() => groupCatalog(catalog), [catalog]);
  const catalogMap = useMemo(() => catalogById(catalog), [catalog]);
  const catalogOutsideMatrix = useMemo(
    () =>
      catalog.filter(
        (e) => !matrixIds.has(e.id) && permissionMatchesRoleType(e.id, editRoleType),
      ),
    [catalog, matrixIds, editRoleType],
  );

  const mismatchedPermissionCount = useMemo(() => {
    if (!selectedRole) return 0;
    return selectedRole.permissions.filter((p) => !permissionMatchesRoleType(p, selectedRole.roleType)).length;
  }, [selectedRole]);

  const filteredRoles = useMemo(() => {
    const q = roleListSearch.trim().toLowerCase();
    return roles.filter((r) => {
      if (roleListTypeFilter !== "all" && r.roleType !== roleListTypeFilter) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q);
    });
  }, [roles, roleListSearch, roleListTypeFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [cat, list] = await Promise.all([
        fetchAdminPermissionCatalog(apiBase, authHeaders()),
        fetchAdminRoles(apiBase, authHeaders()),
      ]);
      setCatalog(cat.entries);
      setRoles(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load roles");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedRole) return;
    setEditName(selectedRole.name);
    setEditDescription(selectedRole.description ?? "");
    const s = new Set(selectedRole.permissions);
    setEditPerms(s);
    setBaselineName(selectedRole.name);
    setBaselineDescription(selectedRole.description ?? "");
    setBaselinePerms(new Set(s));
    setSaveErr("");
    setOtherPermSearch("");
    setCustomPermErr("");
  }, [selectedRole?.id, selectedRole?.name, selectedRole?.description, selectedRole?.permissions.join("|")]);

  useEffect(() => {
    if (roles.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !roles.some((r) => r.id === selectedId)) {
      setSelectedId(roles[0]?.id ?? null);
    }
  }, [roles, selectedId]);

  const editPermsForRole = useMemo(
    () => new Set(filterPermissionsForRoleType(editPerms, editRoleType)),
    [editPerms, editRoleType],
  );
  const baselinePermsForRole = useMemo(
    () => new Set(filterPermissionsForRoleType(baselinePerms, editRoleType)),
    [baselinePerms, editRoleType],
  );

  const isDirty =
    selectedRole !== null &&
    ((!selectedRole.isSystem && editName.trim().toLowerCase() !== baselineName) ||
      editDescription.trim() !== baselineDescription.trim() ||
      mismatchedPermissionCount > 0 ||
      editPermsForRole.size !== baselinePermsForRole.size ||
      [...editPermsForRole].some((p) => !baselinePermsForRole.has(p)) ||
      [...baselinePermsForRole].some((p) => !editPermsForRole.has(p)));

  const extraAssigned = useMemo(
    () =>
      [...editPerms]
        .filter((p) => permissionMatchesRoleType(p, editRoleType))
        .filter((p) => !matrixIds.has(p))
        .sort(),
    [editPerms, editRoleType, matrixIds],
  );

  /** Custom extras only (catalog toggles cover the rest). */
  const extraCustomOnly = useMemo(
    () => extraAssigned.filter((p) => !catalog.some((c) => c.id === p)),
    [extraAssigned, catalog],
  );

  const togglePerm = (id: string, on: boolean) => {
    setEditPerms((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const addCustomPerm = (raw: string) => {
    const p = raw.trim().toLowerCase();
    if (!p || !PERM_INPUT_RE.test(p)) return;
    if (!selectedRole) return;
    if (!permissionMatchesRoleType(p, selectedRole.roleType)) {
      setCustomPermErr(
        selectedRole.roleType === "portal"
          ? "Portal roles only accept permissions starting with portal: (e.g. portal:file:read)."
          : "Staff roles cannot include portal: permissions — use Portal — rows in the matrix instead.",
      );
      return;
    }
    setCustomPermErr("");
    setEditPerms((prev) => new Set(prev).add(p));
    setExtraCustomInput("");
  };

  const save = async () => {
    if (!selectedRole) return;
    setSaveBusy(true);
    setSaveErr("");
    try {
      const permissions = filterPermissionsForRoleType(editPerms, selectedRole.roleType);
      const updated = await patchAdminRole(apiBase, authHeaders(), selectedRole.id, {
        ...(selectedRole.isSystem ? {} : { name: editName.trim().toLowerCase() }),
        description: editDescription.trim() || undefined,
        permissions,
      });
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setBaselineName(updated.name);
      setBaselineDescription(updated.description ?? "");
      setBaselinePerms(new Set(updated.permissions));
      setEditName(updated.name);
      setEditDescription(updated.description ?? "");
      setEditPerms(new Set(updated.permissions));
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaveBusy(false);
    }
  };

  const addRole = async () => {
    const name = newRoleName.trim().toLowerCase();
    if (!name) return;
    setCreateBusy(true);
    setCreateErr("");
    try {
      const row = await createAdminRole(apiBase, authHeaders(), {
        name,
        roleType: newRoleType,
        description: newRoleDescription.trim() || undefined,
        permissions: [],
      });
      setRoles((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedId(row.id);
      setNewRoleName("");
      setNewRoleDescription("");
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreateBusy(false);
    }
  };

  const removeRole = async (id: string) => {
    if (!window.confirm("Delete this role? It must have no users assigned.")) return;
    setDeletingId(id);
    try {
      await deleteAdminRole(apiBase, authHeaders(), id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] w-full max-w-[1200px] flex-col gap-4 lg:max-w-none lg:flex-row lg:gap-0">
      <aside className="flex w-full shrink-0 flex-col border border-border bg-surface-muted/90 lg:w-64 lg:border-y lg:border-l lg:border-r-0 lg:rounded-l-xl">
        <div className="border-b border-border p-4">
          <Link to="/settings/users" className="text-xs text-brand hover:underline">
            &larr; Settings
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-ink">Roles</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Superadmin only. Pick a role to edit permissions (matrix + extras). Assign staff roles under{" "}
            <Link to="/settings/users" className="font-medium text-brand hover:underline">
              Settings → Users
            </Link>
            ; portal logins are under each customer&apos;s <span className="font-medium">Portal users</span> tab.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="px-2 py-3 text-sm text-muted">Loading...</p>
          ) : roles.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">No roles yet. Add one below.</p>
          ) : (
            <>
              <label className="mb-2 block px-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Type</span>
                <select
                  value={roleListTypeFilter}
                  onChange={(e) => setRoleListTypeFilter(e.target.value as "all" | RoleType)}
                  className={`text-xs ${rolesTextFieldClass}`}
                >
                  <option value="all">All roles</option>
                  <option value="staff">Staff only</option>
                  <option value="portal">Portal only</option>
                </select>
              </label>
              <label className="mb-2 block px-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Search roles</span>
                <input
                  value={roleListSearch}
                  onChange={(e) => setRoleListSearch(e.target.value)}
                  placeholder="Filter by role name"
                  className={`text-xs ${rolesTextFieldClass}`}
                />
              </label>
              <ul className="space-y-0.5">
                {filteredRoles.length === 0 ? (
                  <li className="px-2 py-3 text-xs text-muted">No roles match this search.</li>
                ) : (
                  filteredRoles.map((r) => {
                const active = r.id === selectedId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm transition-colors ${
                        active
                          ? "bg-brand/12 font-semibold text-ink shadow-sm ring-1 ring-brand/60"
                          : "text-ink-soft hover:bg-surface-raised/70"
                      }`}
                    >
                      <ShieldIcon className={`h-4 w-4 shrink-0 ${active ? "text-brand" : "text-muted-soft"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-xs">{r.name}</span>
                        {roleDisplayDescription(r) ? (
                          <span className="mt-0.5 line-clamp-2 block text-[10px] font-normal leading-snug text-muted">
                            {roleDisplayDescription(r)}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 rounded bg-surface-muted px-1 py-0.5 text-[9px] font-semibold uppercase text-muted">
                        {r.roleType}
                      </span>
                      {r.isSystem ? (
                        <span
                          className="shrink-0 rounded bg-brand/15 px-1 py-0.5 text-[9px] font-semibold text-brand"
                          title="System role"
                        >
                          system
                        </span>
                      ) : null}
                      <span
                        className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft"
                        title="Users assigned"
                      >
                        {r.assignedUserCount}
                      </span>
                    </button>
                  </li>
                );
                  })
                )}
              </ul>
            </>
          )}
        </div>

        <div className="border-t border-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">New role</p>
          <label className="mb-2 block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Type</span>
            <select
              value={newRoleType}
              onChange={(e) => setNewRoleType(e.target.value as RoleType)}
              className={`text-xs ${rolesTextFieldClass}`}
            >
              <option value="staff">Staff (practice)</option>
              <option value="portal">Portal (customer login)</option>
            </select>
          </label>
          <div className="flex gap-2">
            <input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="name"
              className={`min-w-0 flex-1 text-xs ${rolesTextFieldClass}`}
            />
            <button
              type="button"
              disabled={createBusy || !newRoleName.trim()}
              onClick={() => void addRole()}
              className="btn btn-primary btn-sm shrink-0 disabled:opacity-40"
            >
              {createBusy ? "..." : "Add"}
            </button>
          </div>
          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Description (optional)</span>
            <input
              value={newRoleDescription}
              onChange={(e) => setNewRoleDescription(e.target.value)}
              placeholder="Short label for admins"
              className={`text-xs ${rolesTextFieldClass}`}
            />
          </label>
          <p className="mt-1 text-[10px] text-muted">Lowercase, 2-63 chars, start with a letter.</p>
          {createErr ? <p className="mt-2 text-xs text-red-400">{createErr}</p> : null}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col border border-border bg-surface-raised lg:rounded-r-xl lg:border-l-0">
        {err ? (
          <div className="alert-error-compact">{err}</div>
        ) : null}

        {!selectedRole && !loading ? (
          <div className="p-8 text-sm text-muted">Select a role from the list.</div>
        ) : selectedRole ? (
          <>
            <div className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                <nav className="text-sm text-muted" aria-label="Breadcrumb">
                  <span className="font-mono font-semibold text-brand">{selectedRole.name}</span>
                  {selectedRole.isSystem ? (
                    <span className="ml-2 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand">
                      system
                    </span>
                  ) : null}
                  <span className="mx-1.5 text-border" aria-hidden>
                    /
                  </span>
                  <span className="font-medium uppercase tracking-wide text-muted-soft">{selectedRole.roleType}</span>
                  <span className="mx-1.5 text-border" aria-hidden>
                    /
                  </span>
                  <span className="font-medium uppercase tracking-wide text-muted-soft">Permissions</span>
                </nav>
                <h2 className="mt-1 text-lg font-semibold text-ink">Role access</h2>
                <label className="mt-3 block max-w-md">
                  <span className="mb-1 block text-xs font-medium text-muted">Role key</span>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. staff_readonly"
                    disabled={selectedRole.isSystem}
                    className={`text-sm ${rolesTextFieldClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  />
                  {selectedRole.isSystem ? (
                    <p className="mt-1 text-[10px] text-muted">System role names cannot be renamed.</p>
                  ) : null}
                </label>
                <label className="mt-3 block max-w-lg">
                  <span className="mb-1 block text-xs font-medium text-muted">Description</span>
                  <input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={roleDisplayDescription(selectedRole) ?? "Optional note for other admins"}
                    className={`text-sm ${rolesTextFieldClass}`}
                  />
                </label>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!isDirty || saveBusy}
                  onClick={() => void save()}
                  className="inline-flex items-center gap-2 btn btn-primary btn-md disabled:opacity-40"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <path d="M17 21v-8H7v8M7 3v5h8" />
                  </svg>
                  {saveBusy ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  disabled={selectedRole.isSystem || selectedRole.assignedUserCount > 0 || deletingId === selectedRole.id}
                  title={
                    selectedRole.isSystem
                      ? "System roles cannot be deleted"
                      : selectedRole.assignedUserCount > 0
                        ? "Remove all user assignments first"
                        : undefined
                  }
                  onClick={() => void removeRole(selectedRole.id)}
                  className="btn btn-danger btn-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deletingId === selectedRole.id ? "Deleting..." : "Delete role"}
                </button>
              </div>
            </div>
            {saveErr ? <p className="alert-error-compact border-b-0">{saveErr}</p> : null}

            <div className="px-4 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Resource matrix</p>
              <p className="mt-0.5 text-[11px] text-muted-soft">
                {editRoleType === "portal"
                  ? "Portal permissions only — customer login access (portal:* keys)."
                  : "Practice staff permissions only — unprefixed keys (customers, jobs, files, etc.)."}
              </p>
              {mismatchedPermissionCount > 0 ? (
                <p className="mt-2 rounded-lg border border-amber-800/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  This role still has {mismatchedPermissionCount} permission
                  {mismatchedPermissionCount === 1 ? "" : "s"} from the other type (hidden here). Saving will remove{" "}
                  {mismatchedPermissionCount === 1 ? "it" : "them"}.
                </p>
              ) : null}
            </div>
            <div className="overflow-x-auto p-4 pt-2">
              <table className="w-full min-w-[640px] border-collapse rounded-lg border border-border bg-surface-muted/40 text-sm shadow-inner">
                <thead>
                  <tr className="border-b border-border bg-surface-raised/80 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="rounded-tl-lg px-3 py-3 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-ink-soft">Resource</span>
                        <MasterCheckbox
                          state={(() => {
                            const states = matrixRows.map((row) => rowMasterState(editPerms, row));
                            if (states.every((s) => s === "na")) return "na";
                            const ok = states.filter((s) => s !== "na");
                            const all = ok.every((s) => s === "all");
                            const none = ok.every((s) => s === "none");
                            if (all) return "all";
                            if (none) return "none";
                            return "some";
                          })()}
                          onToggle={() => {
                            const states = matrixRows.map((row) => rowMasterState(editPerms, row));
                            const ok = states.filter((s) => s !== "na");
                            const allOn = ok.length > 0 && ok.every((s) => s === "all");
                            setEditPerms((prev) => {
                              let next = new Set(prev);
                              for (const row of matrixRows) {
                                if (rowMasterState(prev, row) === "na") continue;
                                next = applyRowToggle(next, row, !allOn);
                              }
                              return next;
                            });
                          }}
                          ariaLabel="Toggle all resources"
                        />
                      </div>
                    </th>
                    {CRUD_COLS.map((col) => {
                      const letter = col === "create" ? "C" : col === "read" ? "R" : col === "update" ? "U" : "D";
                      const st = columnMasterState(editPerms, col);
                      return (
                        <th key={col} className="w-16 px-1 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-0.5">
                              <span className="text-[11px] font-bold text-brand">{letter}</span>
                              <PermissionInfoButton title={crudColumnTooltipContent(col)} size="xs" />
                            </div>
                            <MasterCheckbox
                              state={st}
                              onToggle={() => {
                                const on = st !== "all";
                                setEditPerms((prev) => applyColumnToggle(prev, col, on));
                              }}
                              ariaLabel={`Toggle column ${letter}`}
                            />
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map((row) => {
                    const rowState = rowMasterState(editPerms, row);
                    return (
                      <tr key={row.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-muted/30">
                        <td className="px-3 py-2.5 pr-2 font-medium text-ink">
                          <div className="flex items-center gap-2">
                            <MasterCheckbox
                              state={rowState}
                              onToggle={() => {
                                const on = rowState !== "all";
                                setEditPerms((prev) => applyRowToggle(prev, row, on));
                              }}
                              ariaLabel={`Toggle all for ${row.label}`}
                            />
                            <div className="min-w-0 flex-1">
                              <span className="block font-medium text-ink">{row.label}</span>
                              {matrixRowDescription(row) ? (
                                <span className="mt-0.5 block text-[10px] font-normal leading-snug text-muted">
                                  {matrixRowDescription(row)}
                                </span>
                              ) : null}
                            </div>
                            <PermissionInfoButton title={matrixRowTooltipContent(row, catalogMap)} />
                          </div>
                        </td>
                        {CRUD_COLS.map((col) => {
                          const applicable = isMatrixColumnApplicable(row, col);
                          const checked = applicable && isMatrixCellChecked(editPerms, row, col);
                          const permKey = applicable ? matrixCellPermissionKey(row, col) : null;
                          const permLabel = permKey ? catalogMap.get(permKey)?.label : null;
                          const cellTitle =
                            permKey && permLabel ? `${permKey} — ${permLabel}` : permKey ?? undefined;
                          return (
                            <td key={col} className="py-2.5 text-center">
                              {applicable ? (
                                <div className="inline-flex items-center justify-center gap-0.5">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    title={cellTitle}
                                    onChange={(ev) =>
                                      setEditPerms((prev) => setMatrixCell(prev, row, col, ev.target.checked))
                                    }
                                    className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                                    aria-label={`${row.label} ${col}`}
                                  />
                                  {permKey ? (
                                    <PermissionInfoButton
                                      title={permissionTooltipContent(permKey, catalogMap)}
                                      size="xs"
                                    />
                                  ) : null}
                                </div>
                              ) : (
                                <span className="inline-block select-none text-muted-soft/50" aria-hidden title="Not applicable">
                                  ?
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border-subtle px-4 pb-6 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Other permissions</p>
              <p className="mt-1 text-xs text-muted">
                Catalog entries for {editRoleType === "portal" ? "portal" : "staff"} roles that are not in the matrix
                above, plus ad-hoc keys you add below.
              </p>

              {catalogOutsideMatrix.length > 0 ? (
                <label className="mt-3 block max-w-md">
                  <span className="mb-1 block text-xs font-medium text-muted">Search permissions</span>
                  <input
                    value={otherPermSearch}
                    onChange={(e) => setOtherPermSearch(e.target.value)}
                    placeholder="Filter by id or label"
                    className={`text-sm ${rolesTextFieldClass}`}
                  />
                </label>
              ) : null}

              {catalogOutsideMatrix.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {[...catalogByGroup.entries()].map(([group, entries]) => {
                    const q = otherPermSearch.trim().toLowerCase();
                    const filtered = entries
                      .filter((e) => !matrixIds.has(e.id))
                      .filter((e) => permissionMatchesRoleType(e.id, editRoleType))
                      .filter(
                        (e) =>
                          !q ||
                          e.id.toLowerCase().includes(q) ||
                          (e.label ?? "").toLowerCase().includes(q),
                      );
                    if (filtered.length === 0) return null;
                    return (
                      <div key={group}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-soft">{group}</p>
                        <ul className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {filtered.map((e) => (
                            <li
                              key={e.id}
                              className="flex items-start gap-2 rounded-lg border border-border bg-surface-muted/60 px-3 py-2 shadow-sm"
                            >
                              <input
                                type="checkbox"
                                id={`cat-${selectedRole.id}-${e.id}`}
                                checked={editPerms.has(e.id)}
                                onChange={(ev) => togglePerm(e.id, ev.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
                              />
                              <label htmlFor={`cat-${selectedRole.id}-${e.id}`} className="min-w-0 flex-1 cursor-pointer text-xs text-ink">
                                <span className="font-mono text-[11px] font-semibold text-brand">{e.id}</span>
                                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{e.label}</span>
                              </label>
                              <PermissionInfoButton title={permissionTooltipContent(e.id, catalogMap)} size="xs" />
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Custom permissions</p>
              <p className="mt-1 text-[11px] text-muted-soft">
                Add any <span className="font-mono">resource:action</span> string not listed above
                {editRoleType === "portal" ? " (must start with portal:)." : " (staff keys only, no portal: prefix)."}
              </p>
              {customPermErr ? <p className="mt-2 text-xs text-red-400">{customPermErr}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={extraCustomInput}
                  onChange={(e) => setExtraCustomInput(e.target.value)}
                  placeholder="resource:action"
                  className={`min-w-0 flex-1 text-xs ${rolesTextFieldClass}`}
                />
                <button
                  type="button"
                  onClick={() => addCustomPerm(extraCustomInput)}
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-muted"
                >
                  Add permission
                </button>
              </div>

              {extraCustomOnly.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1">
                  {extraCustomOnly.map((p) => (
                    <li
                      key={p}
                      className="inline-flex items-center gap-1 rounded bg-surface-raised px-2 py-0.5 font-mono text-[11px] text-ink ring-1 ring-border"
                    >
                      {p}
                      <PermissionInfoButton title={permissionTooltipContent(p, catalogMap)} size="xs" />
                      <button
                        type="button"
                        className="text-red-400 hover:underline"
                        onClick={() => togglePerm(p, false)}
                        aria-label={`Remove ${p}`}
                      >
                        x
                      </button>
                    </li>
                  ))}
                </ul>
              ) : extraAssigned.length === 0 ? (
                <p className="mt-2 text-xs text-muted">No permissions outside the matrix on this role.</p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="p-8 text-sm text-muted">Loading...</div>
        )}
      </section>
    </div>
  );
}
