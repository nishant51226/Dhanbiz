import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createAdminPracticeUser,
  deleteAdminPracticeUser,
  fetchAdminPracticeUserCustomerAssignments,
  fetchAdminPracticeUsers,
  fetchAdminRoles,
  fetchAllCustomersForStaffAssignment,
  patchAdminPracticeUser,
  postAdminPracticeUserPassword,
  replaceAdminPracticeUserCustomerAssignments,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { AdminPracticeUserRow, AdminRoleRow, Customer } from "../types/api";
import { formatDateTime } from "../utils/formatDate";
import { ModalDialog } from "../components/ui/ModalDialog";
import { CustomerAccessPicker } from "../components/admin/CustomerAccessPicker";
import {
  staffDefaultsAllCustomers,
  staffNeedsCustomerAssignments,
  unionPermissionsFromRoles,
} from "../utils/staffRoleSelection";
import { roleDisplayDescription } from "../utils/roleDescriptions";

const inputClass =
  "mt-1 w-full max-w-md rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-muted-soft";

function EffectivePermissionsPreview({
  roles,
  selectedIds,
}: {
  roles: AdminRoleRow[];
  selectedIds: ReadonlySet<string>;
}) {
  const perms = unionPermissionsFromRoles(roles, selectedIds);
  if (selectedIds.size === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-muted/50 px-3 py-2">
      <p className="text-xs font-medium text-ink">
        Effective access: <span className="text-brand">{perms.length}</span> permission
        {perms.length === 1 ? "" : "s"}
        {selectedIds.size > 1 ? (
          <span className="text-muted"> (union of {selectedIds.size} roles)</span>
        ) : null}
      </p>
      {perms.length > 0 ? (
        <p className="mt-1 line-clamp-2 font-mono text-[10px] leading-relaxed text-muted" title={perms.join(", ")}>
          {perms.slice(0, 12).join(" · ")}
          {perms.length > 12 ? ` · +${perms.length - 12} more` : ""}
        </p>
      ) : (
        <p className="mt-1 text-[10px] text-muted">No permissions on selected roles yet — edit under Settings → Roles.</p>
      )}
    </div>
  );
}

function roleCheckboxList(
  roles: AdminRoleRow[],
  groupName: string,
  selectedIds: ReadonlySet<string>,
  onToggle: (id: string, on: boolean) => void,
  disabled?: boolean,
  tall?: boolean,
) {
  if (roles.length === 0) {
    return (
      <p className="text-xs text-muted">
        No staff roles are available yet. Add them under Settings → Roles, or run role seed migrations.
      </p>
    );
  }
  return (
    <ul
      className={`mt-2 space-y-2 overflow-y-auto rounded-lg border border-border bg-surface-muted/40 p-3 ${
        tall ? "max-h-[min(40vh,18rem)]" : "max-h-48"
      }`}
    >
      {roles.map((r) => (
        <li key={r.id} className="flex items-start gap-2">
          <input
            id={`${groupName}-role-${r.id}`}
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
            checked={selectedIds.has(r.id)}
            disabled={disabled}
            onChange={(e) => onToggle(r.id, e.target.checked)}
          />
          <label htmlFor={`${groupName}-role-${r.id}`} className="cursor-pointer text-sm leading-snug">
            <span className="font-mono text-xs font-semibold text-ink">{r.name}</span>
            {r.isSystem ? (
              <span className="ml-1.5 rounded bg-brand/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-brand">
                system
              </span>
            ) : null}
            <span className="mt-0.5 block text-[11px] text-muted">
              {roleDisplayDescription(r) ??
                `${r.permissions.length} permission${r.permissions.length === 1 ? "" : "s"}`}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export default function StaffSettingsUsersPage() {
  const { apiBase, authHeaders } = useAuth();
  const [rows, setRows] = useState<AdminPracticeUserRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [generatePassword, setGeneratePassword] = useState(true);
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newRoleIds, setNewRoleIds] = useState<Set<string>>(() => new Set());
  const [newCustomerIds, setNewCustomerIds] = useState<Set<string>>(() => new Set());
  const newCustomerSelectionTouchedRef = useRef(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [initialPasswordBanner, setInitialPasswordBanner] = useState<{ email: string; password: string } | null>(
    null,
  );

  const [deleteBusyUserId, setDeleteBusyUserId] = useState<string | null>(null);

  const [passwordModalUser, setPasswordModalUser] = useState<AdminPracticeUserRow | null>(null);
  const [pwdGenerate, setPwdGenerate] = useState(true);
  const [pwdCustom, setPwdCustom] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdErr, setPwdErr] = useState("");
  const [pwdBanner, setPwdBanner] = useState<{ email: string; password: string } | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const [editingUser, setEditingUser] = useState<AdminPracticeUserRow | null>(null);
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editRoleIds, setEditRoleIds] = useState<Set<string>>(() => new Set());
  const [editCustomerIds, setEditCustomerIds] = useState<Set<string>>(() => new Set());
  const [editCustomersLoading, setEditCustomersLoading] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const [userList, roleList, customerList] = await Promise.all([
        fetchAdminPracticeUsers(apiBase, authHeaders()),
        fetchAdminRoles(apiBase, authHeaders(), { roleType: "staff" }),
        fetchAllCustomersForStaffAssignment(apiBase, authHeaders()),
      ]);
      setRows(userList);
      setRoles(roleList);
      setCustomers(customerList);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const modalOpen = Boolean(passwordModalUser || editingUser);
    if (!modalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [passwordModalUser, editingUser]);

  const practiceStaffRoles = roles;

  const newRoleCustomerAccess = useMemo(
    () => staffNeedsCustomerAssignments(newRoleIds, newIsAdmin),
    [newRoleIds, newIsAdmin],
  );
  const editRoleCustomerAccess = useMemo(
    () => staffNeedsCustomerAssignments(editRoleIds, editIsAdmin),
    [editRoleIds, editIsAdmin],
  );
  const newDefaultsAllCustomers = useMemo(
    () => staffDefaultsAllCustomers(roles, newRoleIds, newIsAdmin),
    [roles, newRoleIds, newIsAdmin],
  );
  const editDefaultsAllCustomers = useMemo(
    () => staffDefaultsAllCustomers(roles, editRoleIds, editIsAdmin),
    [roles, editRoleIds, editIsAdmin],
  );

  /** When customers load after role pick, default selection from effective permissions. */
  useEffect(() => {
    if (newCustomerSelectionTouchedRef.current) return;
    if (!staffNeedsCustomerAssignments(newRoleIds, newIsAdmin)) return;
    if (customers.length === 0) return;
    if (newDefaultsAllCustomers) {
      setNewCustomerIds(new Set(customers.map((c) => c.id)));
    } else {
      setNewCustomerIds(new Set());
    }
  }, [customers, newRoleIds, newIsAdmin, newDefaultsAllCustomers]);

  const toggleNewRole = (id: string, on: boolean) => {
    newCustomerSelectionTouchedRef.current = false;
    setNewRoleIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleNewCustomer = (id: string, on: boolean) => {
    newCustomerSelectionTouchedRef.current = true;
    setNewCustomerIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const bulkSetNewCustomers = (ids: string[], on: boolean) => {
    newCustomerSelectionTouchedRef.current = true;
    setNewCustomerIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const openEdit = useCallback(
    async (u: AdminPracticeUserRow) => {
      setPasswordModalUser(null);
      setEditingUser(u);
      setEditIsAdmin(u.isAdmin);
      setEditRoleIds(new Set(u.roles.map((r) => r.id)));
      setEditCustomerIds(new Set());
      setEditCustomersLoading(true);
      setEditErr("");
      try {
        const assignments = await fetchAdminPracticeUserCustomerAssignments(apiBase, authHeaders(), u.id);
        const assigned = new Set(assignments.map((a) => a.customerId));
        if (staffDefaultsAllCustomers(roles, new Set(u.roles.map((r) => r.id)), u.isAdmin) && assigned.size === 0) {
          setEditCustomerIds(new Set(customers.map((c) => c.id)));
        } else {
          setEditCustomerIds(assigned);
        }
      } catch (e) {
        setEditErr(e instanceof Error ? e.message : "Failed to load customer assignments");
      } finally {
        setEditCustomersLoading(false);
      }
    },
    [apiBase, authHeaders, customers, roles],
  );

  const closeEdit = useCallback(() => {
    setEditingUser(null);
    setEditErr("");
    if (searchParams.get("edit")) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("edit");
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const editId = searchParams.get("edit")?.trim();
    if (!editId || loading || customers.length === 0) return;
    if (editingUser?.id === editId) return;
    const row = rows.find((r) => r.id === editId);
    if (row) void openEdit(row);
  }, [searchParams, loading, rows, customers.length, editingUser?.id, openEdit]);

  const openPasswordModal = (u: AdminPracticeUserRow) => {
    setEditingUser(null);
    setPasswordModalUser(u);
    setPwdGenerate(true);
    setPwdCustom("");
    setPwdErr("");
    setPwdBanner(null);
  };

  const closePasswordModal = () => {
    setPasswordModalUser(null);
    setPwdErr("");
    setPwdBusy(false);
  };

  const onSubmitPassword = async () => {
    if (!passwordModalUser) return;
    if (!pwdGenerate && pwdCustom.trim().length < 8) {
      setPwdErr("Password must be at least 8 characters");
      return;
    }
    setPwdBusy(true);
    setPwdErr("");
    setPwdBanner(null);
    try {
      const res = await postAdminPracticeUserPassword(apiBase, authHeaders(), passwordModalUser.id, {
        password: pwdGenerate ? undefined : pwdCustom.trim(),
      });
      if (res.initialPassword) {
        setPwdBanner({ email: passwordModalUser.email, password: res.initialPassword });
      } else {
        closePasswordModal();
      }
    } catch (e) {
      setPwdErr(e instanceof Error ? e.message : "Could not update password");
    } finally {
      setPwdBusy(false);
    }
  };

  const toggleEditRole = (id: string, on: boolean) => {
    setEditRoleIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      if (!editIsAdmin && staffDefaultsAllCustomers(roles, next, false)) {
        setEditCustomerIds(new Set(customers.map((c) => c.id)));
      }
      return next;
    });
  };

  const toggleEditCustomer = (id: string, on: boolean) => {
    setEditCustomerIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const bulkSetEditCustomers = (ids: string[], on: boolean) => {
    setEditCustomerIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const onSaveEdit = async () => {
    if (!editingUser) return;
    if (!editIsAdmin && editRoleIds.size === 0) {
      setEditErr("Pick at least one role, or enable superadmin");
      return;
    }
    if (!editIsAdmin && editRoleCustomerAccess && editCustomerIds.size === 0) {
      setEditErr("Pick at least one customer");
      return;
    }
    setSaveBusy(true);
    setEditErr("");
    try {
      await patchAdminPracticeUser(apiBase, authHeaders(), editingUser.id, {
        isAdmin: editIsAdmin,
        roleIds: [...editRoleIds],
      });
      if (!editIsAdmin) {
        await replaceAdminPracticeUserCustomerAssignments(apiBase, authHeaders(), editingUser.id, [
          ...editCustomerIds,
        ]);
      }
      closeEdit();
      await load();
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaveBusy(false);
    }
  };

  const onCreate = async () => {
    setCreateMsg("");
    setInitialPasswordBanner(null);
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      setCreateMsg("Email is required");
      return;
    }
    if (!newIsAdmin && newRoleIds.size === 0) {
      setCreateMsg("Pick at least one role, or enable superadmin");
      return;
    }
    if (!generatePassword && newPassword.length < 8) {
      setCreateMsg("Password must be at least 8 characters");
      return;
    }
    if (!newIsAdmin && newRoleCustomerAccess && newCustomerIds.size === 0) {
      setCreateMsg("Pick at least one customer");
      return;
    }

    setCreateBusy(true);
    try {
      const body: { email: string; password?: string; isAdmin?: boolean; roleIds?: string[] } = {
        email,
        isAdmin: newIsAdmin,
        roleIds: [...newRoleIds],
      };
      if (!generatePassword && newPassword.trim()) {
        body.password = newPassword;
      }
      const res = await createAdminPracticeUser(apiBase, authHeaders(), body);
      if (!newIsAdmin) {
        const assignIds = [...newCustomerIds];
        await replaceAdminPracticeUserCustomerAssignments(apiBase, authHeaders(), res.id, assignIds);
      }
      if (res.initialPassword) {
        setInitialPasswordBanner({ email: res.email, password: res.initialPassword });
      }
      setCreateMsg("User created.");
      setNewEmail("");
      setNewPassword("");
      setNewRoleIds(new Set());
      setNewCustomerIds(new Set());
      newCustomerSelectionTouchedRef.current = false;
      setNewIsAdmin(false);
      setGeneratePassword(true);
      await load();
    } catch (e) {
      setCreateMsg(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreateBusy(false);
    }
  };

  const onDeleteUser = async (u: AdminPracticeUserRow) => {
    const proceed = window.confirm(
      `Delete user "${u.email}"?\n\nThis removes their staff login and customer assignments.`,
    );
    if (!proceed) return;
    setErr("");
    setDeleteBusyUserId(u.id);
    try {
      await deleteAdminPracticeUser(apiBase, authHeaders(), u.id);
      if (editingUser?.id === u.id) closeEdit();
      if (passwordModalUser?.id === u.id) closePasswordModal();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusyUserId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Users</h1>
        <p className="mt-1 text-sm text-muted">
          Add practice staff with one or more <span className="font-medium">staff roles</span> (defaults to all
          active customers; you can narrow below), or use superadmin. On{" "}
          <span className="font-medium">Files</span> and <span className="font-medium">Jobs</span> they see documents
          and jobs for those customers; on           <span className="font-medium">Files</span> they can turn on{" "}
          <span className="font-medium">Assigned to me</span> when their role includes{" "}
          <span className="font-medium">Library document assignee</span>. Customer portal accounts
          (<span className="font-medium text-ink-soft">customer admin / user</span>) are created under each
          customer&apos;s <span className="font-medium text-ink-soft">Portal users</span> tab.
        </p>
      </div>

      {err ? (
        <p className="alert-error-compact">{err}</p>
      ) : null}

      <section className="rounded-xl border border-border bg-surface-raised p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Add user</h2>
        <p className="mt-1 text-xs text-muted">
          Creates practice staff logins: pick one or more staff roles, or grant full access with superadmin. Customer
          access defaults to every customer; uncheck any you want to exclude. Customer portal accounts are created under
          each customer&apos;s Portal users tab.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-ink">
              Email
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className={inputClass}
                placeholder="name@firm.com"
                autoComplete="off"
              />
            </label>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                checked={newIsAdmin}
                onChange={(e) => {
                  const on = e.target.checked;
                  setNewIsAdmin(on);
                  if (on) {
                    setNewCustomerIds(new Set());
                    newCustomerSelectionTouchedRef.current = false;
                  } else if (staffNeedsCustomerAssignments(newRoleIds, false)) {
                    newCustomerSelectionTouchedRef.current = false;
                    if (staffDefaultsAllCustomers(roles, newRoleIds, false)) {
                      setNewCustomerIds(new Set(customers.map((c) => c.id)));
                    } else {
                      setNewCustomerIds(new Set());
                    }
                  }
                }}
              />
              Superadmin (full access, bypasses role checks)
            </label>
            <div className="mt-3">
              <span className="block text-sm font-medium text-ink">Password</span>
              <p className="mt-0.5 text-xs text-muted">Choose one: we generate a secure password, or you set it now.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                    generatePassword ? "border-brand bg-brand/5 ring-1 ring-brand/25" : "border-border hover:bg-surface-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="new-practice-user-password-mode"
                    className="mt-0.5 h-4 w-4 border-border text-brand focus:ring-brand/30"
                    checked={generatePassword}
                    onChange={() => {
                      setGeneratePassword(true);
                      setNewPassword("");
                    }}
                  />
                  <span className="min-w-0 text-sm leading-snug text-ink">
                    <span className="font-medium">Generate password</span>
                    <span className="mt-1 block text-xs text-muted">
                      We create a random password and show it once after the user is created.
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                    !generatePassword ? "border-brand bg-brand/5 ring-1 ring-brand/25" : "border-border hover:bg-surface-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="new-practice-user-password-mode"
                    className="mt-0.5 h-4 w-4 border-border text-brand focus:ring-brand/30"
                    checked={!generatePassword}
                    onChange={() => setGeneratePassword(false)}
                  />
                  <span className="min-w-0 text-sm leading-snug text-ink">
                    <span className="font-medium">Create your own password</span>
                    <span className="mt-1 block text-xs text-muted">You choose the password (at least 8 characters).</span>
                  </span>
                </label>
              </div>
              {!generatePassword ? (
                <label className="mt-3 block text-sm font-medium text-ink">
                  Your password
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClass}
                    autoComplete="new-password"
                    minLength={8}
                    placeholder="Minimum 8 characters"
                  />
                </label>
              ) : null}
            </div>
          </div>
          <div>
            <span className="text-sm font-medium text-ink">Roles (permissions)</span>
            {roleCheckboxList(practiceStaffRoles, "new-practice-user-role", newRoleIds, toggleNewRole, createBusy)}
            <EffectivePermissionsPreview roles={practiceStaffRoles} selectedIds={newRoleIds} />
            {newRoleCustomerAccess ? (
              <div className="mt-4">
                <span className="block text-sm font-medium text-ink">Assigned customers</span>
                <p className="mt-1 text-xs text-muted">
                  {newDefaultsAllCustomers
                    ? "All customers are selected by default. Uncheck any to exclude."
                    : "Select at least one customer this user can access."}
                </p>
                <CustomerAccessPicker
                  customers={customers}
                  selectedIds={newCustomerIds}
                  onToggle={toggleNewCustomer}
                  onBulkSet={bulkSetNewCustomers}
                  disabled={createBusy}
                  idPrefix="new-customer-assign"
                />
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          disabled={createBusy}
          onClick={() => void onCreate()}
          className="mt-4 btn btn-primary btn-md"
        >
          {createBusy ? "Creating…" : "Create user"}
        </button>
        {createMsg ? <p className="mt-2 text-sm text-muted">{createMsg}</p> : null}
        {initialPasswordBanner ? (
          <div className="mt-4 alert-success">
            <p className="font-semibold text-emerald-200">One-time password</p>
            <p className="mt-2 text-ink">
              <span className="text-muted">Email:</span>{" "}
              <span className="font-mono text-xs">{initialPasswordBanner.email}</span>
            </p>
            <p className="mt-1 text-ink">
              <span className="text-muted">Password:</span>{" "}
              <span className="font-mono font-semibold text-brand">{initialPasswordBanner.password}</span>
            </p>
            <p className="mt-2 text-xs text-muted">Copy now — it will not be shown again.</p>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Staff directory</h2>
          <p className="mt-0.5 text-xs text-muted">Edit role, superadmin, or login password for existing accounts.</p>
        </div>

        {loading ? (
          <p className="px-4 py-8 text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted">No practice users yet. Create one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted/60 text-[10px] font-bold uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Access</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-ink">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.isAdmin ? (
                        <span className="rounded-md bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand">
                          Superadmin
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Role-based</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <span
                              key={r.id}
                              title={roleDisplayDescription(r) ?? undefined}
                              className="rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-[11px] text-ink-soft"
                            >
                              {r.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{formatDateTime(u.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={deleteBusyUserId === u.id}
                          onClick={() => openPasswordModal(u)}
                          className="rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-muted/80 disabled:opacity-50"
                        >
                          Change password
                        </button>
                        <button
                          type="button"
                          disabled={deleteBusyUserId === u.id}
                          onClick={() => void openEdit(u)}
                          className="rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-muted/80 disabled:opacity-50"
                        >
                          Edit access
                        </button>
                        <button
                          type="button"
                          disabled={deleteBusyUserId === u.id}
                          onClick={() => void onDeleteUser(u)}
                          className="btn btn-danger btn-sm disabled:opacity-50"
                        >
                          {deleteBusyUserId === u.id ? "Deleting…" : "Delete user"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {passwordModalUser ? (
        <ModalDialog
          open
          onClose={closePasswordModal}
          disabled={pwdBusy}
          titleId="pwd-modal-title"
          className="max-h-[90vh] max-w-lg overflow-y-auto p-5"
        >
          <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="pwd-modal-title" className="text-sm font-semibold text-ink">
                  Change password
                </h2>
                <p className="mt-0.5 font-mono text-xs text-muted">{passwordModalUser.email}</p>
              </div>
              <button
                type="button"
                onClick={closePasswordModal}
                className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted hover:text-ink"
              >
                Close
              </button>
            </div>

            {pwdErr ? <p className="mt-3 text-sm text-red-400">{pwdErr}</p> : null}

            {pwdBanner ? (
              <div className="mt-4 alert-success">
                <p className="font-semibold text-emerald-200">New password (copy now)</p>
                <p className="mt-2 text-ink">
                  <span className="text-muted">Email:</span>{" "}
                  <span className="font-mono text-xs">{pwdBanner.email}</span>
                </p>
                <p className="mt-1 text-ink">
                  <span className="text-muted">Password:</span>{" "}
                  <span className="font-mono font-semibold text-brand">{pwdBanner.password}</span>
                </p>
                <p className="mt-3 text-xs text-muted">This password will not be shown again.</p>
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="mt-4 btn btn-primary btn-md"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <p className="mt-3 text-xs text-muted">
                  Generate a new random password (shown once), or set a password you choose.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                      pwdGenerate ? "border-brand bg-brand/5 ring-1 ring-brand/25" : "border-border hover:bg-surface-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pwd-mode"
                      className="mt-0.5 h-4 w-4 border-border text-brand focus:ring-brand/30"
                      checked={pwdGenerate}
                      onChange={() => {
                        setPwdGenerate(true);
                        setPwdCustom("");
                      }}
                    />
                    <span className="min-w-0 text-sm leading-snug text-ink">
                      <span className="font-medium">Generate password</span>
                      <span className="mt-1 block text-xs text-muted">Random secure password; shown once after save.</span>
                    </span>
                  </label>
                  <label
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                      !pwdGenerate ? "border-brand bg-brand/5 ring-1 ring-brand/25" : "border-border hover:bg-surface-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pwd-mode"
                      className="mt-0.5 h-4 w-4 border-border text-brand focus:ring-brand/30"
                      checked={!pwdGenerate}
                      onChange={() => setPwdGenerate(false)}
                    />
                    <span className="min-w-0 text-sm leading-snug text-ink">
                      <span className="font-medium">Set password</span>
                      <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>
                    </span>
                  </label>
                </div>
                {!pwdGenerate ? (
                  <label className="mt-4 block text-sm font-medium text-ink">
                    New password
                    <input
                      type="password"
                      value={pwdCustom}
                      onChange={(e) => setPwdCustom(e.target.value)}
                      className={inputClass}
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="Minimum 8 characters"
                    />
                  </label>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pwdBusy}
                    onClick={() => void onSubmitPassword()}
                    className="btn btn-primary btn-md"
                  >
                    {pwdBusy ? "Saving…" : "Update password"}
                  </button>
                  <button
                    type="button"
                    disabled={pwdBusy}
                    onClick={closePasswordModal}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted hover:text-ink disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
        </ModalDialog>
      ) : null}

      {editingUser ? (
        <ModalDialog
          open
          onClose={closeEdit}
          disabled={saveBusy}
          titleId="edit-access-modal-title"
          className="flex max-h-[min(92vh,56rem)] w-full max-w-5xl flex-col overflow-hidden p-0"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 id="edit-access-modal-title" className="text-base font-semibold text-ink">
                Edit access
              </h2>
              <p className="mt-0.5 font-mono text-xs text-muted">{editingUser.email}</p>
            </div>
            <button
              type="button"
              onClick={closeEdit}
              disabled={saveBusy}
              className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {editErr ? <p className="mb-3 text-sm text-red-400">{editErr}</p> : null}

            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                checked={editIsAdmin}
                disabled={saveBusy}
                onChange={(e) => {
                  const on = e.target.checked;
                  setEditIsAdmin(on);
                  if (on) setEditCustomerIds(new Set());
                }}
              />
              Superadmin (full access, bypasses role checks)
            </label>

            <span className="mt-5 block text-sm font-medium text-ink">Roles (permissions)</span>
            {roleCheckboxList(practiceStaffRoles, "edit-practice-user-role", editRoleIds, toggleEditRole, saveBusy, true)}
            <EffectivePermissionsPreview roles={practiceStaffRoles} selectedIds={editRoleIds} />

            {editRoleCustomerAccess ? (
              <div className="mt-5">
                <span className="block text-sm font-medium text-ink">Assigned customers</span>
                <p className="mt-1 text-xs text-muted">
                  {editIsAdmin
                    ? "Superadmin can access all customers."
                    : editDefaultsAllCustomers
                      ? "All customers are selected by default. Uncheck any to exclude."
                      : "Select at least one customer this user can access."}
                </p>
                {editCustomersLoading ? (
                  <p className="mt-2 text-xs text-muted">Loading customer assignments…</p>
                ) : (
                  <CustomerAccessPicker
                    customers={customers}
                    selectedIds={editCustomerIds}
                    onToggle={toggleEditCustomer}
                    onBulkSet={bulkSetEditCustomers}
                    disabled={saveBusy || editIsAdmin || editRoleIds.size === 0}
                    idPrefix="edit-customer-assign"
                    tall
                  />
                )}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-5 py-4">
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => void onSaveEdit()}
              className="btn btn-primary btn-md"
            >
              {saveBusy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={saveBusy}
              onClick={closeEdit}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </div>
  );
}
