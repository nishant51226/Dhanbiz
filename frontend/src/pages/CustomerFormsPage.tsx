import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { fetchLatestCustomerFormSubmission } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatDateTime } from "../utils/formatDate";
import type { CustomerFormSubmission } from "../types/api";
import type { CustomerWorkspaceOutletContext } from "./customerWorkspaceContext";

export default function CustomerFormsPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { apiBase, authHeaders } = useAuth();
  const { customer, loading, err } = useOutletContext<CustomerWorkspaceOutletContext>();
  const [submission, setSubmission] = useState<CustomerFormSubmission | null>(null);
  const [formsLoading, setFormsLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoadErr("");
    setFormsLoading(true);
    try {
      const row = await fetchLatestCustomerFormSubmission(apiBase, authHeaders(), customerId);
      setSubmission(row);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load");
      setSubmission(null);
    } finally {
      setFormsLoading(false);
    }
  }, [apiBase, authHeaders, customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !customer) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (err) {
    return <p className="text-sm text-red-400">{err}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Forms</h1>
        <p className="mt-1 text-sm text-muted">Onboarding submissions and signing status for this customer.</p>
      </div>

      {loadErr ? <p className="text-sm text-red-400">{loadErr}</p> : null}

      {formsLoading ? (
        <p className="text-sm text-muted">Loading submission…</p>
      ) : submission === null ? (
        <p className="rounded-lg border border-border bg-surface-raised p-4 text-sm text-muted">
          No form submission found yet.{" "}
          {customerId ? (
            <Link to={`/customers/${customerId}/onboarding`} className="font-semibold text-brand hover:underline">
              Continue onboarding
            </Link>
          ) : null}
        </p>
      ) : (
        <section className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Latest submission</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <dt className="text-muted">Status</dt>
              <dd>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    submission.status === "completed"
                      ? "badge-success text-xs normal-case tracking-normal"
                      : "border border-amber-800/40 bg-amber-950/45 text-amber-200"
                  }`}
                >
                  {submission.status}
                </span>
              </dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-muted">Updated</dt>
              <dd className="font-medium text-ink">{formatDateTime(submission.updatedAt)}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-muted">Submission id</dt>
              <dd className="font-mono text-xs text-muted">{submission.id}</dd>
            </div>
          </dl>
          {submission.status === "draft" && customerId ? (
            <p className="mt-4 text-sm text-muted">
              <Link to={`/customers/${customerId}/onboarding`} className="font-semibold text-brand hover:underline">
                Open onboarding wizard
              </Link>{" "}
              to continue or send signing links.
            </p>
          ) : null}
        </section>
      )}

      {customer?.onboardingFormPdfDownloads && customer.onboardingFormPdfDownloads.length > 0 ? (
        <section className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Onboarding PDFs</h2>
          <p className="mt-2 text-sm text-muted">
            Final copies of the four forms in S3. Presigned links expire after about an hour — switch tabs or refresh this
            page to reload customer data for new links.
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            {customer.onboardingFormPdfDownloads.map((p) => (
              <li
                key={p.formKey}
                className="flex flex-col gap-1 border-b border-border-subtle pb-3 last:border-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4"
              >
                <span className="font-semibold text-ink">{p.title}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {p.downloadUrl ? (
                    <>
                      <a
                        href={p.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand hover:underline"
                      >
                        Open / download
                      </a>
                      {p.urlExpiresAt ? (
                        <span className="text-xs text-muted">until {formatDateTime(p.urlExpiresAt)}</span>
                      ) : null}
                    </>
                  ) : customerId && p.fileId ? (
                    <Link to={`/customers/${customerId}/files/${p.fileId}`} className="font-medium text-brand hover:underline">
                      Open in app
                    </Link>
                  ) : (
                    <span className="text-xs text-muted">Unavailable</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-sm text-muted">
        Revisions, DocuSeal targets, and full submission history can be added here later alongside the latest row.
      </p>
    </div>
  );
}
