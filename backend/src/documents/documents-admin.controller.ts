import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth } from "@nestjs/swagger";
import { createReadStream } from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { CustomerPortalService } from "../customer-portal/customer-portal.service";
import { FolderLibraryKind } from "../entities/folder.entity";
import { DirectS3UploadService } from "../files/direct-s3-upload.service";
import { S3Service } from "../s3/s3.service";
import { uploadMaxBytes } from "../upload-limits";
import { assertCanDeleteDriveFiles } from "../files/file-delete.policy";
import { PermissionsService } from "../auth/permissions.service";
import { DocumentsAdminService } from "./documents-admin.service";
import { LibraryExportService } from "./library-export.service";
import { FileActivityLogService } from "../file-activity/file-activity-log.service.js";

@ApiBearerAuth("bearer")
@Controller("documents")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("file:read")
export class DocumentsAdminController {
  private readonly log = new Logger(DocumentsAdminController.name);

  constructor(
    private readonly documents: DocumentsAdminService,
    private readonly portalUpload: CustomerPortalService,
    private readonly directS3: DirectS3UploadService,
    private readonly libraryExport: LibraryExportService,
    private readonly s3: S3Service,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
    private readonly fileActivity: FileActivityLogService,
  ) {}

  /** Practice staff (no portal customer scope) may upload into restricted folders. */
  private allowRestrictedUpload(user?: AuthUser): boolean {
    return Boolean(user && !user.customerId);
  }

  /** Staff: upload into portal library folders (same pipeline as portal supplier upload). */
  @Post("upload")
  @RequirePermission("file:write")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: uploadMaxBytes() },
    })
  )
  async upload(
    @Req() req: Request & { user?: AuthUser },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("customerId") customerId: string,
    @Body("libraryKind") libraryKindRaw: string,
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
    if (!customerId?.trim()) {
      throw new BadRequestException("customerId is required");
    }
    const raw = libraryKindRaw?.trim().toLowerCase();
    if (!raw || !(Object.values(FolderLibraryKind) as string[]).includes(raw)) {
      throw new BadRequestException("libraryKind must be invoices, statements, or files");
    }
    if (this.s3.isBucketConfigured()) {
      throw new BadRequestException(
        "Multipart POST /api/documents/upload is disabled while S3_AWS_BUCKET is set (stale UI or non-browser client). Hard-refresh the app, then use upload-s3/init → PUT to S3 → upload-s3/complete.",
      );
    }
    this.log.warn(
      `POST /documents/upload (multipart) customerId=${customerId.trim()} libraryKind=${raw} sizeBytes=${file.size} — S3 bucket unset; dev-only path`,
    );
    const user = req.user;
    if (!user?.userId) {
      throw new BadRequestException("Authentication required");
    }
    return this.portalUpload.uploadForSupplier({
      customerId: customerId.trim(),
      kind: raw as FolderLibraryKind,
      file,
      supplierName,
      supplierFolderId,
      visionPrompt,
      structurePrompt,
      visionModel,
      structureModel,
      aiProvider,
      runExtraction,
      uploadedByUserId: user.userId,
      uploaderIsPracticeStaff: !user.customerId,
      allowRestrictedUpload: this.allowRestrictedUpload(user),
    });
  }

  /** Presigned S3 PUT for large files (no multipart body through this API). */
  @Post("upload-s3/init")
  @RequirePermission("file:write")
  async uploadS3Init(
    @Req() req: Request & { user?: AuthUser },
    @Body("customerId") customerId: string,
    @Body("libraryKind") libraryKindRaw: string,
    @Body("fileName") fileName: string,
    @Body("mimeType") mimeType: string,
    @Body("sizeBytes") sizeBytes: number,
    @Body("supplierName") supplierName?: string,
    @Body("supplierFolderId") supplierFolderId?: string,
  ) {
    if (!customerId?.trim()) {
      throw new BadRequestException("customerId is required");
    }
    let raw = libraryKindRaw?.trim().toLowerCase();
    if (supplierFolderId?.trim()) {
      const inferred = await this.portalUpload.inferLibraryKindForCustomerFolder(
        customerId.trim(),
        supplierFolderId.trim(),
      );
      if (inferred) raw = inferred;
    }
    if (!raw || !(Object.values(FolderLibraryKind) as string[]).includes(raw)) {
      throw new BadRequestException("libraryKind must be invoices, statements, or files");
    }
    this.log.log(
      `POST /documents/upload-s3/init customerId=${customerId.trim()} libraryKind=${raw} fileName=${String(fileName ?? "").slice(0, 120)} sizeBytes=${Number(sizeBytes)}`,
    );
    const out = await this.directS3.initUpload({
      customerId: customerId.trim(),
      fileName: String(fileName ?? ""),
      mimeType: String(mimeType ?? ""),
      sizeBytes: Number(sizeBytes),
      librarySection: raw,
      supplierName,
      supplierFolderId,
      allowRestrictedUpload: this.allowRestrictedUpload(req.user),
    });
    this.log.log(`POST /documents/upload-s3/init ok fileId=${out.fileId}`);
    return out;
  }

  @Post("upload-s3/batch-init")
  @RequirePermission("file:write")
  async uploadS3BatchInit(
    @Req() req: Request & { user?: AuthUser },
    @Body("customerId") customerId: string,
    @Body("libraryKind") libraryKindRaw: string,
    @Body("files") files: Array<{ fileName: string; mimeType: string; sizeBytes: number }>,
    @Body("supplierName") supplierName?: string,
    @Body("supplierFolderId") supplierFolderId?: string,
  ) {
    if (!customerId?.trim()) {
      throw new BadRequestException("customerId is required");
    }
    if (!Array.isArray(files) || files.length === 0) {
      throw new BadRequestException("files array is required");
    }
    let raw = libraryKindRaw?.trim().toLowerCase();
    if (supplierFolderId?.trim()) {
      const inferred = await this.portalUpload.inferLibraryKindForCustomerFolder(
        customerId.trim(),
        supplierFolderId.trim(),
      );
      if (inferred) raw = inferred;
    }
    if (!raw || !(Object.values(FolderLibraryKind) as string[]).includes(raw)) {
      throw new BadRequestException("libraryKind must be invoices, statements, or files");
    }
    this.log.log(
      `POST /documents/upload-s3/batch-init customerId=${customerId.trim()} libraryKind=${raw} count=${files.length}`,
    );
    return this.directS3.initUploadBatch(
      {
        customerId: customerId.trim(),
        librarySection: raw,
        supplierName,
        supplierFolderId,
        allowRestrictedUpload: this.allowRestrictedUpload(req.user),
      },
      files.map((f) => ({
        fileName: String(f?.fileName ?? ""),
        mimeType: String(f?.mimeType ?? ""),
        sizeBytes: Number(f?.sizeBytes),
      })),
    );
  }

  @Post("upload-s3/complete")
  @RequirePermission("file:write")
  async uploadS3Complete(
    @Req() req: Request & { user?: AuthUser },
    @Body("customerId") customerId: string,
    @Body("fileId") fileId: string,
    @Body("libraryKind") libraryKindRaw: string,
    @Body("supplierName") supplierName?: string,
    @Body("supplierFolderId") supplierFolderId?: string,
    @Body("visionPrompt") visionPrompt?: string,
    @Body("structurePrompt") structurePrompt?: string,
    @Body("visionModel") visionModel?: string,
    @Body("structureModel") structureModel?: string,
    @Body("aiProvider") aiProvider?: string,
    @Body("runExtraction") runExtraction?: string,
  ) {
    if (!customerId?.trim() || !fileId?.trim()) {
      throw new BadRequestException("customerId and fileId are required");
    }
    let raw = libraryKindRaw?.trim().toLowerCase();
    if (supplierFolderId?.trim()) {
      const inferred = await this.portalUpload.inferLibraryKindForCustomerFolder(
        customerId.trim(),
        supplierFolderId.trim(),
      );
      if (inferred) raw = inferred;
    }
    if (!raw || !(Object.values(FolderLibraryKind) as string[]).includes(raw)) {
      throw new BadRequestException("libraryKind must be invoices, statements, or files");
    }
    this.log.log(
      `POST /documents/upload-s3/complete customerId=${customerId.trim()} fileId=${fileId.trim()} libraryKind=${raw}`,
    );
    const user = req.user;
    const done = await this.directS3.completeUpload({
      customerId: customerId.trim(),
      fileId: fileId.trim(),
      libraryKind: raw as FolderLibraryKind,
      supplierName,
      supplierFolderId,
      visionPrompt,
      structurePrompt,
      visionModel,
      structureModel,
      aiProvider,
      runExtraction,
      uploadedByUserId: user?.userId,
      uploaderIsPracticeStaff: Boolean(user && !user.customerId),
      allowRestrictedUpload: this.allowRestrictedUpload(user),
    });
    this.log.log(
      `POST /documents/upload-s3/complete ok documentId=${done.document?.id ?? "none"} jobId=${done.job?.id ?? "none"}`,
    );
    return done;
  }

  @Post("upload-s3/batch-complete")
  @RequirePermission("file:write")
  async uploadS3BatchComplete(
    @Req() req: Request & { user?: AuthUser },
    @Body("customerId") customerId: string,
    @Body("libraryKind") libraryKindRaw: string,
    @Body("fileIds") fileIds: string[],
    @Body("supplierName") supplierName?: string,
    @Body("supplierFolderId") supplierFolderId?: string,
    @Body("visionPrompt") visionPrompt?: string,
    @Body("structurePrompt") structurePrompt?: string,
    @Body("visionModel") visionModel?: string,
    @Body("structureModel") structureModel?: string,
    @Body("aiProvider") aiProvider?: string,
    @Body("runExtraction") runExtraction?: string,
  ) {
    if (!customerId?.trim()) {
      throw new BadRequestException("customerId is required");
    }
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new BadRequestException("fileIds array is required");
    }
    let raw = libraryKindRaw?.trim().toLowerCase();
    if (supplierFolderId?.trim()) {
      const inferred = await this.portalUpload.inferLibraryKindForCustomerFolder(
        customerId.trim(),
        supplierFolderId.trim(),
      );
      if (inferred) raw = inferred;
    }
    if (!raw || !(Object.values(FolderLibraryKind) as string[]).includes(raw)) {
      throw new BadRequestException("libraryKind must be invoices, statements, or files");
    }
    this.log.log(
      `POST /documents/upload-s3/batch-complete customerId=${customerId.trim()} libraryKind=${raw} count=${fileIds.length}`,
    );
    const user = req.user;
    return this.directS3.completeUploadBatch({
      customerId: customerId.trim(),
      fileIds: fileIds.map((id) => String(id ?? "").trim()).filter(Boolean),
      libraryKind: raw as FolderLibraryKind,
      supplierName,
      supplierFolderId,
      visionPrompt,
      structurePrompt,
      visionModel,
      structureModel,
      aiProvider,
      runExtraction,
      uploadedByUserId: user?.userId,
      uploaderIsPracticeStaff: Boolean(user && !user.customerId),
      allowRestrictedUpload: this.allowRestrictedUpload(user),
    });
  }

  @Get()
  list(
    @Req() req: Request & { user?: AuthUser },
    @Query("page") pageRaw?: string,
    @Query("limit") limitRaw?: string,
    @Query("sort") sort?: string,
    @Query("customerId") customerId?: string,
    @Query("libraryKind") libraryKind?: string,
    @Query("searchText") searchText?: string,
    @Query("assignedOnly") assignedOnlyRaw?: string,
    @Query("uploadedAfter") uploadedAfter?: string,
    @Query("uploadDateKey") uploadDateKey?: string,
  ) {
    const page = Math.max(1, Number.parseInt(String(pageRaw ?? "1"), 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(limitRaw ?? "20"), 10) || 20));
    let kind: FolderLibraryKind | undefined;
    if (libraryKind && (Object.values(FolderLibraryKind) as string[]).includes(libraryKind)) {
      kind = libraryKind as FolderLibraryKind;
    }
    const assignedOnlyStr = String(assignedOnlyRaw ?? "").trim().toLowerCase();
    const assignedOnly = assignedOnlyStr === "true" || assignedOnlyStr === "1" || assignedOnlyStr === "yes";
    return this.documents.list(
      {
        page,
        limit,
        sort: sort ?? "name,ASC",
        customerId: customerId?.trim() || undefined,
        libraryKind: kind,
        searchText: searchText?.trim() || undefined,
        assignedOnly: assignedOnly === true ? true : undefined,
        uploadedAfter: uploadedAfter?.trim() || undefined,
        uploadDateKey: uploadDateKey?.trim() || undefined,
      },
      req.user,
    );
  }

  @Get("folders/browse")
  listBrowseFolders(
    @Query("customerId") customerId?: string,
    @Query("libraryKind") libraryKind?: string,
    @Query("page") pageRaw?: string,
    @Query("limit") limitRaw?: string,
    @Query("scope") scopeRaw?: string,
    @Query("searchText") searchText?: string,
  ) {
    let kind: FolderLibraryKind | undefined;
    if (libraryKind && (Object.values(FolderLibraryKind) as string[]).includes(libraryKind)) {
      kind = libraryKind as FolderLibraryKind;
    }
    const page = Math.max(1, Number.parseInt(String(pageRaw ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(limitRaw ?? "20"), 10) || 20));
    const scopeStr = String(scopeRaw ?? "customer").trim().toLowerCase();
    const scope = scopeStr === "global" ? "global" : scopeStr === "all" ? "all" : "customer";
    return this.documents.listBrowseLibraryFolders({
      customerId: customerId?.trim() || undefined,
      libraryKind: kind,
      page,
      limit,
      scope,
      searchText: searchText?.trim() || undefined,
    });
  }

  @Get("folders/all")
  listAllFolders(
    @Query("customerId") customerId?: string,
    @Query("libraryKind") libraryKind?: string,
  ) {
    let kind: FolderLibraryKind | undefined;
    if (libraryKind && (Object.values(FolderLibraryKind) as string[]).includes(libraryKind)) {
      kind = libraryKind as FolderLibraryKind;
    }
    return this.documents.listAllLibraryFolders({
      customerId: customerId?.trim() || undefined,
      libraryKind: kind,
    });
  }

  /** Active customers for Files filters — scoped like library browse; requires `file:read` only. */
  @Get("library-customer-filter-options")
  listLibraryCustomerFilterOptions(
    @Req() req: Request & { user?: AuthUser },
    @Query("page") pageRaw?: string,
    @Query("limit") limitRaw?: string,
    @Query("searchText") searchText?: string,
  ) {
    const page = Math.max(1, Number.parseInt(String(pageRaw ?? "1"), 10) || 1);
    const limit = Math.min(500, Math.max(1, Number.parseInt(String(limitRaw ?? "500"), 10) || 500));
    return this.documents.listLibraryCustomerFilterOptions(req.user, {
      page,
      limit,
      searchText: searchText?.trim() || undefined,
    });
  }

  @Post("library-exports")
  createLibraryExport(
    @Req() req: Request & { user?: AuthUser },
    @Body()
    body: {
      customerId?: string;
      viewMode?: string;
      libraryKind?: string;
      folderId?: string;
      folderName?: string;
      year?: number;
      month?: number;
      day?: number;
      searchText?: string;
      assignedOnly?: boolean;
      uploadedAfter?: string;
      uploadedBefore?: string;
      documentIds?: string[];
    },
  ) {
    const requestedCustomerId = body?.customerId?.trim() || undefined;
    const viewModeRaw = String(body?.viewMode ?? "folderView").trim();
    const viewMode =
      viewModeRaw === "customerView" || viewModeRaw === "dateView" ? viewModeRaw : ("folderView" as const);
    let kind: FolderLibraryKind | undefined;
    const rawKind = String(body?.libraryKind ?? "").trim();
    if (rawKind && (Object.values(FolderLibraryKind) as string[]).includes(rawKind)) {
      kind = rawKind as FolderLibraryKind;
    }
    return this.libraryExport.createExport(req.user, {
      customerId: requestedCustomerId,
      viewMode,
      libraryKind: kind,
      folderId: body?.folderId?.trim() || undefined,
      folderName: body?.folderName?.trim() || undefined,
      year: body?.year != null ? Number(body.year) : undefined,
      month: body?.month != null ? Number(body.month) : undefined,
      day: body?.day != null ? Number(body.day) : undefined,
      searchText: body?.searchText?.trim() || undefined,
      assignedOnly: body?.assignedOnly === true ? true : undefined,
      uploadedAfter: body?.uploadedAfter?.trim() || undefined,
      uploadedBefore: body?.uploadedBefore?.trim() || undefined,
      documentIds: Array.isArray(body?.documentIds)
        ? body.documentIds.map((id) => String(id).trim()).filter(Boolean)
        : undefined,
    }).then((row) => ({
      id: row.id,
      customerId: row.customerId,
      status: row.status,
      filters: row.filters,
      fileCount: row.fileCount,
      zipFileName: row.zipFileName,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
  }

  @Get("library-exports/:exportId")
  getLibraryExport(@Req() req: Request & { user?: AuthUser }, @Param("exportId", ParseUUIDPipe) exportId: string) {
    return this.libraryExport.getExportForUser(exportId, req.user).then((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerName: row.customer?.name ?? null,
      status: row.status,
      filters: row.filters,
      fileCount: row.fileCount,
      zipFileName: row.zipFileName,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
  }

  @Get("library-exports/:exportId/download")
  async downloadLibraryExport(
    @Req() req: Request & { user?: AuthUser },
    @Param("exportId", ParseUUIDPipe) exportId: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.libraryExport.getDownloadFile(exportId, req.user, req);
    const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "library-export.zip";
    return new StreamableFile(buffer, {
      type: "application/zip",
      disposition: `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
  }

  @Get("dashboard/customer-uploads")
  @RequirePermission("file:read")
  customerUploadDashboard(
    @Req() req: Request & { user?: AuthUser },
    @Query("customerId") customerId?: string,
    @Query("libraryKind") libraryKind?: string,
    @Query("assignedOnly") assignedOnlyRaw?: string,
    @Query("uploadedAfter") uploadedAfter?: string,
    @Query("uploadedBefore") uploadedBefore?: string,
    @Query("page") pageRaw?: string,
    @Query("limit") limitRaw?: string,
  ) {
    let kind: FolderLibraryKind | undefined;
    if (libraryKind && (Object.values(FolderLibraryKind) as string[]).includes(libraryKind)) {
      kind = libraryKind as FolderLibraryKind;
    }
    const assignedOnlyStr = String(assignedOnlyRaw ?? "").trim().toLowerCase();
    const assignedOnly = assignedOnlyStr === "true" || assignedOnlyStr === "1" || assignedOnlyStr === "yes";
    const page = Math.max(1, Number.parseInt(String(pageRaw ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(limitRaw ?? "20"), 10) || 20));
    return this.documents.getCustomerDocumentUploadDashboard(
      {
        customerId: customerId?.trim() || undefined,
        libraryKind: kind,
        assignedOnly,
        uploadedAfter: uploadedAfter?.trim() || undefined,
        uploadedBefore: uploadedBefore?.trim() || undefined,
        page,
        limit,
      },
      req.user,
    );
  }

  @Get("customer-document-counts")
  @RequirePermission("file:read")
  customerDocumentCounts(
    @Req() req: Request & { user?: AuthUser },
    @Query("customerIds") customerIdsRaw?: string,
    @Query("libraryKind") libraryKind?: string,
    @Query("assignedOnly") assignedOnlyRaw?: string,
  ) {
    let kind: FolderLibraryKind | undefined;
    if (libraryKind && (Object.values(FolderLibraryKind) as string[]).includes(libraryKind)) {
      kind = libraryKind as FolderLibraryKind;
    }
    const ids = String(customerIdsRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const assignedOnlyStr = String(assignedOnlyRaw ?? "").trim().toLowerCase();
    const assignedOnly = assignedOnlyStr === "true" || assignedOnlyStr === "1" || assignedOnlyStr === "yes";
    return this.documents.countLibraryDocumentsByCustomerIds(
      ids,
      { libraryKind: kind, assignedOnly },
      req.user,
    );
  }

  @Get("dates/browse")
  listBrowseDates(
    @Req() req: Request & { user?: AuthUser },
    @Query("level") levelRaw?: string,
    @Query("page") pageRaw?: string,
    @Query("limit") limitRaw?: string,
    @Query("year") yearRaw?: string,
    @Query("month") monthRaw?: string,
    @Query("day") dayRaw?: string,
    @Query("dateKey") dateKey?: string,
    @Query("customerId") customerId?: string,
    @Query("folderId") folderId?: string,
    @Query("libraryKind") libraryKind?: string,
    @Query("searchText") searchText?: string,
    @Query("assignedOnly") assignedOnlyRaw?: string,
    @Query("dateBasis") dateBasisRaw?: string,
  ) {
    const levelStr = String(levelRaw ?? "years").trim().toLowerCase();
    const levels = ["years", "months", "days", "dates", "customers", "folders", "documents"] as const;
    if (!levels.includes(levelStr as (typeof levels)[number])) {
      throw new BadRequestException("level must be years, months, days, dates, customers, folders, or documents");
    }
    let kind: FolderLibraryKind | undefined;
    if (libraryKind && (Object.values(FolderLibraryKind) as string[]).includes(libraryKind)) {
      kind = libraryKind as FolderLibraryKind;
    }
    const page = Math.max(1, Number.parseInt(String(pageRaw ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(limitRaw ?? "20"), 10) || 20));
    const assignedOnlyStr = String(assignedOnlyRaw ?? "").trim().toLowerCase();
    const assignedOnly = assignedOnlyStr === "true" || assignedOnlyStr === "1" || assignedOnlyStr === "yes";
    const year = yearRaw != null && yearRaw !== "" ? Number.parseInt(yearRaw, 10) : undefined;
    const month = monthRaw != null && monthRaw !== "" ? Number.parseInt(monthRaw, 10) : undefined;
    const day = dayRaw != null && dayRaw !== "" ? Number.parseInt(dayRaw, 10) : undefined;
    const dateBasisStr = String(dateBasisRaw ?? "").trim().toLowerCase();
    const dateBasis = dateBasisStr === "uploaded" ? ("uploaded" as const) : undefined;
    return this.documents.listBrowseLibraryDates(
      {
        level: levelStr as (typeof levels)[number],
        page,
        limit,
        year: Number.isFinite(year) ? year : undefined,
        month: Number.isFinite(month) ? month : undefined,
        day: Number.isFinite(day) ? day : undefined,
        dateKey: dateKey?.trim() || undefined,
        customerId: customerId?.trim() || undefined,
        folderId: folderId?.trim() || undefined,
        libraryKind: kind,
        searchText: searchText?.trim() || undefined,
        assignedOnly: assignedOnly === true ? true : undefined,
        dateBasis,
      },
      req.user,
    );
  }

  @Delete("folders/:folderId")
  @RequirePermission("file:delete")
  async removeFolder(
    @Req() req: Request & { user?: AuthUser },
    @Param("folderId", ParseUUIDPipe) folderId: string,
  ) {
    await assertCanDeleteDriveFiles(req.user, this.permissions);
    return this.documents.softDeleteLibraryFolder(folderId, req.user);
  }

  @Get("folders/:folderId/documents")
  listFolderDocuments(
    @Req() req: Request & { user?: AuthUser },
    @Param("folderId", ParseUUIDPipe) folderId: string,
  ) {
    return this.documents.listDocumentsInFolder(folderId, req.user);
  }

  @Get("assignee-candidates")
  @RequirePermission("document:assign")
  assigneeCandidates(@Query("customerId") customerId?: string) {
    return this.documents.listAssigneeCandidates(customerId?.trim() || undefined);
  }

  @Post("bulk-delete")
  @RequirePermission("file:delete")
  async bulkRemove(@Req() req: Request & { user?: AuthUser }, @Body() body: { ids?: unknown }) {
    await assertCanDeleteDriveFiles(req.user, this.permissions);
    const ids = Array.isArray(body?.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [];
    return this.documents.softDeleteDocuments(ids, req.user);
  }

  @Delete(":id")
  @RequirePermission("file:delete")
  async remove(@Req() req: Request & { user?: AuthUser }, @Param("id", ParseUUIDPipe) id: string) {
    await assertCanDeleteDriveFiles(req.user, this.permissions);
    return this.documents.softDeleteDocument(id, req.user);
  }

  @Get("file-access/latest")
  latestFileAccess(
    @Req() req: Request & { user?: AuthUser },
    @Query("documentIds") documentIdsRaw?: string,
  ) {
    const ids = (documentIdsRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return this.documents.getLatestFileAccessForList(ids, req.user);
  }

  @Get(":id/jobs")
  jobsForDocument(@Req() req: Request & { user?: AuthUser }, @Param("id", ParseUUIDPipe) id: string) {
    const actor = req.user;
    this.log.log(
      `[documents/:id/jobs] user=${actor?.userId ?? "anon"} isAdmin=${actor?.isAdmin ?? false} customerId=${actor?.customerId ?? "null"} doc=${id}`,
    );
    return this.documents.jobsForDocument(id, req.user);
  }

  @Post(":id/requeue-extraction")
  @RequirePermission("job:create")
  requeueExtraction(@Req() req: Request & { user?: AuthUser }, @Param("id", ParseUUIDPipe) id: string) {
    return this.documents.requeueExtractionForDocument(id, req.user);
  }

  @Get(":id")
  one(@Req() req: Request & { user?: AuthUser }, @Param("id", ParseUUIDPipe) id: string) {
    const actor = req.user;
    this.log.log(
      `[documents/:id] user=${actor?.userId ?? "anon"} isAdmin=${actor?.isAdmin ?? false} customerId=${actor?.customerId ?? "null"} doc=${id}`,
    );
    return this.documents.getOne(id, req.user);
  }

  @Get(":id/content")
  async content(
    @Req() req: Request & { user?: AuthUser },
    @Param("id", ParseUUIDPipe) id: string,
    @Query("download") download?: string,
  ): Promise<StreamableFile> {
    const actor = req.user;
    this.log.log(
      `[documents/:id/content] user=${actor?.userId ?? "anon"} isAdmin=${actor?.isAdmin ?? false} customerId=${actor?.customerId ?? "null"} doc=${id}`,
    );
    const doc = await this.documents.getOne(id, req.user);
    const isDownload = download === "1" || download === "true";
    await this.fileActivity.recordContentAccessAwait({
      document: doc,
      download: isDownload,
      req,
      route: "GET /documents/:id/content",
    });
    const customerId = doc.customerId ?? doc.folder?.customerId ?? null;
    if (!customerId) {
      this.log.warn(`[documents/:id/content] missing customer on doc=${id} user=${actor?.userId ?? "anon"}`);
      throw new NotFoundException("Document customer not found");
    }
    const root = this.config.get<string>("FILE_STORAGE_ROOT");
    if (!root) {
      throw new ServiceUnavailableException("FILE_STORAGE_ROOT not configured");
    }
    const mimeFromCol = typeof doc.mimeType === "string" ? doc.mimeType.trim() : "";
    const mimeFromMeta =
      doc.metadata && typeof doc.metadata.mimeType === "string" ? doc.metadata.mimeType.trim() : "";
    const mimeType = mimeFromCol || mimeFromMeta || "application/octet-stream";
    const s3Key = doc.s3Key?.trim();
    if (s3Key) {
      this.log.log(
        `[documents/:id/content] source=s3 customer=${customerId} doc=${id} user=${actor?.userId ?? "anon"}`,
      );
      const buf = await this.s3.getObjectBufferByKey(s3Key);
      return new StreamableFile(Readable.from(buf), {
        type: mimeType,
        length: buf.length,
        disposition: `inline; filename="${encodeURIComponent(id)}"`,
      });
    }
    const rel = doc.fileUrl?.trim().replace(/^\/+/, "");
    if (!rel) {
      throw new NotFoundException("document not found");
    }
    const abs = path.join(root, customerId, rel);
    this.log.log(
      `[documents/:id/content] source=disk customer=${customerId} doc=${id} user=${actor?.userId ?? "anon"}`,
    );
    return new StreamableFile(createReadStream(abs), {
      type: mimeType,
      disposition: `inline; filename="${encodeURIComponent(id)}"`,
    });
  }

  @Get(":id/assignees")
  @RequirePermission("job:read")
  assignees(@Param("id", ParseUUIDPipe) id: string) {
    return this.documents.listDocumentAssignees(id);
  }

  @Post(":id/assignees")
  @RequirePermission("document:assign")
  replaceAssignees(
    @Req() req: Request & { user?: AuthUser },
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { userIds?: string[] },
  ) {
    const userIds = Array.isArray(body?.userIds) ? body.userIds : [];
    return this.documents.replaceDocumentAssignees(id, userIds, req.user);
  }
}
