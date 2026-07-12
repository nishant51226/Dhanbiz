import type { CustomerOnboardingData } from "./customerOnboarding";
import { getDirectDebitLogoDataUrl } from "./onboarding-template-image-src";
import { DIRECT_DEBIT_LOGO_URL } from "./pdf-constants";
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

function digitBoxes(value: string, count: number): string {
  const chars = value.replace(/\s/g, "").split("");
  return Array.from({ length: count }, (_, i) =>
    `<span class="digit-box">${chars[i] ? esc(chars[i]) : "&nbsp;"}</span>`,
  ).join("");
}

export type DirectDebitHtmlRenderOptions = {
  directDebitLogoSrc?: string;
  assetOrigin?: string;
};

function directDebitLogoAbsoluteSrc(opts?: DirectDebitHtmlRenderOptions): string {
  const explicit = opts?.directDebitLogoSrc?.trim();
  if (explicit) return explicit;
  const embedded = getDirectDebitLogoDataUrl();
  if (embedded.startsWith("data:")) return embedded;
  const path = DIRECT_DEBIT_LOGO_URL;
  const origin = opts?.assetOrigin?.replace(/\/$/, "");
  if (origin) return `${origin}${path}`;
  return path;
}

/**
 * Render the Direct Debit instruction form as a self-contained HTML document
 * matching the branded 3K Financial template.
 */
export function renderDirectDebitHtml(
  data: CustomerOnboardingData,
  options?: DirectDebitHtmlRenderOptions,
): string {
  const bank = data.bank;
  const co = data.company;
  const sig = data.signatures.direct_debit;
  const serviceUserNumber = "275069";
  const directDebitLogoSrc = esc(directDebitLogoAbsoluteSrc(options));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Direct Debit Instruction</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    background: #fff;
    line-height: 1.45;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 14mm 16mm;
    position: relative;
  }

  /* ?? Header ?????????????????????????? */
  .dd-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 18px;
  }
  .dd-company {
    flex: 1;
  }
  .dd-company-name {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .dd-company-addr {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.4;
  }
  .dd-right-header {
    flex: 1;
    text-align: right;
  }
  .dd-logo-img {
    height: 48px;
    width: auto;
  }
  .dd-instruction-title {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.3;
    text-align: left;
  }

  /* ?? Two-column form ????????????????? */
  .dd-form {
    display: flex;
    gap: 20px;
    margin-top: 12px;
  }
  .dd-col { flex: 1; }

  /* ?? Field blocks ???????????????????? */
  .field-block {
    margin-bottom: 12px;
  }
  .field-block-label {
    font-size: 10px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .field-input-box {
    border: 1.5px solid #1a1a1a;
    min-height: 30px;
    padding: 4px 6px;
    font-size: 11px;
    background: #fff;
  }
  .field-input-box.tall {
    min-height: 60px;
  }

  /* ?? Digit boxes ????????????????????? */
  .digit-row {
    display: flex;
    gap: 0;
  }
  .digit-box {
    width: 28px;
    height: 30px;
    border: 1.5px solid #1a1a1a;
    text-align: center;
    line-height: 28px;
    font-size: 16px;
    font-weight: 700;
    font-family: 'Courier New', monospace;
    background: #fff;
  }
  .digit-box + .digit-box {
    border-left: none;
  }

  /* ?? Instruction box ????????????????? */
  .instruction-box {
    font-size: 9px;
    line-height: 1.4;
    border: 1.5px solid #1a1a1a;
    padding: 6px;
    margin-bottom: 12px;
    min-height: 80px;
  }

  /* ?? Divider ????????????????????????? */
  .dd-divider {
    border: none;
    border-top: 1px dashed #999;
    margin: 14px 0;
    font-size: 8px;
    color: #666;
    text-align: center;
  }
  .dd-divider-text {
    font-size: 8px;
    color: #666;
    text-align: center;
    font-style: italic;
    margin-bottom: 10px;
  }

  /* ?? Guarantee section ??????????????? */
  .guarantee-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .guarantee-title {
    font-size: 16px;
    font-weight: 700;
  }
  .guarantee-list {
    font-size: 9px;
    line-height: 1.5;
    margin: 0;
    padding-left: 16px;
  }
  .guarantee-list li {
    margin-bottom: 6px;
  }

  @media print {
    body { padding: 0; margin: 0; }
    .page { padding: 0; margin: 0; width: 100%; min-height: auto; }
    @page { size: A4 portrait; margin: 14mm 16mm; }
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
  <!-- HEADER -->
  <div class="dd-header">
    <div class="dd-company">
      <div class="dd-company-name">3KFinancialAcco</div>
      <div class="dd-company-addr">
        Kemp House, 128<br/>
        City Road, London<br/>
        EC1V 2NX
      </div>
    </div>
    <div class="dd-right-header">
      <img class="dd-logo-img" src="${directDebitLogoSrc}" alt="Direct Debit"/>
    </div>
  </div>

  <div class="dd-instruction-title">
    Instruction to your bank<br/>
    or building society to<br/>
    pay by Direct Debit
  </div>

  <!-- FORM -->
  <div class="dd-form">
    <!-- LEFT COLUMN -->
    <div class="dd-col">
      <div class="field-block">
        <div class="field-block-label">Company Name</div>
        <div class="field-input-box">${v(co.name)}</div>
      </div>

      <div class="field-block">
        <div class="field-block-label">Name of account holder(s)</div>
        <div class="field-input-box">${v(bank.account_holder_name)}</div>
      </div>

      <div class="field-block">
        <div class="field-block-label">Bank/Building Society account number</div>
        <div class="digit-row">${digitBoxes(bank.account_number, 8)}</div>
      </div>

      <div class="field-block">
        <div class="field-block-label">Branch sort code</div>
        <div class="digit-row">${digitBoxes(bank.sort_code, 6)}</div>
      </div>

      <div class="field-block">
        <div class="field-block-label">Name and full postal address of your<br/>Bank/Building Society</div>
        <div class="field-input-box tall">${v(bank.bank_address)}</div>
      </div>
    </div>

    <!-- RIGHT COLUMN -->
    <div class="dd-col">
      <div class="field-block">
        <div class="field-block-label">Service User Number</div>
        <div class="digit-row">${digitBoxes(serviceUserNumber, 6)}</div>
      </div>

      <div class="field-block">
        <div class="field-block-label">Reference</div>
        <div class="field-input-box">${v(co.name)}</div>
      </div>

      <div class="instruction-box">
        <div class="field-block-label" style="margin-bottom:4px;">Instruction to your Bank or Building Society</div>
        Please pay 3KFinancialAcco Direct Debits from the account
        detailed in this Instruction subject to the safeguards assured by the
        Direct Debit Guarantee. I understand that this instruction may
        remain with 3KFinancialAcco and, if so, details will be passed
        electronically to my bank/building society.
      </div>

      <div class="field-block">
        <div class="field-block-label">Signature(s)</div>
        <div class="field-input-box tall">${signatureForPdfHtml(
          sig.signature,
          "max-height:72px;max-width:100%;object-fit:contain;vertical-align:middle",
        )}</div>
      </div>

      <div class="field-block">
        <div class="field-block-label">Date</div>
        <div class="field-input-box">${htmlFieldDate(sig.date)}</div>
      </div>
    </div>
  </div>

  <div class="dd-divider-text">
    Banks and building societies may not accept Direct Debit Instructions for some types of account.
  </div>
  <hr class="dd-divider"/>

  <!-- DIRECT DEBIT GUARANTEE -->
  <div class="guarantee-header">
    <div class="guarantee-title">The Direct Debit Guarantee</div>
    <div style="text-align:right;">
      <img class="dd-logo-img" src="${directDebitLogoSrc}" alt="Direct Debit" style="height:36px;"/>
    </div>
  </div>

  <ul class="guarantee-list">
    <li>This Guarantee is offered by all banks and building societies that accept instructions to pay Direct Debits.</li>
    <li>If there are any changes to the amount, date, or frequency of your Direct Debit 3KFinancialAcco will notify you 10
      working days in advance of your account being debited or as otherwise agreed. If you request 3KFinancialAcco to
      collect a payment, confirmation of the amount and date will be given to you at the time of the request.</li>
    <li>If an error is made in the payment of your Direct Debit, by 3KFinancialAcco or your bank or building society, you
      are entitled to a full and immediate refund of the amount paid from your bank or building society &ndash; if you
      receive a refund, you are not entitled to, you must pay it back when 3KFinancialAcco asks you to.</li>
    <li>You can cancel a Direct Debit at any time by simply contacting your bank or building society. Written confirmation
      may be required. Please also notify 3KFinancialAcco.</li>
  </ul>
</div>

<p style="margin:12px auto; font-size:9px; color:#94a3b8; text-align:center; max-width:210mm;" class="no-print">
  Use your browser's Print (Ctrl+P / Cmd+P) to save as PDF.
</p>
</body>
</html>`;
}
