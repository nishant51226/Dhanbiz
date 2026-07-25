import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, IsNull, Repository } from "typeorm";
import { CustomerFormSubmissionEntity } from "../entities/customer-form-submission.entity";
import { Customer } from "../entities/customer.entity";
import { File, FileType } from "../entities/file.entity";
import { S3Service } from "../s3/s3.service";
import { runWithAdminRls, runWithTenantRls } from "../tenant/run-with-tenant-rls";
import type { OnboardingFormPdfKey } from "./onboarding-form-keys";
import { OnboardingHtmlPdfService } from "./onboarding-html-pdf.service";
import { OnboardingPdfSignatureHydrateService } from "./onboarding-pdf-signature-hydrate.service";
import { reviveCustomerOnboarding } from "./onboarding-templates/customerOnboarding";

/** One S3 object per signable document (Registration + Change of accountant). */
const ONBOARDING_DOCUMENT_FILES: readonly {
  formKey: OnboardingFormPdfKey;
  filename: string;
}[] = [
  { formKey: "form_1", filename: "01-client-registration.pdf" },
  { formKey: "form_3", filename: "03-change-of-accountant.pdf" },
];

/** S3 folder for onboarding artefacts (uploads go through {@link S3Service.uploadCustomerFile}). */
const ONBOARDING_FOLDER = "onboarding-files";

const ONBOARDING_PDF_DISPLAY_TITLE: Record<string, string> = {
  "01-client-registration.pdf": "Client registration",
  "03-change-of-accountant.pdf": "Change of accountant",
};

export type OnboardingFormPdfDownloadDto = {
  formKey: OnboardingFormPdfKey;
  filename: string;
  title: string;
  fileId: string | null;
  /** Presigned GET when the bucket is configured; {@code null} if S3 is not in use. */
  downloadUrl: string | null;
  /** ISO timestamp when {@code downloadUrl} stops working; {@code null} when there is no URL. */
  urlExpiresAt: string | null;
};

/**
 * Onboarding completion: read DB, then push artefacts to S3 via {@link S3Service} only.
 * Initial onboarding PDFs in `files`: {@link CustomerOnboardingS3Service.bootstrapOnboardingPdfFilesOnly}.
 */
@Injectable()
export class CustomerOnboardingS3Service {
  private readonly log = new Logger(CustomerOnboardingS3Service.name);

  constructor(
    private readonly config: ConfigService,
    private readonly s3: S3Service,
    private readonly htmlPdf: OnboardingHtmlPdfService,
    private readonly signatureHydrate: OnboardingPdfSignatureHydrateService,
    private readonly dataSource: DataSource,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(File)
    private readonly files: Repository<File>,
    @InjectRepository(CustomerFormSubmissionEntity)
    private readonly submissions: Repository<CustomerFormSubmissionEntity>,
  ) {}

  /**
   * After `Customer` exists: `files` is used **only** for onboarding (invoices/statements/etc. use `documents`).
   * Generates the signable document PDFs, uploads to S3 (`onboarding-files/{filename}.pdf` — no `documents/` subfolder) and inserts `files` rows with
   * `s3_key` set. If the bucket is not configured, falls back to `FILE_STORAGE_ROOT` + `storage_relative_path`.
   * Same S3 keys as {@link syncCompletedOnboarding} so completion overwrites blobs; sync updates row metadata.
   */
  async bootstrapOnboardingPdfFilesOnly(customerId: string): Promise<void> {
    const storageRoot = this.config.get<string>("FILE_STORAGE_ROOT")?.trim();
    const prepared: {
      filename: string;
      formKey: OnboardingFormPdfKey;
      body: Buffer;
      storageRelativePath: string | null;
      s3Key: string | null;
    }[] = [];

    for (const { filename, formKey } of ONBOARDING_DOCUMENT_FILES) {
      try {
        const body = await this.htmlPdf.renderStepToPdfBuffer(formKey, reviveCustomerOnboarding({}));
        let storageRelativePath: string | null = null;
        let s3Key: string | null = null;
        if (this.s3.isBucketConfigured()) {
          const { fileKey } = await this.s3.uploadCustomerFile({
            customerId,
            folder: ONBOARDING_FOLDER,
            key: filename,
            body,
            contentType: "application/pdf",
          });
          s3Key = fileKey;
        } else if (storageRoot) {
          const safeBase = filename.replace(/[^\w.\-]+/g, "_");
          const blobName = `${randomUUID()}-${safeBase}`;
          const rel = path.join("blobs", blobName).replace(/\\/g, "/");
          const dir = path.join(storageRoot, customerId, "blobs");
          await fs.mkdir(dir, { recursive: true });
          const abs = path.join(storageRoot, customerId, rel);
          await fs.writeFile(abs, body);
          storageRelativePath = rel;
        } else {
          this.log.debug(
            `Skipping onboarding PDF ${filename} for ${customerId}: set S3_AWS_BUCKET or FILE_STORAGE_ROOT.`,
          );
          continue;
        }
        prepared.push({ filename, formKey, body, storageRelativePath, s3Key });
      } catch (e) {
        this.log.warn(
          `Bootstrap onboarding PDF ${filename} for ${customerId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    if (prepared.length === 0) {
      return;
    }

    await runWithAdminRls(this.dataSource, async (manager) => {
      const fileRepo = manager.getRepository(File);

      for (const { filename, formKey, body, storageRelativePath, s3Key } of prepared) {
        const dup = await fileRepo.findOne({
          where: {
            customerId,
            parentId: IsNull(),
            fileType: FileType.file,
            name: filename,
          },
        });
        if (dup) {
          continue;
        }
        await fileRepo.save(
          fileRepo.create({
            customerId,
            parentId: null,
            fileType: FileType.file,
            name: filename,
            mimeType: "application/pdf",
            sizeBytes: String(body.length),
            storageRelativePath,
            s3Key,
            metadata: { onboardingStepPdf: true, formKey },
          }),
        );
      }
    });
  }

  private async findOnboardingStepPdfFileRow(customerId: string, filename: string): Promise<File | null> {
    const candidates = await this.files.find({
      where: { customerId, fileType: FileType.file, name: filename },
    });
    return candidates.find((f) => f.metadata?.onboardingStepPdf === true) ?? null;
  }

  private collectFileIdsFromJson(...parts: (Record<string, unknown> | null | undefined)[]): string[] {
    const text = parts
      .filter((p): p is Record<string, unknown> => p !== null && p !== undefined && typeof p === "object")
      .map((p) => JSON.stringify(p))
      .join("\n");
    return [
      ...new Set(
        [...text.matchAll(/file:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)].map(
          (m) => m[1],
        ),
      ),
    ];
  }

  async syncCompletedOnboarding(customerId: string): Promise<void> {
    if (!this.s3.isBucketConfigured()) {
      this.log.debug("Skipping onboarding S3 sync: S3_AWS_BUCKET is not set.");
      return;
    }

    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) {
      return;
    }

    const latest = await this.submissions.findOne({
      where: { customerId },
      order: { updatedAt: "DESC" },
    });

    let payload: Record<string, unknown> | null = null;
    if (
      customer.onboardingData &&
      typeof customer.onboardingData === "object" &&
      !Array.isArray(customer.onboardingData)
    ) {
      payload = customer.onboardingData as Record<string, unknown>;
    } else if (latest?.data && typeof latest.data === "object" && !Array.isArray(latest.data)) {
      payload = latest.data as Record<string, unknown>;
    }

    if (!payload || Object.keys(payload).length === 0) {
      this.log.warn(`Onboarding S3 sync skipped for ${customerId}: no onboarding JSON.`);
      return;
    }

    const metaRaw = latest?.metadata;
    const metaObj =
      metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)
        ? (metaRaw as Record<string, unknown>)
        : {};

    await this.s3.uploadCustomerFile({
      customerId,
      folder: ONBOARDING_FOLDER,
      key: "onboarding-data.json",
      body: Buffer.from(JSON.stringify(payload, null, 2), "utf-8"),
      contentType: "application/json; charset=utf-8",
    });

    const revived = reviveCustomerOnboarding(payload);
    const forPdf = await this.signatureHydrate.hydrate(customerId, revived);
    // Registration + Change of accountant — same HTML templates as staff preview (Playwright print).
    for (const { formKey, filename } of ONBOARDING_DOCUMENT_FILES) {
      const body = await this.htmlPdf.renderStepToPdfBuffer(formKey, forPdf);
      const { fileKey } = await this.s3.uploadCustomerFile({
        customerId,
        folder: ONBOARDING_FOLDER,
        key: filename,
        body,
        contentType: "application/pdf",
      });
      const pdfRow = await this.findOnboardingStepPdfFileRow(customerId, filename);
      if (pdfRow) {
        await this.files.update(
          { id: pdfRow.id, customerId },
          { sizeBytes: String(body.length), s3Key: fileKey, mimeType: "application/pdf" },
        );
      }
    }

    await this.s3.uploadCustomerFile({
      customerId,
      folder: ONBOARDING_FOLDER,
      key: "metadata.json",
      body: Buffer.from(JSON.stringify(metaObj, null, 2), "utf-8"),
      contentType: "application/json; charset=utf-8",
    });

    const storageRoot = this.config.get<string>("FILE_STORAGE_ROOT")?.trim();
    if (!storageRoot) {
      this.log.warn("FILE_STORAGE_ROOT unset: cannot copy blob files (e.g. signatures) to S3.");
      return;
    }

    const submissionData =
      latest?.data && typeof latest.data === "object" && !Array.isArray(latest.data)
        ? (latest.data as Record<string, unknown>)
        : undefined;
    const fileIds = this.collectFileIdsFromJson(payload, submissionData, metaObj);

    for (const fileId of fileIds) {
      const fileRow = await this.files.findOne({ where: { id: fileId, customerId } });
      if (!fileRow?.storageRelativePath || fileRow.fileType !== FileType.file) {
        continue;
      }

      const abs = path.join(storageRoot, customerId, fileRow.storageRelativePath);
      try {
        const buf = await fs.readFile(abs);
        const safeName = fileRow.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
        const { fileKey } = await this.s3.uploadCustomerFile({
          customerId,
          folder: ONBOARDING_FOLDER,
          key: `files/${fileId}-${safeName}`,
          body: buf,
          contentType: fileRow.mimeType ?? "application/octet-stream",
        });
        await this.files.update({ id: fileId, customerId }, { s3Key: fileKey });
      } catch (e) {
        this.log.warn(
          `Could not copy file ${fileId} to S3 for customer ${customerId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  /**
   * Presigned S3 GET URLs for the fixed onboarding document PDFs (`onboarding-files/01-…03-…`),
   * for admin customer detail (preview/download). File rows are read under tenant RLS.
   */
  async getOnboardingFormPdfDownloadsForAdminDetail(customerId: string): Promise<OnboardingFormPdfDownloadDto[]> {
    const expiresInSec = 3600;
    const urlExpiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

    return runWithTenantRls(this.dataSource, customerId, async (manager) => {
      const fileRepo = manager.getRepository(File);
      const out: OnboardingFormPdfDownloadDto[] = [];

      for (const { formKey, filename } of ONBOARDING_DOCUMENT_FILES) {
        const candidates = await fileRepo.find({
          where: { customerId, fileType: FileType.file, name: filename },
        });
        const row =
          candidates.find((f) => (f.metadata as Record<string, unknown> | undefined)?.onboardingStepPdf === true) ??
          candidates[0] ??
          null;

        /** Only presign when this row has an `s3_key` from a successful upload — avoids NoSuchKey for local-only rows. */
        const s3Key = row?.s3Key?.trim() ?? "";
        let downloadUrl: string | null = null;
        if (this.s3.isBucketConfigured() && s3Key.length > 0) {
          try {
            const { url } = await this.s3.getPresignedUrlForCustomerScopedObjectKey({
              customerId,
              s3ObjectKey: s3Key,
              expiresInSec,
            });
            downloadUrl = url;
          } catch (e) {
            this.log.debug(
              `Presign onboarding PDF ${filename} for ${customerId}: ${e instanceof Error ? e.message : e}`,
            );
          }
        }

        out.push({
          formKey,
          filename,
          title: ONBOARDING_PDF_DISPLAY_TITLE[filename] ?? filename,
          fileId: row?.id ?? null,
          downloadUrl,
          urlExpiresAt: downloadUrl ? urlExpiresAt : null,
        });
      }

      return out;
    });
  }
}
