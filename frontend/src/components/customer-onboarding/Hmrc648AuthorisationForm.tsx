import { useEffect } from "react";
import type { CustomerFormSubmission } from "../../types/api";
import type { CustomerOnboardingData } from "../../types/customerOnboarding";
import {
  DEFAULT_PRACTICE_CIS_REFERENCE,
  ensurePracticeAgentBlock,
  ensureHmrcRefsFromStep1,
  showHmrcAgentCodes,
} from "../../types/customerOnboarding";
import { withAuthorizedSignatoryNameAcrossForms } from "../../utils/syncAuthorizedSignatoryName";
import { DatePickerField } from "../DatePickerField";
import { inp, inpReadonly, lab, sec, secTitle } from "./fieldStyles";
import { AuthBoxRow, HmrcSecBox, InlineTickRow, RefBoxField } from "./hmrcFormFields";
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

type HmrcRefStringKey = {
  [K in keyof CustomerOnboardingData["hmrc_options"]]: CustomerOnboardingData["hmrc_options"][K] extends string
    ? K
    : never;
}[keyof CustomerOnboardingData["hmrc_options"]];

function formatRegisteredAddress(d: CustomerOnboardingData): string {
  const { line1, city, postcode } = d.company?.registeredAddress ?? {};
  const parts = [line1, city, postcode].filter(Boolean);
  return parts.join(", ");
}

export function Hmrc648AuthorisationForm({
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
  const sig = data.signatures.hmrc_64_8;
  const auth = data.authorization;
  const ho = data.hmrc_options;
  const tax = data.tax;

  useEffect(() => {
    setData((d) => {
      let cur = ensurePracticeAgentBlock(d);
      cur = ensureHmrcRefsFromStep1(cur);
      if (!String(cur.tax.cis_reference ?? "").trim()) {
        cur = { ...cur, tax: { ...cur.tax, cis_reference: DEFAULT_PRACTICE_CIS_REFERENCE } };
      }
      return cur === d ? d : cur;
    });
  }, [
    setData,
    data.company.name,
    data.company.type,
    data.tax.utr,
    data.tax.vat_number,
    data.directors[0]?.ni_number,
    data.directors[0]?.personal_utr,
    data.agent.name,
    data.agent.address,
    data.agent.postcode,
    data.agent.phone,
    data.agent.agent_code_sa,
    data.agent.agent_code_ct,
    data.agent.client_reference,
  ]);

  const setAuth = (key: keyof typeof auth, checked: boolean) => {
    setData((d) => ({
      ...d,
      authorization: { ...d.authorization, [key]: checked },
    }));
  };

  const setOption = (key: keyof typeof ho, checked: boolean) => {
    setData((d) => ({
      ...d,
      hmrc_options: { ...d.hmrc_options, [key]: checked },
    }));
  };

  const setHmrcRef = (key: HmrcRefStringKey, value: string) => {
    setData((d) => ({
      ...d,
      hmrc_options: { ...d.hmrc_options, [key]: value },
    }));
  };

  const setTax = (key: keyof typeof tax, value: string) => {
    setData((d) => ({ ...d, tax: { ...d.tax, [key]: value } }));
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        HMRC 64-8. Company and agent defaults come from step 1. Tax references use character boxes; authorisations use
        tick boxes like the official form.
      </p>

      <section className={sec}>
        <h3 className={secTitle}>Company (auto-filled)</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={lab}>Company name</span>
            <input className={inpReadonly} readOnly value={data.company.name} tabIndex={-1} />
          </label>
          <label className="sm:col-span-2">
            <span className={lab}>Registered address</span>
            <input className={inpReadonly} readOnly value={formatRegisteredAddress(data)} tabIndex={-1} />
          </label>
        </div>
      </section>

      <section className={sec} aria-labelledby="hmrc-agent-details-heading">
        <h3 id="hmrc-agent-details-heading" className={secTitle}>
          Agent details
        </h3>
        <p className="mt-1 text-xs text-muted">
          Practice defaults are read-only. Enter the client reference and online access fields used on the form.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={lab}>Agent name</span>
            <input className={inpReadonly} readOnly tabIndex={-1} value={data.agent.name} />
          </label>
          <label className="sm:col-span-2">
            <span className={lab}>Address</span>
            <input className={inpReadonly} readOnly tabIndex={-1} value={data.agent.address} />
          </label>
          <label>
            <span className={lab}>Post code</span>
            <input className={inpReadonly} readOnly tabIndex={-1} value={data.agent.postcode} />
          </label>
          <label>
            <span className={lab}>Phone number</span>
            <input className={inpReadonly} readOnly tabIndex={-1} type="tel" value={data.agent.phone} />
          </label>
          {showHmrcAgentCodes(data.company.type) ? (
            <>
              <label>
                <span className={lab}>Agent code (SA)</span>
                <input className={inpReadonly} readOnly tabIndex={-1} value={data.agent.agent_code_sa} />
              </label>
              <label>
                <span className={lab}>Agent code (CT)</span>
                <input className={inpReadonly} readOnly tabIndex={-1} value={data.agent.agent_code_ct} />
              </label>
            </>
          ) : null}
          <label className="sm:col-span-2">
            <span className={lab}>Client reference</span>
            <input
              className={inp}
              value={data.agent.client_reference}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  agent: { ...d.agent, client_reference: e.target.value },
                }))
              }
              placeholder="Enter HMRC reference"
              autoComplete="off"
            />
          </label>
        </div>
      </section>

      <section className={sec}>
        <h3 className={secTitle}>Tax authorisation</h3>
        <p className="mt-1 text-xs text-muted">Tick each tax area you want to authorise, then complete the reference boxes.</p>
        <div className="mt-4 space-y-4">
          <HmrcSecBox title="Self Assessment & Partnership">
            <AuthBoxRow
              label="Self Assessment"
              checked={auth.self_assessment}
              onChange={(checked) => setAuth("self_assessment", checked)}
              description="If you tick this box you must give your National Insurance number (NINO) and/or your Unique Tax reference (UTR)."
            />
            <AuthBoxRow
              label="Partnership"
              checked={auth.partnership}
              onChange={(checked) => setAuth("partnership", checked)}
              description="If you tick this box you must give your Unique Tax reference (UTR)."
            />
            <RefBoxField
              fieldId="hmrc.sa.ni"
              label="National Insurance number"
              value={ho.ref_self_assessment_ni_number}
              onChange={(value) => setHmrcRef("ref_self_assessment_ni_number", value)}
              count={9}
            />
            <RefBoxField
              fieldId="hmrc.sa.utr"
              label="Unique Tax reference (UTR)"
              value={ho.ref_self_assessment_utr}
              onChange={(value) => setHmrcRef("ref_self_assessment_utr", value)}
              count={10}
            />
            <InlineTickRow
              checked={ho.utr_not_yet_issued}
              onChange={(checked) => setOption("utr_not_yet_issued", checked)}
              ariaLabel="UTR not yet issued"
            >
              If UTR has not been issued yet tick here
            </InlineTickRow>
            <InlineTickRow
              checked={ho.send_statement_to_agent}
              onChange={(checked) => setOption("send_statement_to_agent", checked)}
              ariaLabel="Send Statement of Account to agent"
            >
              If you would like us to send your Statement of Account to your agent instead, tick here. Paying any amount
              due is your responsibility.
            </InlineTickRow>
          </HmrcSecBox>

          <HmrcSecBox title="Trust">
            <AuthBoxRow label="Trust" checked={auth.trust} onChange={(checked) => setAuth("trust", checked)} />
            <p className="text-xs text-muted">
              Your agent will have access to your personal and financial information for your trust.
            </p>
            <RefBoxField
              fieldId="hmrc.trust.utr"
              label="Unique Tax reference (UTR)"
              value={ho.ref_trust_utr}
              onChange={(value) => setHmrcRef("ref_trust_utr", value)}
              count={10}
            />
            <RefBoxField
              fieldId="hmrc.individual_paye.ni"
              label="Individual PAYE — National Insurance number"
              value={ho.ref_individual_paye_ni_number}
              onChange={(value) => setHmrcRef("ref_individual_paye_ni_number", value)}
              count={9}
            />
          </HmrcSecBox>

          <HmrcSecBox title="Corporation Tax">
            <AuthBoxRow
              label="Corporation Tax"
              checked={auth.corporation_tax}
              onChange={(checked) => setAuth("corporation_tax", checked)}
              description="Your agent will have access to your company and financial information."
            />
            <RefBoxField
              fieldId="hmrc.ct.company_number"
              label="Company Registration number"
              value={data.company.number}
              onChange={() => {}}
              count={8}
              readOnly
            />
            <RefBoxField
              fieldId="hmrc.ct.utr"
              label="Company Unique Tax reference"
              value={ho.ref_corporation_tax_utr}
              onChange={(value) => setHmrcRef("ref_corporation_tax_utr", value)}
              count={10}
            />
          </HmrcSecBox>

          <HmrcSecBox title="Tax credits">
            <AuthBoxRow label="Tax credits" checked={auth.tax_credits} onChange={(checked) => setAuth("tax_credits", checked)} />
            <RefBoxField
              fieldId="hmrc.tax_credits.ni"
              label="National Insurance number"
              value={ho.ref_tax_credits_ni_number}
              onChange={(value) => setHmrcRef("ref_tax_credits_ni_number", value)}
              count={9}
            />
            <label className="block">
              <span className={lab}>Joint claimant name</span>
              <input
                className={inp}
                value={ho.joint_claimant_name}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    hmrc_options: { ...d.hmrc_options, joint_claimant_name: e.target.value },
                  }))
                }
              />
            </label>
            <RefBoxField
              fieldId="hmrc.tax_credits.joint_ni"
              label="Joint claimant National Insurance number"
              value={ho.joint_claimant_ni_number}
              onChange={(value) =>
                setData((d) => ({
                  ...d,
                  hmrc_options: { ...d.hmrc_options, joint_claimant_ni_number: value },
                }))
              }
              count={9}
            />
          </HmrcSecBox>

          <HmrcSecBox title="VAT">
            <AuthBoxRow label="VAT" checked={auth.vat} onChange={(checked) => setAuth("vat", checked)} />
            <RefBoxField
              fieldId="hmrc.vat.number"
              label="VAT Registration number"
              value={tax.vat_number}
              onChange={(value) => setTax("vat_number", value)}
              count={9}
            />
            <InlineTickRow
              checked={ho.vat_not_registered}
              onChange={(checked) => setOption("vat_not_registered", checked)}
              ariaLabel="VAT not registered yet"
            >
              If not registered yet tick here
            </InlineTickRow>
          </HmrcSecBox>

          <HmrcSecBox title="Construction Industry Scheme (CIS)">
            <AuthBoxRow label="CIS" checked={auth.cis} onChange={(checked) => setAuth("cis", checked)} />
            <label className="block">
              <span className={lab}>CIS Reference number</span>
              <input className={inpReadonly} readOnly tabIndex={-1} value={tax.cis_reference} />
            </label>
            <RefBoxField
              fieldId="hmrc.cis.paye_ref"
              label="PAYE Reference number"
              value={ho.ref_cis_paye_ref}
              onChange={(value) => setHmrcRef("ref_cis_paye_ref", value)}
              count={12}
            />
            <label className="block">
              <span className={lab}>Agent Government Gateway identifier</span>
              <input
                className={inp}
                value={ho.cis_government_gateway_id}
                onChange={(e) => setHmrcRef("cis_government_gateway_id", e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className={lab}>PAYE Agent ID code</span>
              <input
                className={inp}
                value={ho.cis_paye_agent_id_code}
                onChange={(e) => setHmrcRef("cis_paye_agent_id_code", e.target.value)}
                autoComplete="off"
              />
            </label>
            <InlineTickRow
              checked={ho.cis_receive_online}
              onChange={(checked) => setOption("cis_receive_online", checked)}
              ariaLabel="CIS receive information online"
            >
              I authorise the agent to use CIS online services to receive information from HMRC (Government Gateway ID and
              PAYE Agent code required).
            </InlineTickRow>
            <InlineTickRow
              checked={ho.cis_receive_phone_writing}
              onChange={(checked) => setOption("cis_receive_phone_writing", checked)}
              ariaLabel="CIS receive information by phone or in writing"
            >
              I authorise the agent to receive CIS information by phone and in writing.
            </InlineTickRow>
          </HmrcSecBox>

          <HmrcSecBox title="Employers' PAYE">
            <AuthBoxRow label="Employers' PAYE" checked={auth.paye} onChange={(checked) => setAuth("paye", checked)} />
            <RefBoxField
              fieldId="hmrc.employers_paye.paye_ref"
              label="PAYE Reference number"
              value={ho.ref_employers_paye_ref}
              onChange={(value) => setHmrcRef("ref_employers_paye_ref", value)}
              count={12}
            />
            <label className="block">
              <span className={lab}>Agent Government Gateway identifier</span>
              <input
                className={inp}
                value={ho.employers_government_gateway_id}
                onChange={(e) => setHmrcRef("employers_government_gateway_id", e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className={lab}>PAYE Agent ID code</span>
              <input
                className={inp}
                value={ho.employers_paye_agent_id_code}
                onChange={(e) => setHmrcRef("employers_paye_agent_id_code", e.target.value)}
                autoComplete="off"
              />
            </label>
            <InlineTickRow
              checked={ho.paye_receive_online}
              onChange={(checked) => setOption("paye_receive_online", checked)}
              ariaLabel="PAYE receive information online"
            >
              I authorise the agent to use PAYE online services (Government Gateway ID and PAYE Agent ID code required).
            </InlineTickRow>
            <InlineTickRow
              checked={ho.paye_receive_phone_writing}
              onChange={(checked) => setOption("paye_receive_phone_writing", checked)}
              ariaLabel="PAYE receive information by phone or in writing"
            >
              I authorise the agent to receive PAYE information by phone and in writing.
            </InlineTickRow>
          </HmrcSecBox>
        </div>
      </section>

      <section className={sec}>
        <h3 className={secTitle}>Signature</h3>
        <OnboardingSignatureBlock
          slot="hmrc_64_8"
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
          title="HMRC 64-8 Signature"
          remoteEmailInitial={data.contact.email.trim()}
          betweenRemoteAndPad={
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label>
                <span className={lab}>Name</span>
                <input
                  className={inp}
                  value={sig.name}
                  onChange={(e) => setData((d) => withAuthorizedSignatoryNameAcrossForms(d, e.target.value))}
                />
              </label>
              <label>
                <span className={lab}>Date</span>
                <DatePickerField
                  value={sig.date}
                  onChange={(date) =>
                    setData((d) => ({
                      ...d,
                      signatures: {
                        ...d.signatures,
                        hmrc_64_8: { ...d.signatures.hmrc_64_8, date },
                      },
                    }))
                  }
                  className={inp}
                  aria-label="HMRC 64-8 signature date"
                />
              </label>
            </div>
          }
        />
      </section>
    </div>
  );
}
