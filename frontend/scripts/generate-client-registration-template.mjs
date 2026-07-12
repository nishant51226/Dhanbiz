/**
 * Builds public/client-registration-template.pdf with AcroForm fields.
 * Field names must stay in sync with src/utils/onboardingPdfAcroformMap.ts
 *
 * Run: npm run generate:pdf-template
 */
import { PDFDocument, PageSizes } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public");
const outPath = join(outDir, "client-registration-template.pdf");

const TEXT_FIELDS_STACKED = [
  "company_name",
  "director_name",
  "nature_of_business",
  "business_address",
  "city",
  "postcode",
  "phone",
  "email",
  "company_registration_number",
  "year_end",
  "utr",
  "vat_number",
  "vat_quarter",
  "paye_ref",
  "payroll_employee_count",
  "payroll_frequency",
];

const TEXT_FIELDS_APPENDIX = [
  "ni_number",
  "cis_reference",
  "director2_name",
  "director2_address",
  "director2_city",
  "director2_postcode",
  "agent_name",
  "agent_address",
  "agent_postcode",
  "agent_phone",
  "agent_code_sa",
  "agent_code_ct",
  "client_reference",
  "bank_account_holder",
  "bank_account_number",
  "bank_sort_code",
  "bank_address",
  "sig_cr_name",
  "sig_cr_position",
  "sig_cr_date",
  "sig_cr_signature",
  "sig_648_name",
  "sig_648_date",
  "sig_648_signature",
  "sig_co_name",
  "sig_co_date",
  "sig_co_signature",
  "sig_dd_name",
  "sig_dd_date",
  "sig_dd_signature",
];

const BT = [
  "bt_limited_company",
  "bt_sole_trader",
  "bt_partnership",
  "bt_llp",
  "bt_charity",
  "bt_other",
];

const SVC = [
  "svc_bookkeeping",
  "svc_vat",
  "svc_quarterly_reports",
  "svc_year_end_accounts",
  "svc_personal_tax_return",
  "svc_other",
  "svc_payroll",
];

const AUTH = ["auth_self_assessment", "auth_partnership", "auth_trust", "auth_vat", "auth_paye"];

const OFFICE = ["office_id_passport", "office_id_driving", "office_addr_utility", "office_addr_bank"];

function addTextRow(form, page, name, x, y, w, h) {
  const f = form.createTextField(name);
  f.addToPage(page, { x, y, width: w, height: h, borderWidth: 0 });
}

function addMultiline(form, page, name, x, y, w, h) {
  const f = form.createTextField(name);
  f.enableMultiline();
  f.addToPage(page, { x, y, width: w, height: h, borderWidth: 0 });
}

function addCb(form, page, name, x, y, size = 12) {
  const c = form.createCheckBox(name);
  c.addToPage(page, { x, y, width: size, height: size, borderWidth: 1 });
}

async function main() {
  const pdfDoc = await PDFDocument.create();
  const form = pdfDoc.getForm();
  let page = pdfDoc.addPage(PageSizes.A4);

  const left = 44;
  const rowH = 18;
  const gap = 6;
  const slot = rowH + gap;
  let row = 0;

  const fullW = () => page.getWidth() - 88;

  const ensureSpace = (needRows = 1) => {
    const ph = page.getHeight();
    const y = ph - 36 - (row + needRows) * slot;
    if (y < 52) {
      page = pdfDoc.addPage(PageSizes.A4);
      row = 0;
    }
  };

  const placeText = (name, h = rowH) => {
    ensureSpace(Math.ceil(h / slot) + 1);
    const ph = page.getHeight();
    const y = ph - 36 - (row + 1) * slot - Math.max(0, h - rowH);
    addTextRow(form, page, name, left, y, fullW(), h);
    row += Math.max(1, Math.round(h / rowH));
  };

  const placeCheckboxRow = (names) => {
    ensureSpace(2);
    const ph = page.getHeight();
    const y = ph - 36 - (row + 1) * slot;
    let x = left;
    const step = Math.min(76, (fullW() - 24) / names.length);
    for (const n of names) {
      addCb(form, page, n, x, y, 12);
      x += step;
    }
    row += 2;
  };

  for (const name of TEXT_FIELDS_STACKED) {
    placeText(name, rowH);
  }

  placeCheckboxRow(BT);
  placeCheckboxRow(SVC);
  placeCheckboxRow(AUTH);
  placeCheckboxRow(OFFICE);

  for (const name of TEXT_FIELDS_APPENDIX) {
    const h = name.includes("signature") ? 34 : rowH;
    placeText(name, h);
  }

  ensureSpace(4);
  {
    const ph = page.getHeight();
    const y = ph - 36 - (row + 1) * slot - 30;
    addMultiline(form, page, "additional_directors", left, y, fullW(), 52);
    row += 4;
  }

  mkdirSync(outDir, { recursive: true });
  const bytes = await pdfDoc.save();
  writeFileSync(outPath, bytes);
  console.log(`Wrote ${outPath} (${bytes.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
