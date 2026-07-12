import PDFDocument from "pdfkit";

/** Renders one onboarding step payload as a simple PDF (title + pretty JSON body). */
export function onboardingStepToPdfBuffer(params: { title: string; data: unknown }): Promise<Buffer> {
  const bodyText = JSON.stringify(
    params.data !== undefined && params.data !== null ? params.data : {},
    null,
    2,
  );

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.font("Helvetica-Bold").fontSize(14).text(params.title);
    doc.moveDown(0.75);
    doc.font("Courier").fontSize(8.5).text(bodyText, {
      width: doc.page.width - 96,
      align: "left",
    });
    doc.end();
  });
}
