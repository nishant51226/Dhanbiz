import type { ReactNode } from "react";
import type {
  CatalogServiceListItem,
  CustomerFormSubmission,
  OnboardingDocusealSignatureTarget,
  OnboardingSubscriptionPlanCard,
} from "../../types/api";
import type { CustomerOnboardingData } from "../../types/customerOnboarding";
import { ChangeOfAccountantForm } from "./ChangeOfAccountantForm";
import { ClientRegistrationForm } from "./ClientRegistrationForm";
import { DirectDebitForm } from "./DirectDebitForm";
import { Hmrc648AuthorisationForm } from "./Hmrc648AuthorisationForm";
import { SignatureSection } from "./finalreviewandsignature";

const STEP_COUNT = 5;

const STEPS = [
  { n: 1, label: "Registration", short: "Registration" },
  { n: 2, label: "HMRC 64-8", short: "64-8" },
  { n: 3, label: "Change of Accountant", short: "Accountant" },
  { n: 4, label: "Direct Debit", short: "Direct Debit" },
  { n: 5, label: "Review & Sign", short: "Review" },
] as const;

type Props = {
  step: number;
  onStepChange: (step: number) => void;
  data: CustomerOnboardingData;
  setData: React.Dispatch<React.SetStateAction<CustomerOnboardingData>>;
  apiBase: string;
  customerId: string | null;
  authHeaders: () => HeadersInit;
  submissionId: string | null;
  formSubmissionRow: CustomerFormSubmission | null;
  onSubmissionRefresh: () => Promise<void> | void;
  onSaveDraft: (dataOverride?: CustomerOnboardingData) => Promise<boolean>;
  saveDraftDisabled?: boolean;
  saveDraftLoading?: boolean;
  draftSaveError?: string;
  saveMessage: string;
  /** True when all signatures are complete (ready to create the customer on step 5). */
  signaturesComplete: boolean;
  /** Shown after signatures on step 5 (e.g. portal email). */
  postSignatureContent?: ReactNode;
  /**
   * When using DocuSeal by email before a server row exists, create customer + submission and return ids.
   * On-device signing can skip this until the final step.
   */
  ensureServerDraft?: () => Promise<{ customerId: string; submissionId: string } | null>;
  onFinish: () => void;
  finishDisabled?: boolean;
  /** Block advancing from step 1 (e.g. duplicate company registration number). */
  nextDisabled?: boolean;
  finishLabel?: string;
  subscriptionPlansForTurnover: OnboardingSubscriptionPlanCard[] | null;
  subscriptionPlansForTurnoverLoading?: boolean;
  subscriptionPlansForTurnoverErr?: string;
  /** True when API widened to all plans for the selected billing cycle (no strict matrix match). */
  subscriptionPlansBillingCycleFallback?: boolean;
  onLoadSubscriptionPlansForTurnover: () => void | Promise<void>;
  subscriptionFeaturesCatalog: CatalogServiceListItem[] | null;
  subscriptionFeaturesLoading?: boolean;
  subscriptionFeaturesErr?: string;
  companyRegConflict?: { id: string; name: string } | null;
  companyRegConflictLoading?: boolean;
  companyRegConflictErr?: string;
  /** When true, omit the Save draft control from the footer (e.g. host renders it in a page toolbar). */
  hideFooterSaveDraft?: boolean;
  /** Step 5 review tabs: which form is selected (drives page-level Preview). */
  onReviewSignatureFormChange?: (slot: OnboardingDocusealSignatureTarget) => void;
};

export function CustomerOnboardingWizard({
  step,
  onStepChange,
  data,
  setData,
  apiBase,
  customerId,
  authHeaders,
  submissionId,
  formSubmissionRow,
  onSubmissionRefresh,
  onSaveDraft,
  saveDraftDisabled,
  saveDraftLoading,
  draftSaveError,
  saveMessage,
  signaturesComplete,
  postSignatureContent,
  ensureServerDraft,
  onFinish,
  finishDisabled,
  nextDisabled = false,
  finishLabel = "Create customer",
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
  hideFooterSaveDraft = false,
  onReviewSignatureFormChange,
}: Props) {
  const handleStepClick = (targetStep: number) => {
    if (targetStep > step && nextDisabled) return;
    onStepChange(targetStep);
  };

  const handleBack = () => {
    if (step <= 1) return;
    onStepChange(step - 1);
  };

  const handleNext = () => {
    if (nextDisabled) return;
    if (step < STEP_COUNT) {
      onStepChange(step + 1);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-5 shadow-sm sm:p-6">
      <nav aria-label="Onboarding steps" className="mb-8">
        <ol className="flex flex-wrap items-center justify-center gap-1 sm:gap-0">
          {STEPS.map((s, i) => {
            const active = step === s.n;

            return (
              <li key={s.n} className="flex items-center">
                <button
                  type="button"
                  onClick={() => handleStepClick(s.n)}
                  className={`
                    flex flex-col items-center gap-1 transition-all sm:flex-row sm:gap-2
                    cursor-pointer hover:opacity-80
                  `}
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={`
                      flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold
                      transition-all duration-200
                      ${active
                        ? "bg-brand text-brand-foreground ring-2 ring-brand/25 ring-offset-2 ring-offset-surface"
                        : "bg-surface-muted text-muted"
                      }
                      hover:scale-105 hover:shadow-md
                    `}
                  >
                    {s.n}
                  </span>
                  <span
                    className={`
                      hidden max-w-[7rem] text-center text-xs font-medium sm:inline sm:max-w-none sm:text-sm
                      ${active ? "text-ink" : "text-muted"}
                    `}
                  >
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 ? (
                  <div
                    className={`mx-1 hidden h-0.5 w-6 bg-border sm:block md:w-12`}
                    aria-hidden
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-center text-sm text-muted sm:hidden">
          {"Step " + step + " of " + STEP_COUNT + " - " + (STEPS[step - 1]?.short ?? "")}
        </p>
      </nav>

      <div className="min-h-[120px] rounded-lg border border-border-subtle bg-surface-muted/40 p-4 sm:p-5">
        {step === 1 ? (
          <ClientRegistrationForm
            data={data}
            setData={setData}
            apiBase={apiBase}
            customerId={customerId}
            authHeaders={authHeaders}
            submissionId={submissionId}
            formSubmissionRow={formSubmissionRow}
            onSubmissionRefresh={onSubmissionRefresh}
            onSaveDraft={onSaveDraft}
            saveDraftLoading={Boolean(saveDraftLoading)}
            draftSaveError={draftSaveError}
            companyNameOk={Boolean(data.company.name.trim())}
            subscriptionPlansForTurnover={subscriptionPlansForTurnover}
            subscriptionPlansForTurnoverLoading={subscriptionPlansForTurnoverLoading}
            subscriptionPlansForTurnoverErr={subscriptionPlansForTurnoverErr}
            subscriptionPlansBillingCycleFallback={subscriptionPlansBillingCycleFallback}
            onLoadSubscriptionPlansForTurnover={onLoadSubscriptionPlansForTurnover}
            subscriptionFeaturesCatalog={subscriptionFeaturesCatalog}
            subscriptionFeaturesLoading={subscriptionFeaturesLoading}
            subscriptionFeaturesErr={subscriptionFeaturesErr}
            companyRegConflict={companyRegConflict}
            companyRegConflictLoading={companyRegConflictLoading}
            companyRegConflictErr={companyRegConflictErr}
          />
        ) : null}
        {step === 2 ? (
          <Hmrc648AuthorisationForm
            data={data}
            setData={setData}
            apiBase={apiBase}
            customerId={customerId}
            authHeaders={authHeaders}
            submissionId={submissionId}
            formSubmissionRow={formSubmissionRow}
            onSubmissionRefresh={onSubmissionRefresh}
            onSaveDraft={onSaveDraft}
            saveDraftLoading={Boolean(saveDraftLoading)}
            draftSaveError={draftSaveError}
            companyNameOk={Boolean(data.company.name.trim())}
          />
        ) : null}
        {step === 3 ? (
          <ChangeOfAccountantForm
            data={data}
            setData={setData}
            apiBase={apiBase}
            customerId={customerId}
            authHeaders={authHeaders}
            submissionId={submissionId}
            formSubmissionRow={formSubmissionRow}
            onSubmissionRefresh={onSubmissionRefresh}
            onSaveDraft={onSaveDraft}
            saveDraftLoading={Boolean(saveDraftLoading)}
            draftSaveError={draftSaveError}
            companyNameOk={Boolean(data.company.name.trim())}
          />
        ) : null}
        {step === 4 ? (
          <DirectDebitForm
            data={data}
            setData={setData}
            apiBase={apiBase}
            customerId={customerId}
            authHeaders={authHeaders}
            submissionId={submissionId}
            formSubmissionRow={formSubmissionRow}
            onSubmissionRefresh={onSubmissionRefresh}
            onSaveDraft={onSaveDraft}
            saveDraftLoading={Boolean(saveDraftLoading)}
            draftSaveError={draftSaveError}
            companyNameOk={Boolean(data.company.name.trim())}
          />
        ) : null}
        {step === 5 ? (
          <div className="space-y-6">
            <SignatureSection
              data={data}
              setData={setData}
              apiBase={apiBase}
              customerId={customerId}
              authHeaders={authHeaders}
              submissionId={submissionId}
              formSubmissionRow={formSubmissionRow}
              onSubmissionRefresh={onSubmissionRefresh}
              onSaveDraft={onSaveDraft}
              saveDraftLoading={Boolean(saveDraftLoading)}
              draftSaveError={draftSaveError}
              companyNameOk={Boolean(data.company.name.trim())}
              ensureServerDraft={ensureServerDraft}
              onActiveFormChange={onReviewSignatureFormChange}
            />
            {postSignatureContent ? <div className="space-y-4">{postSignatureContent}</div> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-4 border-t border-border-subtle pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={step <= 1}
          className={
            hideFooterSaveDraft
              ? "rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-semibold text-ink shadow-sm hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
              : "order-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-semibold text-ink shadow-sm hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 sm:order-1"
          }
        >
          Back
        </button>
        {!hideFooterSaveDraft ? (
          <div className="order-1 flex flex-col items-center gap-1 sm:order-2">
            <button
              type="button"
              onClick={() => void onSaveDraft()}
              disabled={saveDraftDisabled}
              title={
                saveDraftDisabled && !saveDraftLoading
                  ? "Enter the company name in step 1 to save a draft"
                  : undefined
              }
              className="rounded-lg border border-border bg-surface-raised px-5 py-2.5 text-sm font-semibold text-ink-soft shadow-sm hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saveDraftLoading ? "Saving…" : "Save draft"}
            </button>
            {saveMessage ? <span className="text-xs font-medium text-emerald-400">{saveMessage}</span> : null}
          </div>
        ) : null}
        {step < 5 ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={nextDisabled}
            title={
              nextDisabled
                ? "Resolve the duplicate company registration number on step 1 first"
                : undefined
            }
            className={
              hideFooterSaveDraft
                ? "btn btn-primary btn-lg disabled:cursor-not-allowed"
                : "order-3 btn btn-primary btn-lg disabled:cursor-not-allowed"
            }
          >
            Next
          </button>
        ) : null}
        {step === 5 ? (
          <div
            className={
              hideFooterSaveDraft
                ? "flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end"
                : "order-3 flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end"
            }
          >
            <p className="text-right text-xs text-muted sm:max-w-[16rem]">
              Confirm the portal email below, then create the customer. Your signed forms are included.
            </p>
            <button
              type="button"
              onClick={() => onFinish()}
              disabled={finishDisabled}
              title={
                companyRegConflict
                  ? "Resolve the duplicate company registration number on step 1 first"
                  : !signaturesComplete
                    ? "Complete signing for all four forms first"
                    : undefined
              }
              className="btn btn-primary btn-lg shadow-sm disabled:cursor-not-allowed"
            >
              {finishLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}