import type { OnboardingDocusealSignatureTarget } from "../types/api";
import type { CustomerOnboardingData } from "../types/customerOnboarding";
import { createEmptyCustomerOnboardingData, EMPTY_HMRC_OPTIONS } from "../types/customerOnboarding";
import { renderChangeAccountantHtml } from "./changeAccountantHtmlTemplate";
import { renderDirectDebitHtml } from "./directDebitHtmlTemplate";
import { resolveDirectDebitLogoSrc } from "./directDebitLogoSrc";
import { renderHmrc648Html } from "./hmrc648HtmlTemplate";
import { resolveHmrcLogoPreviewSrc, resolveHmrcLogoSrc } from "./hmrcLogoSrc";
import { onboardingExportBaseName } from "./onboardingExportFilename";
import { renderRegistrationHtml } from "./onboardingHtmlTemplate";
import { resolveBrandLogoSrc, resolvePublicAssetDataUrl } from "./brandLogoSrc";
import {
  hydrateOnboardingSignaturesForPdf,
  parseOnboardingSignatureFileId,
} from "./onboardingSignatureFile";

function browserAssetOrigin(): string | undefined {
  if (typeof globalThis === "undefined" || !("location" in globalThis)) return undefined;
  const loc = globalThis.location as Location | undefined;
  return loc?.origin || undefined;
}

async function registrationHtmlOptions(): Promise<{ assetOrigin?: string; logoSrc: string }> {
  const assetOrigin = browserAssetOrigin();
  const logoSrc = await resolveBrandLogoSrc(assetOrigin);
  return { assetOrigin, logoSrc };
}

async function hmrc648PreviewHtmlOptions(): Promise<{ hmrcLogoSrc: string }> {
  const hmrcLogoSrc = await resolveHmrcLogoPreviewSrc(browserAssetOrigin());
  return { hmrcLogoSrc };
}

async function hmrc648PdfHtmlOptions(): Promise<{ hmrcLogoSrc: string }> {
  const hmrcLogoSrc = await resolveHmrcLogoSrc(browserAssetOrigin());
  return { hmrcLogoSrc };
}

async function directDebitHtmlOptions(): Promise<{ directDebitLogoSrc: string }> {
  const directDebitLogoSrc = await resolveDirectDebitLogoSrc(browserAssetOrigin());
  return { directDebitLogoSrc };
}

async function inlineSameOriginImages(root: HTMLElement, assetOrigin?: string): Promise<void> {
  const origin = assetOrigin?.replace(/\/$/, "");
  if (!origin) return;

  await Promise.all(
    Array.from(root.querySelectorAll("img")).map(async (img) => {
      const src = img.getAttribute("src")?.trim() ?? "";
      if (!src || src.startsWith("data:")) return;

      let pathname: string | null = null;
      if (src.startsWith("/")) {
        pathname = src;
      } else if (src.startsWith(origin)) {
        try {
          pathname = new URL(src).pathname;
        } catch {
          return;
        }
      } else {
        return;
      }

      const dataUrl = await resolvePublicAssetDataUrl(pathname, origin);
      if (dataUrl.startsWith("data:")) img.src = dataUrl;
    }),
  );
}

/* ?? Helpers ???????????????????????????????????????????????????????? */

function htmlToBlobUrl(html: string): string {
  return URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
}

function trimCanvasToExpectedPages(
  canvas: HTMLCanvasElement,
  expectedNPages: number,
): HTMLCanvasElement {
  const ratio = 297 / 210; // A4 portrait height / width
  const pxPageHeight = Math.floor(canvas.width * ratio);
  if (pxPageHeight <= 0) return canvas;
  const targetH = expectedNPages * pxPageHeight;
  const overshoot = canvas.height - targetH;
  if (overshoot <= 0 || overshoot > 8) return canvas;
  const trimmed = document.createElement("canvas");
  trimmed.width = canvas.width;
  trimmed.height = targetH;
  const ctx = trimmed.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, trimmed.width, trimmed.height);
  ctx.drawImage(canvas, 0, 0);
  return trimmed;
}

type JsPdfDoc = InstanceType<(typeof import("jspdf"))["jsPDF"]>;

const PDF_CAPTURE_SCALE = 1.5;

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        }),
    ),
  );
}

function buildPdfExportStyleOverrides(fixedPageHeight: boolean): string {
  let extra = `
.page { margin-bottom: 0 !important; box-shadow: none !important; border-radius: 0 !important; background: #fff !important; }
.registration-export-root { gap: 0 !important; display: block !important; }
.no-print { display: none !important; }
body { background: #fff !important; padding: 0 !important; margin: 0 !important; }
@media screen {
  .registration-export-root { gap: 0 !important; }
  .page { margin-bottom: 0 !important; box-shadow: none !important; background: #fff !important; }
}`;
  if (fixedPageHeight) {
    extra += `
.page { height: 297mm !important; min-height: 297mm !important; max-height: 297mm !important; overflow: hidden !important; }`;
  }
  return extra;
}

function listPageElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll(".page")).filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  );
}

async function mountHtmlForPdfExport(html: string): Promise<{
  root: HTMLElement;
  pageElements: HTMLElement[];
  isRegistrationForm: boolean;
}> {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const isRegistrationForm = parsed.body.innerHTML.includes("registration-export-root");
  const pdfStyleOverrides = buildPdfExportStyleOverrides(!isRegistrationForm);

  const wrapper = document.createElement("div");
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.style.cssText =
    "position:fixed;left:-12000px;top:0;width:210mm;overflow:visible;background:#fff;pointer-events:none;";

  const styleEl = document.createElement("style");
  styleEl.textContent = `${parsed.querySelector("style")?.textContent ?? ""}${pdfStyleOverrides}`;
  wrapper.appendChild(styleEl);

  const content = document.createElement("div");
  content.innerHTML = parsed.body.innerHTML;
  wrapper.appendChild(content);

  document.body.appendChild(wrapper);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await waitForImages(wrapper);
  await inlineSameOriginImages(wrapper, browserAssetOrigin());

  const pageElements = listPageElements(content);
  return { root: wrapper, pageElements, isRegistrationForm };
}

async function appendCanvasToPdf(
  pdf: JsPdfDoc,
  canvas: HTMLCanvasElement,
  isFirstPdfContent: boolean,
): Promise<void> {
  if (canvas.width <= 0 || canvas.height <= 0) return;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", 0.98);

  let heightLeft = imgHeight;
  let position = 0;
  let isFirstSlice = true;

  while (heightLeft > 0) {
    if (!isFirstSlice || !isFirstPdfContent) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    isFirstSlice = false;
    isFirstPdfContent = false;
    heightLeft -= pageHeight;
    if (heightLeft > 0) position = heightLeft - imgHeight;
  }
}

async function downloadHtmlAsPdf(html: string, filename: string): Promise<void> {
  const { root, pageElements, isRegistrationForm } = await mountHtmlForPdfExport(html);
  if (pageElements.length === 0) {
    root.remove();
    throw new Error("Could not find .page elements in rendered HTML");
  }

  try {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    let isFirstPdfContent = true;
    for (const pageEl of pageElements) {
      const rawCanvas = await html2canvas(pageEl, {
        scale: PDF_CAPTURE_SCALE,
        useCORS: true,
        scrollY: 0,
        logging: false,
        backgroundColor: "#ffffff",
      });
      const canvas = isRegistrationForm ? rawCanvas : trimCanvasToExpectedPages(rawCanvas, 1);
      await appendCanvasToPdf(pdf, canvas, isFirstPdfContent);
      isFirstPdfContent = false;
    }

    pdf.save(filename);
  } finally {
    root.remove();
  }
}

/* ?? Client Registration Form ??????????????????????????????????????? */

export type RegistrationPdfAuth = { apiBase: string; headers: HeadersInit };

export type OnboardingPdfDownloadOptions = {
  /** Blank layout for DocuSeal template upload — no wizard values prefilled. */
  blank?: boolean;
};

/** Strip defaults (today's date, billing cycle, CIS, etc.) for an empty DocuSeal template PDF. */
export function createBlankOnboardingPdfData(): CustomerOnboardingData {
  const d = createEmptyCustomerOnboardingData();
  d.company.type = "";
  d.tax.cis_reference = "";
  d.subscription_billing_cycle = "";
  d.subscription_payee_users = null;
  d.subscription_is_dormant = false;
  d.agent = {
    name: "",
    phone: "",
    address: "",
    postcode: "",
    agent_code_ct: "",
    agent_code_sa: "",
    client_reference: "",
    government_gateway_id: "",
    paye_agent_id_code: "",
  };
  d.signatures.client_registration = { name: "", position: "", date: "", signature: "" };
  d.signatures.hmrc_64_8 = { name: "", date: "", signature: "" };
  d.signatures.change_accountant = { name: "", date: "", signature: "" };
  d.signatures.direct_debit = { name: "", date: "", signature: "" };
  d.authorization = {
    self_assessment: false,
    partnership: false,
    trust: false,
    vat: false,
    paye: false,
    corporation_tax: false,
    tax_credits: false,
    cis: false,
  };
  d.hmrc_options = { ...EMPTY_HMRC_OPTIONS };
  return d;
}

function resolveOnboardingPdfData(
  data: CustomerOnboardingData,
  options?: OnboardingPdfDownloadOptions,
): CustomerOnboardingData {
  return options?.blank ? createBlankOnboardingPdfData() : data;
}

function blankOnboardingPdfFilename(step: number): string {
  switch (step) {
    case 2:
      return "64-8-blank-template.pdf";
    case 3:
      return "change-accountant-blank-template.pdf";
    case 4:
      return "direct-debit-blank-template.pdf";
    default:
      return "client-registration-blank-template.pdf";
  }
}

/** Wizard step (1–4) whose PDF preview matches an onboarding signature slot. */
export function onboardingPreviewStepForSignatureSlot(slot: OnboardingDocusealSignatureTarget): number {
  switch (slot) {
    case "client_registration":
      return 1;
    case "hmrc_64_8":
      return 2;
    case "change_accountant":
      return 3;
    case "direct_debit":
      return 4;
    default:
      return 1;
  }
}

/**
 * Resolve any `file:<id>` onboarding signatures to embedded `data:image/...` URLs for HTML/PDF preview.
 * In-memory `data:image/...` values are left as-is.
 */
export async function prepareOnboardingDataForPdfPreview(
  data: CustomerOnboardingData,
  auth?: RegistrationPdfAuth,
): Promise<CustomerOnboardingData> {
  if (!auth) return data;
  const anyFileRef =
    parseOnboardingSignatureFileId(data.signatures.client_registration.signature) ||
    parseOnboardingSignatureFileId(data.signatures.hmrc_64_8.signature) ||
    parseOnboardingSignatureFileId(data.signatures.change_accountant.signature) ||
    parseOnboardingSignatureFileId(data.signatures.direct_debit.signature);
  if (!anyFileRef) return data;
  return hydrateOnboardingSignaturesForPdf(auth.apiBase, auth.headers, data);
}

export async function createOnboardingPdfPreviewUrl(
  data: CustomerOnboardingData,
  auth?: RegistrationPdfAuth,
): Promise<string> {
  const hydrated = await prepareOnboardingDataForPdfPreview(data, auth);
  const opts = await registrationHtmlOptions();
  return htmlToBlobUrl(renderRegistrationHtml(hydrated, opts));
}

export async function downloadOnboardingPdf(
  data: CustomerOnboardingData,
  auth?: RegistrationPdfAuth,
  options?: OnboardingPdfDownloadOptions,
): Promise<void> {
  const source = resolveOnboardingPdfData(data, options);
  const hydrated = options?.blank ? source : await prepareOnboardingDataForPdfPreview(source, auth);
  const opts = await registrationHtmlOptions();
  await downloadHtmlAsPdf(
    renderRegistrationHtml(hydrated, opts),
    options?.blank ? blankOnboardingPdfFilename(1) : `${onboardingExportBaseName(data)}.pdf`,
  );
}

/* ?? HMRC 64-8 ??????????????????????????????????????????????????????? */

export async function createHmrc648PreviewUrl(
  data: CustomerOnboardingData,
  auth?: RegistrationPdfAuth,
): Promise<string> {
  const hydrated = await prepareOnboardingDataForPdfPreview(data, auth);
  const hmrcOpts = await hmrc648PreviewHtmlOptions();
  return htmlToBlobUrl(renderHmrc648Html(hydrated, hmrcOpts));
}

export async function downloadHmrc648Pdf(
  data: CustomerOnboardingData,
  auth?: RegistrationPdfAuth,
  options?: OnboardingPdfDownloadOptions,
): Promise<void> {
  const source = resolveOnboardingPdfData(data, options);
  const hydrated = options?.blank ? source : await prepareOnboardingDataForPdfPreview(source, auth);
  const hmrcOpts = await hmrc648PdfHtmlOptions();
  await downloadHtmlAsPdf(
    renderHmrc648Html(hydrated, hmrcOpts),
    options?.blank ? blankOnboardingPdfFilename(2) : `64-8-${onboardingExportBaseName(data)}.pdf`,
  );
}

/* ?? Change of Accountants ??????????????????????????????????????????? */

export async function createChangeAccountantPreviewUrl(
  data: CustomerOnboardingData,
  auth?: RegistrationPdfAuth,
): Promise<string> {
  const hydrated = await prepareOnboardingDataForPdfPreview(data, auth);
  return htmlToBlobUrl(renderChangeAccountantHtml(hydrated));
}

export async function downloadChangeAccountantPdf(
  data: CustomerOnboardingData,
  auth?: RegistrationPdfAuth,
  options?: OnboardingPdfDownloadOptions,
): Promise<void> {
  const source = resolveOnboardingPdfData(data, options);
  const hydrated = options?.blank ? source : await prepareOnboardingDataForPdfPreview(source, auth);
  await downloadHtmlAsPdf(
    renderChangeAccountantHtml(hydrated),
    options?.blank ? blankOnboardingPdfFilename(3) : `change-accountant-${onboardingExportBaseName(data)}.pdf`,
  );
}

/* ?? Direct Debit ???????????????????????????????????????????????????? */

export async function createDirectDebitPreviewUrl(
  data: CustomerOnboardingData,
  auth?: RegistrationPdfAuth,
): Promise<string> {
  const hydrated = await prepareOnboardingDataForPdfPreview(data, auth);
  const ddOpts = await directDebitHtmlOptions();
  return htmlToBlobUrl(renderDirectDebitHtml(hydrated, ddOpts));
}

export async function downloadDirectDebitPdf(
  data: CustomerOnboardingData,
  auth?: RegistrationPdfAuth,
  options?: OnboardingPdfDownloadOptions,
): Promise<void> {
  const source = resolveOnboardingPdfData(data, options);
  const hydrated = options?.blank ? source : await prepareOnboardingDataForPdfPreview(source, auth);
  const ddOpts = await directDebitHtmlOptions();
  await downloadHtmlAsPdf(
    renderDirectDebitHtml(hydrated, ddOpts),
    options?.blank ? blankOnboardingPdfFilename(4) : `direct-debit-${onboardingExportBaseName(data)}.pdf`,
  );
}
