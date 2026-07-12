import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Repository } from "typeorm";
import { ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PortalFolderDocumentService } from "../customer-portal/portal-folder-document.service";
import { Customer } from "../entities/customer.entity";
import { DocumentEntity } from "../entities/document.entity";
import { File, FileType } from "../entities/file.entity";
import { FolderLibraryKind } from "../entities/folder.entity";
import { Job, JobStatus, JobType } from "../entities/job.entity";
import {
  defaultStructureModel,
  defaultVisionModel,
  parseAiProviderId,
  resolveEffectiveProvider,
} from "../ai/providers/factory.js";
import { appendJobDiagnostic } from "../extraction/job-diagnostics.js";
import type { JobDiagnosticEntry } from "../extraction/financial-types.js";
import { QueueService } from "../queue/queue.service";
import { S3Service } from "../s3/s3.service";
import { uploadMaxBytes } from "../upload-limits";
import {
  isAllowedUploadMime,
  isExtractableUploadMime,
  UPLOAD_MIME_TYPE_ERROR,
} from "./upload-mime.util";
import { FileUploadNotificationService } from "../notification/file-upload-notification.service";
import { DirectS3UploadService } from "./direct-s3-upload.service";
import { FilesSupplierPathService } from "./files-supplier-path.service";
import { FileActivityLogService } from "../file-activity/file-activity-log.service.js";

@ApiBearerAuth("bearer")
@Controller("files")
@UseGuards(JwtAuthGuard)
export class UploadController {
  private readonly log = new Logger(UploadController.name);

  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(File) private readonly files: Repository<File>,
    @InjectRepository(DocumentEntity) private readonly documents: Repository<DocumentEntity>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
    private readonly supplierPaths: FilesSupplierPathService,
    private readonly s3: S3Service,
    private readonly directS3: DirectS3UploadService,
    private readonly library: PortalFolderDocumentService,
    private readonly fileUploadNotifications: FileUploadNotificationService,
    private readonly fileActivity: FileActivityLogService,
  ) {}

  private uploaderFromReq(req: Request & { user?: AuthUser }) {
    const user = req.user;
    if (!user?.userId) return null;
    return {
      uploadedByUserId: user.userId,
      uploaderIsPracticeStaff: !user.customerId,
    };
  }

  /** Stream binary for authenticated preview (iframe uses blob URL from frontend). */
  @Get(":id/content")
  async streamContent(
    @Req() req: Request & { user?: AuthUser },
    @Param("id") id: string,
    @Query("download") download?: string,
  ): Promise<StreamableFile> {
    const row = await this.files.findOne({ where: { id } });
    if (!row || row.fileType !== FileType.file) {
      throw new NotFoundException("file not found");
    }
    const isDownload = download === "1" || download === "true";
    this.fileActivity.recordContentAccess({
      fileId: id,
      fileName: row.name,
      download: isDownload,
      req,
      route: "GET /files/:id/content",
    });
    const mime = row.mimeType ?? "application/octet-stream";
    const safeName = encodeURIComponent(row.name.replace(/[\r\n"]/g, "_"));
    if (row.s3Key?.trim() && this.s3.isBucketConfigured()) {
      try {
        const buf = await this.s3.getObjectBufferByKey(row.s3Key.trim());
        return new StreamableFile(Readable.from(buf), {
          type: mime,
          disposition: `inline; filename*=UTF-8''${safeName}`,
          length: buf.length,
        });
      } catch {
        /* fall through to disk */
      }
    }
    if (!row.storageRelativePath?.trim()) {
      throw new NotFoundException("file has no stored content");
    }
    const root = this.config.get<string>("FILE_STORAGE_ROOT");
    if (!root) {
      throw new ServiceUnavailableException("FILE_STORAGE_ROOT not configured");
    }
    const custRoot = path.resolve(path.join(root, row.customerId));
    const abs = path.resolve(path.join(custRoot, row.storageRelativePath));
    if (!abs.startsWith(custRoot + path.sep) && abs !== custRoot) {
      throw new BadRequestException("invalid storage path");
    }
    let size: number;
    try {
      const st = await fs.stat(abs);
      size = st.size;
    } catch {
      throw new NotFoundException("file not found on disk");
    }
    const stream = createReadStream(abs);
    return new StreamableFile(stream, {
      type: mime,
      disposition: `inline; filename*=UTF-8''${safeName}`,
      length: size,
    });
  }

  @Post("upload-s3/init")
  async uploadS3Init(
    @Req() req: Request & { user?: AuthUser },
    @Body("customerId") customerId: string,
    @Body("fileName") fileName: string,
    @Body("mimeType") mimeType: string,
    @Body("sizeBytes") sizeBytes: number,
    @Body("parentId") parentId?: string,
    @Body("librarySection") librarySection?: string,
    @Body("supplierName") supplierName?: string,
    @Body("supplierFolderId") supplierFolderId?: string,
  ) {
    const uploader = this.uploaderFromReq(req);
    return this.directS3.initUpload({
      customerId: String(customerId ?? ""),
      fileName: String(fileName ?? ""),
      mimeType: String(mimeType ?? ""),
      sizeBytes: Number(sizeBytes),
      parentId,
      librarySection,
      supplierName,
      supplierFolderId,
      allowRestrictedUpload: Boolean(uploader?.uploaderIsPracticeStaff),
      allowCreateFolder: Boolean(uploader?.uploaderIsPracticeStaff),
    });
  }

  @Post("upload-s3/complete")
  async uploadS3Complete(
    @Req() req: Request & { user?: AuthUser },
    @Body("customerId") customerId: string,
    @Body("fileId") fileId: string,
    @Body("librarySection") librarySection?: string,
    @Body("supplierName") supplierName?: string,
    @Body("supplierFolderId") supplierFolderId?: string,
    @Body("visionPrompt") visionPrompt?: string,
    @Body("structurePrompt") structurePrompt?: string,
    @Body("visionModel") visionModel?: string,
    @Body("structureModel") structureModel?: string,
    @Body("aiProvider") aiProvider?: string,
    @Body("runExtraction") runExtraction?: string,
  ) {
    const uploader = this.uploaderFromReq(req);
    return this.directS3.completeUpload({
      customerId: String(customerId ?? ""),
      fileId: String(fileId ?? ""),
      librarySection,
      supplierName,
      supplierFolderId,
      visionPrompt,
      structurePrompt,
      visionModel,
      structureModel,
      aiProvider,
      runExtraction,
      ...(uploader ?? {}),
      allowRestrictedUpload: Boolean(uploader?.uploaderIsPracticeStaff),
      allowCreateFolder: Boolean(uploader?.uploaderIsPracticeStaff),
    });
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: uploadMaxBytes() },
    })
  )
  async upload(
    @Req() req: Request & { user?: AuthUser },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("customerId") customerId: string,
    @Body("parentId") parentId?: string,
    /** When set (`invoices` | `statements` | `files`), file is placed under the supplier tree: Section / Year / UTC date / supplier (same as supplier uploads). `parentId` is ignored. */
    @Body("librarySection") librarySection?: string,
    @Body("supplierName") supplierName?: string,
    @Body("supplierFolderId") supplierFolderId?: string,
    @Body("visionPrompt") visionPrompt?: string,
    @Body("structurePrompt") structurePrompt?: string,
    @Body("visionModel") visionModel?: string,
    @Body("structureModel") structureModel?: string,
    @Body("aiProvider") aiProvider?: string,
    @Body("runExtraction") runExtraction?: string
  ) {
    if (!file) {
      throw new BadRequestException('Missing file field "file".');
    }
    if (!isAllowedUploadMime(file.mimetype, file.originalname)) {
      throw new BadRequestException(UPLOAD_MIME_TYPE_ERROR);
    }
    if (!customerId?.trim()) {
      throw new BadRequestException("customerId is required");
    }

    const customer = await this.customers.findOne({
      where: { id: customerId.trim() },
    });
    if (!customer) {
      throw new NotFoundException("customer not found");
    }

    let resolvedParentId: string | null = null;
    if (librarySection?.trim()) {
      const section = this.supplierPaths.assertLibrarySection(librarySection.trim());
      const resolved = await this.supplierPaths.resolveSupplierUploadParent({
        customerId: customer.id,
        section,
        supplierName: supplierName?.trim() || "Upload",
        supplierFolderId: supplierFolderId?.trim() || undefined,
      });
      resolvedParentId = resolved.parentId;
    } else if (parentId?.trim()) {
      const parent = await this.files.findOne({ where: { id: parentId.trim() } });
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

    const root = this.config.get<string>("FILE_STORAGE_ROOT");
    if (!root) {
      throw new ServiceUnavailableException("FILE_STORAGE_ROOT not configured");
    }

    const safeBase =
      path.basename(file.originalname).replace(/[^\w.\-]+/g, "_").slice(0, 200) ||
      "upload";
    const blobName = `${randomUUID()}-${safeBase}`;
    const rel = path.join("blobs", blobName).replace(/\\/g, "/");
    const dir = path.join(root, customer.id, "blobs");
    await fs.mkdir(dir, { recursive: true });
    const abs = path.join(root, customer.id, rel);
    await fs.writeFile(abs, file.buffer);

    const displayName = path.basename(file.originalname).slice(0, 1024) || safeBase;

    const row = this.files.create({
      customerId: customer.id,
      parentId: resolvedParentId,
      fileType: FileType.file,
      name: displayName,
      mimeType: file.mimetype,
      sizeBytes: String(file.size),
      storageRelativePath: rel,
    });
    const savedFile = await this.files.save(row);

    let libraryDocument: { id: string } | null = null;
    if (librarySection?.trim()) {
      const section = this.supplierPaths.assertLibrarySection(librarySection.trim());
      const resolved = await this.library.resolveSupplierUploadFolder({
        customerId: customer.id,
        kind: section as FolderLibraryKind,
        supplierName: supplierName?.trim() || undefined,
        supplierFolderId: supplierFolderId?.trim() || undefined,
        allowRestrictedUpload: true,
        allowCreateFolder: !req.user?.customerId,
      });
      const doc = await this.library.createDocument({
        folderId: resolved.supplierFolderId,
        customerId: customer.id,
        displayName,
        originalName: file.originalname,
        fileUrl: rel,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        s3Key: null,
        libraryKind: resolved.kind,
      });
      await this.library.linkDocumentToExtractionFile(doc.id, savedFile.id);
      libraryDocument = doc;
    }

    if (this.s3.isBucketConfigured()) {
      try {
        const uploadKey = `${savedFile.id}-${safeBase}`.replace(/[^\w.\-]+/g, "_").slice(0, 220);
        const { fileKey } = await this.s3.uploadCustomerFile({
          customerId: customer.id,
          folder: "files",
          key: `uploads/${uploadKey}`,
          body: file.buffer,
          contentType: file.mimetype || "application/octet-stream",
        });
        await this.files.update({ id: savedFile.id }, { s3Key: fileKey });
        savedFile.s3Key = fileKey;
        if (libraryDocument) {
          await this.documents.update({ id: libraryDocument.id }, { s3Key: fileKey });
        }
      } catch (e) {
        this.log.warn(`S3 mirror failed for file ${savedFile.id}: ${e instanceof Error ? e.message : e}`);
      }
    }

    const wantExtraction =
      runExtraction !== "false" &&
      runExtraction !== "0" &&
      runExtraction !== "no" &&
      isExtractableUploadMime(file.mimetype, file.originalname);
    const diagnostics: JobDiagnosticEntry[] = [];
    appendJobDiagnostic(diagnostics, "upload", "File stored via POST /files/upload", {
      api: "POST /files/upload",
      fileId: savedFile.id,
      documentId: libraryDocument?.id ?? null,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storageRelativePath: rel,
      customerId: customer.id,
      runExtraction: wantExtraction,
      librarySection: librarySection?.trim() || null,
      parentFolderId: resolvedParentId,
    });
    const uploader = this.uploaderFromReq(req);
    if (!wantExtraction) {
      if (uploader) {
        this.fileUploadNotifications.maybeNotifyCustomerAdmins({
          ...uploader,
          customerId: customer.id,
          fileId: savedFile.id,
          fileName: savedFile.name,
        });
      }
      return { file: savedFile, job: null, diagnostics };
    }

    const jobRow = this.jobs.create({
      customerId: customer.id,
      fileId: libraryDocument ? null : savedFile.id,
      documentId: libraryDocument?.id ?? null,
      type: JobType.extraction,
      status: JobStatus.queued,
      percentCompleted: 0,
      visionPrompt: visionPrompt?.trim() || null,
      structurePrompt: structurePrompt?.trim() || null,
      visionModel: visionModel?.trim() || null,
      structureModel: structureModel?.trim() || null,
      aiProvider: parseAiProviderId(aiProvider),
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
    const effProvider = resolveEffectiveProvider(parseAiProviderId(aiProvider), this.config);
    const effVision = visionModel?.trim() || defaultVisionModel(this.config, effProvider);
    const effStructure = structureModel?.trim() || defaultStructureModel(this.config, effProvider);
    appendJobDiagnostic(diagnostics, "upload", "Extraction job queued", {
      api: "POST /files/upload",
      jobId: savedJob.id,
      pgBossJobId,
      effectiveProvider: effProvider,
      effectiveVisionModel: effVision,
      effectiveStructureModel: effStructure,
      requestedAiProvider: parseAiProviderId(aiProvider),
      requestedVisionModel: visionModel?.trim() || null,
      requestedStructureModel: structureModel?.trim() || null,
    });
    if (uploader) {
      this.fileUploadNotifications.maybeNotifyCustomerAdmins({
        ...uploader,
        customerId: customer.id,
        fileId: savedFile.id,
        fileName: savedFile.name,
      });
    }
    return { file: savedFile, job, diagnostics };
  }
}
