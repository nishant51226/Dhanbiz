import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import { useCallback, useEffect, useState } from "react";
import {
  createSubscriptionCatalogService,
  deleteSubscriptionCatalogService,
  fetchSubscriptionCatalogServices,
  updateSubscriptionCatalogService,
} from "../../api/client";
import { ConfirmDialog } from "../ConfirmDialog";
import { ModalDialog } from "../ui/ModalDialog";
import type { CatalogServiceListItem } from "../../types/api";

type ServiceFormModal =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; service: CatalogServiceListItem };

function formatPrice(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

export function SubscriptionServicesTab({
  apiBase,
  authHeaders,
  canWrite,
}: {
  apiBase: string;
  authHeaders: () => HeadersInit;
  canWrite: boolean;
}) {
  const [services, setServices] = useState<CatalogServiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [formModal, setFormModal] = useState<ServiceFormModal>({ open: false });
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: false } | { open: true; service: CatalogServiceListItem }>(
    { open: false },
  );
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const rows = await fetchSubscriptionCatalogServices(apiBase, authHeaders());
      setServices(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load services");
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrice("0");
    setIsActive(true);
    setFormErr("");
  };

  const openCreate = () => {
    resetForm();
    setFormModal({ open: true, mode: "create" });
  };

  const openEdit = (service: CatalogServiceListItem) => {
    setName(service.name);
    setDescription(service.description ?? "");
    setPrice(formatPrice(service.price));
    setIsActive(service.isActive);
    setFormErr("");
    setFormModal({ open: true, mode: "edit", service });
  };

  const closeForm = () => {
    if (!submitting) setFormModal({ open: false });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formModal.open) return;
    const nameTrim = name.trim();
    if (!nameTrim) {
      setFormErr("Name is required.");
      return;
    }
    const priceNum = price.trim() === "" ? 0 : Number.parseFloat(price.trim());
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setFormErr("Enter a valid price (0 or greater).");
      return;
    }
    setSubmitting(true);
    setFormErr("");
    try {
      if (formModal.mode === "create") {
        await createSubscriptionCatalogService(apiBase, authHeaders(), {
          name: nameTrim,
          description: description.trim() || undefined,
          price: priceNum,
          isActive,
        });
      } else {
        await updateSubscriptionCatalogService(apiBase, authHeaders(), formModal.service.serviceId, {
          name: nameTrim,
          description: description.trim() || null,
          price: priceNum,
          isActive,
        });
      }
      setFormModal({ open: false });
      resetForm();
      await load();
    } catch (ex) {
      setFormErr(ex instanceof Error ? ex.message : "Could not save service");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.open) return;
    setDeleteBusy(true);
    setErr("");
    try {
      setDeletingId(deleteConfirm.service.serviceId);
      await deleteSubscriptionCatalogService(apiBase, authHeaders(), deleteConfirm.service.serviceId);
      setDeleteConfirm({ open: false });
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not delete service");
    } finally {
      setDeleteBusy(false);
      setDeletingId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ExtensionOutlinedIcon className="text-brand" sx={{ fontSize: 22 }} />
            <h2 className="text-base font-semibold text-ink">Service catalogue</h2>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            Define all services here. When editing a subscription plan, tick the services that belong to that plan — you
            cannot create new services from the plan screen.
          </p>
        </div>
        {canWrite ? (
          <button type="button" onClick={openCreate} className="btn btn-primary btn-md shrink-0 gap-2 rounded-xl">
            <AddIcon sx={{ fontSize: 18 }} />
            Add service
          </button>
        ) : null}
      </div>

      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-muted">Loading services…</p>
      ) : services.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-muted/40 px-8 py-12 text-center">
          <p className="text-sm font-medium text-ink">No services yet</p>
          <p className="mt-2 text-sm text-muted">
            Add services using <span className="font-semibold text-ink">Add service</span> above, then assign them to
            plans.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface-raised shadow-card">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/80 text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Price (£)</th>
                <th className="px-4 py-3">Status</th>
                {canWrite ? <th className="w-28 px-4 py-3" aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr key={svc.serviceId} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{svc.name}</td>
                  <td className="max-w-xs px-4 py-3 text-ink-soft">
                    {svc.description ? (
                      <span className="line-clamp-2">{svc.description}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{formatPrice(svc.price)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        svc.isActive
                          ? "badge-success text-xs normal-case tracking-normal"
                          : "rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted"
                      }`}
                    >
                      {svc.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canWrite ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(svc)}
                          className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-brand"
                          aria-label={`Edit ${svc.name}`}
                        >
                          <EditOutlinedIcon sx={{ fontSize: 20 }} />
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === svc.serviceId}
                          onClick={() => setDeleteConfirm({ open: true, service: svc })}
                          className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-red-600 disabled:opacity-40"
                          aria-label={`Delete ${svc.name}`}
                        >
                          <DeleteOutlinedIcon sx={{ fontSize: 20 }} />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formModal.open ? (
        <ModalDialog
          open
          onClose={closeForm}
          disabled={submitting}
          titleId="subscription-service-form-title"
          className="max-h-[90vh] max-w-md overflow-y-auto"
        >
              <button
                type="button"
                onClick={closeForm}
                disabled={submitting}
                className="absolute right-4 top-4 text-muted-soft hover:text-muted disabled:opacity-50"
                aria-label="Close"
              >
                ✕
              </button>
              <h2 id="subscription-service-form-title" className="text-lg font-semibold text-ink">
                {formModal.mode === "create" ? "Add service" : "Edit service"}
              </h2>
              <form className="mt-4 space-y-4" onSubmit={handleSave}>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    placeholder="e.g. VAT filing"
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Description</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    placeholder="Optional"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Price (£)</span>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="decimal"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-muted/80 px-3 py-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-brand focus:ring-brand"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">Active</span>
                    <span className="mt-0.5 block text-xs text-muted">Inactive services stay in the catalogue but are hidden from onboarding pickers.</span>
                  </span>
                </label>
                {formErr ? <p className="text-sm text-red-400">{formErr}</p> : null}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeForm}
                    disabled={submitting}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} className="btn btn-primary btn-md">
                    {submitting ? "Saving…" : formModal.mode === "create" ? "Add service" : "Save changes"}
                  </button>
                </div>
              </form>
        </ModalDialog>
      ) : null}

      <ConfirmDialog
        open={deleteConfirm.open}
        title={deleteConfirm.open ? `Delete service "${deleteConfirm.service.name}"?` : ""}
        message={
          deleteConfirm.open
            ? "This removes the service from the catalogue and unlinks it from any plans that use it."
            : ""
        }
        confirmLabel="Delete"
        busy={deleteBusy}
        onCancel={() => {
          if (deleteBusy) return;
          setDeleteConfirm({ open: false });
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </section>
  );
}
