import { HMRC_LOGO_IMG_URL } from "../constants";
import { ensurePracticeAgentBlock, ensureHmrcRefsFromStep1, showHmrcAgentCodes, type CustomerOnboardingData } from "../types/customerOnboarding";
import { htmlFieldDate } from "./onboardingTemplateFieldHtml";
import { signatureForPdfHtml } from "./onboardingTemplateSignatureHtml";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function v(s: string): string {
  const t = s.trim();
  return t ? esc(t) : "&nbsp;";
}

function refBoxes(value: string, count: number): string {
  const chars = value.replace(/\s/g, "").split("");
  return Array.from({ length: count }, (_, i) =>
    `<span class="ref-box">${chars[i] ? esc(chars[i]) : "&nbsp;"}</span>`,
  ).join("");
}

function cb(checked: boolean): string {
  return checked ? "&#x2713;" : "&nbsp;";
}

/** Split a single address string into up to three printed lines (matches the paper form). */
function splitAddressLines(address: string): [string, string, string] {
  const raw = address.trim();
  if (!raw) return ["", "", ""];
  const byNewline = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byNewline.length > 1) {
    return [byNewline[0] ?? "", byNewline[1] ?? "", byNewline.slice(2).join(", ")];
  }
  const byComma = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (byComma.length > 1) {
    return [byComma[0] ?? "", byComma.slice(1).join(", "), ""];
  }
  return [raw, "", ""];
}

/** Options for HMRC 64-8 HTML — pass a resolved data URL for reliable PDF export. */
export type Hmrc648HtmlRenderOptions = {
  /** Pre-resolved logo URL or data URL (preferred for blob preview and PDF export). */
  hmrcLogoSrc?: string;
  assetOrigin?: string;
};

function hmrcLogoAbsoluteSrc(opts?: Hmrc648HtmlRenderOptions): string {
  const explicit = opts?.hmrcLogoSrc?.trim();
  if (explicit) return explicit;
  return HMRC_LOGO_IMG_URL;
}

/**
 * Render the HMRC 64-8 "Authorising your agent" form as a self-contained
 * 3-page HTML document with dynamic data injected.
 */
export function renderHmrc648Html(
  data: CustomerOnboardingData,
  options?: Hmrc648HtmlRenderOptions,
): string {
  const d = ensureHmrcRefsFromStep1(ensurePracticeAgentBlock(data));
  const sig = d.signatures.hmrc_64_8;
  const auth = d.authorization;
  const agent = d.agent;
  const tax = d.tax;
  const co = d.company;
  const ho = d.hmrc_options;

  const saNi = ho.ref_self_assessment_ni_number;
  const saUtr = ho.ref_self_assessment_utr;
  const trustUtr = ho.ref_trust_utr;
  const individualPayeNi = ho.ref_individual_paye_ni_number;
  const ctUtr = ho.ref_corporation_tax_utr;
  const taxCreditsNi = ho.ref_tax_credits_ni_number;
  const cisPayeRef = ho.ref_cis_paye_ref;
  const employersPayeRef = ho.ref_employers_paye_ref;
  const cisGateway = ho.cis_government_gateway_id;
  const cisPayeAgentCode = ho.cis_paye_agent_id_code;
  const employersGateway = ho.employers_government_gateway_id;
  const employersPayeAgentCode = ho.employers_paye_agent_id_code;

  const hmrcLogoSrc = hmrcLogoAbsoluteSrc(options).replace(/"/g, "&quot;");

  const agentCodeRowsHtml = showHmrcAgentCodes(co.type)
    ? `<div class="field-row"><span class="field-label">Agent code (SA)</span><span class="field-value">${v(agent.agent_code_sa)}</span></div>
        <div class="field-row"><span class="field-label">Agent code (CT)</span><span class="field-value">${v(agent.agent_code_ct)}</span></div>`
    : "";

  const [agentAddr1, agentAddr2, agentAddr3] = splitAddressLines(agent.address);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>64-8 Authorising your agent</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    color: #1a1a1a;
    background: #fff;
    line-height: 1.45;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 10mm 12mm;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .page + .page { page-break-before: always; }

  /* ?? Header ???????????????????????????? */
  .hmrc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
  }
  .hmrc-logo {
    flex-shrink: 0;
    line-height: 0;
  }
  .hmrc-logo img {
    display: block;
    height: 38px;
    width: auto;
    max-width: 200px;
    object-fit: contain;
  }
  .hmrc-title {
    font-size: 20px;
    font-weight: 700;
    text-align: right;
  }

  /* ?? Two-column page 1 ???????????????? */
  .two-col { display: flex; gap: 14px; }
  .col-left { flex: 1; min-width: 0; }
  .col-right { flex: 1; min-width: 0; }

  /* ?? Sections ?????????????????????????? */
  .sec-box {
    border: 1px solid #a0aec0;
    margin-bottom: 8px;
  }
  .agent-details-box {
    padding: 4px 6px 6px;
  }
  .sec-title {
    background: #d5e8d4;
    padding: 4px 6px;
    font-weight: 700;
    font-size: 11px;
    border-bottom: 1px solid #a0aec0;
  }
  .sec-body { padding: 6px; }
  .sec-body p { margin-bottom: 5px; font-size: 9.5px; }
  .sec-body p:last-child { margin-bottom: 0; }

  /* ?? Form fields ??????????????????????? */
  .field-row {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    margin-bottom: 4px;
  }
  .field-label {
    font-weight: 600;
    font-size: 9.5px;
    width: 110px;
    flex-shrink: 0;
    padding-bottom: 2px;
  }
  .field-value {
    display: block;
    flex: 1;
    min-width: 0;
    border-bottom: 1px solid #a0aec0;
    padding: 0 4px 2px;
    font-size: 10px;
    line-height: 1.4;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .field-line {
    border-bottom: 1px solid #a0aec0;
    margin-bottom: 4px;
    padding: 0 4px 2px;
    font-size: 10px;
    line-height: 1.4;
  }
  .field-line--indented {
    margin-left: 114px;
  }

  /* Reference number boxes */
  .ref-row { display: flex; gap: 2px; margin: 3px 0 6px; }
  .ref-box {
    width: 20px;
    height: 22px;
    border: 1px solid #a0aec0;
    text-align: center;
    line-height: 22px;
    font-size: 12px;
    font-family: 'Courier New', monospace;
    background: #f7f9fb;
  }

  /* Checkboxes */
  .cb { font-size: 14px; vertical-align: middle; }
  .auth-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 6px;
  }
  .auth-label {
    font-weight: 700;
    font-size: 10.5px;
    min-width: 110px;
  }
  .auth-box {
    display: inline-block;
    box-sizing: border-box;
    vertical-align: middle;
    width: 20px;
    height: 20px;
    border: 1px solid #a0aec0;
    text-align: center;
    line-height: 20px;
    font-size: 14px;
    flex-shrink: 0;
    background: #f7f9fb;
  }
  .tick-here-block {
    margin-bottom: 4px;
  }
  .tick-here-text {
    font-size: 9px;
    margin: 0 0 2px;
    line-height: 1.45;
  }
  .tick-here-action {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    line-height: 1.45;
  }
  .tick-here-action--wrap {
    flex-wrap: wrap;
  }
  .auth-desc { font-size: 9px; flex: 1; }

  /* ?? Page 2 sections ??????????????????? */
  .p2-section { margin-bottom: 10px; }
  .p2-title {
    font-weight: 700;
    font-size: 11px;
    margin-bottom: 2px;
  }
  .p2-body { font-size: 9.5px; line-height: 1.45; }
  .p2-body p { margin-bottom: 4px; }
  .p2-two-col { display: flex; gap: 14px; }
  .p2-two-col > div { flex: 1; }

  /* ?? Page 3 notes ?????????????????????? */
  .notes-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
  .notes-h2 { font-size: 12px; font-weight: 700; margin: 10px 0 4px; }
  .notes-h3 { font-size: 10.5px; font-weight: 700; margin: 8px 0 3px; }
  .notes-p { font-size: 9.5px; margin-bottom: 4px; line-height: 1.45; }
  .notes-ul { font-size: 9.5px; margin: 0 0 4px 16px; line-height: 1.45; }
  .notes-table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin: 4px 0 8px; }
  .notes-table td, .notes-table th {
    border: 1px solid #a0aec0;
    padding: 3px 5px;
    text-align: left;
    vertical-align: top;
  }
  .notes-table th { background: #f0f4f8; font-weight: 600; }

  /* ?? Footer ???????????????????????????? */
  .page-footer {
    margin-top: auto;
    padding-top: 8px;
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: #666;
  }

  /* ?? Print ????????????????????????????? */
  @media print {
    body { padding: 0; margin: 0; }
    .page { padding: 0; margin: 0; width: 100%; min-height: auto; }
    .page + .page { page-break-before: always; }
    @page { size: A4 portrait; margin: 10mm; }
    .no-print { display: none !important; }
  }
  @media screen {
    body { background: #e2e8f0; padding: 12px; }
    .page { background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.15); border-radius: 4px; margin-bottom: 16px; }
  }
</style>
</head>
<body>

<!-- ??????????????????? PAGE 1 ??????????????????? -->
<div class="page">
  <div class="hmrc-header">
    <div class="hmrc-logo">
      <img src="${hmrcLogoSrc}" alt="HM Revenue and Customs" height="38"/>
    </div>
    <div class="hmrc-title">Authorising your agent</div>
  </div>

  <p style="font-size:9px; margin-bottom:4px;">This form was updated in March 2022.</p>

  <div class="two-col">
    <!-- LEFT COLUMN -->
    <div class="col-left">
      <p style="font-size:9px; margin-bottom:6px;">
        <strong>Read the Notes on page 3 before filling in this authority</strong><br/>
        If you do not have an agent but would like another person to
        communicate with HMRC on your behalf follow the guidance
        at www.gov.uk/appoint-tax-agent
      </p>
      <p style="font-size:9px; margin-bottom:6px;">
        This form overrides any earlier authority given to HMRC.
      </p>
      <p style="font-size:9px; margin-bottom:6px;">
        HMRC may contact you in the future to reauthorise your
        agent relationship to comply with the UK General Data
        Protection Regulation (UK GDPR). For more details on what
        your agent will have access to, follow the guidance at
        www.gov.uk/government/publications/tax-agents-and-advisers-authorising-your-agent-64-8
      </p>
      <p style="font-size:9px; margin-bottom:6px;">
        <strong>To change your agent or withdraw your consent</strong><br/>
        Follow the guidance at www.gov.uk/guidance/change-or-remove-your-tax-agents-authorisation
      </p>
      <p style="font-size:9px; margin-bottom:6px;">
        <strong>Multiple agents</strong><br/>
        If you have more than one agent (for example, one acting for
        the PAYE scheme and another for Corporation Tax) fill in one
        of these forms for each agent.
      </p>

      <!-- Client details -->
      <div class="sec-box">
        <div class="field-line"><strong>I</strong> <em>(print your name)</em>&nbsp;&nbsp;${v(sig.name)}</div>
        <div class="field-line"><strong>of</strong> <em>(name of business, company or trust if applicable)</em>&nbsp;&nbsp;${v(co.name)}</div>
        <div class="field-line" style="min-height:10px;">&nbsp;</div>
        <div class="field-line">authorise HMRC to disclose information to <strong>${v(agent.name)}</strong></div>
        <div class="field-line" style="min-height:10px;">&nbsp;</div>
      </div>

      <p style="font-size:9px; font-weight:700; margin-bottom:3px;">Give your personal details or company registered office here</p>
      <div class="sec-box">
        <div class="field-row"><span class="field-label">Address</span><span class="field-value">${v(data.company?.registeredAddress?.line1)}</span></div>
        <div class="field-line field-line--indented">${v(data.company?.registeredAddress?.city)}</div>
        <div class="field-line field-line--indented">${v(data.company?.registeredAddress?.country ?? "")}</div>
        <div class="field-row"><span class="field-label">Postcode</span><span class="field-value">${v(data.company.registeredAddress.postcode)}</span></div>
        <div class="field-row"><span class="field-label">Phone number</span><span class="field-value">${v(data.contact.phone)}</span></div>
      </div>

      <p style="font-size:9px; margin-bottom:3px;">
        I confirm that the nominated agent has agreed to act on my behalf, and
        the authorisation is correct and complete.<br/>
        This authorisation is limited to the matters indicated on this form.
      </p>
      <div class="sec-box">
        <div class="field-row"><span class="field-label">Signature</span><span class="field-value">${signatureForPdfHtml(
          sig.signature,
          "max-height:48px;max-width:200px;object-fit:contain;vertical-align:middle",
        )}</span></div>
        <div class="field-line">&nbsp;</div>
        <div class="field-row"><span class="field-label">Date</span><span class="field-value">${htmlFieldDate(sig.date)}</span></div>
      </div>

      <p style="font-size:9px; font-weight:700; margin-bottom:3px;">Give your agent's details here</p>
      <div class="sec-box agent-details-box">
        <div class="field-row"><span class="field-label">Address</span><span class="field-value">${v(agentAddr1)}</span></div>
        <div class="field-line field-line--indented">${agentAddr2 ? v(agentAddr2) : "&nbsp;"}</div>
        <div class="field-line field-line--indented">${agentAddr3 ? v(agentAddr3) : "&nbsp;"}</div>
        <div class="field-row"><span class="field-label">Post code</span><span class="field-value">${v(agent.postcode)}</span></div>
        <div class="field-row"><span class="field-label">Phone number</span><span class="field-value">${v(agent.phone)}</span></div>
        ${agentCodeRowsHtml}
        <div class="field-row"><span class="field-label">Client reference</span><span class="field-value">${v(agent.client_reference)}</span></div>
      </div>
    </div>

    <!-- RIGHT COLUMN -->
    <div class="col-right">
      <!-- Self Assessment -->
      <div class="sec-box">
        <div class="sec-body">
          <div class="auth-row">
            <span class="auth-label">Self Assessment</span>
            <span class="auth-box">${auth.self_assessment ? "&#x2713;" : "&nbsp;"}</span>
            <span class="auth-desc">
              If you tick this box you must give
              your National Insurance number
              (NINO) and/or your Unique Tax
              reference (UTR)
            </span>
          </div>
          <div class="auth-row">
            <span class="auth-label">Partnership</span>
            <span class="auth-box">${auth.partnership ? "&#x2713;" : "&nbsp;"}</span>
            <span class="auth-desc">
              If you tick this box you must give
              your Unique Tax reference (UTR)
            </span>
          </div>
        </div>
      </div>

      <p style="font-size:9px; margin-bottom:4px;">
        Your agent will have access to your Self Assessment and
        Partnership information such as your income, tax, national
        insurance, pension as well as your personal and financial
        information. For more information go to
        www.gov.uk/selfassessment
      </p>

      <p style="font-size:9.5px; font-weight:700; margin-bottom:2px;">National Insurance number</p>
      <div class="ref-row">${refBoxes(saNi, 9)}</div>

      <p style="font-size:9.5px; font-weight:700; margin-bottom:2px;">Unique Tax reference (UTR) if applicable</p>
      <div class="ref-row">${refBoxes(saUtr, 10)}</div>

      <div class="tick-here-action tick-here-action--wrap">
        <span>If UTR has not been issued yet tick here</span>
        <span class="auth-box">${cb(ho.utr_not_yet_issued)}</span>
      </div>

      <div class="tick-here-block">
        <p class="tick-here-text">
          If you're a Self Assessment taxpayer, we'll send your
          Statement of Account to you, but if you would like
          us to send it to your agent instead
        </p>
        <div class="tick-here-action">
          <span>tick here</span>
          <span class="auth-box">${cb(ho.send_statement_to_agent)}</span>
        </div>
      </div>
      <p style="font-size:9px; margin-bottom:8px;">Paying any amount due is your responsibility.</p>

      <!-- Trust -->
      <div class="sec-box">
        <div class="sec-body">
          <div class="auth-row">
            <span class="auth-label">Trust</span>
            <span class="auth-box">${auth.trust ? "&#x2713;" : "&nbsp;"}</span>
          </div>
          <p style="font-size:9px;">
            Your agent will have access to your personal and financial
            information for your trust. For more information go to
            www.gov.uk/trusts-taxes
          </p>
        </div>
      </div>

      <p style="font-size:9.5px; font-weight:700; margin-bottom:2px;">Unique Tax Reference (UTR) if applicable</p>
      <div class="ref-row">${refBoxes(trustUtr, 10)}</div>

      <!-- PAYE -->
      <div class="sec-box">
        <div class="sec-body">
          <p style="font-size:10px; font-weight:700; margin-bottom:3px;">Individual Pay As You Earn (PAYE)</p>
          <p style="font-size:9px;">
            Your agent will have access to your PAYE information
            such as your income, tax, national insurance, pension as
            well as your personal and financial information. For more
            information go to
            www.gov.uk/topic/personal-tax/income-tax
          </p>
        </div>
      </div>

      <p style="font-size:9.5px; font-weight:700; margin-bottom:2px;">National Insurance number</p>
      <div class="ref-row">${refBoxes(individualPayeNi, 9)}</div>
    </div>
  </div>

  <div class="page-footer">
    <span>64-8 Authorising your agent</span>
    <span>Page 1 of 3</span>
    <span>HMRC 03/22</span>
  </div>
</div>

<!-- ??????????????????? PAGE 2 ??????????????????? -->
<div class="page">
  <div class="p2-two-col">
    <!-- LEFT COLUMN -->
    <div>
      <!-- Corporation Tax -->
      <div class="sec-box">
        <div class="sec-body">
          <div class="auth-row">
            <span class="p2-title">Corporation Tax</span>
            <span class="auth-box">${cb(auth.corporation_tax)}</span>
          </div>
          <p style="font-size:9px;">
            Your agent will have access to your company and financial
            information and be able to update the company
            communication and contact details. For more information
            go to www.gov.uk/topic/business-tax/corporation-tax
          </p>
          <p style="font-size:9.5px; font-weight:700; margin-top:4px;">Company Registration number</p>
          <div class="ref-row">${refBoxes(co.number, 8)}</div>
          <p style="font-size:9.5px; font-weight:700;">Company's Unique Tax reference</p>
          <div class="ref-row">${refBoxes(ctUtr, 10)}</div>
        </div>
      </div>

      <!-- Tax credits -->
      <div class="sec-box">
        <div class="sec-body">
          <div class="auth-row">
            <span class="p2-title">Tax credits</span>
            <span class="auth-box">${cb(auth.tax_credits)}</span>
          </div>
          <p style="font-size:9px;">
            Your agent will have access to your personal and financial
            information relating to your Tax Credit claim. They
            can act on your behalf but cannot receive payments.
            Correspondence will still be sent to you. For joint tax credit
            claims we need both claimants to sign this authority for
            HMRC to deal with. For more information go to
            www.gov.uk/taxcredits
          </p>
          <p style="font-size:9.5px; font-weight:700; margin-top:4px;">National Insurance number</p>
          <div class="ref-row">${refBoxes(taxCreditsNi, 9)}</div>
          <p style="font-size:9px;">
            If you have a joint tax credit claim and the other claimant
            wants HMRC to deal with this agent, they must give
            their name and sign here
          </p>
          <p style="font-size:9.5px; font-weight:700;">Joint claimant's name</p>
          <div class="field-line">${v(ho.joint_claimant_name)}</div>
          <p style="font-size:9.5px; font-weight:700;">Joint claimant's National Insurance number</p>
          <div class="ref-row">${refBoxes(ho.joint_claimant_ni_number, 9)}</div>
          <p style="font-size:9.5px; font-weight:700;">Joint claimant's signature</p>
          <div class="field-line">&nbsp;</div>
        </div>
      </div>

      <!-- VAT -->
      <div class="sec-box">
        <div class="sec-body">
          <div class="auth-row">
            <span class="p2-title">VAT</span>
            <span class="auth-box">${auth.vat ? "&#x2713;" : "&nbsp;"}</span>
          </div>
          <p style="font-size:9px;">
            Please note if you have signed up for Making Tax Digital
            for VAT, this form cannot be used to authorise an agent to
            manage your Making Tax Digital services.
          </p>
          <p style="font-size:9px;">
            We'll continue to send correspondence to you rather than
            to your agent but we can deal with your agent in writing or
            by phone on specific matters.
          </p>
          <p style="font-size:9px;">
            If your agent wants to submit VAT returns online on your
            behalf, you'll need to authorise them through your business
            tax account or ask your agent to begin authorisation
            through their digital services. You may receive a letter
            containing a PIN which you'll need to pass to your agent to
            complete authorisation.
          </p>
          <p style="font-size:9px;">
            For more information go to
            www.gov.uk/topic/business-tax/vat
          </p>
          <p style="font-size:9.5px; font-weight:700; margin-top:4px;">VAT Registration number</p>
          <div class="ref-row">
            ${refBoxes(tax.vat_number, 9)}
            <span style="margin:0 4px; line-height:22px;">If not registered<br/>yet tick here</span>
            <span class="auth-box">${cb(ho.vat_not_registered)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT COLUMN -->
    <div>
      <!-- CIS -->
      <div class="sec-box">
        <div class="sec-body">
          <div class="auth-row">
            <span class="p2-title">Construction Industry Scheme (CIS)</span>
            <span class="auth-box">${cb(auth.cis)}</span>
          </div>
          <p style="font-size:9px;">
            Your agent will have access to your returns, subcontractors'
            income and deductions.
          </p>
          <p style="font-size:9px;">
            For more information go to
            www.gov.uk/what-is-the-construction-industry-scheme
          </p>
          <p style="font-size:9.5px; font-weight:700; margin-top:4px;">CIS Reference number</p>
          <div class="field-line">${v(tax.cis_reference)}</div>
          <p style="font-size:9.5px; font-weight:700;">PAYE Reference number</p>
          <div class="ref-row">${refBoxes(cisPayeRef, 12)}</div>
          <p style="font-size:9.5px; font-weight:700;">Agent Government Gateway identifier<br/><em style="font-weight:400">(required for online access)</em></p>
          <div class="field-line">${v(cisGateway)}</div>
          <p style="font-size:9.5px; font-weight:700;">PAYE Agent ID code</p>
          <div class="field-line">${v(cisPayeAgentCode)}</div>
          <p style="font-size:9px; margin-top:4px;">
            Please select below how you would like your agent to
            receive the information, you can tick more than one box.
          </p>
          <p style="font-size:9px;">
            I am a contractor in the CIS and authorise the agent
            named above to use the CIS online services to receive
            information over the internet from HMRC on my
            behalf and I have given my Agent Government
            Gateway ID and PAYE Agent code. &nbsp;<span class="auth-box">${cb(ho.cis_receive_online)}</span>
          </p>
          <p style="font-size:9px;">
            I am a contractor in the CIS and authorise the agent
            named above to receive information over the phone
            and in writing from HMRC. &nbsp;<span class="auth-box">${cb(ho.cis_receive_phone_writing)}</span>
          </p>
        </div>
      </div>

      <!-- Employers' PAYE -->
      <div class="sec-box">
        <div class="sec-body">
          <div class="auth-row">
            <span class="p2-title">Employers' PAYE</span>
            <span class="auth-box">${auth.paye ? "&#x2713;" : "&nbsp;"}</span>
          </div>
          <p style="font-size:9px;">
            Note: Only complete this section if you're an employer
            operating PAYE.
          </p>
          <p style="font-size:9px;">
            Your agent will have access to your employees' personal and
            financial information.
            For more information go to www.gov.uk/paye
          </p>
          <p style="font-size:9.5px; font-weight:700; margin-top:4px;">PAYE Reference number</p>
          <div class="ref-row">${refBoxes(employersPayeRef, 12)}</div>
          <p style="font-size:9.5px; font-weight:700;">Agent Government Gateway identifier<br/><em style="font-weight:400">(required for online access)</em></p>
          <div class="field-line">${v(employersGateway)}</div>
          <p style="font-size:9.5px; font-weight:700;">PAYE Agent ID code</p>
          <div class="field-line">${v(employersPayeAgentCode)}</div>
          <p style="font-size:9px; margin-top:4px;">
            Please select below how you would like your agent to
            receive the information, you can tick more than one box.
          </p>
          <p style="font-size:9px;">
            I authorise the agent named above to use PAYE online
            services to receive information over the internet from
            HMRC on my behalf and I have given my Agent
            Government Gateway ID and PAYE Agent ID code. &nbsp;<span class="auth-box">${cb(ho.paye_receive_online)}</span>
          </p>
          <p style="font-size:9px;">
            I authorise the agent named above to receive
            information over the phone and in writing from
            HMRC on my behalf. &nbsp;<span class="auth-box">${cb(ho.paye_receive_phone_writing)}</span>
          </p>
        </div>
      </div>
    </div>
  </div>

  <div class="page-footer">
    <span></span>
    <span>Page 2 of 3</span>
    <span></span>
  </div>
</div>

<!-- ??????????????????? PAGE 3 ??????????????????? -->
<div class="page">
  <div class="notes-title">Notes</div>

  <div class="p2-two-col">
    <div>
      <div class="notes-h2">How we use your information</div>
      <p class="notes-p">
        HMRC is committed to protecting the privacy and security of
        your personal information.
      </p>
      <p class="notes-p">This authorisation covers acts under:</p>
      <ul class="notes-ul">
        <li>UK General Data Protection Regulation (UK GDPR)</li>
        <li>Data Protection Act (DPA) 2018</li>
        <li>Commissioner's Revenue and Customs Act (CRCA) 2005</li>
      </ul>
      <p class="notes-p">For more information go to:</p>
      <ul class="notes-ul">
        <li>www.gov.uk/government/organisations/hm-revenue-customs/about/personal-information-charter</li>
        <li>IDG40120 - Sharing information outside of HMRC: legal obligations: lawful disclosure under section 18 CRCA
          www.gov.uk/hmrc-internal-manuals/information-disclosure-guide/idg40120</li>
      </ul>
      <p class="notes-p">
        This authority allows us to exchange, amend and disclose
        information about you with your agent and to deal with
        them on matters within the responsibility of HMRC, as
        specified on this form.
      </p>
      <p class="notes-p">
        HMRC is not responsible for how your agent uses or holds
        your information. You should contact your agent
        directly if you want more information.
      </p>

      <div class="notes-h2">Who should sign this form</div>
      <p class="notes-p">
        Please note the legal age for an individual to give consent is
        generally 13 years and above in England and Wales and 12
        years and above in Scotland.
      </p>
      <table class="notes-table">
        <thead><tr><th>If the authority is for</th><th>Who signs the form</th></tr></thead>
        <tbody>
          <tr><td>You, as an individual</td><td>You, for your personal tax affairs</td></tr>
          <tr><td>A company</td><td>The secretary or other responsible officer of the company</td></tr>
          <tr><td>A partnership</td><td>The partner responsible for the partnership's tax affairs. It applies only to the partnership. Individual partners need to sign a separate authority for their own tax affairs</td></tr>
          <tr><td>A trust</td><td>One or more of the trustees</td></tr>
        </tbody>
      </table>

      <div class="notes-h2">Agent Government Gateway identifier</div>
      <p class="notes-p">
        Agents can find their Agent Government Gateway identifier
        by logging on to HMRC online services for agents and
        selecting 'Authorise client' from the left hand menu.
        The identifier will appear on the next screen under the title
        'Agent identifier'.
      </p>

      <div class="notes-h2">Other Agent Authorisation options</div>
      <div class="notes-h3">Temporary basis</div>
      <p class="notes-p">
        Use form COMP1 to temporarily authorise an agent to act
        on your behalf if you're having a compliance check carried
        out. For more information go to www.gov.uk/tax-adviser-authorisation-for-compliance-checks
      </p>
    </div>

    <div>
      <div class="notes-h3">High Income Child Benefit Charge</div>
      <p class="notes-p">
        Use form CH995 to authorise an appointed tax adviser to
        deal with your High Income Child Benefit Charge affairs.
        For more information go to
        www.gov.uk/government/publications/child-benefit-authorise-a-tax-adviser-for-high-income-child-benefit-charge-matters-ch995
      </p>

      <div class="notes-h3">Tax credits and Child Benefit</div>
      <p class="notes-p">
        Use form TC689 to authorise someone to act for you for
        Tax Credit and Child Benefit matters. For more
        information go to
        www.gov.uk/government/publications/tax-credits-and-child-benefit-allow-someone-else-to-act-for-you-tc689
      </p>

      <div class="notes-h3">Digital Services</div>
      <p class="notes-p">
        You can also authorise your agent to act for you online using
        our digital services. For more information go to
        www.gov.uk/guidance/client-authorisation-an-overview
      </p>

      <div class="notes-h2">Where to send this form</div>
      <p class="notes-p">
        Only send pages 1 and 2 to HMRC, do not send page 3.
        Keep page 3 for your records.
      </p>
      <p class="notes-p">When you've completed pages 1 and 2 of this form please send them to:</p>
      <p class="notes-p">
        National Insurance Contributions and Employer Office<br/>
        HM Revenue and Customs<br/>
        BX9 1AN
      </p>
      <p class="notes-p">
        There are some exceptions to this to help speed the handling
        of your details in certain circumstances. If this form:
      </p>
      <ul class="notes-ul">
        <li>accompanies other correspondence, send it to the appropriate HMRC office</li>
        <li>is solely for Corporation Tax Affairs, send it to the HMRC office that deals with the company</li>
        <li>is for a High Net Worth customer, send it to the appropriate High Net Worth Unit</li>
        <li>accompanies a VAT Registration application, send it to the appropriate VAT Registration Unit</li>
        <li>has been specifically requested by an HMRC office, send it back to the office</li>
      </ul>
    </div>
  </div>

  <div class="page-footer">
    <span></span>
    <span>Page 3 of 3</span>
    <span></span>
  </div>
</div>

<p style="margin:12px auto; font-size:9px; color:#94a3b8; text-align:center; max-width:210mm;" class="no-print">
  Use your browser's Print (Ctrl+P / Cmd+P) to save as PDF.
</p>
</body>
</html>`;
}
