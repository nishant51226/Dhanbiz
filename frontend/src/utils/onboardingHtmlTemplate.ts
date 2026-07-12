import { BRAND_LOGO_URL } from "../constants";
import {
  type CustomerOnboardingData,
  MAX_DIRECTORS,
  showCompaniesHouseAuthCode,
} from "../types/customerOnboarding";
import { buildClientRegistrationFormModel } from "./onboardingExportFormModel";
import { signatureForPdfHtml } from "./onboardingTemplateSignatureHtml";
import { htmlFieldDate } from "./onboardingTemplateFieldHtml";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cb(checked: boolean): string {
  return checked ? "&#x2611;" : "&#x2610;";
}

function v(s: string): string {
  const t = s.trim();
  return t ? esc(t) : "&nbsp;";
}

/** Step 1 optional filters: user-ticked catalogue services (not plan matrix). */
function subscriptionSelectedServicesRowHtml(data: CustomerOnboardingData): string {
  const ids = (data.subscription_selected_service_ids ?? [])
    .map((x) => String(x).trim())
    .filter(Boolean);
  const byId = new Map(
    (data.subscription_selected_services ?? []).map((s) => [
      String(s.id ?? "").trim(),
      String(s.name ?? "").trim(),
    ]),
  );
  const labels: string[] = [];
  for (const id of ids) {
    const nm = byId.get(id);
    labels.push(nm && nm.length > 0 ? nm : id);
  }
  const inner =
    labels.length > 0
      ? `<div class="svc-stack">${labels
          .map(
            (label) =>
              `<div class="svc-line"><span class="svc-cb" aria-hidden="true">${cb(true)}</span><span class="svc-label">${esc(label)}</span></div>`,
          )
          .join("")}</div>`
      : v("");
  return `<tr>
        <td class="lbl">Services :</td>
        <td class="val svc-cell">${inner}</td>
      </tr>`;
}

type DirectorRowFields = Pick<
  CustomerOnboardingData["directors"][number],
  | "name"
  | "address"
  | "city"
  | "postcode"
  | "personal_utr"
  | "ni_number"
  | "date_of_birth"
  | "identity_verification_code"
>;

function directorCityPostcodeCell(d: DirectorRowFields): string {
  const c = d.city.trim();
  const p = d.postcode.trim();
  return v(`${c}${c && p ? ", " : ""}${p}`);
}

/**
 * Always renders exactly `MAX_DIRECTORS` rows (5).
 * Filled rows come from `directors` (in order, capped at the max); the rest are blank for layout.
 */
function buildDirectorTableRowsHtml(directors: CustomerOnboardingData["directors"]): string {
  const filled: DirectorRowFields[] = directors
    .slice(0, MAX_DIRECTORS)
    .map((d) => ({
      name: d.name ?? "",
      address: d.address ?? "",
      city: d.city ?? "",
      postcode: d.postcode ?? "",
      personal_utr: d.personal_utr ?? "",
      ni_number: d.ni_number ?? "",
      date_of_birth: d.date_of_birth ?? "",
      identity_verification_code: d.identity_verification_code ?? "",
    }));
  const padCount = Math.max(0, MAX_DIRECTORS - filled.length);
  const blanks: DirectorRowFields[] = Array.from({ length: padCount }, () => ({
    name: "",
    address: "",
    city: "",
    postcode: "",
    personal_utr: "",
    ni_number: "",
    date_of_birth: "",
    identity_verification_code: "",
  }));
  const rows: DirectorRowFields[] = [...filled, ...blanks];
  return rows
    .map((d, i) => {
      const n = i + 1;
      return `<tr>
        <td>${n}</td>
        <td>${v(d.name ?? "")}</td>
        <td>${v(d.address ?? "")}</td>
        <td>${directorCityPostcodeCell(d)}</td>
        <td>${v(d.personal_utr ?? "")}</td>
        <td>${v(d.ni_number ?? "")}</td>
        <td>${htmlFieldDate(d.date_of_birth ?? "")}</td>
        <td>${v(d.identity_verification_code ?? "")}</td>
      </tr>`;
    })
    .join("\n      ");
}

export type RegistrationHtmlOptions = {
  /**
   * Page origin (e.g. https://app.example.com). Used when {@link logoSrc} is not set.
   */
  assetOrigin?: string;
  /** Pre-resolved logo URL or data URL (preferred for blob previews and PDF export). */
  logoSrc?: string;
};

function publicBrandLogoPath(): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  const file = BRAND_LOGO_URL.replace(/^\//, "");
  return `${normalized}${file}`;
}

function brandLogoAbsoluteSrc(opts?: RegistrationHtmlOptions): string {
  const explicit = opts?.logoSrc?.trim();
  if (explicit) return explicit;
  const path = publicBrandLogoPath();
  const origin = opts?.assetOrigin?.replace(/\/$/, "");
  if (origin) return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Build a self-contained HTML document that replicates the Client Registration Form
 * exactly as it appears in the branded PDF template.
 */
export function renderRegistrationHtml(
  data: CustomerOnboardingData,
  opts?: RegistrationHtmlOptions,
): string {
  const logoSrc = esc(brandLogoAbsoluteSrc(opts));
  const m = buildClientRegistrationFormModel(data);
  const primaryPeopleRowLabel = "Director/Proprietor Name :";
  const officePhotoIdLabel = "Director Photo ID :";
  const directorsTableFootnote = `<strong>Directors/Secretory/Sole Trader/Proprietor IDs</strong>&nbsp;&nbsp;<em style="font-size:9px">(Use a separate sheet for additional director ID verification if required)</em>`;

  const businessTypeItems = m.businessTypes
    .map((bt) => `<span class="cb-item">${esc(bt.label)}&nbsp;${cb(bt.checked)}</span>`)
    .join("&nbsp;&nbsp;&nbsp;");

  const sigCr = data.signatures.client_registration;
  const sigTrim = sigCr.signature.trim();
  const signatureBlockHtml = sigTrim
    ? `<div style="margin-top:10px"><span class="sig-label">Signature</span><br/>${signatureForPdfHtml(sigTrim, "max-height:56px;max-width:220px;object-fit:contain")}</div>`
    : `<div class="sig-placeholder"><span class="sig-label">Signature</span></div>`;

  const authCodeRowHtml = showCompaniesHouseAuthCode(data.company.type)
    ? `<tr>
        <td class="lbl">Auth code :</td>
        <td class="val" colspan="3">${v(m.authCode)}</td>
      </tr>`
    : "";

  const subscriptionDormantRowHtml =
    m.subscriptionBillingCycle.trim().toLowerCase() === "yearly"
      ? `<tr>
        <td class="lbl">Dormant (yearly) :</td>
        <td class="val" colspan="3">${v(m.subscriptionIsDormant)}</td>
      </tr>`
      : "";

  const showTradingSection = data.company.traderSameAsRegistered !== true;
  const tradingAddressSectionHtml = showTradingSection
    ? `  <div class="section-hdr">Trading Address</div>
  <table class="form-tbl">
    <colgroup>
      <col style="width:22%"/>
      <col style="width:28%"/>
      <col style="width:18%"/>
      <col style="width:32%"/>
    </colgroup>
    <tbody>
      <tr>
        <td class="lbl">Address Line 1 :</td>
        <td class="val" colspan="3">${v(m.tradingAddress)}</td>
      </tr>
      <tr>
        <td class="lbl">City :</td>
        <td class="val">${v(m.tradingCity)}</td>
        <td class="lbl">Post Code :</td>
        <td class="val">${v(m.tradingPostcode)}</td>
      </tr>
      <tr>
        <td class="lbl">Country :</td>
        <td class="val" colspan="3">${v(m.tradingCountry)}</td>
      </tr>
    </tbody>
  </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Client Registration Form</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5px;
    color: #1a1a1a;
    background: #fff;
    padding: 0;
    margin: 0;
  }

  /* Natural height only: a fixed min-height of one A4 often makes html2pdf.js
     overshoot by a few pixels and emit an almost-blank second page. */
  .registration-export-root {
    width: 210mm;
    margin: 0 auto;
  }

  .page {
    width: 210mm;
    margin: 0 auto;
    padding: 12mm 10mm 10mm;
  }

  .page + .page {
    page-break-before: always;
    break-before: page;
  }

  /* ?? Header ?????????????????????????????? */
  .header {
    background: #0c2636;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-radius: 3px 3px 0 0;
  }
  .logo-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-logo-img {
    display: block;
    height: 72px;
    width: auto;
    max-width: 220px;
    object-fit: contain;
  }
  .header h1 {
    font-size: 20px;
    font-weight: 600;
    color: #c5a44e;
    margin: 0;
    letter-spacing: 0.5px;
  }

  /* ?? Section headers ????????????????????? */
  .section-hdr {
    background: #dbeafe;
    border: 1px solid #7b8fa3;
    border-bottom: none;
    padding: 5px 8px;
    font-size: 13px;
    font-weight: 700;
    color: #1e3a5f;
    margin-top: 8px;
  }
  .section-hdr:first-of-type { margin-top: 6px; }

  /* ?? Tables ?????????????????????????????? */
  table.form-tbl {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  table.form-tbl td {
    border: 1px solid #7b8fa3;
    padding: 4px 6px;
    font-size: 10.5px;
    vertical-align: middle;
    height: 22px;
  }
  td.lbl {
    font-weight: 600;
    color: #1a1a1a;
    background: #f0f4f8;
    white-space: nowrap;
  }
  td.val {
    color: #1a1a1a;
  }

  /* Office use page: writable areas for notes / remarks / approval */
  .page-office {
    box-sizing: border-box;
  }
  .page-office table.form-tbl.office-detail tr.notes-row td,
  .page-office table.form-tbl.office-detail tr.remarks-row td,
  .page-office table.form-tbl.office-detail tr.approval-row td {
    height: 45mm !important;
  }
  .page-office table.form-tbl.office-detail td.lbl {
    vertical-align: top;
    padding-top: 10px;
  }
  .page-office table.form-tbl.office-detail td.office-tall-val,
  .page-office table.form-tbl.office-detail tr.approval-row td.val {
    vertical-align: top;
    padding: 10px 12px;
    white-space: pre-wrap;
    font-size: 11px;
    line-height: 1.4;
  }

  /* checkbox row */
  .cb-item { white-space: nowrap; }

  /* Subscription plan — selected services (wrap inside page width) */
  table.form-tbl td.val.svc-cell {
    white-space: normal;
    vertical-align: top;
    height: auto;
    min-height: 22px;
    padding-top: 5px;
    padding-bottom: 5px;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .svc-stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .svc-line {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    line-height: 1.35;
  }
  .svc-cb {
    flex-shrink: 0;
    white-space: nowrap;
    line-height: 1.2;
  }
  .svc-label {
    flex: 1;
    min-width: 0;
    white-space: normal;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }

  /* ?? Directors table ????????????????????? */
  table.dir-tbl {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  table.dir-tbl th {
    border: 1px solid #7b8fa3;
    background: #f0f4f8;
    padding: 4px 6px;
    font-size: 10px;
    font-weight: 600;
    text-align: left;
  }
  table.dir-tbl td {
    border: 1px solid #7b8fa3;
    padding: 4px 6px;
    font-size: 9px;
    height: 22px;
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  table.dir-tbl th {
    font-size: 9px;
  }
  table.dir-tbl td:first-child { width: 24px; text-align: center; }

  /* ?? Declaration ????????????????????????? */
  .decl-box {
    border: 1px solid #7b8fa3;
    padding: 10px 10px 14px;
    font-size: 10px;
    line-height: 1.55;
    color: #1a1a1a;
  }
  .decl-box p { margin-bottom: 6px; }
  .sig-line {
    display: flex;
    gap: 20px;
    margin-top: 12px;
  }
  .sig-field {
    flex: 1;
    border-bottom: 1px dotted #666;
    padding-bottom: 2px;
    min-height: 16px;
    font-size: 10px;
  }
  .sig-label { font-weight: 600; }
  .sig-placeholder {
    margin-top: 10px;
    border: 1px dashed #7b8fa3;
    border-radius: 2px;
    min-height: 52px;
    max-width: 280px;
    padding: 8px 10px 10px;
    display: flex;
    align-items: flex-end;
    color: #64748b;
    font-size: 10px;
  }
  .sig-placeholder .sig-label { color: #64748b; font-weight: 600; }
  .note-italic {
    margin-top: 10px;
    font-style: italic;
    font-weight: 700;
    font-size: 9px;
  }

  /* ?? Print ??????????????????????????????? */
  @media print {
    body { padding: 0; margin: 0; }
    .registration-export-root { display: block; width: 100%; }
    .page { padding: 0; margin: 0; width: 100%; min-height: auto; }
    .page-office { min-height: auto; }
    @page { size: A4 portrait; margin: 10mm; }
    .no-print { display: none !important; }
  }
  @media screen {
    body { background: #e2e8f0; padding: 12px; }
    .registration-export-root { display: flex; flex-direction: column; gap: 16px; }
    .page { background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.15); border-radius: 4px; }
  }
</style>
</head>
<body>
<div class="registration-export-root">
<div class="page">

  <!-- ? HEADER -->
  <div class="header">
    <div class="logo-wrap">
      <img
        class="brand-logo-img"
        src="${logoSrc}"
        alt="3K Financial &amp; Accounting Services Ltd"
        width="220"
        height="72"
      />
    </div>
    <h1>Client Registration Form</h1>
  </div>

  <!-- ? COMPANY INFORMATION -->
  <div class="section-hdr">Company Information</div>
  <table class="form-tbl">
    <colgroup>
      <col style="width:22%"/>
      <col style="width:28%"/>
      <col style="width:18%"/>
      <col style="width:32%"/>
    </colgroup>
    <tbody>
      <tr>
        <td class="lbl">Company Name :</td>
        <td class="val" colspan="3">${v(m.companyName)}</td>
      </tr>
      <tr>
        <td class="lbl">${primaryPeopleRowLabel}</td>
        <td class="val" colspan="3">${v(m.directorName)}</td>
      </tr>
      <tr>
        <td class="lbl">Nature of Business :</td>
        <td class="val" colspan="3">${v(m.natureOfBusiness)}</td>
      </tr>
      <tr>
        <td class="lbl">Business Type :</td>
        <td class="val" colspan="3">${businessTypeItems}</td>
      </tr>
      <tr>
        <td class="lbl">Company Registration No. :</td>
        <td class="val">${v(m.companyReg)}</td>
        <td class="lbl">Year End :</td>
        <td class="val">${v(m.yearEnd)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-hdr">Registered Address</div>
  <table class="form-tbl">
    <colgroup>
      <col style="width:22%"/>
      <col style="width:28%"/>
      <col style="width:18%"/>
      <col style="width:32%"/>
    </colgroup>
    <tbody>
      <tr>
        <td class="lbl">Address Line 1 :</td>
        <td class="val" colspan="3">${v(m.businessAddress)}</td>
      </tr>
      <tr>
        <td class="lbl">City :</td>
        <td class="val">${v(m.registeredCity)}</td>
        <td class="lbl">Post Code :</td>
        <td class="val">${v(m.postcode)}</td>
      </tr>
      <tr>
        <td class="lbl">Country :</td>
        <td class="val" colspan="3">${v(m.registeredCountry)}</td>
      </tr>
    </tbody>
  </table>

${tradingAddressSectionHtml}

  <div class="section-hdr">Contact</div>
  <table class="form-tbl">
    <colgroup>
      <col style="width:22%"/>
      <col style="width:28%"/>
      <col style="width:18%"/>
      <col style="width:32%"/>
    </colgroup>
    <tbody>
      <tr>
        <td class="lbl">Phone :</td>
        <td class="val">${v(m.phone)}</td>
        <td class="lbl">Email :</td>
        <td class="val">${v(m.email)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-hdr">Tax Information</div>
  <table class="form-tbl">
    <colgroup>
      <col style="width:22%"/>
      <col style="width:28%"/>
      <col style="width:18%"/>
      <col style="width:32%"/>
    </colgroup>
    <tbody>
      <tr>
        <td class="lbl">UTR :</td>
        <td class="val">${v(m.utr)}</td>
        <td class="lbl">VAT Number :</td>
        <td class="val">${v(m.vatNumber)}</td>
      </tr>
      <tr>
        <td class="lbl">VAT Quarter :</td>
        <td class="val">${v(m.vatQuarter)}</td>
        <td class="lbl">PAYE Office Ref :</td>
        <td class="val">${v(m.payeRef)}</td>
      </tr>
      <tr>
        <td class="lbl">PAYE Ref :</td>
        <td class="val">${v(m.niNumber)}</td>
        <td class="lbl">CIS Reference :</td>
        <td class="val">${v(m.cisReference)}</td>
      </tr>
      ${authCodeRowHtml}
    </tbody>
  </table>

  <!-- Subscription plan (replaces legacy services / payroll block on step 1) -->
  <div class="section-hdr">Subscription Plan</div>
  <table class="form-tbl">
    <colgroup>
      <col style="width:22%"/>
      <col style="width:78%"/>
    </colgroup>
    <tbody>
      <tr>
        <td class="lbl">Plan :</td>
        <td class="val">${v(m.subscriptionPlanName)}</td>
      </tr>
      <tr>
        <td class="lbl">Quoted amount :</td>
        <td class="val">${v(m.subscriptionPlanQuotedAmountDisplay)}</td>
      </tr>
      <tr>
        <td class="lbl">Billing cycle :</td>
        <td class="val">${v(m.subscriptionBillingCycle)}</td>
      </tr>
      <tr>
        <td class="lbl">Payee users :</td>
        <td class="val">${v(m.subscriptionPayeeUsers)}</td>
      </tr>
      ${subscriptionDormantRowHtml}
      <tr>
        <td class="lbl">Annual turnover :</td>
        <td class="val">${v(m.annualTurnoverGbp)}</td>
      </tr>
      ${subscriptionSelectedServicesRowHtml(data)}
    </tbody>
  </table>

</div><!-- page 1: company through subscription -->

<div class="page">

  <table class="form-tbl" style="margin-top:8px">
    <tbody>
      <tr>
        <td class="val" colspan="4" style="font-size:10px; padding:4px 6px;">
          ${directorsTableFootnote}
        </td>
      </tr>
    </tbody>
  </table>
  <table class="dir-tbl">
    <thead>
      <tr>
        <th style="width:24px">&nbsp;</th>
        <th>Name</th>
        <th>Home Address</th>
        <th style="width:14%">City &amp; Post Code</th>
        <th style="width:10%">UTR</th>
        <th style="width:10%">NI Number</th>
        <th style="width:10%">DOB</th>
        <th style="width:12%">ID verification code</th>
      </tr>
    </thead>
    <tbody>
      ${buildDirectorTableRowsHtml(data.directors)}
    </tbody>
  </table>

  <!-- ? DECLARATION -->
  <div class="section-hdr">Declaration</div>
  <div class="decl-box">
    <p>
      I understand and confirm that I have agreed to the terms and conditions of 3K Ltd and have provided all the above
      information accurately and instructed to act for us.
    </p>
    <p>
      At 3K Ltd, we value our client's privacy and we will not share your information with any 3rd party. The information
      collected in this form will be used to setup a client profile and will help us to serve you better.
    </p>

    <div class="sig-line">
      <div class="sig-field"><span class="sig-label">Authorized Signatory</span>&nbsp;&nbsp;${v(sigCr.name.trim())}</div>
      <div class="sig-field"><span class="sig-label">Position</span>&nbsp;&nbsp;${v(sigCr.position.trim())}</div>
    </div>
    <div class="sig-line">
      <div class="sig-field"><span class="sig-label">Name</span>&nbsp;&nbsp;${v(sigCr.name.trim())}</div>
      <div class="sig-field"><span class="sig-label">Date</span>&nbsp;&nbsp;${htmlFieldDate(sigCr.date)}</div>
    </div>
    ${signatureBlockHtml}

    <p class="note-italic">*TO BE SIGNED BY DIRECTOR'S OR PROPRIETOR ONLY, SIGNATORY PROOF OF I.D. REQUIRED</p>
  </div>

</div><!-- page 2: directors + declaration -->

<div class="page page-office">

  <div class="section-hdr">For 3K Ltd - Office Use Only</div>
  <table class="form-tbl">
    <tbody>
      <tr>
        <td class="lbl" style="width:22%">${officePhotoIdLabel}</td>
        <td class="val">Passport&nbsp;${cb(data.office_use.director_photo_id.passport)}&nbsp;&nbsp;&nbsp;Driving License&nbsp;${cb(data.office_use.director_photo_id.driving_license)}</td>
        <td class="lbl" style="width:18%">Address Proof :</td>
        <td class="val">Utility Bill&nbsp;${cb(data.office_use.address_proof.utility_bill)}&nbsp;&nbsp;&nbsp;Bank Statement&nbsp;${cb(data.office_use.address_proof.bank_statement)}</td>
      </tr>
      <tr>
        <td class="lbl">Online Access :</td>
        <td class="val" colspan="3">
          Company House&nbsp;${cb(data.office_use.online_access.companies_house)}&nbsp;&nbsp;
          HMRC&nbsp;${cb(data.office_use.online_access.hmrc)}&nbsp;&nbsp;
          PAYE&nbsp;${cb(data.office_use.online_access.paye)}&nbsp;&nbsp;
          VAT&nbsp;${cb(data.office_use.online_access.vat)}&nbsp;&nbsp;
          Bank&nbsp;${cb(data.office_use.online_access.bank)}&nbsp;&nbsp;
          Credit Card&nbsp;${cb(data.office_use.online_access.credit_card)}&nbsp;&nbsp;
          Other&nbsp;${cb(data.office_use.online_access.other)}
        </td>
      </tr>
    </tbody>
  </table>
  <table class="form-tbl office-detail" style="margin-top:6px">
    <tbody>
      <tr class="notes-row">
        <td class="lbl" style="width:22%">Notes :</td>
        <td class="val office-tall-val" colspan="3">${v(m.officeNotes)}</td>
      </tr>
      <tr class="remarks-row">
        <td class="lbl">Internal remarks :</td>
        <td class="val office-tall-val" colspan="3">${v(m.officeInternalRemarks)}</td>
      </tr>
      <tr class="approval-row">
        <td class="lbl">Approval status :</td>
        <td class="val" colspan="3">${v(m.officeApprovalStatusLabel)}</td>
      </tr>
    </tbody>
  </table>

</div><!-- page 2: office use only -->

</div><!-- /registration-export-root -->

<p style="margin:12px auto; font-size:9px; color:#94a3b8; text-align:center; max-width:210mm;" class="no-print">
  Use your browser's Print (Ctrl+P / Cmd+P) to save as PDF.
</p>
</body>
</html>`;
}
