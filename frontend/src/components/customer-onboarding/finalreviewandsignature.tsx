// SignatureSection.tsx
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "react-router-dom";
import { sendAllOnboardingSignatureEmailRequests } from "../../api/client";
import type { CustomerFormSubmission, OnboardingDocusealSignatureTarget } from "../../types/api";
import type { CustomerOnboardingData } from "../../types/customerOnboarding";
import { isPartnershipCompanyType, isSoleTraderCompanyType } from "../../types/customerOnboarding";
import {
  hasStoredSignatureImage,
  resolveRemoteDocusealSlotStatus,
} from "../../utils/onboardingSigningGate";
import { withAuthorizedSignatoryNameAcrossForms } from "../../utils/syncAuthorizedSignatoryName";
import { inp, lab } from "./fieldStyles";
import { OnboardingSignatureBlock } from "./OnboardingSignatureBlock";

/** Poll cadence while waiting for at least one DocuSeal signature webhook to land. */
const REMOTE_SIGNATURE_POLL_MS = 5000;

const REMOTE_SLOTS: { slot: OnboardingDocusealSignatureTarget; label: string }[] = [
  { slot: "client_registration", label: "Registration" },
  { slot: "hmrc_64_8", label: "HMRC 64-8" },
  { slot: "change_accountant", label: "Change of Accountant" },
  { slot: "direct_debit", label: "Direct Debit" },
];

function signatureForSlot(data: CustomerOnboardingData, slot: OnboardingDocusealSignatureTarget): string {
  if (slot === "client_registration") return data.signatures.client_registration.signature;
  if (slot === "hmrc_64_8") return data.signatures.hmrc_64_8.signature;
  if (slot === "change_accountant") return data.signatures.change_accountant.signature;
  return data.signatures.direct_debit.signature;
}

type SignatureSectionProps = {
  data: CustomerOnboardingData;
  setData: Dispatch<SetStateAction<CustomerOnboardingData>>;
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
  /** Create customer + submission when DocuSeal email is sent before a server row exists (remote signing). */
  ensureServerDraft?: () => Promise<{ customerId: string; submissionId: string } | null>;
  /** Step 5: notify parent which form tab is active (for per-form Preview). */
  onActiveFormChange?: (slot: OnboardingDocusealSignatureTarget) => void;
};

export function SignatureSection({
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
  ensureServerDraft,
  onActiveFormChange,
}: SignatureSectionProps) {
  const [searchParams] = useSearchParams();
  const soleTraderUrl = searchParams.get("type") === "sole_trader";
  const mode = data.signatures.capture_mode;
  const [activeTab, setActiveTab] = useState<OnboardingDocusealSignatureTarget>("client_registration");

  useEffect(() => {
    onActiveFormChange?.(activeTab);
  }, [activeTab, onActiveFormChange]);
  
  const [bundleEmail, setBundleEmail] = useState(() => data.contact.email.trim());
  const [bundleBusy, setBundleBusy] = useState(false);
  const [bundleErr, setBundleErr] = useState("");
  const [bundleOk, setBundleOk] = useState("");

  const formsList = [
    { slot: "client_registration" as const, label: "Registration", signature: data.signatures.client_registration },
    { slot: "hmrc_64_8" as const, label: "HMRC 64-8", signature: data.signatures.hmrc_64_8 },
    { slot: "change_accountant" as const, label: "Change of Accountant", signature: data.signatures.change_accountant },
    { slot: "direct_debit" as const, label: "Direct Debit", signature: data.signatures.direct_debit },
  ];

  const getSignatureForSlot = (slot: OnboardingDocusealSignatureTarget) => {
    return formsList.find(f => f.slot === slot)?.signature;
  };

  useEffect(() => {
    if (mode !== "remote_email") return;
    void onSubmissionRefresh();
  }, [mode, onSubmissionRefresh]);

  /**
   * While any slot is in the "DocuSeal link sent — waiting for signer" state, poll the latest
   * form submission row every 5s so the wizard flips to "Signature saved" automatically once the
   * webhook lands (no manual page reload needed). The interval stops as soon as all four slots
   * have a stored signature (or none are awaiting), and on unmount.
   */
  useEffect(() => {
    const serverRowData = formSubmissionRow?.data;
    const anyAwaiting = REMOTE_SLOTS.some(({ slot }) => {
      return resolveRemoteDocusealSlotStatus(data, serverRowData, formSubmissionRow?.metadata, slot) === "awaiting";
    });
    if (!anyAwaiting) return;
    const id = window.setInterval(() => {
      void onSubmissionRefresh();
    }, REMOTE_SIGNATURE_POLL_MS);
    return () => window.clearInterval(id);
  }, [data, formSubmissionRow, onSubmissionRefresh]);

  const setCaptureMode = (next: "in_person" | "remote_email" | undefined) => {
    setData((d) => {
      const s = d.signatures;
      if (next === undefined) {
        const { capture_mode: _drop, ...rest } = s;
        return { ...d, signatures: { ...rest } };
      }
      return { ...d, signatures: { ...s, capture_mode: next } };
    });
  };

  const changeSigningMethodControl = (
    <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle pb-3">
      <button
        type="button"
        onClick={() => setCaptureMode(undefined)}
        className="text-sm font-semibold text-brand hover:underline"
      >
        ← Change signing method
      </button>
      <span className="text-xs text-muted">
        Pick director on this device or email all forms again. Existing signatures stay saved unless you clear them on each form.
      </span>
    </div>
  );

  const recipientName = (() => {
    const d0 = data.directors[0]?.name?.trim();
    if (d0) return d0;
    const soleType = isSoleTraderCompanyType(data.company.type);
    const trader = data.company.name?.trim();
    if (trader && (soleType || (soleTraderUrl && !isPartnershipCompanyType(data.company.type)))) return trader;
    return data.signatures.client_registration.name.trim();
  })();

  const sendBundle = async () => {
    setBundleErr("");
    setBundleOk("");
    let cid = customerId;
    let sid = submissionId;
    if (!cid || !sid) {
      const ensured = await ensureServerDraft?.();
      if (ensured) {
        cid = ensured.customerId;
        sid = ensured.submissionId;
      }
    }
    if (!cid || !sid) {
      setBundleErr(
        "Enter the company name on step 1, then try again — we could not create your company record for DocuSeal.",
      );
      return;
    }
    const email = bundleEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      setBundleErr("Enter a valid email address for the signer.");
      return;
    }
    setBundleBusy(true);
    try {
      await sendAllOnboardingSignatureEmailRequests(
        apiBase,
        authHeaders(),
        cid,
        sid,
        { recipientEmail: email, recipientName: recipientName || undefined },
        data,
      );
      await onSubmissionRefresh();
      setBundleOk(
        "Four signing emails were sent (one per form). The same person can complete each DocuSeal link; images merge into this registration when done.",
      );
    } catch (e) {
      setBundleErr(e instanceof Error ? e.message : "Could not send signing requests");
    } finally {
      setBundleBusy(false);
    }
  };

  // Remote email mode UI
  if (mode === "remote_email") {
    return (
      <div className="space-y-4">
        {changeSigningMethodControl}
        <div className="rounded-lg border border-border bg-surface-muted/80 px-4 py-3 text-sm text-ink">
          <p className="font-medium text-ink">Declaration</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            I understand and confirm that the information provided across these forms is accurate, and I am
            authorised to request signatures on behalf of the business. By sending the email below, the recipient
            will receive separate secure links to sign each document.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised px-4 py-3">
          <h4 className="text-sm font-semibold text-ink">Send all four documents</h4>
          <p className="mt-1 text-xs text-muted">
            Uses DocuSeal templates configured on the server (one submission per form). If you have not saved a
            draft yet, we create your company record when you send so DocuSeal can attach to it.
          </p>
          <div className="mt-3 flex max-w-lg flex-col gap-3">
            <label>
              <span className={lab}>Signer Email</span>
              <input
                className={inp}
                type="email"
                value={bundleEmail}
                onChange={(e) => setBundleEmail(e.target.value)}
                placeholder="director@example.com"
                autoComplete="email"
              />
            </label>
            <button
              type="button"
              disabled={bundleBusy || !companyNameOk}
              title={!companyNameOk ? "Enter the company name in step 1 first" : undefined}
              onClick={() => void sendBundle()}
              className="btn btn-primary btn-lg w-fit disabled:cursor-not-allowed"
            >
              {bundleBusy ? "Sending…" : "Send signature emails (all four forms)"}
            </button>
            {bundleErr && <p className="text-sm text-red-400">{bundleErr}</p>}
            {bundleOk && <p className="text-sm text-emerald-400">{bundleOk}</p>}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised px-4 py-3">
          <h4 className="text-sm font-semibold text-ink">Status</h4>
          <ul className="mt-2 space-y-2 text-sm">
            {REMOTE_SLOTS.map(({ slot, label }) => {
              const status = resolveRemoteDocusealSlotStatus(
                data,
                formSubmissionRow?.data,
                formSubmissionRow?.metadata,
                slot,
              );
              const detail =
                status === "saved"
                  ? "Signature saved"
                  : status === "awaiting"
                    ? "DocuSeal link sent — waiting for signer"
                    : "Not signed yet";
              return (
                <li key={slot} className="flex justify-between gap-2 border-b border-border-subtle py-1 last:border-0">
                  <span className="text-ink-soft">{label}</span>
                  <span className="shrink-0 text-muted">{detail}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  // In-person mode UI with tabs
  if (mode === "in_person") {
    return (
      <div className="space-y-4">
        {changeSigningMethodControl}
        {/* Tabs Navigation */}
        <div className="border-b border-border">
          <nav className="-mb-px flex space-x-4 overflow-x-auto">
            {formsList.map(({ slot, label }) => {
              const hasSig = hasStoredSignatureImage(signatureForSlot(data, slot));
              return (
                <button
                  key={slot}
                  onClick={() => setActiveTab(slot)}
                  className={`
                    whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-all
                    ${activeTab === slot 
                      ? 'border-brand text-brand' 
                      : 'border-transparent text-muted hover:border-border hover:text-ink-soft'
                    }
                  `}
                >
                  {label}
                  {hasSig && <span className="ml-2 text-base text-emerald-400">✓</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Declaration */}
        <div className="rounded-lg border border-border bg-surface-muted/80 px-4 py-3 text-sm text-ink">
          <p className="font-medium text-ink">Declaration</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            I understand and confirm that the information provided across these forms is accurate, and I am
            authorised to request signatures on behalf of the business. By signing below, the director
            confirms agreement to the terms.
          </p>
        </div>

        {/* Active Form Signature Pad */}
        <div className="rounded-lg border border-border bg-surface-raised px-4 py-3">
          <h4 className="text-sm font-semibold text-ink mb-3">
            {formsList.find(f => f.slot === activeTab)?.label} Signature
          </h4>
          <OnboardingSignatureBlock
            key={activeTab}
            slot={activeTab}
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
            title={`${formsList.find(f => f.slot === activeTab)?.label} Signature`}
            showRemoteSigning={false}
            remoteEmailInitial={data.contact.email.trim()}
            betweenRemoteAndPad={
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className={lab}>Name</span>
                  <input
                    className={inp}
                    value={getSignatureForSlot(activeTab)?.name || ''}
                    onChange={(e) =>
                      setData((d) => withAuthorizedSignatoryNameAcrossForms(d, e.target.value))
                    }
                  />
                </label>
                <label>
                  <span className={lab}>Date</span>
                  <input
                    className={inp}
                    type="date"
                    value={getSignatureForSlot(activeTab)?.date || ''}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        signatures: {
                          ...d.signatures,
                          [activeTab]: { 
                            ...d.signatures[activeTab], 
                            date: e.target.value 
                          },
                        },
                      }))
                    }
                  />
                </label>
              </div>
            }
          />
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              const currentIndex = formsList.findIndex(f => f.slot === activeTab);
              if (currentIndex > 0) setActiveTab(formsList[currentIndex - 1].slot);
            }}
            disabled={formsList.findIndex(f => f.slot === activeTab) === 0}
            className="rounded-lg bg-surface-muted px-4 py-2 text-sm font-medium text-ink-soft transition hover:bg-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Previous Form
          </button>
          <button
            type="button"
            onClick={() => {
              const currentIndex = formsList.findIndex(f => f.slot === activeTab);
              if (currentIndex < formsList.length - 1) setActiveTab(formsList[currentIndex + 1].slot);
            }}
            disabled={formsList.findIndex(f => f.slot === activeTab) === formsList.length - 1}
            className="btn btn-primary btn-md font-medium disabled:cursor-not-allowed"
          >
            Next Form →
          </button>
        </div>

        {/* Completion Message */}
        {formsList.every(({ slot }) => hasStoredSignatureImage(signatureForSlot(data, slot))) && (
          <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/35 p-4 text-center">
            <p className="text-sm font-medium text-emerald-200">
              ✓ All forms signed! You can now proceed to the next step.
            </p>
          </div>
        )}
      </div>
    );
  }

  // Mode selection UI (when no mode is selected)
  return (
    <div className="space-y-4">
      <p className="mb-4 text-sm text-muted">
        Choose how the four onboarding forms will be signed.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setCaptureMode("in_person")}
          className="rounded-xl border-2 border-border bg-surface-raised p-4 text-left shadow-sm transition hover:border-brand hover:bg-brand/5"
        >
          <span className="block text-sm font-semibold text-ink">Director signing on this device</span>
          <span className="mt-2 block text-xs text-muted">
            Use the pad on each step (including this one). No DocuSeal emails. When all four forms have a saved
            signature, use Create customer below to finish registration.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setCaptureMode("remote_email")}
          className="rounded-xl border-2 border-border bg-surface-raised p-4 text-left shadow-sm transition hover:border-brand hover:bg-brand/5"
        >
          <span className="block text-sm font-semibold text-ink">Email all forms for signature</span>
          <span className="mt-2 block text-xs text-muted">
            One recipient receives four DocuSeal links (registration, 64-8, change of accountant, direct debit).
            After every link is completed and signatures are merged, use Create customer below to finish registration.
          </span>
        </button>
      </div>
    </div>
  );
}