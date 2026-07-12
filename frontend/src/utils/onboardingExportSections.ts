import type { CustomerOnboardingData } from "../types/customerOnboarding";
import {
  coerceOfficeNoted,
  labelForOfficeApprovalStatus,
  showCompaniesHouseAuthCode,
  showHmrcAgentCodes,
} from "../types/customerOnboarding";

export type OnboardingExportSection = {
  title: string;
  rows: { label: string; value: string }[];
};

function disp(s: string): string {
  const t = String(s ?? "").trim();
  return t.length > 0 ? t : "\u2014";
}

function yn(b: boolean): string {
  return b ? "Yes" : "No";
}

/** Readable line for signature fields (may be data URLs or long text). */
export function formatSignatureExportValue(s: string): string {
  const t = String(s ?? "").trim();
  if (!t) return "\u2014";
  if (t.startsWith("data:")) return "[Signature image provided]";
  if (/^file:[0-9a-f-]{36}$/i.test(t)) return "[Signature file on server]";
  if (t.length > 200) return `${t.slice(0, 200)}\u2026`;
  return t;
}

export function buildOnboardingExportSections(data: CustomerOnboardingData): OnboardingExportSection[] {
  const sections: OnboardingExportSection[] = [];

  sections.push({
    title: "Company",
    rows: [
      { label: "Company name", value: disp(data.company.name) },
      { label: "Company number", value: disp(data.company.number) },
      { label: "Business Type", value: disp(data.company.type) },
      { label: "Nature of business", value: disp(data.company.nature_of_business) },
      { label: "Year end", value: disp(data.company.year_end) },
      { label: "Registered address line 1", value: disp(data.company.registeredAddress.line1) },
      { label: "Registered city", value: disp(data.company.registeredAddress.city) },
      { label: "Registered postcode", value: disp(data.company.registeredAddress.postcode) },
      { label: "Registered country", value: disp(data.company.registeredAddress.country ?? "") },
      {
        label: "Trading same as registered",
        value:
          data.company.traderSameAsRegistered === true
            ? "Yes"
            : data.company.traderSameAsRegistered === false
              ? "No"
              : disp(""),
      },
      {
        label: "Trading address line 1",
        value: disp(
          (data.company.traderSameAsRegistered === true
            ? data.company.registeredAddress.line1
            : data.company.traderAddress.line1) ?? "",
        ),
      },
      {
        label: "Trading city",
        value: disp(
          (data.company.traderSameAsRegistered === true
            ? data.company.registeredAddress.city
            : data.company.traderAddress.city) ?? "",
        ),
      },
      {
        label: "Trading postcode",
        value: disp(
          (data.company.traderSameAsRegistered === true
            ? data.company.registeredAddress.postcode
            : data.company.traderAddress.postcode) ?? "",
        ),
      },
      {
        label: "Trading country",
        value: disp(
          (data.company.traderSameAsRegistered === true
            ? data.company.registeredAddress.country
            : data.company.traderAddress.country) ?? "",
        ),
      },
    ],
  });

  sections.push({
    title: "Contact",
    rows: [
      { label: "Phone", value: disp(data.contact.phone) },
      { label: "Email", value: disp(data.contact.email) },
    ],
  });

  data.directors.forEach((d, i) => {
    const peopleTitle = data.directors.length > 1 ? `Director ${i + 1}` : "Director";
    sections.push({
      title: peopleTitle,
      rows: [
        { label: "Name", value: disp(d.name) },
        { label: "Address", value: disp(d.address) },
        { label: "City", value: disp(d.city) },
        { label: "Postcode", value: disp(d.postcode) },
        { label: "UTR", value: disp(d.personal_utr) },
        { label: "NI Number", value: disp(d.ni_number) },
        { label: "DOB", value: disp(d.date_of_birth) },
        { label: "Identity verification code", value: disp(d.identity_verification_code) },
      ],
    });
  });

  sections.push({
    title: "Tax Information",
    rows: [
      { label: "UTR", value: disp(data.tax.utr) },
      ...(showCompaniesHouseAuthCode(data.company.type)
        ? [{ label: "Auth code", value: disp(data.tax.auth_code) }]
        : []),
      { label: "VAT number", value: disp(data.tax.vat_number) },
      { label: "VAT quarter", value: disp(data.tax.vat_quarter) },
      { label: "PAYE Office Ref", value: disp(data.tax.paye_ref) },
      { label: "PAYE Ref", value: disp(data.tax.ni_number) },
      { label: "CIS reference", value: disp(data.tax.cis_reference) },
    ],
  });

  const planLabel =
    (data.subscription_plan_name || "").trim() || (data.subscription_matrix_plan_name || "").trim();
  const quoteRaw = data.subscription_matrix_plan_price_inc_vat_gbp;
  const billingLc = String(data.subscription_billing_cycle ?? "").trim().toLowerCase();
  const cycleWord = billingLc === "yearly" ? "year" : "month";
  const quoteDisp =
    typeof quoteRaw === "number" && Number.isFinite(quoteRaw)
      ? `£${quoteRaw.toFixed(2)} inc. VAT per ${cycleWord}`
      : disp("");
  const turnoverRaw = data.annual_turnover_gbp;
  const turnoverDisp =
    typeof turnoverRaw === "number" && Number.isFinite(turnoverRaw)
      ? `£${turnoverRaw.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`
      : disp("");
  const billing = String(data.subscription_billing_cycle ?? "").trim() || disp("");
  const payee =
    data.subscription_payee_users === null || data.subscription_payee_users === undefined
      ? disp("")
      : String(data.subscription_payee_users);
  const dormant =
    data.subscription_is_dormant === true ? "Yes" : data.subscription_is_dormant === false ? "No" : disp("");
  const featureIds = Array.isArray(data.subscription_selected_service_ids)
    ? data.subscription_selected_service_ids.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const bySvcId = new Map(
    (data.subscription_selected_services ?? []).map((s) => [String(s.id).trim(), String(s.name ?? "").trim()]),
  );
  const selectedServiceLabels = featureIds.map((id) => {
    const nm = bySvcId.get(id);
    return nm && nm.length > 0 ? nm : id;
  });
  const selectedServicesDisp = selectedServiceLabels.length ? selectedServiceLabels.join(", ") : disp("");
  sections.push({
    title: "Subscription plan",
    rows: [
      { label: "Billing cycle", value: billing },
      { label: "Payees", value: payee },
      ...(featureIds.length ? [{ label: "Selected services", value: selectedServicesDisp }] : []),
      ...(String(data.subscription_billing_cycle ?? "").toLowerCase() === "yearly"
        ? [{ label: "Dormant (yearly)", value: dormant }]
        : []),
      { label: "Annual turnover (GBP)", value: turnoverDisp },
      { label: "Plan", value: planLabel ? planLabel : disp("") },
      { label: "Quoted amount (inc. VAT)", value: quoteDisp },
    ],
  });

  sections.push({
    title: "Agent (64-8)",
    rows: [
      { label: "Name", value: disp(data.agent.name) },
      { label: "Address", value: disp(data.agent.address) },
      { label: "Postcode", value: disp(data.agent.postcode) },
      { label: "Phone", value: disp(data.agent.phone) },
      ...(showHmrcAgentCodes(data.company.type)
        ? [
            { label: "Agent code (SA)", value: disp(data.agent.agent_code_sa) },
            { label: "Agent code (CT)", value: disp(data.agent.agent_code_ct) },
          ]
        : []),
      { label: "Client reference", value: disp(data.agent.client_reference) },
    ],
  });

  sections.push({
    title: "Bank details",
    rows: [
      { label: "Account holder", value: disp(data.bank.account_holder_name) },
      { label: "Account number", value: disp(data.bank.account_number) },
      { label: "Sort code", value: disp(data.bank.sort_code) },
      { label: "Bank address", value: disp(data.bank.bank_address) },
    ],
  });

  const paa = data.change_of_accountant.previous_accountant_address;
  sections.push({
    title: "Change of accountant \u2014 letter recipient",
    rows: [
      { label: "Previous accountant name", value: disp(data.change_of_accountant.previous_accountant_name) },
      { label: "Address line 1", value: disp(paa.line1) },
      { label: "City", value: disp(paa.city) },
      { label: "Postcode", value: disp(paa.postcode) },
      { label: "Country", value: disp(paa.country ?? "") },
    ],
  });

  const a = data.authorization;
  sections.push({
    title: "Tax authorisations",
    rows: [
      { label: "Self assessment", value: yn(a.self_assessment) },
      { label: "Partnership", value: yn(a.partnership) },
      { label: "Trust", value: yn(a.trust) },
      { label: "VAT", value: yn(a.vat) },
      { label: "PAYE", value: yn(a.paye) },
    ],
  });

  const ou = data.office_use;
  const pid = ou.director_photo_id;
  const apf = ou.address_proof;
  const oa = ou.online_access;
  const idRow = "Director photo ID";
  sections.push({
    title: "Office use",
    rows: [
      { label: `${idRow} \u2013 Passport`, value: yn(pid.passport) },
      { label: `${idRow} \u2013 Driving licence`, value: yn(pid.driving_license) },
      { label: "Address proof \u2013 Utility bill", value: yn(apf.utility_bill) },
      { label: "Address proof \u2013 Bank statement", value: yn(apf.bank_statement) },
      { label: "Online access \u2013 Companies House", value: yn(oa.companies_house) },
      { label: "Online access \u2013 HMRC", value: yn(oa.hmrc) },
      { label: "Online access \u2013 PAYE", value: yn(oa.paye) },
      { label: "Online access \u2013 VAT", value: yn(oa.vat) },
      { label: "Online access \u2013 Bank", value: yn(oa.bank) },
      { label: "Online access \u2013 Credit card", value: yn(oa.credit_card) },
      { label: "Online access \u2013 Other", value: yn(oa.other) },
      { label: "Notes", value: disp(coerceOfficeNoted(ou.noted)) },
      { label: "Internal remarks", value: disp(ou.internal_remarks) },
      { label: "Approval status", value: disp(labelForOfficeApprovalStatus(ou.approval_status)) },
    ],
  });

  const cr = data.signatures.client_registration;
  const h = data.signatures.hmrc_64_8;
  const ca = data.signatures.change_accountant;
  const dd = data.signatures.direct_debit;

  sections.push({
    title: "Signatures \u2013 Client registration",
    rows: [
      { label: "Name", value: disp(cr.name) },
      { label: "Position", value: disp(cr.position) },
      { label: "Date", value: disp(cr.date) },
      { label: "Signature", value: formatSignatureExportValue(cr.signature) },
    ],
  });

  sections.push({
    title: "Signatures \u2013 HMRC 64-8",
    rows: [
      { label: "Name", value: disp(h.name) },
      { label: "Date", value: disp(h.date) },
      { label: "Signature", value: formatSignatureExportValue(h.signature) },
    ],
  });

  sections.push({
    title: "Signatures \u2013 Change of accountant",
    rows: [
      { label: "Name", value: disp(ca.name) },
      { label: "Date", value: disp(ca.date) },
      { label: "Signature", value: formatSignatureExportValue(ca.signature) },
    ],
  });

  sections.push({
    title: "Signatures \u2013 Direct debit",
    rows: [
      { label: "Name", value: disp(dd.name) },
      { label: "Date", value: disp(dd.date) },
      { label: "Signature", value: formatSignatureExportValue(dd.signature) },
    ],
  });

  return sections;
}
