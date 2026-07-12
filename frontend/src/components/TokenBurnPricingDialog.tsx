import { useCallback, useEffect, useState } from "react";
import { createAiPricing, fetchAiPricingList, updateAiPricing } from "../api/client";
import type { UnpricedModelRef } from "../types/api";
import { pickActiveAiPricingRow } from "../utils/aiPricing";

type ModelPricingDraft = {
  inputTokenPrice: string;
  outputTokenPrice: string;
  currency: string;
};

function modelKey(m: UnpricedModelRef): string {
  return `${m.provider}:${m.model}`;
}

type Props = {
  open: boolean;
  apiBase: string;
  getAuthHeaders: () => HeadersInit;
  models: UnpricedModelRef[];
  onClose: () => void;
  onSaved: () => void;
};

export function TokenBurnPricingDialog({
  open,
  apiBase,
  getAuthHeaders,
  models,
  onClose,
  onSaved,
}: Props) {
  const [drafts, setDrafts] = useState<Record<string, ModelPricingDraft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const next: Record<string, ModelPricingDraft> = {};
    for (const m of models) {
      next[modelKey(m)] = { inputTokenPrice: "", outputTokenPrice: "", currency: "USD" };
    }
    setDrafts(next);
    setError("");
  }, [open, models]);

  const updateDraft = useCallback((key: string, patch: Partial<ModelPricingDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const headers = getAuthHeaders();
      const existingRows = await fetchAiPricingList(apiBase, headers);
      for (const m of models) {
        const key = modelKey(m);
        const d = drafts[key];
        if (!d?.inputTokenPrice.trim() || !d?.outputTokenPrice.trim()) {
          throw new Error(`Enter input and output price per million for ${m.provider} / ${m.model}`);
        }
        const payload = {
          inputTokenPrice: d.inputTokenPrice.trim(),
          outputTokenPrice: d.outputTokenPrice.trim(),
          currency: d.currency.trim() || "USD",
        };
        const active = pickActiveAiPricingRow(existingRows, m.provider, m.model);
        if (active) {
          await updateAiPricing(apiBase, headers, active.id, payload);
        } else {
          const created = await createAiPricing(apiBase, headers, {
            provider: m.provider,
            model: m.model,
            ...payload,
          });
          existingRows.push(created);
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save pricing");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-burn-pricing-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface-raised p-6 shadow-xl">
        <h2 id="token-burn-pricing-title" className="text-lg font-semibold text-ink">
          Set model pricing
        </h2>
        <p className="mt-2 text-sm text-muted">
          Token usage is already recorded. Add per-million token prices (USD or other currency) to show
          estimated cost on this report. Job-level cost views use the same pricing table.
        </p>

        <ul className="mt-4 space-y-4">
          {models.map((m) => {
            const key = modelKey(m);
            const d = drafts[key] ?? { inputTokenPrice: "", outputTokenPrice: "", currency: "USD" };
            return (
              <li key={key} className="rounded-lg border border-border bg-surface p-3">
                <p className="text-sm font-medium text-ink">
                  {m.provider} <span className="font-mono text-xs text-muted">/ {m.model}</span>
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted">Input / 1M tokens</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 0.15"
                      className="rounded border border-border bg-surface-raised px-2 py-1.5 font-mono text-sm"
                      value={d.inputTokenPrice}
                      onChange={(e) => updateDraft(key, { inputTokenPrice: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted">Output / 1M tokens</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 0.60"
                      className="rounded border border-border bg-surface-raised px-2 py-1.5 font-mono text-sm"
                      value={d.outputTokenPrice}
                      onChange={(e) => updateDraft(key, { outputTokenPrice: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted">Currency</span>
                    <input
                      type="text"
                      maxLength={8}
                      className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm uppercase"
                      value={d.currency}
                      onChange={(e) => updateDraft(key, { currency: e.target.value })}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || models.length === 0}
            className="btn btn-primary btn-md disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save pricing"}
          </button>
        </div>
      </div>
    </div>
  );
}
