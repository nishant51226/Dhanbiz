import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ResultsTabs } from "../components/ResultsTabs";
import {
  EXTRACT_DOCUMENT_OPTIONS,
  type ExtractDocumentKind,
  structurePromptFor,
  visionPromptFor,
} from "../constants/extractDocumentPresets";
import { useAuth } from "../auth/AuthContext";
import type { ExtractResponse } from "../types/api";

export default function QuickExtractPage() {
  const { apiBase, authRequired, token, logout, authHeaders, refreshSession } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [documentKind, setDocumentKind] = useState<ExtractDocumentKind>("invoice");
  const [visionPrompt, setVisionPrompt] = useState(() => visionPromptFor("invoice"));
  const [structurePrompt, setStructurePrompt] = useState(() => structurePromptFor("invoice"));
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setResult(null);
      if (!file) {
        setError("Choose a file first.");
        return;
      }
      setLoading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("visionPrompt", visionPrompt);
        body.append("structurePrompt", structurePrompt);
        const postExtract = (headers: HeadersInit) =>
          fetch(`${apiBase}/api/extract`, { method: "POST", headers, body });
        let res = await postExtract(authHeaders());
        if (res.status === 401) {
          const newAccess = await refreshSession();
          if (newAccess) {
            res = await postExtract({ Authorization: `Bearer ${newAccess}` });
          } else {
            logout();
            setError("Session expired or unauthorized. Sign in again.");
            return;
          }
        }
        const data = (await res.json()) as ExtractResponse;
        if (!res.ok) {
          setError(data.detail ?? data.error ?? res.statusText);
          return;
        }
        setResult(data);
      } catch {
        setError("Request failed. Is the backend running?");
      } finally {
        setLoading(false);
      }
    },
    [file, visionPrompt, structurePrompt, apiBase, authHeaders, refreshSession, logout]
  );

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:max-w-md lg:border-r lg:border-border lg:pr-6">
        <p className="mb-2 text-xs text-muted">
          Synchronous legacy <code className="rounded bg-surface-muted px-1">/api/extract</code>. For queued file tasks use{" "}
          <Link to="/customers" className="text-brand hover:underline">
            Customers
          </Link>
          .
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink/90">Document type</span>
            <select
              value={documentKind}
              onChange={(e) => {
                const k = e.target.value as ExtractDocumentKind;
                setDocumentKind(k);
                setVisionPrompt(visionPromptFor(k));
                setStructurePrompt(structurePromptFor(k));
              }}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            >
              {EXTRACT_DOCUMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink/90">File</span>
            <input
              type="file"
              accept="image/*,.pdf,application/pdf"
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink/90">Vision prompt</span>
            <textarea
              value={visionPrompt}
              onChange={(e) => setVisionPrompt(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink/90">Structure prompt</span>
            <textarea
              value={structurePrompt}
              onChange={(e) => setStructurePrompt(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={loading || (authRequired === true && !token)}
            className="btn btn-primary btn-lg"
          >
            {loading ? "Processing…" : "Extract & structure"}
          </button>
        </form>
        {error ? (
          <p className="mt-4 alert-error-compact">{error}</p>
        ) : null}
        {result?.warnings && result.warnings.length > 0 ? (
          <section className="mt-4 rounded-lg border border-amber-700/40 bg-amber-950/40 p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200">Warnings</h2>
            <ul className="list-inside list-disc text-sm text-amber-200/90">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>
      <div className="min-w-0 flex-1">
        <ResultsTabs result={result} embedded />
      </div>
    </div>
  );
}
