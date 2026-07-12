import type { CustomerOnboardingData } from "./customerOnboarding";
import { htmlFieldDate } from "./onboarding-template-field-html.js";
import { signatureForPdfHtml } from "./onboarding-template-signature-html.js";

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

/**
 * Render the "Change of Accountants" letter as a self-contained HTML document.
 * Single page, formal business letter matching the branded template.
 */
function formatPreviousAccountantAddress(d: CustomerOnboardingData): string {
  const { line1, city, postcode, country } = d.change_of_accountant.previous_accountant_address;
  return [line1, city, postcode, country]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function effectiveTraderAddress(co: CustomerOnboardingData["company"]) {
  return co.traderSameAsRegistered === true ? co.registeredAddress : co.traderAddress;
}

function formatTraderAddressLine(co: CustomerOnboardingData["company"]): string {
  const trader = effectiveTraderAddress(co);
  return [trader.line1, trader.city, trader.postcode, trader.country]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function renderChangeAccountantHtml(data: CustomerOnboardingData): string {
  const sig = data.signatures.change_accountant;
  const co = data.company;
  const addr = co.registeredAddress;
  const traderAddressLine = formatTraderAddressLine(co);
  const showTradingAddress =
    co.traderSameAsRegistered !== true ||
    [co.traderAddress.line1, co.traderAddress.city, co.traderAddress.postcode, co.traderAddress.country]
      .map((s) => String(s ?? "").trim())
      .some(Boolean);
  const recipientName = data.change_of_accountant.previous_accountant_name;
  const recipientAddressLine = formatPreviousAccountantAddress(data);
  const agentAddr = "128 City Road, London";
  const agentPostcode = "EC1V 2NX";
  const sigTrim = sig.signature.trim();
  const signatureBlockHtml = sigTrim
    ? `<div style="margin-top:20px;margin-bottom:8px">
    <div style="font-size:11px;font-weight:700;margin-bottom:6px">Signature</div>
    ${signatureForPdfHtml(sig.signature, "max-height:64px;max-width:260px;object-fit:contain;vertical-align:middle")}
  </div>`
    : `<div style="margin-top:20px;margin-bottom:8px">
    <div style="font-size:11px;font-weight:700;margin-bottom:6px">Signature</div>
    <div class="sig-placeholder"><span class="sig-label">Signature</span></div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Change of Accountants</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Times New Roman', Times, Georgia, serif;
    font-size: 12px;
    color: #1a1a1a;
    background: #fff;
    line-height: 1.6;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 20mm 25mm;
    position: relative;
  }

  .confidential {
    font-weight: 700;
    font-size: 12px;
    margin-bottom: 20px;
  }

  .dotted-line {
    border-bottom: 1px dotted #666;
    min-height: 18px;
    margin-bottom: 4px;
    padding: 2px 0;
    font-size: 12px;
  }

  .date-line {
    margin-top: 16px;
    margin-bottom: 16px;
    font-size: 12px;
  }

  .salutation {
    margin-bottom: 16px;
    font-size: 12px;
  }

  .subject {
    font-weight: 700;
    font-size: 12px;
    margin-bottom: 16px;
  }

  .body-para {
    font-size: 12px;
    margin-bottom: 14px;
    text-align: justify;
    line-height: 1.6;
  }

  .closing {
    font-size: 12px;
    margin-bottom: 10px;
  }

  .sig-section {
    margin-top: 24px;
  }

  .sig-label {
    font-weight: 700;
    font-size: 12px;
    margin-bottom: 10px;
  }

  .sig-field-row {
    display: flex;
    align-items: baseline;
    margin-bottom: 6px;
    font-size: 12px;
  }

  .sig-field-label {
    width: 140px;
    flex-shrink: 0;
  }

  .sig-field-value {
    flex: 1;
    border-bottom: 1px dotted #666;
    min-height: 18px;
    padding: 2px 4px;
  }

  .sig-placeholder {
    margin-top: 4px;
    border: 1px dashed #666;
    border-radius: 2px;
    min-height: 64px;
    max-width: 280px;
    padding: 8px 10px;
    display: flex;
    align-items: flex-end;
    color: #64748b;
    font-size: 11px;
  }

  .sig-placeholder .sig-label {
    font-weight: 700;
    color: #64748b;
  }

  @media print {
    body { padding: 0; margin: 0; }
    .page { padding: 0; margin: 0; width: 100%; min-height: auto; }
    @page { size: A4 portrait; margin: 20mm 25mm; }
    .no-print { display: none !important; }
  }
  @media screen {
    body { background: #e2e8f0; padding: 12px; }
    .page { background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.15); border-radius: 4px; }
  }
</style>
</head>
<body>

<div class="page">
  <div class="confidential">Private &amp; confidential</div>

  <div class="dotted-line">${v(recipientName)}</div>
  <div class="dotted-line">${v(recipientAddressLine)}</div>
  <div class="dotted-line">&nbsp;</div>
  <div class="dotted-line">&nbsp;</div>

  <div class="date-line">Date : ${htmlFieldDate(sig.date)}</div>

  <div class="salutation">Dear Sir,</div>

  <div class="subject">Change of Accountants</div>

  <p class="body-para">
    I am writing to you to inform you that I have decided to move accountants to 3K
    Financial &amp; Accounting Services Ltd, ${esc(agentAddr)},
    ${esc(agentPostcode)}.
  </p>

  <p class="body-para">
    They will be in touch with you shortly to arrange the hand over. I would be grateful if
    you could provide him with your assistance in the transition.
  </p>

  <p class="body-para">
    I have had no client service issues to concern me but as you are aware the business
    has evolved substantially and I feel that my new accountants will be better placed to
    serve the future needs of the business.
  </p>

  <p class="body-para">
    I would like to take this opportunity to thank you and your staff for your attention over
    the years and I wish you well in the future.
  </p>

  <p class="closing">Kind regards,</p>
  <p class="closing">Yours sincerely</p>

  ${signatureBlockHtml}

  <div class="sig-section">
    <div class="sig-label">Authorised Signatory</div>

    <div class="sig-field-row">
      <span class="sig-field-label">Trading Name</span>
      <span class="sig-field-value">${v(co.name)}</span>
    </div>

    <div class="sig-field-row">
      <span class="sig-field-label">Registered Address</span>
      <span class="sig-field-value">${v(addr.line1)}</span>
    </div>

    <div class="sig-field-row">
      <span class="sig-field-label">&nbsp;</span>
      <span class="sig-field-value">${v(addr.city)}</span>
    </div>

    <div class="sig-field-row">
      <span class="sig-field-label">&nbsp;</span>
      <span class="sig-field-value">${v(addr.postcode)}</span>
    </div>

    ${
      showTradingAddress
        ? `<div class="sig-field-row">
      <span class="sig-field-label">Trading Address</span>
      <span class="sig-field-value">${v(traderAddressLine)}</span>
    </div>`
        : ""
    }
  </div>
</div>

<p style="margin:12px auto; font-size:9px; color:#94a3b8; text-align:center; max-width:210mm;" class="no-print">
  Use your browser's Print (Ctrl+P / Cmd+P) to save as PDF.
</p>
</body>
</html>`;
}
