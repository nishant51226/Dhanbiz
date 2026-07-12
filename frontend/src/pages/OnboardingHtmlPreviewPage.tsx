import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

type PreviewState = {
  title?: string;
  url?: string;
};

export default function OnboardingHtmlPreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as PreviewState;

  const title = useMemo(() => (state.title && state.title.trim() ? state.title : "Onboarding preview"), [state.title]);
  const url = useMemo(() => (state.url && state.url.trim() ? state.url : ""), [state.url]);

  if (!url) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <h1 className="text-xl font-semibold text-ink">Preview unavailable</h1>
        <p className="text-sm text-muted">Open preview from the onboarding form to view it here.</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          Back to form
        </button>
      </div>
      <div className="h-[84vh] w-full rounded-xl border border-border bg-surface-raised p-2 shadow-sm">
        <iframe title={title} src={url} className="h-full w-full rounded-md border border-border-subtle" />
      </div>
    </div>
  );
}
