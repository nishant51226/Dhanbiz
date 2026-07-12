import { useCallback, useEffect, useMemo, useState } from "react";
import { patchCustomer } from "../api/client";
import type { Customer } from "../types/api";
import type { CustomerOnboardingData } from "../types/customerOnboarding";
import { buildOnboardingSavePayload } from "../utils/onboardingSavePayload";
import { readOnboardingDotPathString, setOnboardingDotPath } from "../utils/onboardingDotPath";

function turnoverToInput(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const s = String(v).trim();
  return s;
}

function cloneOnboardingRoot(merged: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(merged);
}

type UseActiveCustomerDetailsEditArgs = {
  customer: Customer | null;
  merged: Record<string, unknown>;
  onboarding: CustomerOnboardingData | null;
  isAdmin: boolean;
  canWriteCustomer: boolean;
  accountStatus: string;
  customerId: string | undefined;
  apiBase: string;
  authHeaders: () => HeadersInit;
  reload?: () => Promise<void>;
};

export function useActiveCustomerDetailsEdit({
  customer,
  merged,
  onboarding,
  isAdmin,
  canWriteCustomer,
  accountStatus,
  customerId,
  apiBase,
  authHeaders,
  reload,
}: UseActiveCustomerDetailsEditArgs) {
  const canEdit =
    (isAdmin || canWriteCustomer) && accountStatus === "active" && Boolean(customerId && onboarding);

  const baselineTurnover = useMemo(() => {
    if (customer?.annualTurnoverGbp !== undefined && customer?.annualTurnoverGbp !== null && customer?.annualTurnoverGbp !== "") {
      return turnoverToInput(customer.annualTurnoverGbp);
    }
    return turnoverToInput(onboarding?.annual_turnover_gbp);
  }, [customer?.annualTurnoverGbp, onboarding?.annual_turnover_gbp]);

  const baselineDraft = useMemo(() => cloneOnboardingRoot(merged), [merged]);

  const [draft, setDraft] = useState<Record<string, unknown>>(baselineDraft);
  const [turnoverDraft, setTurnoverDraft] = useState(baselineTurnover);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    setDraft(baselineDraft);
    setTurnoverDraft(baselineTurnover);
    setSaveErr("");
  }, [baselineDraft, baselineTurnover]);

  const dirty = useMemo(() => {
    if (!canEdit) return false;
    if (turnoverDraft.trim() !== baselineTurnover.trim()) return true;
    return JSON.stringify(draft) !== JSON.stringify(baselineDraft);
  }, [baselineDraft, baselineTurnover, canEdit, draft, turnoverDraft]);

  const fieldValue = useCallback(
    (path: string) => readOnboardingDotPathString(draft, path),
    [draft],
  );

  const setField = useCallback((path: string, value: string) => {
    setDraft((prev) => setOnboardingDotPath(prev, path, value));
  }, []);

  const reset = useCallback(() => {
    setDraft(baselineDraft);
    setTurnoverDraft(baselineTurnover);
    setSaveErr("");
  }, [baselineDraft, baselineTurnover]);

  const save = useCallback(async () => {
    if (!canEdit || !dirty || !customerId || saving) return;
    const tRaw = turnoverDraft.trim().replace(/,/g, "");
    let annualTurnoverGbp: number | undefined;
    if (tRaw !== "") {
      const n = Number(tRaw);
      if (!Number.isFinite(n) || n < 0) {
        setSaveErr("Annual turnover must be a non-negative number, or leave blank.");
        return;
      }
      annualTurnoverGbp = n;
    }

    setSaving(true);
    setSaveErr("");
    try {
      const body: {
        onboardingData: CustomerOnboardingData;
        annualTurnoverGbp?: number;
      } = {
        onboardingData: buildOnboardingSavePayload(draft),
      };
      if (tRaw !== "") {
        body.annualTurnoverGbp = annualTurnoverGbp;
        body.onboardingData = {
          ...body.onboardingData,
          annual_turnover_gbp: annualTurnoverGbp ?? null,
        };
      }
      await patchCustomer(apiBase, authHeaders(), customerId, body);
      await reload?.();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [apiBase, authHeaders, canEdit, customerId, dirty, draft, reload, saving, turnoverDraft]);

  return {
    canEdit,
    draft,
    fieldValue,
    setField,
    turnoverDraft,
    setTurnoverDraft,
    dirty,
    saving,
    saveErr,
    save,
    reset,
  };
}
