import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAllCustomersPageWithSubmissionData, fetchOnboardingDashboardSortFields } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Can } from "../auth/Can";
import type { CustomerPageRowWithSubmission, OnboardingDashboardSortFieldMeta } from "../types/api";
import {
  getOnboardingCardTemplate,
  getOnboardingDotPath,
  ONBOARDING_DASHBOARD_CARD_TEMPLATES,
} from "../dashboard/onboarding-card-templates";
import { ToolbarButton } from "./ui/ToolbarButton";
import { buildOnboardingSortFieldBuckets, type OnboardingChartBucket } from "../utils/onboardingDashboardChartBuckets";

const LS_KEY_V1 = "staff_onboarding_dashboard_cards_v1";
const LS_KEY_V2 = "staff_onboarding_dashboard_cards_v2";

type DashboardCardConfig = {
  id: string;
  templateId: string;
  order: "ASC" | "DESC";
};

type StoredShapeV2 = { cards: DashboardCardConfig[] };
type StoredShapeV1 = { cards: { id: string; fieldId: string; order: "ASC" | "DESC" }[] };

function migrateFromV1(raw: string): DashboardCardConfig[] {
  try {
    const j = JSON.parse(raw) as StoredShapeV1;
    if (!j?.cards?.length) return [];
    return j.cards.map((c) => {
      const t = ONBOARDING_DASHBOARD_CARD_TEMPLATES.find((x) => x.sortFieldId === c.fieldId);
      return {
        id: typeof c.id === "string" ? c.id : newId(),
        templateId: t?.id ?? ONBOARDING_DASHBOARD_CARD_TEMPLATES[0]?.id ?? "incorporation",
        order: c.order === "DESC" ? "DESC" : "ASC",
      };
    });
  } catch {
    return [];
  }
}

function loadCards(): DashboardCardConfig[] {
  try {
    const rawV2 = localStorage.getItem(LS_KEY_V2);
    if (rawV2) {
      const j = JSON.parse(rawV2) as StoredShapeV2;
      if (j && Array.isArray(j.cards)) {
        return j.cards.filter((c) => typeof c?.id === "string" && typeof c?.templateId === "string");
      }
    }
    const rawV1 = localStorage.getItem(LS_KEY_V1);
    if (rawV1) {
      const migrated = migrateFromV1(rawV1);
      if (migrated.length > 0) {
        localStorage.setItem(LS_KEY_V2, JSON.stringify({ cards: migrated }));
      }
      return migrated;
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveCards(cards: DashboardCardConfig[]) {
  try {
    localStorage.setItem(LS_KEY_V2, JSON.stringify({ cards }));
  } catch {
    /* ignore */
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `c-${Date.now()}`;
}

function OnboardingBucketBarChart({
  title,
  subtitle,
  buckets,
  emptyHint,
}: {
  title: string;
  subtitle?: string;
  buckets: OnboardingChartBucket[];
  emptyHint: string;
}) {
  const max = useMemo(() => Math.max(1, ...buckets.map((b) => b.count)), [buckets]);
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-muted/30 p-3">
      <h3 className="text-xs font-semibold text-ink">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-[10px] text-muted">{subtitle}</p> : null}
      {buckets.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted">{emptyHint}</p>
      ) : (
        <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
          {buckets.map((b) => (
            <li key={b.label} className="space-y-0.5">
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="min-w-0 truncate font-medium text-ink-soft" title={b.label}>
                  {b.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted">{b.count.toLocaleString()}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-brand/75 transition-[width]"
                  style={{ width: `${(b.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SingleCard({
  card,
  templates,
  sortFieldIds,
  apiBase,
  authHeaders,
  onChange,
  onRemove,
}: {
  card: DashboardCardConfig;
  templates: typeof ONBOARDING_DASHBOARD_CARD_TEMPLATES;
  sortFieldIds: Set<string>;
  apiBase: string;
  authHeaders: () => HeadersInit;
  onChange: (next: DashboardCardConfig) => void;
  onRemove: () => void;
}) {
  const [rows, setRows] = useState<CustomerPageRowWithSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const template = getOnboardingCardTemplate(card.templateId) ?? templates[0];
  const onboardingData = useMemo(() => `${template.sortFieldId},${card.order}`, [template.sortFieldId, card.order]);

  const chartBuckets = useMemo(
    () => buildOnboardingSortFieldBuckets(rows, template.sortFieldId),
    [rows, template.sortFieldId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const all = await fetchAllCustomersPageWithSubmissionData(apiBase, authHeaders(), {
        sort: "name,ASC",
        onboardingSort: onboardingData,
      });
      setRows(all);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, onboardingData]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-2 border-b border-border pb-3">
        <label className="min-w-[12rem] flex-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          Template
          <select
            className="mt-1 w-full rounded-lg border border-border bg-surface-input px-2 py-1.5 text-xs text-ink"
            value={card.templateId}
            onChange={(e) => {
              const nextT = getOnboardingCardTemplate(e.target.value);
              onChange({
                ...card,
                templateId: e.target.value,
                order: nextT?.defaultOrder ?? card.order,
              });
            }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="w-24 text-[10px] font-bold uppercase tracking-wide text-muted">
          Order
          <select
            className="mt-1 w-full rounded-lg border border-border bg-surface-input px-2 py-1.5 text-xs text-ink"
            value={card.order}
            onChange={(e) => onChange({ ...card, order: e.target.value === "DESC" ? "DESC" : "ASC" })}
          >
            <option value="ASC">ASC</option>
            <option value="DESC">DESC</option>
          </select>
        </label>
        <ToolbarButton onClick={() => void load()}>Refresh</ToolbarButton>
        <ToolbarButton variant="danger" onClick={onRemove}>
          Remove
        </ToolbarButton>
      </div>
      <p className="mt-2 text-[11px] text-muted">{template.description}</p>
      <p className="mt-1 truncate text-[10px] text-muted" title={template.sortFieldId}>
        Sort: <span className="font-mono text-ink-soft">{template.sortFieldId}</span> · {card.order}
        {!sortFieldIds.has(template.sortFieldId) ? (
          <span className="ml-1 text-feedback-warning"> (not in API catalog — check backend)</span>
        ) : null}
      </p>
      {err ? <p className="mt-2 text-xs text-feedback-error">{err}</p> : null}
      {loading ? (
        <p className="mt-4 text-xs text-muted">Loading all customers (paged)…</p>
      ) : (
        <>
          <div className="mt-3">
            <OnboardingBucketBarChart
              title="Distribution by sort field"
              subtitle={`${rows.length.toLocaleString()} customer(s). ISO dates grouped by month (YYYY-MM).`}
              buckets={chartBuckets}
              emptyHint="No rows to chart."
            />
          </div>
          <p className="mt-3 text-[11px] font-medium text-ink-soft">
            All customers ({rows.length.toLocaleString()})
          </p>
          <div className="scroll-subtle mt-2 max-h-[min(28rem,70vh)] overflow-auto rounded-lg border border-border/50">
            <ul className="divide-y divide-border/50">
              {rows.map((r) => (
                <li key={r.id} className="bg-surface-muted/10 px-2 py-2">
                  <Link to={`/customers/${r.id}/dashboard`} className="text-xs font-semibold text-brand hover:underline">
                    {r.name}
                  </Link>
                  <dl className="mt-1.5 space-y-0.5 text-[11px]">
                    {template.rows.map((row) => (
                      <div key={row.path} className="flex gap-2">
                        <dt className="w-[48%] shrink-0 text-muted">{row.label}</dt>
                        <dd className="min-w-0 break-words text-ink-soft" title={getOnboardingDotPath(r.onboardingData, row.path)}>
                          {getOnboardingDotPath(r.onboardingData, row.path)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </div>
          {rows.length === 0 ? <p className="mt-2 text-xs text-muted">No customers in this view.</p> : null}
        </>
      )}
    </section>
  );
}

export function StaffOnboardingDashboardCards() {
  const { apiBase, authHeaders } = useAuth();
  const [fields, setFields] = useState<OnboardingDashboardSortFieldMeta[]>([]);
  const [fieldsErr, setFieldsErr] = useState("");
  const [cards, setCards] = useState<DashboardCardConfig[]>(() => loadCards());

  const sortFieldIds = useMemo(() => new Set(fields.map((f) => f.id)), [fields]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchOnboardingDashboardSortFields(apiBase, authHeaders());
        if (cancelled) return;
        setFields(res.fields ?? []);
        setFieldsErr("");
      } catch (e) {
        if (cancelled) return;
        setFieldsErr(e instanceof Error ? e.message : "Could not load column catalog");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders]);

  useEffect(() => {
    saveCards(cards);
  }, [cards]);

  const addCard = () => {
    const first = ONBOARDING_DASHBOARD_CARD_TEMPLATES[0];
    if (!first) return;
    setCards((c) => [...c, { id: newId(), templateId: first.id, order: first.defaultOrder }]);
  };

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Companies House & onboarding cards</h2>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            Pick a <span className="font-medium text-ink-soft">template</span> per card. Each card loads <span className="font-medium text-ink-soft">all</span> customers you can
            access (paged from the API), sorted by one CH field, shows a <span className="font-medium text-ink-soft">bar chart</span> of values for that sort field (dates by
            month), then the full list with the template&apos;s rows from{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 text-[10px]">onboarding_data</code>. Layout is saved in this browser only.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm shrink-0"
          onClick={addCard}
          disabled={ONBOARDING_DASHBOARD_CARD_TEMPLATES.length === 0}
        >
          Add card
        </button>
      </div>
      {fieldsErr ? <p className="mt-3 text-xs text-feedback-warning">{fieldsErr}</p> : null}

      {cards.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No cards yet. Choose &ldquo;Add card&rdquo;, pick a template and order.</p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          {cards.map((card) => (
            <SingleCard
              key={card.id}
              card={card}
              templates={ONBOARDING_DASHBOARD_CARD_TEMPLATES}
              sortFieldIds={sortFieldIds}
              apiBase={apiBase}
              authHeaders={authHeaders}
              onChange={(next) => setCards((list) => list.map((x) => (x.id === card.id ? next : x)))}
              onRemove={() => setCards((list) => list.filter((x) => x.id !== card.id))}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Wrapper so we can gate with `Can` from the parent if desired. */
export function StaffOnboardingDashboardCardsSection() {
  return (
    <Can permission="customer:read">
      <StaffOnboardingDashboardCards />
    </Can>
  );
}
