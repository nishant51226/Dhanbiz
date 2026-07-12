import { useCallback, useState } from "react";
import { createLibraryExport, fetchLibraryExport, type CreateLibraryExportInput } from "../api/client";

const EXPORT_POLL_INTERVAL_MS = 2000;
const EXPORT_POLL_MAX_ATTEMPTS = 90;

export type StartLibraryZipExportOptions = {
  /** Called when the background job finishes successfully (e.g. refresh access columns). */
  onExportCompleted?: () => void;
};

export function useLibraryZipExport(apiBase: string, getHeaders: () => HeadersInit) {
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<{ message: string; severity: "success" | "error" } | null>(
    null,
  );

  const pollExportCompletion = useCallback(
    async (exportId: string, onCompleted?: () => void) => {
      for (let attempt = 0; attempt < EXPORT_POLL_MAX_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, EXPORT_POLL_INTERVAL_MS));
        try {
          const row = await fetchLibraryExport(apiBase, getHeaders(), exportId);
          if (row.status === "completed") {
            onCompleted?.();
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("library-export-completed"));
            }
            return;
          }
          if (row.status === "failed") return;
        } catch {
          return;
        }
      }
    },
    [apiBase, getHeaders],
  );

  const startLibraryZipExport = useCallback(
    async (input: CreateLibraryExportInput, scopeLabel?: string, options?: StartLibraryZipExportOptions) => {
      setExporting(true);
      try {
        const row = await createLibraryExport(apiBase, getHeaders(), input);
        setExportNotice({
          severity: "success",
          message: `ZIP export started for ${scopeLabel?.trim() || "current view"}. You will be notified when it is ready.`,
        });
        void pollExportCompletion(row.id, options?.onExportCompleted);
      } catch (e) {
        setExportNotice({
          severity: "error",
          message: e instanceof Error ? e.message : "Failed to start ZIP export",
        });
      } finally {
        setExporting(false);
      }
    },
    [apiBase, getHeaders, pollExportCompletion],
  );

  return {
    exporting,
    exportNotice,
    setExportNotice,
    startLibraryZipExport,
  };
}
