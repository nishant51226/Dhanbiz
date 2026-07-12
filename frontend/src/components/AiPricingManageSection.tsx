import { useCallback, useEffect, useState } from "react";
import { fetchAiPricingList, updateAiPricing } from "../api/client";
import type { AiPricingRow } from "../types/api";
import { listActiveAiPricingRows } from "../utils/aiPricing";

type Draft = {
  inputTokenPrice: string;
  outputTokenPrice: string;
  currency: string;
};

type Props = {
  apiBase: string;
  getAuthHeaders: () => HeadersInit;
  onPricingChanged?: () => void;
};

export function AiPricingManageSection({ apiBase, getAuthHeaders, onPricingChanged }: Props) {
  const [rows, setRows] = useState<AiPricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ inputTokenPrice: "", outputTokenPrice: "", currency: "USD" });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchAiPricingList(apiBase, getAuthHeaders());
      setRows(listActiveAiPricingRows(list));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pricing");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, getAuthHeaders]);

  useEffect(() => {
    if (expanded) {
      void load();
    }
  }, [expanded, load]);

  const startEdit = (row: AiPricingRow) => {
    setEditingId(row.id);
    setDraft({
      inputTokenPrice: row.inputTokenPrice,
      outputTokenPrice: row.outputTokenPrice,
      currency: row.currency || "USD",
    });
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!draft.inputTokenPrice.trim() || !draft.outputTokenPrice.trim()) {
      setError("Input and output price per million are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateAiPricing(apiBase, getAuthHeaders(), editingId, {
        inputTokenPrice: draft.inputTokenPrice.trim(),
        outputTokenPrice: draft.outputTokenPrice.trim(),
        currency: draft.currency.trim() || "USD",
      });
      setEditingId(null);
      await load();
      onPricingChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update pricing");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface-raised">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <div>
          <h3 className="text-sm font-semibold text-ink">Saved model pricing</h3>
          <p className="text-xs text-muted">Edit per-million token rates used for cost estimates.</p>
        </div>
        <span className="text-sm text-muted">{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded ? (
        <div className="border-t border-border px-4 pb-4">
          {loading ? <p className="pt-3 text-sm text-muted">Loading pricing…</p> : null}
          {error ? <p className="pt-3 text-sm text-red-400">{error}</p> : null}
          {!loading && rows.length === 0 ? (
            <p className="pt-3 text-sm text-muted">
              No pricing saved yet. Use &quot;Set missing pricing&quot; when the report prompts you, or add
              rows via the API.
            </p>
          ) : null}
          {!loading && rows.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-muted text-[11px] font-bold uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2 text-right">Input / 1M</th>
                    <th className="px-3 py-2 text-right">Output / 1M</th>
                    <th className="px-3 py-2">Currency</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isEditing = editingId === row.id;
                    return (
                      <tr key={row.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 text-ink">{row.provider}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.model}</td>
                        {isEditing ? (
                          <>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                className="w-full min-w-[5rem] rounded border border-border bg-surface px-2 py-1 font-mono text-right text-xs"
                                value={draft.inputTokenPrice}
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, inputTokenPrice: e.target.value }))
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                className="w-full min-w-[5rem] rounded border border-border bg-surface px-2 py-1 font-mono text-right text-xs"
                                value={draft.outputTokenPrice}
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, outputTokenPrice: e.target.value }))
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                maxLength={8}
                                className="w-16 rounded border border-border bg-surface px-2 py-1 text-xs uppercase"
                                value={draft.currency}
                                onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void saveEdit()}
                                  className="btn btn-primary btn-sm px-2 py-1 disabled:opacity-60"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={cancelEdit}
                                  className="rounded border border-border px-2 py-1 text-xs font-semibold text-ink hover:bg-surface-muted"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                              {row.inputTokenPrice}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                              {row.outputTokenPrice}
                            </td>
                            <td className="px-3 py-2 text-xs uppercase">{row.currency}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="rounded border border-border px-2 py-1 text-xs font-semibold text-brand hover:bg-brand/10"
                              >
                                Edit
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
