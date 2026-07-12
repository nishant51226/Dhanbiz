import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Repository } from "typeorm";
import {
  defaultStructureModel,
  defaultVisionModel,
  parseAiProviderId,
  resolveEffectiveProvider,
} from "../ai/providers/factory.js";
import { appendJobDiagnostic } from "../extraction/job-diagnostics.js";
import type { JobDiagnosticEntry } from "../extraction/financial-types.js";
import { PortalFolderDocumentService } from "../customer-portal/portal-folder-document.service";
import { Customer } from "../entities/customer.entity";
import type { DocumentEntity } from "../entities/document.entity";
import { File, FileType } from "../entities/file.entity";
import { FolderLibraryKind } from "../entities/folder.entity";
import { Job, JobStatus, JobType } from "../entities/job.entity";
import { QueueService } from "../queue/queue.service";
import { S3Service } from "../s3/s3.service";
import { presignedUploadMaxBytes } from "../upload-limits";
import {
  isAllowedUploadMime,
  isExtractableUploadMime,
  UPLOAD_MIME_TYPE_ERROR,
} from "./upload-mime.util";
import {
  FileUploadNotificationService,
  type FileUploadNotifierContext,
} from "../notification/file-upload-notification.service";
import { FilesSupplierPathService } from "./files-supplier-path.service";
import { FileActivityLogService } from "../file-activity/file-activity-log.service.js";
import { FileActivityAction, FileActivityActorKind } from "../entities/file-activity-log.entity.js";

export type DirectS3UploadInitBody = {
  customerId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  parentId?: string;
  /** Supplier tree: `invoices` | `statements` | `files` */
  librarySection?: string;
  supplierName?: string;
  supplierFolderId?: string;
  allowRestrictedUpload?: boolean;
  allowCreateFolder?: boolean;
};

export type DirectS3UploadBatchFileMeta = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export const DIRECT_S3_UPLOAD_BATCH_MAX = 50;

export type DirectS3UploadInitResult = {
  fileId: string;
  putUrl: string;
  fileKey: string;
  headers: { "Content-Type": string };
  expiresInSec: number;
};

@Injectable()
export class DirectS3UploadService {
  private readonly log = new Logger(DirectS3UploadService.name);

  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(File) private readonly files: Repository<File>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    private readonly config: ConfigService,
    private readonly s3: S3Service,
    private readonly supplierPaths: FilesSupplierPathService,
    private readonly library: PortalFolderDocumentService,
    private readonly queue: QueueService,
    private readonly fileUploadNotifications: FileUploadNotificationService,
    private readonly fileActivity: FileActivityLogService,
  ) {}

  private emitFileUploaded(ctx: Omit<FileUploadNotifierContext, "customerId" | "fileId" | "fileName"> & {
    customerId: string;
    fileId: string;
    fileName: string;
  }): void {
    this.fileUploadNotifications.maybeNotifyCustomerAdmins(ctx);
  }

  async initUpload(body: DirectS3UploadInitBody): Promise<DirectS3UploadInitResult> {
    if (!this.s3.isBucketConfigured()) {
      throw new ServiceUnavailableException("S3_AWS_BUCKET is not configured; direct S3 upload is unavailable.");
    }
    const customerId = body.customerId?.trim();
    if (!customerId) {
      throw new BadRequestException("customerId is required");
    }
    const fileName = String(body.fileName ?? "").trim();
    const mime = String(body.mimeType ?? "").trim();
    if (!isAllowedUploadMime(mime, fileName)) {
      throw new BadRequestException(UPLOAD_MIME_TYPE_ERROR);
    }
    const size = Number(body.sizeBytes);
    if (!Number.isFinite(size) || size < 1 || size > presignedUploadMaxBytes()) {
      throw new BadRequestException(`sizeBytes must be between 1 and ${presignedUploadMaxBytes()}`);
    }

    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException("customer not found");
    }

    const safeBase =
      path.basename(String(body.fileName ?? "upload")).replace(/[^\w.\-]+/g, "_").slice(0, 200) || "upload";

    let librarySectionRaw = (body.librarySection ?? "").trim();
    const supplierFolderIdOpt = body.supplierFolderId?.trim() || undefined;
    const supplierNameOpt = body.supplierName?.trim() || undefined;
    const allowCreateFolder = body.allowCreateFolder !== false;

    if (librarySectionRaw && !allowCreateFolder && !supplierFolderIdOpt) {
      throw new BadRequestException(
        "Select an existing folder. Creating new folders is not permitted for your role.",
      );
    }

    if (supplierFolderIdOpt) {
      const inferred = await this.library.inferLibraryKindForCustomerFolder(customer.id, supplierFolderIdOpt);
      if (inferred) librarySectionRaw = inferred;
    }

    let resolvedParentId: string | null = null;
    if (librarySectionRaw) {
      const section = this.supplierPaths.assertLibrarySection(librarySectionRaw);
      const kind = this.library.assertLibraryKind(section);

      let resolved: { parentId: string; supplierLabel: string };

      if (supplierFolderIdOpt) {
        try {
          const { supplierLabel } = await this.library.resolveSupplierUploadFolder({
            customerId: customer.id,
            kind,
            supplierFolderId: supplierFolderIdOpt,
            supplierName: supplierNameOpt,
            allowRestrictedUpload: Boolean(body.allowRestrictedUpload),
            allowCreateFolder,
          });
          resolved = await this.supplierPaths.resolveSupplierUploadParent({
            customerId: customer.id,
            section,
            supplierName: supplierLabel,
            supplierFolderId: undefined,
          });
        } catch (err) {
          if (err instanceof NotFoundException) {
            resolved = await this.supplierPaths.resolveSupplierUploadParent({
              customerId: customer.id,
              section,
              supplierName: supplierNameOpt || "Upload",
              supplierFolderId: supplierFolderIdOpt,
            });
          } else {
            throw err;
          }
        }
      } else {
        resolved = await this.supplierPaths.resolveSupplierUploadParent({
          customerId: customer.id,
          section,
          supplierName: supplierNameOpt || "Upload",
          supplierFolderId: undefined,
        });
      }
      resolvedParentId = resolved.parentId;
    } else if (body.parentId?.trim()) {
      const parent = await this.files.findOne({ where: { id: body.parentId.trim() } });
      if (!parent) {
        throw new NotFoundException("parent not found");
      }
      if (parent.customerId !== customer.id) {
        throw new BadRequestException("parent belongs to another customer");
      }
      if (parent.fileType !== FileType.folder) {
        throw new BadRequestException("parent must be a folder");
      }
      resolvedParentId = parent.id;
    }

    const displayName = path.basename(String(body.fileName ?? "upload")).slice(0, 1024) || safeBase;
    const fileId = randomUUID();
    const objectKey = `uploads/${fileId}-${safeBase}`.replace(/[^\w.\-./]+/g, "_").slice(0, 240);

    const { url, fileKey } = await this.s3.getPresignedPutUrlForCustomer({
      customerId: customer.id,
      folder: "files",
      key: objectKey,
      contentType: mime,
      expiresInSec: Math.min(3600, Math.max(300, Number(process.env.PRESIGNED_PUT_TTL_SEC) || 900)),
    });

    const expiresInSec = Math.min(3600, Math.max(300, Number(process.env.PRESIGNED_PUT_TTL_SEC) || 900));

    const row = this.files.create({
      id: fileId,
      customerId: customer.id,
      parentId: resolvedParentId,
      fileType: FileType.file,
      name: displayName,
      mimeType: mime,
      sizeBytes: String(Math.floor(size)),
      storageRelativePath: null,
      s3Key: null,
      metadata: {
        directS3Upload: true,
        declaredSizeBytes: Math.floor(size),
        presignedFolder: "files",
        presignedKey: objectKey,
        expectedFileKey: fileKey,
        librarySection: librarySectionRaw || null,
        supplierName: body.supplierName?.trim() || null,
        supplierFolderId: body.supplierFolderId?.trim() || null,
      },
    });
    await this.files.save(row);

    return {
      fileId,
      putUrl: url,
      fileKey,
      headers: { "Content-Type": mime },
      expiresInSec,
    };
  }

  async completeUpload(params: {
    customerId: string;
    fileId: string;
    runExtraction?: string;
    visionPrompt?: string;
    structurePrompt?: string;
    visionModel?: string;
    structureModel?: string;
    aiProvider?: string;
    /** Override metadata when completing from portal (same as init). */
    librarySection?: string;
    supplierName?: string;
    supplierFolderId?: string;
    libraryKind?: FolderLibraryKind;
    uploadedByUserId?: string;
    uploaderIsPracticeStaff?: boolean;
    allowRestrictedUpload?: boolean;
    allowCreateFolder?: boolean;
  }): Promise<{ file: File; document: DocumentEntity | null; job: Job | null; diagnostics: JobDiagnosticEntry[] }> {
    const customerId = params.customerId?.trim();
    const fileId = params.fileId?.trim();
    if (!customerId || !fileId) {
      throw new BadRequestException("customerId and fileId are required");
    }
    if (!this.s3.isBucketConfigured()) {
      throw new ServiceUnavailableException("S3_AWS_BUCKET is not configured.");
    }

    const file = await this.files.findOne({ where: { id: fileId, customerId } });
    if (!file || file.fileType !== FileType.file) {
      throw new NotFoundException("file not found");
    }
    const meta = file.metadata && typeof file.metadata === "object" ? (file.metadata as Record<string, unknown>) : {};
    if (!meta.directS3Upload) {
      throw new BadRequestException("File was not created for direct S3 upload.");
    }
    const expectedFileKey =
      typeof meta.expectedFileKey === "string" && meta.expectedFileKey.trim()
        ? meta.expectedFileKey.trim()
        : null;
    if (!expectedFileKey) {
      throw new BadRequestException("Missing expectedFileKey in file metadata.");
    }

    const head = await this.s3.headObjectByKey(expectedFileKey);
    if (!head) {
      throw new BadRequestException("Object not found in S3; finish the PUT to the presigned URL first.");
    }

    await this.files.update({ id: fileId }, { s3Key: expectedFileKey, storageRelativePath: null });
    const updated = (await this.files.findOne({ where: { id: fileId } })) as File;

    const libSection =
      (params.librarySection?.trim() ||
        (typeof meta.librarySection === "string" ? meta.librarySection.trim() : "")) ||
      "";
    const kind = params.libraryKind ?? (libSection ? this.library.assertLibraryKind(libSection) : null);

    let document: DocumentEntity | null = null;
    if (kind) {
      const { supplierFolderId: targetFolderId, kind: resolvedKind } = await this.library.resolveSupplierUploadFolder({
        customerId,
        kind,
        supplierName: params.supplierName?.trim() || (typeof meta.supplierName === "string" ? meta.supplierName : undefined),
        supplierFolderId:
          params.supplierFolderId?.trim() ||
          (typeof meta.supplierFolderId === "string" ? meta.supplierFolderId : undefined),
        allowRestrictedUpload: Boolean(params.allowRestrictedUpload),
        allowCreateFolder: params.allowCreateFolder !== false,
      });
      const logicalPath = `s3/files/${fileId}`.replace(/\\/g, "/");
      document = await this.library.createDocument({
        folderId: targetFolderId,
        customerId,
        displayName: updated.name,
        originalName: updated.name,
        fileUrl: logicalPath,
        mimeType: updated.mimeType ?? "application/octet-stream",
        sizeBytes: head.contentLength || Number(meta.declaredSizeBytes) || Number(updated.sizeBytes) || 0,
        s3Key: expectedFileKey,
        libraryKind: resolvedKind,
      });
      await this.library.linkDocumentToExtractionFile(document.id, fileId);
      if (this.fileActivity.isFilesLibraryDocument(document)) {
        this.fileActivity.record({
          customerId,
          documentId: document.id,
          fileId,
          action: FileActivityAction.uploaded,
          summary: `Uploaded ${updated.name}`,
          metadata: {
            mimeType: updated.mimeType ?? null,
            sizeBytes: head.contentLength || Number(meta.declaredSizeBytes) || Number(updated.sizeBytes) || 0,
            supplierFolderId: targetFolderId,
            libraryKind: resolvedKind,
          },
          actorUserId: params.uploadedByUserId?.trim() || null,
          actorKind: params.uploaderIsPracticeStaff
            ? FileActivityActorKind.staff
            : FileActivityActorKind.portal,
          actorIsAdmin: params.uploaderIsPracticeStaff === true,
        });
      }
    }

    const root = this.config.get<string>("FILE_STORAGE_ROOT")?.trim();
    if (root) {
      try {
        const buf = await this.s3.getObjectBufferByKey(expectedFileKey);
        const diskName = `${fileId}-${path.basename(updated.name).replace(/[^\w.\-]+/g, "_")}`.slice(0, 220);
        const rel = path.join("blobs", diskName).replace(/\\/g, "/");
        const dir = path.join(root, customerId, "blobs");
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(root, customerId, rel), buf);
        await this.files.update({ id: fileId }, { storageRelativePath: rel });
        updated.storageRelativePath = rel;
      } catch (e) {
        this.log.warn(
          `Could not mirror S3 object to disk for ${fileId}: ${e instanceof Error ? e.message : e} — extraction still uses S3 or buffer.`,
        );
      }
    }

    const wantExtraction =
      params.runExtraction !== "false" &&
      params.runExtraction !== "0" &&
      params.runExtraction !== "no" &&
      isExtractableUploadMime(updated.mimeType ?? "", updated.name);
    const diagnostics: JobDiagnosticEntry[] = [];
    appendJobDiagnostic(diagnostics, "upload", "Direct S3 upload completed", {
      api: "POST /files/upload-s3/complete",
      fileId,
      s3Key: expectedFileKey,
      documentId: document?.id ?? null,
      customerId,
      runExtraction: wantExtraction,
    });

    if (!wantExtraction) {
      const f = (await this.files.findOne({ where: { id: fileId } })) as File;
      this.maybeEmitFileUploaded(params, customerId, fileId, f.name);
      return { file: f, document, job: null, diagnostics };
    }

    const jobRow = this.jobs.create({
      customerId,
      fileId: document ? null : fileId,
      documentId: document?.id ?? null,
      type: JobType.extraction,
      status: JobStatus.queued,
      percentCompleted: 0,
      visionPrompt: params.visionPrompt?.trim() || null,
      structurePrompt: params.structurePrompt?.trim() || null,
      visionModel: params.visionModel?.trim() || null,
      structureModel: params.structureModel?.trim() || null,
      aiProvider: parseAiProviderId(params.aiProvider),
    });
    const savedJob = await this.jobs.save(jobRow);

    let pgBossJobId: string;
    try {
      pgBossJobId = await this.queue.enqueueExtraction(savedJob.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.jobs.update(savedJob.id, {
        status: JobStatus.failed,
        error: `Queue failed: ${msg}`,
      });
      throw new ServiceUnavailableException(`Queue failed: ${msg}`);
    }
    await this.jobs.update(savedJob.id, { pgBossJobId });
    const job = await this.jobs.findOne({ where: { id: savedJob.id } });
    if (job && document && this.fileActivity.isFilesLibraryDocument(document)) {
      this.fileActivity.tryLogJob(job, FileActivityAction.job_created, {
        toStatus: JobStatus.queued,
        summary: `Extraction job created for ${updated.name}`,
      });
    }
    const effProvider = resolveEffectiveProvider(parseAiProviderId(params.aiProvider), this.config);
    const effVision = params.visionModel?.trim() || defaultVisionModel(this.config, effProvider);
    const effStructure = params.structureModel?.trim() || defaultStructureModel(this.config, effProvider);
    appendJobDiagnostic(diagnostics, "upload", "Extraction job queued (direct S3)", {
      jobId: savedJob.id,
      pgBossJobId,
      effectiveProvider: effProvider,
      effectiveVisionModel: effVision,
      effectiveStructureModel: effStructure,
    });
    const f = (await this.files.findOne({ where: { id: fileId } })) as File;
    this.maybeEmitFileUploaded(params, customerId, fileId, f.name);
    return { file: f, document, job, diagnostics };
  }

  private maybeEmitFileUploaded(
    params: { uploadedByUserId?: string; uploaderIsPracticeStaff?: boolean },
    customerId: string,
    fileId: string,
    fileName: string,
  ): void {
    const uploadedByUserId = params.uploadedByUserId?.trim();
    if (!uploadedByUserId) return;
    this.emitFileUploaded({
      uploadedByUserId,
      uploaderIsPracticeStaff: params.uploaderIsPracticeStaff === true,
      customerId,
      fileId,
      fileName,
    });
  }

  /** One HTTP round-trip: presigned PUT metadata for many files (browser still PUTs each object to S3). */
  async initUploadBatch(
    shared: Omit<DirectS3UploadInitBody, "fileName" | "mimeType" | "sizeBytes">,
    files: DirectS3UploadBatchFileMeta[],
  ): Promise<{ items: DirectS3UploadInitResult[] }> {
    if (!files?.length) {
      throw new BadRequestException("files array is required");
    }
    if (files.length > DIRECT_S3_UPLOAD_BATCH_MAX) {
      throw new BadRequestException(`At most ${DIRECT_S3_UPLOAD_BATCH_MAX} files per batch`);
    }
    const items: DirectS3UploadInitResult[] = [];
    for (const f of files) {
      items.push(
        await this.initUpload({
          ...shared,
          fileName: f.fileName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
        }),
      );
    }
    return { items };
  }

  /** One HTTP round-trip: finalize many direct S3 uploads (sequential completes for safe folder-by-name resolution). */
  async completeUploadBatch(params: {
    customerId: string;
    fileIds: string[];
    runExtraction?: string;
    visionPrompt?: string;
    structurePrompt?: string;
    visionModel?: string;
    structureModel?: string;
    aiProvider?: string;
    librarySection?: string;
    supplierName?: string;
    supplierFolderId?: string;
    libraryKind?: FolderLibraryKind;
    uploadedByUserId?: string;
    uploaderIsPracticeStaff?: boolean;
    allowRestrictedUpload?: boolean;
    allowCreateFolder?: boolean;
  }): Promise<{
    results: Array<{
      fileId: string;
      document: DocumentEntity | null;
      job: Job | null;
    }>;
    failures: Array<{ fileId: string; message: string }>;
  }> {
    const fileIds = (params.fileIds ?? []).map((id) => id?.trim()).filter(Boolean);
    if (fileIds.length === 0) {
      throw new BadRequestException("fileIds array is required");
    }
    if (fileIds.length > DIRECT_S3_UPLOAD_BATCH_MAX) {
      throw new BadRequestException(`At most ${DIRECT_S3_UPLOAD_BATCH_MAX} fileIds per batch`);
    }
    const results: Array<{ fileId: string; document: DocumentEntity | null; job: Job | null }> = [];
    const failures: Array<{ fileId: string; message: string }> = [];
    for (const fileId of fileIds) {
      try {
        const done = await this.completeUpload({ ...params, fileId });
        results.push({ fileId, document: done.document, job: done.job });
      } catch (e) {
        failures.push({
          fileId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { results, failures };
  }
}
