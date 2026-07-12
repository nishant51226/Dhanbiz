import type { CustomerOnboardingData } from "../types/customerOnboarding";
import {
  BUSINESS_TYPE_OPTIONS,
  coerceOfficeNoted,
  labelForOfficeApprovalStatus,
  showCompaniesHouseAuthCode,
  showHmrcAgentCodes,
} from "../types/customerOnboarding";
import { formatSignatureExportValue } from "./onboardingExportSections";

const EMPTY = "\u2014";

export type CheckboxLine = { label: string; checked: boolean };

export type AppendixSection = { title: string; rows: { label: string; value: string }[] };

export type ClientRegistrationFormModel = {
  companyName: string;
  directorName: string;
  natureOfBusiness: string;
  businessAddress: string;
  registeredCity: string;
  registeredCountry: string;
  postcode: string;
  tradingAddress: string;
  tradingCity: string;
  tradingPostcode: string;
  tradingCountry: string;
  phone: string;
  email: string;
  businessTypes: CheckboxLine[];
  companyReg: string;
  yearEnd: string;
  utr: string;
  authCode: string;
  vatNumber: string;
  vatQuarter: string;
  payeRef: string;
  niNumber: string;
  cisReference: string;
  /** Selected catalogue plan (step 1); shown on the registration PDF. */
  subscriptionPlanName: string;
  /** Plan UUID when known (second row on PDF when non-empty). */
  subscriptionPlanId: string;
  /** Matrix recommend `pricing.final` when stored on the submission (inc. VAT); empty if unknown. */
  subscriptionPlanQuotedAmountDisplay: string;
  subscriptionBillingCycle: string;
  subscriptionPayeeUsers: string;
  subscriptionIsDormant: string;
  annualTurnoverGbp: string;
  /** Office free-text notes (`office_use.noted` in JSON). */
  officeNotes: string;
  officeInternalRemarks: string;
  officeApprovalStatusLabel: string;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** First row only — matches the first row of the IDs table; extra directors appear in the appendix. */
function directorDisplay(data: CustomerOnboardingData): string {
  return (data.directors[0]?.name ?? "").trim();
}

function formatSubscriptionMatrixQuotedAmountDisplay(data: CustomerOnboardingData): string {
  const raw = data.subscription_matrix_plan_price_inc_vat_gbp;
  if (raw === null || raw === undefined) return "";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return "";
  const cycle = String(data.subscription_billing_cycle ?? "monthly").trim().toLowerCase();
  const cycleWord = cycle === "yearly" ? "year" : "month";
  return `£${n.toFixed(2)} inc. VAT per ${cycleWord}`;
}

function formatAnnualTurnoverGbp(data: CustomerOnboardingData): string {
  const raw = data.annual_turnover_gbp;
  if (raw === null || raw === undefined) return "";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return "";
  return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
}

function formatSubscriptionPayeeUsers(data: CustomerOnboardingData): string {
  const v = data.subscription_payee_users;
  if (v === null || v === undefined) return "";
  return String(v);
}

function formatSubscriptionIsDormant(data: CustomerOnboardingData): string {
  if (data.subscription_is_dormant === true) return "Yes";
  if (data.subscription_is_dormant === false) return "No";
  return "";
}

export function buildClientRegistrationFormModel(data: CustomerOnboardingData): ClientRegistrationFormModel {
  const selectedType = norm(data.company.type);
  const businessTypes: CheckboxLine[] = BUSINESS_TYPE_OPTIONS.map((opt) => ({
    label: opt,
    checked: selectedType === norm(opt),
  }));

  const planName =
    (data.subscription_plan_name ?? "").trim() || (data.subscription_matrix_plan_name ?? "").trim();
  const planId =
    (data.subscription_plan_id ?? "").trim() || (data.subscription_matrix_plan_id ?? "").trim();
  const subscriptionPlanName = planName || planId;
  const billingCycle = String(data.subscription_billing_cycle ?? "").trim();
  const trader = data.company.traderAddress;

  return {
    companyName: data.company.name.trim(),
    directorName: directorDisplay(data),
    natureOfBusiness: data.company.nature_of_business.trim(),
    businessAddress: data.company.registeredAddress.line1.trim(),
    registeredCity: data.company.registeredAddress.city.trim(),
    registeredCountry: (data.company.registeredAddress.country ?? "").trim(),
    postcode: data.company.registeredAddress.postcode.trim(),
    tradingAddress: trader.line1.trim(),
    tradingCity: trader.city.trim(),
    tradingPostcode: trader.postcode.trim(),
    tradingCountry: (trader.country ?? "").trim(),
    phone: data.contact.phone.trim(),
    email: data.contact.email.trim(),
    businessTypes,
    companyReg: data.company.number.trim(),
    yearEnd: data.company.year_end.trim(),
    utr: data.tax.utr.trim(),
    authCode: data.tax.auth_code.trim(),
    vatNumber: data.tax.vat_number.trim(),
    vatQuarter: data.tax.vat_quarter.trim(),
    payeRef: data.tax.paye_ref.trim(),
    niNumber: data.tax.ni_number.trim(),
    cisReference: data.tax.cis_reference.trim(),
    subscriptionPlanName,
    subscriptionPlanId: planId,
    subscriptionPlanQuotedAmountDisplay: formatSubscriptionMatrixQuotedAmountDisplay(data),
    subscriptionBillingCycle: billingCycle,
    subscriptionPayeeUsers: formatSubscriptionPayeeUsers(data),
    subscriptionIsDormant:
      billingCycle.toLowerCase() === "yearly" ? formatSubscriptionIsDormant(data) : "",
    annualTurnoverGbp: formatAnnualTurnoverGbp(data),
    officeNotes: coerceOfficeNoted(data.office_use.noted).trim(),
    officeInternalRemarks: data.office_use.internal_remarks.trim(),
    officeApprovalStatusLabel: labelForOfficeApprovalStatus(data.office_use.approval_status),
  };
}

export function buildAppendixSections(data: CustomerOnboardingData): AppendixSection[] {
  const sections: AppendixSection[] = [];

  const ni = data.tax.ni_number.trim();
  const cis = data.tax.cis_reference.trim();
  const showAuthCode = showCompaniesHouseAuthCode(data.company.type);
  const authCode = showAuthCode ? data.tax.auth_code.trim() : "";
  if (ni || cis || authCode) {
    sections.push({
      title: "Additional tax references",
      rows: [
        ...(showAuthCode ? [{ label: "Auth code", value: authCode || EMPTY }] : []),
        { label: "PAYE Ref", value: ni || EMPTY },
        { label: "CIS reference", value: cis || EMPTY },
      ],
    });
  }

  if (data.directors.length > 1) {
    sections.push({
      title: "Additional directors",
      rows: data.directors.slice(1).flatMap((d, i) => [
        { label: `Director ${i + 2} - name`, value: d.name.trim() || EMPTY },
        { label: `Director ${i + 2} - address`, value: d.address.trim() || EMPTY },
        { label: `Director ${i + 2} - city`, value: d.city.trim() || EMPTY },
        { label: `Director ${i + 2} - postcode`, value: d.postcode.trim() || EMPTY },
        { label: `Director ${i + 2} - UTR`, value: d.personal_utr.trim() || EMPTY },
        { label: `Director ${i + 2} - NI Number`, value: d.ni_number.trim() || EMPTY },
        { label: `Director ${i + 2} - DOB`, value: d.date_of_birth.trim() || EMPTY },
        {
          label: `Director ${i + 2} - identity verification code`,
          value: d.identity_verification_code.trim() || EMPTY,
        },
      ]),
    });
  }

  sections.push({
    title: "Agent (64-8)",
    rows: [
      { label: "Name", value: data.agent.name.trim() || EMPTY },
      { label: "Address", value: data.agent.address.trim() || EMPTY },
      { label: "Postcode", value: data.agent.postcode.trim() || EMPTY },
      { label: "Phone", value: data.agent.phone.trim() || EMPTY },
      ...(showHmrcAgentCodes(data.company.type)
        ? [
            { label: "Agent code (SA)", value: data.agent.agent_code_sa.trim() || EMPTY },
            { label: "Agent code (CT)", value: data.agent.agent_code_ct.trim() || EMPTY },
          ]
        : []),
      { label: "Client reference", value: data.agent.client_reference.trim() || EMPTY },
    ],
  });

  sections.push({
    title: "Bank details",
    rows: [
      { label: "Account holder", value: data.bank.account_holder_name.trim() || EMPTY },
      { label: "Account number", value: data.bank.account_number.trim() || EMPTY },
      { label: "Sort code", value: data.bank.sort_code.trim() || EMPTY },
      { label: "Bank address", value: data.bank.bank_address.trim() || EMPTY },
    ],
  });

  const paa = data.change_of_accountant.previous_accountant_address;
  sections.push({
    title: "Change of accountant - letter recipient",
    rows: [
      { label: "Previous accountant name", value: data.change_of_accountant.previous_accountant_name.trim() || EMPTY },
      { label: "Address line 1", value: paa.line1.trim() || EMPTY },
      { label: "City", value: paa.city.trim() || EMPTY },
      { label: "Postcode", value: paa.postcode.trim() || EMPTY },
      { label: "Country", value: (paa.country ?? "").trim() || EMPTY },
    ],
  });

  const a = data.authorization;
  sections.push({
    title: "Tax authorisations",
    rows: [
      { label: "Self assessment", value: a.self_assessment ? "Yes" : "No" },
      { label: "Partnership", value: a.partnership ? "Yes" : "No" },
      { label: "Trust", value: a.trust ? "Yes" : "No" },
      { label: "VAT", value: a.vat ? "Yes" : "No" },
      { label: "PAYE", value: a.paye ? "Yes" : "No" },
    ],
  });

  const cr = data.signatures.client_registration;
  const h = data.signatures.hmrc_64_8;
  const ca = data.signatures.change_accountant;
  const dd = data.signatures.direct_debit;

  sections.push({
    title: "Signatures - Client registration",
    rows: [
      { label: "Name", value: cr.name.trim() || EMPTY },
      { label: "Position", value: cr.position.trim() || EMPTY },
      { label: "Date", value: cr.date.trim() || EMPTY },
      { label: "Signature", value: formatSignatureExportValue(cr.signature) },
    ],
  });
  sections.push({
    title: "Signatures - HMRC 64-8",
    rows: [
      { label: "Name", value: h.name.trim() || EMPTY },
      { label: "Date", value: h.date.trim() || EMPTY },
      { label: "Signature", value: formatSignatureExportValue(h.signature) },
    ],
  });
  sections.push({
    title: "Signatures - Change of accountant",
    rows: [
      { label: "Name", value: ca.name.trim() || EMPTY },
      { label: "Date", value: ca.date.trim() || EMPTY },
      { label: "Signature", value: formatSignatureExportValue(ca.signature) },
    ],
  });
  sections.push({
    title: "Signatures - Direct debit",
    rows: [
      { label: "Name", value: dd.name.trim() || EMPTY },
      { label: "Date", value: dd.date.trim() || EMPTY },
      { label: "Signature", value: formatSignatureExportValue(dd.signature) },
    ],
  });

  return sections;
}

export function checkboxToken(checked: boolean): string {
  return checked ? "[X]" : "[ ]";
}
