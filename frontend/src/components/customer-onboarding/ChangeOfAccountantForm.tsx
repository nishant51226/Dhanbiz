import type { CustomerFormSubmission } from "../../types/api";
import type { CustomerOnboardingData } from "../../types/customerOnboarding";
import { withAuthorizedSignatoryNameAcrossForms } from "../../utils/syncAuthorizedSignatoryName";
import { DatePickerField } from "../DatePickerField";
import { inp, inpReadonly, lab, sec, secTitle } from "./fieldStyles";
import { OnboardingSignatureBlock } from "./OnboardingSignatureBlock";

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
};

export function ChangeOfAccountantForm({
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
}: Props) {
  const sig = data.signatures.change_accountant;
  const prev = data.change_of_accountant;
  const prevAddr = prev.previous_accountant_address;

  const patchPrevAddress = (partial: Partial<typeof prevAddr>) => {
    setData((d) => ({
      ...d,
      change_of_accountant: {
        ...d.change_of_accountant,
        previous_accountant_address: {
          ...d.change_of_accountant.previous_accountant_address,
          ...partial,
        },
      },
    }));
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Change of accountant letter: your trading name is taken from step 1. Enter the{" "}
        <strong className="font-medium text-ink">previous accountant&apos;s</strong> name and address
        (who receives the letter). Your registered address from step 1 is only used in the signatory block
        at the foot of the letter, not here.
      </p>

      <section className={sec}>
        <h3 className={secTitle}>Your company (from step 1)</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={lab}>Trading name (for letter footer)</span>
            <input className={inpReadonly} readOnly value={data.company.name} tabIndex={-1} />
          </label>
        </div>
      </section>

      <section className={sec}>
        <h3 className={secTitle}>Previous accountant (letter recipient)</h3>
        <p className="mb-3 text-xs text-muted">
          This is the firm or person you are leaving — not your business or trading address.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={lab}>Accountant / firm name</span>
            <input
              className={inp}
              value={prev.previous_accountant_name}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  change_of_accountant: {
                    ...d.change_of_accountant,
                    previous_accountant_name: e.target.value,
                  },
                }))
              }
              placeholder="e.g. ABC Accountants Ltd"
            />
          </label>
          <label className="sm:col-span-2">
            <span className={lab}>Address line 1</span>
            <input
              className={inp}
              value={prevAddr.line1}
              onChange={(e) => patchPrevAddress({ line1: e.target.value })}
              placeholder="Street and number"
            />
          </label>
          <label>
            <span className={lab}>City</span>
            <input className={inp} value={prevAddr.city} onChange={(e) => patchPrevAddress({ city: e.target.value })} />
          </label>
          <label>
            <span className={lab}>Postcode</span>
            <input
              className={inp}
              value={prevAddr.postcode}
              onChange={(e) => patchPrevAddress({ postcode: e.target.value })}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={lab}>Country</span>
            <input
              className={inp}
              value={prevAddr.country ?? ""}
              onChange={(e) => patchPrevAddress({ country: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section className={sec}>
        <h3 className={secTitle}>Letter and Signature</h3>
        <OnboardingSignatureBlock
          slot="change_accountant"
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
          title="Change of Accountant Signature"
          remoteEmailInitial={data.contact.email.trim()}
          betweenRemoteAndPad={
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label>
                <span className={lab}>Date</span>
                <DatePickerField
                  value={sig.date}
                  onChange={(date) =>
                    setData((d) => ({
                      ...d,
                      signatures: {
                        ...d.signatures,
                        change_accountant: { ...d.signatures.change_accountant, date },
                      },
                    }))
                  }
                  className={inp}
                  aria-label="Change of accountant signature date"
                />
              </label>
              <label className="sm:col-span-2">
                <span className={lab}>Authorised Signatory Name</span>
                <input
                  className={inp}
                  value={sig.name}
                  onChange={(e) =>
                    setData((d) => withAuthorizedSignatoryNameAcrossForms(d, e.target.value))
                  }
                />
              </label>
            </div>
          }
        />
      </section>
    </div>
  );
}
