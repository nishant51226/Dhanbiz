import { useCallback, useEffect, useState } from "react";
import { fetchTokenBurnReport } from "../api/client";
import type { TokenBurnReport } from "../types/api";

function defaultFromIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultToIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function toRangeIso(dateOnly: string, endOfDay: boolean): string {
  return endOfDay ? `${dateOnly}T23:59:59.999Z` : `${dateOnly}T00:00:00.000Z`;
}

export function useTokenBurnReport(
  apiBase: string,
  authHeaders: () => HeadersInit
) {
  const [fromDate, setFromDate] = useState(defaultFromIso);
  const [toDate, setToDate] = useState(defaultToIso);
  const [customerId, setCustomerId] = useState("");
  const [report, setReport] = useState<TokenBurnReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    if (!fromDate.trim() || !toDate.trim()) {
      setReport(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchTokenBurnReport(apiBase, authHeaders(), {
        from: toRangeIso(fromDate, false),
        to: toRangeIso(toDate, true),
        customerId: customerId || undefined,
      });
      setReport(data);
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, fromDate, toDate, customerId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  return {
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    customerId,
    setCustomerId,
    report,
    loading,
    error,
    loadReport,
  };
}
