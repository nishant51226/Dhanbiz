import { type Dispatch, type SetStateAction } from "react";
import type { CustomerFormSubmission } from "../../types/api";
import type { CustomerOnboardingData } from "../../types/customerOnboarding";
import { withAuthorizedSignatoryNameAcrossForms } from "../../utils/syncAuthorizedSignatoryName";
import { DatePickerField } from "../DatePickerField";
import { inp, lab, sec, secTitle } from "./fieldStyles";
import { DigitBoxField, FormBoxField, FormStaticBox } from "./hmrcFormFields";
import { OnboardingSignatureBlock } from "./OnboardingSignatureBlock";

const DIRECT_DEBIT_SERVICE_USER_NUMBER = "275069";

const DIRECT_DEBIT_INSTRUCTION =
  "Please pay 3KFinancialAcco Direct Debits from the account detailed in this Instruction subject to the safeguards assured by the Direct Debit Guarantee. I understand that this instruction may remain with 3KFinancialAcco and, if so, details will be passed electronically to my bank/building society.";

type Props = {
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
};

export function DirectDebitForm({
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
  const sig = data.signatures.direct_debit;
  const bank = data.bank;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Direct Debit instruction — fields match the official form layout. Account number and sort code use digit boxes;
        other details use bordered fields like the PDF.
      </p>

      <section className={sec}>
        <h3 className={secTitle}>Instruction to your bank or building society</h3>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <FormBoxField
              label="Company name"
              value={data.company.name}
              onChange={(value) =>
                setData((d) => ({
                  ...d,
                  company: { ...d.company, name: value },
                }))
              }
            />
            <FormBoxField
              label="Name of account holder(s)"
              value={bank.account_holder_name}
              onChange={(value) =>
                setData((d) => ({
                  ...d,
                  bank: { ...d.bank, account_holder_name: value },
                }))
              }
            />
            <DigitBoxField
              label="Bank/Building Society account number"
              value={bank.account_number}
              onChange={(value) =>
                setData((d) => ({
                  ...d,
                  bank: { ...d.bank, account_number: value },
                }))
              }
              count={8}
            />
            <DigitBoxField
              label="Branch sort code"
              value={bank.sort_code}
              onChange={(value) =>
                setData((d) => ({
                  ...d,
                  bank: { ...d.bank, sort_code: value },
                }))
              }
              count={6}
            />
            <FormBoxField
              label="Name and full postal address of your Bank/Building Society"
              value={bank.bank_address}
              onChange={(value) =>
                setData((d) => ({
                  ...d,
                  bank: { ...d.bank, bank_address: value },
                }))
              }
              tall
            />
          </div>

          <div className="space-y-4">
            <DigitBoxField
              label="Service User Number"
              value={DIRECT_DEBIT_SERVICE_USER_NUMBER}
              onChange={() => {}}
              count={6}
              readOnly
            />
            <FormBoxField label="Reference" value={data.company.name} readOnly />
            <FormStaticBox title="Instruction to your Bank or Building Society">{DIRECT_DEBIT_INSTRUCTION}</FormStaticBox>
            <p className="text-[11px] italic text-muted">
              Banks and building societies may not accept Direct Debit Instructions for some types of account.
            </p>
          </div>
        </div>
      </section>

      <section className={sec}>
        <h3 className={secTitle}>Signature</h3>
        <OnboardingSignatureBlock
          slot="direct_debit"
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
          title="Direct Debit Signature"
          remoteEmailInitial={data.contact.email.trim()}
          betweenRemoteAndPad={
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormBoxField
                label="Name"
                value={sig.name}
                onChange={(value) => setData((d) => withAuthorizedSignatoryNameAcrossForms(d, value))}
              />
              <label className="block min-w-0">
                <span className={lab}>Date</span>
                <DatePickerField
                  value={sig.date}
                  onChange={(date) =>
                    setData((d) => ({
                      ...d,
                      signatures: {
                        ...d.signatures,
                        direct_debit: { ...d.signatures.direct_debit, date },
                      },
                    }))
                  }
                  className={inp}
                  aria-label="Direct debit signature date"
                />
              </label>
            </div>
          }
        />
      </section>

      <section className={sec}>
        <h3 className={secTitle}>The Direct Debit Guarantee</h3>
        <FormStaticBox>
          <ul className="list-disc space-y-2 pl-4">
            <li>This Guarantee is offered by all banks and building societies that accept instructions to pay Direct Debits.</li>
            <li>
              If there are any changes to the amount, date, or frequency of your Direct Debit 3KFinancialAcco will notify
              you 10 working days in advance of your account being debited or as otherwise agreed. If you request
              3KFinancialAcco to collect a payment, confirmation of the amount and date will be given to you at the time
              of the request.
            </li>
            <li>
              If an error is made in the payment of your Direct Debit, by 3KFinancialAcco or your bank or building
              society, you are entitled to a full and immediate refund of the amount paid from your bank or building
              society — if you receive a refund you are not entitled to, you must pay it back when 3KFinancialAcco asks
              you to.
            </li>
            <li>
              You can cancel a Direct Debit at any time by simply contacting your bank or building society. Written
              confirmation may be required. Please also notify 3KFinancialAcco.
            </li>
          </ul>
        </FormStaticBox>
      </section>
    </div>
  );
}
