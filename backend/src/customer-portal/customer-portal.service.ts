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
import { Customer } from "../entities/customer.entity";
import { DocumentEntity } from "../entities/document.entity";
import { FolderLibraryKind } from "../entities/folder.entity";
import { Job, JobStatus, JobType } from "../entities/job.entity";
import { QueueService } from "../queue/queue.service";
import { S3Service } from "../s3/s3.service";
import { FileUploadNotificationService } from "../notification/file-upload-notification.service";
import {
  isAllowedUploadMime,
  isExtractableUploadMime,
  UPLOAD_MIME_TYPE_ERROR,
} from "../files/upload-mime.util";
import { PortalFolderDocumentService } from "./portal-folder-document.service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePortalFolderParentId(v: string | undefined): string | null {
  if (v === undefined || v === "") return null;
  if (!UUID_RE.test(v)) {
    throw new BadRequestException("parentId must be a valid UUID");
  }
  return v;
}

@Injectable()
export class CustomerPortalService {
  private readonly log = new Logger(CustomerPortalService.name);

  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(DocumentEntity) private readonly documents: Repository<DocumentEntity>,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
    private readonly library: PortalFolderDocumentService,
    private readonly s3: S3Service,
    private readonly fileUploadNotifications: FileUploadNotificationService,
  ) {}

  listFolders(customerId: string, kind: FolderLibraryKind, parentId: string | null) {
    return this.library.listFolders(customerId, kind, parentId);
  }

  listAllFolders(customerId: string, kind: FolderLibraryKind) {
    return this.library.listAllFolders(customerId, kind);
  }

  listBrowseFoldersPaginated(
    customerId: string,
    kinds: FolderLibraryKind[],
    page: number,
    limit: number,
    scope: "global" | "customer" | "all",
    searchText?: string,
  ) {
    return this.library.listBrowseFoldersPaginated(customerId, kinds, page, limit, scope, searchText);
  }

  listDocuments(customerId: string, kind: FolderLibraryKind, folderId: string) {
    return this.library.listDocuments(customerId, kind, folderId);
  }

  listSuppliers(
    customerId: string,
    kind: FolderLibraryKind,
    options?: { excludeRestricted?: boolean },
  ) {
    return this.library.listSuppliers(customerId, kind, options);
  }

  listSuppliersAll(customerId: string, options?: { excludeRestricted?: boolean }) {
    return this.library.listSuppliersAll(customerId, options);
  }

  inferLibraryKindForCustomerFolder(customerId: string, folderId: string) {
    return this.library.inferLibraryKindForCustomerFolder(customerId, folderId);
  }

  getLibraryTree(customerId: string, kind: FolderLibraryKind) {
    return this.library.getLibraryTree(customerId, kind);
  }

  resolveDocumentAbsolutePath(customerId: string, documentId: string, root: string) {
    return this.library.resolveDocumentAbsolutePath(customerId, documentId, root);
  }

  resolveDocumentContentSource(customerId: string, documentId: string, root: string) {
    return this.library.resolveDocumentContentSource(customerId, documentId, root);
  }

  async uploadForSupplier(params: {
    customerId: string;
    kind: FolderLibraryKind;
    file: Express.Multer.File;
    supplierName?: string;
    supplierFolderId?: string;
    visionPrompt?: string;
    structurePrompt?: string;
    visionModel?: string;
    structureModel?: string;
    aiProvider?: string;
    runExtraction?: string;
    uploadedByUserId: string;
    uploaderIsPracticeStaff: boolean;
    allowRestrictedUpload?: boolean;
  }): Promise<{ document: DocumentEntity; job: Job | null; diagnostics: JobDiagnosticEntry[] }> {
    const { customerId, kind, file } = params;
    if (!isAllowedUploadMime(file.mimetype, file.originalname)) {
      throw new BadRequestException(UPLOAD_MIME_TYPE_ERROR);
    }

    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException("customer not found");
    }

    const root = this.config.get<string>("FILE_STORAGE_ROOT");
    if (!root) {
      throw new ServiceUnavailableException("FILE_STORAGE_ROOT not configured");
    }

    const safeBase =
      path.basename(file.originalname).replace(/[^\w.\-]+/g, "_").slice(0, 200) || "upload";
    const blobName = `${randomUUID()}-${safeBase}`;
    const rel = path.join("blobs", blobName).replace(/\\/g, "/");
    const dir = path.join(root, customer.id, "blobs");
    await fs.mkdir(dir, { recursive: true });
    const abs = path.join(root, customer.id, rel);
    await fs.writeFile(abs, file.buffer);

    const displayName = path.basename(file.originalname).slice(0, 1024) || safeBase;

    const resolved = await this.library.resolveSupplierUploadFolder({
      customerId,
      kind,
      supplierName: params.supplierName?.trim() || undefined,
      supplierFolderId: params.supplierFolderId?.trim() || undefined,
      allowRestrictedUpload: Boolean(params.allowRestrictedUpload),
      allowCreateFolder: params.uploaderIsPracticeStaff,
    });

    const savedDoc = await this.library.createDocument({
      folderId: resolved.supplierFolderId,
      customerId,
      displayName,
      originalName: file.originalname,
      fileUrl: rel,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      libraryKind: resolved.kind,
    });

    if (this.s3.isBucketConfigured()) {
      try {
        const uploadKey = `${savedDoc.id}-${safeBase}`.replace(/[^\w.\-]+/g, "_").slice(0, 220);
        const { fileKey } = await this.s3.uploadCustomerFile({
          customerId: customer.id,
          folder: "files",
          key: `uploads/${uploadKey}`,
          body: file.buffer,
          contentType: file.mimetype || "application/octet-stream",
        });
        await this.documents.update({ id: savedDoc.id }, { s3Key: fileKey });
        savedDoc.s3Key = fileKey;
      } catch (e) {
        this.log.warn(`S3 mirror failed for document ${savedDoc.id}: ${e instanceof Error ? e.message : e}`);
      }
    }

    const wantExtraction =
      params.runExtraction !== "false" &&
      params.runExtraction !== "0" &&
      params.runExtraction !== "no" &&
      isExtractableUploadMime(file.mimetype, file.originalname);
    const diagnostics: JobDiagnosticEntry[] = [];
    appendJobDiagnostic(diagnostics, "upload", "Document stored via customer portal upload", {
      api: "POST /customer-portal/:customerId/{library}/upload-for-supplier",
      documentId: savedDoc.id,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storageRelativePath: rel,
      customerId,
      kind: resolved.kind,
      runExtraction: wantExtraction,
    });
    const notifyUpload = () => {
      this.fileUploadNotifications.maybeNotifyCustomerAdmins({
        uploadedByUserId: params.uploadedByUserId,
        uploaderIsPracticeStaff: params.uploaderIsPracticeStaff,
        customerId: customer.id,
        fileId: savedDoc.id,
        fileName: displayName,
      });
    };

    if (!wantExtraction) {
      notifyUpload();
      return { document: savedDoc, job: null, diagnostics };
    }

    const jobRow = this.jobs.create({
      customerId: customer.id,
      documentId: savedDoc.id,
      fileId: null,
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
    const effProvider = resolveEffectiveProvider(parseAiProviderId(params.aiProvider), this.config);
    const effVision =
      params.visionModel?.trim() || defaultVisionModel(this.config, effProvider);
    const effStructure =
      params.structureModel?.trim() || defaultStructureModel(this.config, effProvider);
    appendJobDiagnostic(diagnostics, "upload", "Extraction job queued (portal)", {
      api: "POST /customer-portal/:customerId/files/upload-for-supplier",
      jobId: savedJob.id,
      pgBossJobId,
      effectiveProvider: effProvider,
      effectiveVisionModel: effVision,
      effectiveStructureModel: effStructure,
      requestedAiProvider: parseAiProviderId(params.aiProvider),
    });
    notifyUpload();
    return { document: savedDoc, job, diagnostics };
  }
}
