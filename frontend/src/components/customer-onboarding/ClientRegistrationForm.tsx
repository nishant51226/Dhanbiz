// ClientRegistrationForm.tsx - Updated for Sole Trader
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  CatalogServiceListItem,
  CustomerFormSubmission,
  OnboardingSubscriptionPlanCard,
} from "../../types/api";
import type { CustomerOnboardingData } from "../../types/customerOnboarding";
import {
  BUSINESS_TYPE_LABELS,
  BUSINESS_TYPE_OPTIONS,
  MAX_DIRECTORS,
  OFFICE_APPROVAL_STATUS_OPTIONS,
  coerceOfficeNoted,
  emptyDirector,
  showCompaniesHouseAuthCode,
} from "../../types/customerOnboarding";
import { withAuthorizedSignatoryNameAcrossForms } from "../../utils/syncAuthorizedSignatoryName";
import { isMatrixYearlyBilling } from "../../utils/subscriptionPlanUi";
import { formatDate } from "../../utils/formatDate";
import { chk, inp, inpReadonly, lab, sec, secTitle } from "./fieldStyles";
import { OnboardingSignatureBlock } from "./OnboardingSignatureBlock";

function formatPlanPrice(p: number | string): string {
  const n = typeof p === "string" ? Number.parseFloat(p) : p;
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

const VAT_QUARTER_END_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type Props = {
  data: CustomerOnboardingData;
  setData: React.Dispatch<React.SetStateAction<CustomerOnboardingData>>;
  apiBase: string;
  customerId: string | null;
  authHeaders: () => HeadersInit;
  submissionId: string | null;
  formSubmissionRow: CustomerFormSubmission | null;
  onSubmissionRefresh: () => Promise<void> | void;
  onSaveDraft: (dataOverride?: CustomerOnboardingData) => Promise<boolean>;
  saveDraftLoading: boolean;
  draftSaveError?: string;
  companyNameOk: boolean;
  /** Loaded after turnover + "Show plans"; null until first successful request for this session. */
  subscriptionPlansForTurnover: OnboardingSubscriptionPlanCard[] | null;
  subscriptionPlansForTurnoverLoading?: boolean;
  subscriptionPlansForTurnoverErr?: string;
  subscriptionPlansBillingCycleFallback?: boolean;
  onLoadSubscriptionPlansForTurnover: () => void | Promise<void>;
  /** Active unique services for subscription feature filter (from `GET /api/subscriptions/services?activeOnly=true`). */
  subscriptionFeaturesCatalog: CatalogServiceListItem[] | null;
  subscriptionFeaturesLoading?: boolean;
  subscriptionFeaturesErr?: string;
  /** Set when another customer already uses this UK company registration number. */
  companyRegConflict?: { id: string; name: string } | null;
  companyRegConflictLoading?: boolean;
  companyRegConflictErr?: string;
};

export function ClientRegistrationForm({
  data,
  setData,
  apiBase,
  customerId,
  authHeaders,
  submissionId,
  formSubmissionRow,
  onSubmissionRefresh,
  onSaveDraft,
  saveDraftLoading,
  draftSaveError,
  companyNameOk,
  subscriptionPlansForTurnover,
  subscriptionPlansForTurnoverLoading,
  subscriptionPlansForTurnoverErr,
  subscriptionPlansBillingCycleFallback,
  onLoadSubscriptionPlansForTurnover,
  subscriptionFeaturesCatalog,
  subscriptionFeaturesLoading,
  subscriptionFeaturesErr,
  companyRegConflict,
  companyRegConflictLoading,
  companyRegConflictErr,
}: Props) {
  const [searchParams] = useSearchParams();
  const businessType = searchParams.get("type"); // Get business type from URL

  const sig = data.signatures.client_registration;
  const selectedPlanId =
    (data.subscription_matrix_plan_id ?? "").trim() || (data.subscription_plan_id ?? "").trim();
  
  // Check if this is a sole trader (URL flow for trader-specific step 1 UI)
  const isSoleTrader = businessType === "sole_trader";
  const showAuthCodeField = showCompaniesHouseAuthCode(data.company.type, businessType);

  const traderLockedToRegistered = data.company.traderSameAsRegistered === true;

  /** Empty payee count is treated as 0 when calling recommend (same as API). Only block on invalid numbers. */
  const payeeUsersInvalid =
    data.subscription_payee_users !== null &&
    data.subscription_payee_users !== undefined &&
    (!Number.isFinite(Number(data.subscription_payee_users)) ||
      Number(data.subscription_payee_users) < 0);

  const showSubscriptionPlansButtonDisabled =
    subscriptionPlansForTurnoverLoading ||
    !data.company.type.trim() ||
    data.annual_turnover_gbp === null ||
    data.annual_turnover_gbp === undefined ||
    !Number.isFinite(data.annual_turnover_gbp) ||
    data.annual_turnover_gbp < 0 ||
    payeeUsersInvalid;

  const patchRegisteredAddress = useCallback(
    (partial: Partial<CustomerOnboardingData["company"]["registeredAddress"]>) => {
      setData((d) => {
        const reg = { ...d.company.registeredAddress, ...partial };
        const trader = d.company.traderSameAsRegistered ? { ...reg } : d.company.traderAddress;
        return { ...d, company: { ...d.company, registeredAddress: reg, traderAddress: trader } };
      });
    },
    [setData],
  );

  return (
    <div className="space-y-6">
      <p className="text-center text-xs font-medium text-muted" aria-live="polite">
        Registration form (includes details, declaration, and office use).
      </p>
      <section className={sec}>
        <h3 className={secTitle}>
          {isSoleTrader ? "Trader Information" : "Company Information"}
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          
          {/* For Sole Trader: Show Trader Name instead of Company Name */}
          {isSoleTrader ? (
            <>
              <label className="sm:col-span-2">
                <span className={lab}>Trader Name</span>
                <input
                  className={inp}
                  value={data.company.name}
                  onChange={(e) =>
                    setData((d) => ({ ...d, company: { ...d.company, name: e.target.value } }))
                  }
                  placeholder="Full name of sole trader"
                />
              </label>
              
              {/* Hide Company Registration Number for Sole Trader */}
              <div className="hidden" />
            </>
          ) : (
            <>
              <label className="sm:col-span-2">
                <span className={lab}>Company Name</span>
                <input
                  className={inp}
                  value={data.company.name}
                  onChange={(e) =>
                    setData((d) => ({ ...d, company: { ...d.company, name: e.target.value } }))
                  }
                  placeholder="Registered name"
                />
              </label>
              <label>
                <span className={lab}>Company Registration Number</span>
                <input
                  className={inp}
                  value={data.company.number}
                  onChange={(e) =>
                    setData((d) => ({ ...d, company: { ...d.company, number: e.target.value } }))
                  }
                />
                {companyRegConflictLoading ? (
                  <p className="mt-1.5 text-xs text-muted" aria-live="polite">
                    Checking for an existing customer with this number…
                  </p>
                ) : null}
                {companyRegConflictErr ? (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400" role="alert">
                    {companyRegConflictErr}
                  </p>
                ) : null}
                {companyRegConflict ? (
                  <p className="mt-1.5 text-sm text-amber-800 dark:text-amber-200" role="alert">
                    This registration number is already used by{" "}
                    <span className="font-medium text-ink">{companyRegConflict.name}</span>. You cannot create a
                    duplicate — change the number or open that customer instead.
                  </p>
                ) : null}
              </label>
            </>
          )}
          
          {/* Business Type - Show but maybe pre-select for Sole Trader */}
          <label>
            <span className={lab}>Business Type</span>
            <select
              className={inp}
              value={data.company.type}
              onChange={(e) => {
                const nextType = e.target.value;
                setData((d) => ({
                  ...d,
                  company: { ...d.company, type: nextType },
                  tax: showCompaniesHouseAuthCode(nextType)
                    ? d.tax
                    : { ...d.tax, auth_code: "" },
                }));
              }}
            >
              <option value="">Select</option>
              {BUSINESS_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {BUSINESS_TYPE_LABELS[opt]}
                </option>
              ))}
              {data.company.type &&
              !(BUSINESS_TYPE_OPTIONS as readonly string[]).includes(data.company.type) ? (
                <option value={data.company.type}>{data.company.type}</option>
              ) : null}
            </select>
          </label>
          
          <label className="sm:col-span-2">
            <span className={lab}>Nature of Business</span>
            <input
              className={inp}
              value={data.company.nature_of_business}
              onChange={(e) =>
                setData((d) => ({ ...d, company: { ...d.company, nature_of_business: e.target.value } }))
              }
              placeholder={isSoleTrader ? "What does your business do?" : "e.g., Software development"}
            />
          </label>
          
          <label>
            <span className={lab}>Year End</span>
            <input
              className={inp}
              value={data.company.year_end}
              onChange={(e) =>
                setData((d) => ({ ...d, company: { ...d.company, year_end: e.target.value } }))
              }
              placeholder="e.g., 31 March"
            />
          </label>

          {showAuthCodeField ? (
            <label>
              <span className={lab}>Auth code</span>
              <input
                className={inp}
                value={data.tax.auth_code}
                onChange={(e) =>
                  setData((d) => ({ ...d, tax: { ...d.tax, auth_code: e.target.value } }))
                }
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          ) : null}

          {/* Hide Companies House info for Sole Trader */}
          {!isSoleTrader && (data.company.company_status ||
            data.company.date_of_creation ||
            data.company.jurisdiction) && (
            <div className="sm:col-span-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-muted">
              <p className="font-semibold text-ink-soft">Companies House (from profile)</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {data.company.company_status ? (
                  <li>Status: {data.company.company_status}</li>
                ) : null}
                {data.company.date_of_creation ? (
                  <li>Incorporated: {formatDate(data.company.date_of_creation)}</li>
                ) : null}
                {data.company.jurisdiction ? (
                  <li>Jurisdiction: {data.company.jurisdiction}</li>
                ) : null}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className={sec}>
        <h3 className={secTitle}>Registered Address</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={lab}>Address Line 1</span>
            <input
              className={inp}
              value={data.company?.registeredAddress?.line1}
              onChange={(e) => patchRegisteredAddress({ line1: e.target.value })}
            />
          </label>
          <label>
            <span className={lab}>City</span>
            <input
              className={inp}
              value={data.company?.registeredAddress?.city}
              onChange={(e) => patchRegisteredAddress({ city: e.target.value })}
            />
          </label>
          <label>
            <span className={lab}>Postcode</span>
            <input
              className={inp}
              value={data.company?.registeredAddress?.postcode}
              onChange={(e) => patchRegisteredAddress({ postcode: e.target.value })}
            />
          </label>
          <label>
            <span className={lab}>Country</span>
            <input
              className={inp}
              value={data.company?.registeredAddress?.country ?? ""}
              onChange={(e) => patchRegisteredAddress({ country: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section className={sec}>
        <h3 className={secTitle}>Trading Address</h3>
        <p className="mt-1 text-xs text-muted">Where you trade from if different from the registered address.</p>
        <label className="mt-3 flex cursor-pointer items-start gap-2 sm:col-span-2">
          <input
            type="checkbox"
            className={`${chk} mt-0.5`}
            checked={traderLockedToRegistered}
            onChange={(e) => {
              const checked = e.target.checked;
              setData((d) => ({
                ...d,
                company: {
                  ...d.company,
                  traderSameAsRegistered: checked,
                  traderAddress: checked ? { ...d.company.registeredAddress } : d.company.traderAddress,
                },
              }));
            }}
          />
          <span className="text-sm text-ink-soft">Same as Registered Address</span>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={lab}>Address Line 1</span>
            <input
              className={traderLockedToRegistered ? inpReadonly : inp}
              readOnly={traderLockedToRegistered}
              value={data.company?.traderAddress?.line1}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  company: {
                    ...d.company,
                    traderAddress: { ...d.company.traderAddress, line1: e.target.value },
                  },
                }))
              }
            />
          </label>
          <label>
            <span className={lab}>City</span>
            <input
              className={traderLockedToRegistered ? inpReadonly : inp}
              readOnly={traderLockedToRegistered}
              value={data.company?.traderAddress?.city}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  company: {
                    ...d.company,
                    traderAddress: { ...d.company.traderAddress, city: e.target.value },
                  },
                }))
              }
            />
          </label>
          <label>
            <span className={lab}>Postcode</span>
            <input
              className={traderLockedToRegistered ? inpReadonly : inp}
              readOnly={traderLockedToRegistered}
              value={data.company?.traderAddress?.postcode}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  company: {
                    ...d.company,
                    traderAddress: { ...d.company.traderAddress, postcode: e.target.value },
                  },
                }))
              }
            />
          </label>
          <label>
            <span className={lab}>Country</span>
            <input
              className={traderLockedToRegistered ? inpReadonly : inp}
              readOnly={traderLockedToRegistered}
              value={data.company?.traderAddress?.country ?? ""}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  company: {
                    ...d.company,
                    traderAddress: { ...d.company.traderAddress, country: e.target.value },
                  },
                }))
              }
            />
          </label>
        </div>
      </section>

      {/* Hide Companies House filing snapshot for Sole Trader */}
      {!isSoleTrader && data.companies_house ? (
        <section className={sec}>
          <h3 className={secTitle}>Companies House Filing Snapshot</h3>
          <p className="mt-1 text-xs text-muted">
            Stored on this onboarding record when you look up a company. Not sent to HMRC forms automatically.
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {data.companies_house.accounts?.next_accounts_due_on ? (
              <>
                <dt className="text-muted">Accounts Next Due</dt>
                <dd className="font-medium text-ink">
                  {data.companies_house.accounts.next_accounts_due_on}
                  {data.companies_house.accounts.next_accounts_overdue ? " (overdue)" : ""}
                </dd>
              </>
            ) : null}
            {data.companies_house.confirmation_statement?.next_due ? (
              <>
                <dt className="text-muted">Confirmation Statement Due</dt>
                <dd className="font-medium text-ink">
                  {data.companies_house.confirmation_statement.next_due}
                  {data.companies_house.confirmation_statement.overdue ? " (overdue)" : ""}
                </dd>
              </>
            ) : null}
            {data.companies_house.fetched_at ? (
              <>
                <dt className="text-muted">Profile Fetched</dt>
                <dd className="font-mono text-xs text-ink-soft">{data.companies_house.fetched_at}</dd>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}

      {/* Contact section remains the same */}
      <section className={sec}>
        <h3 className={secTitle}>Contact</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className={lab}>Phone Number</span>
            <input
              className={inp}
              type="tel"
              value={data.contact.phone}
              onChange={(e) =>
                setData((d) => ({ ...d, contact: { ...d.contact, phone: e.target.value } }))
              }
            />
          </label>
          <label>
            <span className={lab}>Email Address</span>
            <input
              className={inp}
              type="email"
              value={data.contact.email}
              onChange={(e) =>
                setData((d) => ({ ...d, contact: { ...d.contact, email: e.target.value } }))
              }
            />
          </label>
        </div>
      </section>

      <section className={sec}>
          <h3 className={secTitle}>Director / Proprietor</h3>
          <div className="mt-4 flex flex-col gap-4">
            <div className="max-h-[min(70vh,720px)] space-y-6 overflow-y-auto overscroll-y-contain rounded-lg border border-border/60 bg-surface-muted/25 p-3 pr-2 [scrollbar-gutter:stable]">
            {data.directors.map((dir, idx) => (
              <div key={dir.uid ?? `dir-${idx}`} className="rounded-lg border border-border bg-surface-raised p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold tracking-wide text-muted">
                    Director {idx + 1}
                  </span>
                  {data.directors.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-400 hover:underline"
                      onClick={() =>
                        setData((d) => ({
                          ...d,
                          directors: d.directors.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className={lab}>Director Name</span>
                    <input
                      className={inp}
                      value={dir.name}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          directors: d.directors.map((row, i) =>
                            i === idx ? { ...row, name: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className={lab}>Address</span>
                    <input
                      className={inp}
                      value={dir.address}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          directors: d.directors.map((row, i) =>
                            i === idx ? { ...row, address: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className={lab}>City</span>
                    <input
                      className={inp}
                      value={dir.city}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          directors: d.directors.map((row, i) =>
                            i === idx ? { ...row, city: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className={lab}>Postcode</span>
                    <input
                      className={inp}
                      value={dir.postcode}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          directors: d.directors.map((row, i) =>
                            i === idx ? { ...row, postcode: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className={lab}>UTR</span>
                    <input
                      className={inp}
                      value={dir.personal_utr}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          directors: d.directors.map((row, i) =>
                            i === idx ? { ...row, personal_utr: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className={lab}>NI Number</span>
                    <input
                      className={inp}
                      value={dir.ni_number}
                      onChange={(e) => {
                        const value = e.target.value;
                        setData((d) => ({
                          ...d,
                          directors: d.directors.map((row, i) =>
                            i === idx ? { ...row, ni_number: value } : row,
                          ),
                          ...(idx === 0 && !d.tax.ni_number.trim()
                            ? { tax: { ...d.tax, ni_number: value } }
                            : {}),
                        }));
                      }}
                    />
                  </label>
                  <label>
                    <span className={lab}>DOB</span>
                    <input
                      className={inp}
                      type="date"
                      value={dir.date_of_birth}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          directors: d.directors.map((row, i) =>
                            i === idx ? { ...row, date_of_birth: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className={lab}>Identity verification code</span>
                    <input
                      className={inp}
                      value={dir.identity_verification_code}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          directors: d.directors.map((row, i) =>
                            i === idx ? { ...row, identity_verification_code: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
            </div>
            {(() => {
              const atLimit = data.directors.length >= MAX_DIRECTORS;
              return (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    disabled={atLimit}
                    aria-disabled={atLimit}
                    title={atLimit ? `You can add up to ${MAX_DIRECTORS} directors.` : undefined}
                    className="shrink-0 rounded-lg border border-dashed border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-raised"
                    onClick={() =>
                      setData((d) =>
                        d.directors.length >= MAX_DIRECTORS
                          ? d
                          : { ...d, directors: [...d.directors, emptyDirector()] },
                      )
                    }
                  >
                    + Add another director
                  </button>
                  {atLimit ? (
                    <span className="text-xs text-muted">
                      Maximum {MAX_DIRECTORS} directors reached.
                    </span>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </section>

      {/* Tax information - For Sole Trader, add UTR field hint */}
      <section className={sec}>
        <h3 className={secTitle}>Tax Information</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className={lab}>UTR</span>
            <input
              className={inp}
              value={data.tax.utr}
              onChange={(e) =>
                setData((d) => ({ ...d, tax: { ...d.tax, utr: e.target.value } }))
              }
              placeholder={isSoleTrader ? "Your Unique Taxpayer Reference" : "Company UTR"}
            />
          </label>
          <label>
            <span className={lab}>VAT Number</span>
            <input
              className={inp}
              value={data.tax.vat_number}
              onChange={(e) =>
                setData((d) => ({ ...d, tax: { ...d.tax, vat_number: e.target.value } }))
              }
            />
          </label>
          <label>
            <span className={lab}>VAT Quarter</span>
            <select
              className={inp}
              value={data.tax.vat_quarter}
              onChange={(e) =>
                setData((d) => ({ ...d, tax: { ...d.tax, vat_quarter: e.target.value } }))
              }
            >
              <option value="">Select month</option>
              {data.tax.vat_quarter &&
              !VAT_QUARTER_END_MONTHS.includes(
                data.tax.vat_quarter as (typeof VAT_QUARTER_END_MONTHS)[number],
              ) ? (
                <option value={data.tax.vat_quarter}>{data.tax.vat_quarter}</option>
              ) : null}
              {VAT_QUARTER_END_MONTHS.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={lab}>VAT return due date</span>
            <input
              type="date"
              className={inp}
              value={data.tax.vat_return_due_date}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  tax: { ...d.tax, vat_return_due_date: e.target.value },
                }))
              }
            />
          </label>
          <label>
            <span className={lab}>PAYE Office Ref</span>
            <input
              className={inp}
              value={data.tax.paye_ref}
              onChange={(e) =>
                setData((d) => ({ ...d, tax: { ...d.tax, paye_ref: e.target.value } }))
              }
            />
          </label>
          <label>
            <span className={lab}>PAYE Ref</span>
            <input
              className={inp}
              value={data.tax.ni_number}
              onChange={(e) =>
                setData((d) => ({ ...d, tax: { ...d.tax, ni_number: e.target.value } }))
              }
              placeholder="e.g. AB123456C"
              autoComplete="off"
            />
          </label>
        </div>
      </section>

      <section className={sec} aria-labelledby="subscription-plan-heading">
        <h3 id="subscription-plan-heading" className={secTitle}>
          Subscription
        </h3>
        <p className="mt-1 text-xs text-muted">
          Optionally tick services to limit plans to bundles that include every selected item. Set billing cycle,
          payees, and turnover — we match matrix bands, extensions, and payroll limits.
        </p>
        <div className="mt-4 rounded-xl border border-border-subtle bg-surface-muted/40 p-4">
          <span className={lab}>Filter by services (optional)</span>
          {subscriptionFeaturesLoading ? (
            <p className="mt-2 text-sm text-muted">Loading active services…</p>
          ) : subscriptionFeaturesErr ? (
            <p className="mt-2 text-sm text-red-400">{subscriptionFeaturesErr}</p>
          ) : !subscriptionFeaturesCatalog?.length ? (
            <p className="mt-2 text-sm text-muted">
              No active services in the catalogue yet. Add services under Settings → Subscription plans (edit a plan).
              You can still load plans without a feature filter.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {subscriptionFeaturesCatalog.map((svc) => {
                const checked = Boolean(
                  (data.subscription_selected_service_ids ?? []).includes(svc.serviceId),
                );
                return (
                  <li key={svc.serviceId}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border-subtle bg-surface-raised/80 px-3 py-2.5 text-sm hover:border-border">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-brand focus:ring-brand"
                        checked={checked}
                        onChange={() => {
                          setData((d) => {
                            const cur = new Set(d.subscription_selected_service_ids ?? []);
                            if (cur.has(svc.serviceId)) cur.delete(svc.serviceId);
                            else cur.add(svc.serviceId);
                            const ids = [...cur];
                            const cat = subscriptionFeaturesCatalog ?? [];
                            const services = ids.map((id) => {
                              const row = cat.find((c) => c.serviceId === id);
                              return { id, name: (row?.name ?? "").trim() || id };
                            });
                            return {
                              ...d,
                              subscription_selected_service_ids: ids,
                              subscription_selected_services: services,
                            };
                          });
                        }}
                      />
                      <span>
                        <span className="font-medium text-ink">{svc.name}</span>
                        {svc.description ? (
                          <span className="mt-0.5 block text-xs text-muted line-clamp-2">{svc.description}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="min-w-[10rem]">
            <span className={lab}>Billing cycle</span>
            <select
              className={inp}
              value={String(data.subscription_billing_cycle ?? "monthly").toLowerCase()}
              onChange={(e) => {
                const v = e.target.value.toLowerCase();
                setData((d) => ({
                  ...d,
                  subscription_billing_cycle: v === "yearly" ? "yearly" : "monthly",
                  ...(!isMatrixYearlyBilling(v) ? { subscription_is_dormant: false } : {}),
                }));
              }}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label className="min-w-[10rem]">
            <span className={lab}>Number of payees</span>
            <input
              className={inp}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="e.g. 7"
              value={
                data.subscription_payee_users === null || data.subscription_payee_users === undefined
                  ? ""
                  : String(data.subscription_payee_users)
              }
              onChange={(e) => {
                const raw = e.target.value.trim();
                setData((d) => {
                  if (raw === "") return { ...d, subscription_payee_users: null };
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n < 0) return d;
                  return { ...d, subscription_payee_users: Math.max(0, Math.floor(n)) };
                });
              }}
            />
          </label>
          <label className="min-w-[12rem] sm:col-span-2 lg:col-span-2">
            <span className={lab}>Annual turnover (GBP)</span>
            <input
              className={inp}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="e.g. 250000"
              value={
                data.annual_turnover_gbp === null || data.annual_turnover_gbp === undefined
                  ? ""
                  : String(data.annual_turnover_gbp)
              }
              onChange={(e) => {
                const raw = e.target.value.trim();
                setData((d) => {
                  if (raw === "") return { ...d, annual_turnover_gbp: null };
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n < 0) return d;
                  return { ...d, annual_turnover_gbp: n };
                });
              }}
            />
          </label>
        </div>
        {isMatrixYearlyBilling(data.subscription_billing_cycle) ? (
          <label className="mt-3 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
              checked={Boolean(data.subscription_is_dormant)}
              onChange={(e) => setData((d) => ({ ...d, subscription_is_dormant: e.target.checked }))}
            />
            <span className={lab}>Account is dormant (add dormant fee when the plan allows it)</span>
          </label>
        ) : null}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <button
            type="button"
            className="btn btn-primary btn-md font-medium"
            disabled={showSubscriptionPlansButtonDisabled}
            onClick={() => void onLoadSubscriptionPlansForTurnover()}
          >
            {subscriptionPlansForTurnoverLoading ? "Loading plans…" : "Show subscription plans"}
          </button>
        </div>
        {subscriptionPlansForTurnoverErr ? (
          <p className="mt-2 text-sm text-red-400">{subscriptionPlansForTurnoverErr}</p>
        ) : null}
        {!subscriptionPlansForTurnoverErr && subscriptionPlansForTurnover === null ? (
          <p className="mt-3 text-sm text-muted">
            Set business type, billing, payees, and turnover, then use &quot;Show subscription plans&quot;. Service
            ticks are optional filters when the catalogue has items.
          </p>
        ) : null}
        {!subscriptionPlansForTurnoverErr && subscriptionPlansForTurnover !== null && subscriptionPlansForTurnover.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No matrix bundles matched these inputs. Adjust business type, billing cycle, turnover, or payees, or add
            bundles under Settings → Subscription plans.
          </p>
        ) : null}
        {!subscriptionPlansForTurnoverErr &&
        subscriptionPlansForTurnover !== null &&
        subscriptionPlansForTurnover.length > 0 &&
        subscriptionPlansBillingCycleFallback ? (
          <p className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/95">
            No plan matched your filters exactly. Showing every active plan for this billing cycle (
            {isMatrixYearlyBilling(data.subscription_billing_cycle) ? "yearly" : "monthly"}). Pricing still uses your
            turnover and payees; if turnover is outside a plan's matrix band, the base uses the lowest band as a
            guide — verify in Settings → Subscription plans.
          </p>
        ) : null}
        {!subscriptionPlansForTurnoverErr && subscriptionPlansForTurnover !== null && subscriptionPlansForTurnover.length > 0 ? (
          <div
            role="radiogroup"
            aria-labelledby="subscription-plan-heading"
            className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {subscriptionPlansForTurnover.map((plan) => {
              const selected = selectedPlanId === plan.id;
              const pr = plan.pricing;
              const ted = pr.turnoverExtensionDetail;
              const ped = pr.payrollExtraDetail;
              const selectedServiceIds = data.subscription_selected_service_ids ?? [];
              const matrixAll = plan.featureMatrix ?? [];
              const featureRowsToShow =
                selectedServiceIds.length > 0
                  ? matrixAll.filter((f) => selectedServiceIds.includes(f.serviceId))
                  : matrixAll;
              return (
                <label
                  key={plan.id}
                  className={`
                    flex h-full min-h-0 cursor-pointer flex-col rounded-xl border bg-surface-muted/30 p-4 shadow-sm transition-colors
                    ${selected ? "border-brand ring-2 ring-brand/20" : "border-border hover:border-border-subtle"}
                  `}
                >
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="subscription_plan"
                        className="mt-1 h-4 w-4 shrink-0 border-border text-brand focus:ring-brand"
                        checked={selected}
                        onChange={() =>
                          setData((d) => ({
                            ...d,
                            subscription_matrix_plan_id: plan.id,
                            subscription_matrix_plan_name: plan.name,
                            subscription_matrix_plan_price_inc_vat_gbp: plan.pricing.final,
                            subscription_plan_id: "",
                            subscription_plan_name: plan.name,
                          }))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-ink">{plan.name}</span>
                          {plan.recommended ? (
                            <span className="rounded-full bg-emerald-950/80 px-2 py-0.5 text-xs font-medium text-emerald-200">
                              Recommended
                            </span>
                          ) : (
                            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
                              Alternative
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          Payroll included up to {plan.payrollLimit} payee(s)
                        </p>
                        <dl className="mt-3 space-y-2 border-t border-border-subtle pt-3 text-xs text-muted">
                          <div className="flex justify-between gap-2">
                            <dt>Base (band)</dt>
                            <dd className="shrink-0 font-mono text-ink">£{formatPlanPrice(pr.base)}</dd>
                          </div>
                          {pr.turnoverExtra > 0 && ted ? (
                            <div className="space-y-0.5">
                              <div className="flex justify-between gap-2">
                                <dt>Turnover extension</dt>
                                <dd className="shrink-0 text-right font-mono text-ink">
                                  £{formatPlanPrice(pr.turnoverExtra)}
                                </dd>
                              </div>
                              <p className="text-[11px] leading-snug text-muted">
                                {ted.blocks} × £{formatPlanPrice(ted.costPerBlock)} = £{formatPlanPrice(pr.turnoverExtra)}
                              </p>
                            </div>
                          ) : pr.turnoverExtra > 0 ? (
                            <div className="flex justify-between gap-2">
                              <dt>Turnover extension</dt>
                              <dd className="font-mono text-ink">£{formatPlanPrice(pr.turnoverExtra)}</dd>
                            </div>
                          ) : null}
                          {pr.payrollExtra > 0 && ped ? (
                            <div className="space-y-0.5">
                              <div className="flex justify-between gap-2">
                                <dt>Extra payees</dt>
                                <dd className="shrink-0 text-right font-mono text-ink">
                                  £{formatPlanPrice(pr.payrollExtra)}
                                </dd>
                              </div>
                              <p className="text-[11px] leading-snug text-muted">
                                {ped.extraPayees} × £{formatPlanPrice(ped.ratePerPayee)} = £
                                {formatPlanPrice(pr.payrollExtra)}
                              </p>
                            </div>
                          ) : pr.payrollExtra > 0 ? (
                            <div className="flex justify-between gap-2">
                              <dt>Extra payees</dt>
                              <dd className="font-mono text-ink">£{formatPlanPrice(pr.payrollExtra)}</dd>
                            </div>
                          ) : null}
                          {pr.dormant > 0 ? (
                            <div className="space-y-0.5">
                              <div className="flex justify-between gap-2">
                                <dt>Dormant fee</dt>
                                <dd className="shrink-0 font-mono text-ink">£{formatPlanPrice(pr.dormant)}</dd>
                              </div>
                              <p className="text-[11px] text-muted">1 × £{formatPlanPrice(pr.dormant)} = £{formatPlanPrice(pr.dormant)}</p>
                            </div>
                          ) : null}
                          <div className="flex justify-between gap-2 border-t border-border-subtle/80 pt-2">
                            <dt>
                              VAT
                              {typeof pr.vatPercent === "number" && Number.isFinite(pr.vatPercent)
                                ? ` (${pr.vatPercent}%)`
                                : ""}
                            </dt>
                            <dd className="shrink-0 font-mono text-ink">£{formatPlanPrice(pr.vat)}</dd>
                          </div>
                        </dl>
                        <div className="mt-1">
                          <span className="text-xl font-bold text-ink">£{formatPlanPrice(pr.final)}</span>
                          <span className="text-sm text-muted"> inc. VAT / cycle</span>
                        </div>
                      </div>
                    </div>
                    {featureRowsToShow.length > 0 ? (
                      <div className="mt-auto border-t border-border-subtle pt-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                          {selectedServiceIds.length > 0
                            ? "Your selected services"
                            : "Services in this plan"}
                        </p>
                        <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1 text-xs">
                          {featureRowsToShow.map((f) => (
                            <li key={f.serviceId} className="flex items-start gap-2 border-b border-border-subtle/60 pb-1.5 last:border-0 last:pb-0">
                              <span
                                className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border-subtle text-[10px] font-semibold leading-none"
                                aria-hidden
                              >
                                {f.status === "included" ? (
                                  <span className="text-emerald-400">✓</span>
                                ) : f.status === "addon" ? (
                                  <span className="text-amber-300">+</span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </span>
                              <span className="min-w-0 flex-1 text-ink">{f.name}</span>
                              <span className="shrink-0 text-[10px] text-muted">
                                {f.status === "included"
                                  ? "Included"
                                  : f.status === "addon"
                                    ? "Add-on"
                                    : "Not offered"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : selectedServiceIds.length > 0 && matrixAll.length > 0 ? (
                      <div className="mt-auto border-t border-border-subtle pt-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Your selected services</p>
                        <p className="mt-2 text-xs text-muted">
                          None of your ticked services appear in this plan&apos;s breakdown. Try another plan or
                          adjust your service filter.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* Declaration on part 1 with the client-facing form */}
      <section className={sec}>
        <h3 className={secTitle}>Declaration</h3>
        <p className="mb-3 text-xs text-muted">Sign below to confirm the declaration for this step.</p>
        <OnboardingSignatureBlock
          slot="client_registration"
          data={data}
          setData={setData}
          apiBase={apiBase}
          customerId={customerId}
          authHeaders={authHeaders}
          submissionId={submissionId}
          formSubmissionRow={formSubmissionRow}
          onSubmissionRefresh={onSubmissionRefresh}
          onSaveDraft={onSaveDraft}
          saveDraftLoading={saveDraftLoading}
          draftSaveError={draftSaveError}
          companyNameOk={companyNameOk}
          title="Signature"
          remoteEmailInitial={data.contact.email.trim()}
          betweenRemoteAndPad={
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label>
                <span className={lab}>Authorized Signatory Name</span>
                <input
                  className={inp}
                  value={sig.name}
                  onChange={(e) =>
                    setData((d) => withAuthorizedSignatoryNameAcrossForms(d, e.target.value))
                  }
                />
              </label>
              <label>
                <span className={lab}>Position</span>
                <input
                  className={inp}
                  value={sig.position}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      signatures: {
                        ...d.signatures,
                        client_registration: {
                          ...d.signatures.client_registration,
                          position: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </label>
              <label>
                <span className={lab}>Date</span>
                <input
                  className={inp}
                  type="date"
                  value={sig.date}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      signatures: {
                        ...d.signatures,
                        client_registration: { ...d.signatures.client_registration, date: e.target.value },
                      },
                    }))
                  }
                />
              </label>
            </div>
          }
        />
      </section>

      {/* Office use section remains the same */}
      <section className={`${sec} border-amber-700/40 bg-amber-950/25`}>
        <h3 className={secTitle}>Office Use</h3>
        <p className="mt-1 text-xs text-amber-200/90">
          For internal use only. The client declaration and signature are on the previous screen.
        </p>
        <div className="mt-4 space-y-5">
          {/* Keep all office use fields as they are */}
          <div>
            <p className="mb-2 text-xs font-semibold text-amber-100">Office checklist (matches PDF tick boxes)</p>
            <div className="flex flex-col gap-3 text-sm text-ink">
              <div>
                <span className="text-xs font-semibold text-muted">
                  Director Photo ID
                </span>
                <div className="mt-1 flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className={chk}
                      checked={data.office_use.director_photo_id.passport}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          office_use: {
                            ...d.office_use,
                            director_photo_id: {
                              ...d.office_use.director_photo_id,
                              passport: e.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    <span>Passport</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className={chk}
                      checked={data.office_use.director_photo_id.driving_license}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          office_use: {
                            ...d.office_use,
                            director_photo_id: {
                              ...d.office_use.director_photo_id,
                              driving_license: e.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    <span>Driving Licence</span>
                  </label>
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-muted">Address Proof</span>
                <div className="mt-1 flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className={chk}
                      checked={data.office_use.address_proof.utility_bill}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          office_use: {
                            ...d.office_use,
                            address_proof: {
                              ...d.office_use.address_proof,
                              utility_bill: e.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    <span>Utility Bill</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className={chk}
                      checked={data.office_use.address_proof.bank_statement}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          office_use: {
                            ...d.office_use,
                            address_proof: {
                              ...d.office_use.address_proof,
                              bank_statement: e.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    <span>Bank Statement</span>
                  </label>
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-muted">Online Access</span>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                  {(
                    [
                      ["companies_house", "Companies House"],
                      ["hmrc", "HMRC"],
                      ["paye", "PAYE"],
                      ["vat", "VAT"],
                      ["bank", "Bank"],
                      ["credit_card", "Credit Card"],
                      ["other", "Other"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className={chk}
                        checked={data.office_use.online_access[key]}
                        onChange={(e) =>
                          setData((d) => ({
                            ...d,
                            office_use: {
                              ...d.office_use,
                              online_access: {
                                ...d.office_use.online_access,
                                [key]: e.target.checked,
                              },
                            },
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-5 rounded-xl border border-amber-700/35 bg-amber-950/15 p-4 sm:p-5">
            <label className="flex min-h-0 flex-col gap-2">
              <span className={lab}>Notes</span>
              <textarea
                className={`${inp} min-h-[12rem] resize-y py-3 text-sm leading-relaxed sm:min-h-[14rem]`}
                value={coerceOfficeNoted(data.office_use.noted)}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    office_use: { ...d.office_use, noted: e.target.value },
                  }))
                }
                placeholder="Office notes"
                rows={14}
              />
            </label>
            <label className="flex min-h-0 flex-col gap-2">
              <span className={lab}>Internal Remarks</span>
              <textarea
                className={`${inp} min-h-[12rem] resize-y py-3 text-sm leading-relaxed sm:min-h-[14rem]`}
                value={data.office_use.internal_remarks}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    office_use: { ...d.office_use, internal_remarks: e.target.value },
                  }))
                }
                placeholder="Internal notes for staff"
                rows={14}
              />
            </label>
            <label className="flex min-h-[8rem] flex-col justify-end gap-2 sm:max-w-xl">
              <span className={lab}>Approval Status</span>
              <select
                className={`${inp} min-h-[3.5rem] py-3 text-base`}
                value={data.office_use.approval_status}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    office_use: { ...d.office_use, approval_status: e.target.value },
                  }))
                }
              >
                {OFFICE_APPROVAL_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value || "unset"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}