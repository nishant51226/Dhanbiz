import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FolderLibraryKind } from "../entities/folder.entity";
import { DocumentsAdminService } from "../documents/documents-admin.service";
import { DirectS3UploadService } from "../files/direct-s3-upload.service";
import { S3Service } from "../s3/s3.service";
import { uploadMaxBytes } from "../upload-limits";
import { CustomerPortalService, parsePortalFolderParentId } from "./customer-portal.service";
import { FileActivityLogService } from "../file-activity/file-activity-log.service.js";

type AuthedRequest = Request & { user?: AuthUser };

@ApiBearerAuth("bearer")
@ApiTags("customer-portal")
@Controller("customer-portal")
@UseGuards(JwtAuthGuard)
export class CustomerPortalController {
  constructor(
    private readonly portal: CustomerPortalService,
    private readonly documentsAdmin: DocumentsAdminService,
    private readonly config: ConfigService,
    private readonly s3: S3Service,
    private readonly directS3: DirectS3UploadService,
    private readonly dataSource: DataSource,
    private readonly fileActivity: FileActivityLogService,
  ) {}

  /** Portal JWT: own org only. Practice staff: same checks as `PermissionsGuard` (staff_customer_assignments). */
  private async assertCustomerAccess(req: AuthedRequest, customerId: string): Promise<void> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.isAdmin) {
      return;
    }
    if (user.customerId) {
      if (user.customerId !== customerId) {
        throw new ForbiddenException("Forbidden");
      }
      return;
    }
    const rows = await this.dataSource.query(
      `
      SELECT 1
      FROM staff_customer_assignments sca
      WHERE sca.staff_user_id = $1
        AND sca.customer_id = $2
      LIMIT 1
      `,
      [user.userId, customerId],
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ForbiddenException("Forbidden");
    }
  }

  private uploadActor(req: AuthedRequest) {
    const user = req.user;
    if (!user?.userId) {
      throw new UnauthorizedException();
    }
    return {
      uploadedByUserId: user.userId,
      uploaderIsPracticeStaff: !user.customerId,
    };
  }

  /** Portal customer users cannot upload to restricted folders; staff/admin can. */
  private allowRestrictedUpload(req: AuthedRequest): boolean {
    return !req.user?.customerId;
  }

  /** Portal customer users cannot create library folders; practice staff can. */
  private allowCreateFolder(req: AuthedRequest): boolean {
    return !req.user?.customerId;
  }

  private uploadFolderListOptions(req: AuthedRequest) {
    return { excludeRestricted: Boolean(req.user?.customerId) };
  }

  /** With S3 configured, staff/portal clients must use `.../library/:kind/upload-s3/*` instead of multipart `upload-for-supplier`. */
  private assertLibraryMultipartDisabledIfS3(): void {
    if (this.s3.isBucketConfigured()) {
      throw new BadRequestException(
        "Multipart upload-for-supplier is disabled when S3_AWS_BUCKET is set. Use POST …/customer-portal/:customerId/library/:kind/upload-s3/init, PUT to S3, then …/upload-s3/complete.",
      );
    }
  }

  @Get(":customerId/documents/:documentId/content")
  @ApiOperation({ summary: "Stream binary content for a library document (invoices/statements/files)" })
  async getDocumentContent(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Param("documentId") documentId: string,
    @Query("download") download?: string,
  ): Promise<StreamableFile> {
    await this.assertCustomerAccess(req, customerId);
    const isDownload = download === "1" || download === "true";
    this.fileActivity.recordContentAccess({
      documentId,
      download: isDownload,
      req,
      route: "GET /customer-portal/:customerId/documents/:documentId/content",
    });
    const root = this.config.get<string>("FILE_STORAGE_ROOT");
    if (!root) {
      throw new ServiceUnavailableException("FILE_STORAGE_ROOT not configured");
    }
    const src = await this.portal.resolveDocumentContentSource(customerId, documentId, root);
    if (src.mode === "s3") {
      const buf = await this.s3.getObjectBufferByKey(src.key);
      return new StreamableFile(Readable.from(buf), {
        type: src.mimeType,
        length: buf.length,
        disposition: `inline; filename="${encodeURIComponent(documentId)}"`,
      });
    }
    return new StreamableFile(createReadStream(src.abs), {
      type: src.mimeType,
      disposition: `inline; filename="${encodeURIComponent(documentId)}"`,
    });
  }

  @Get(":customerId/folders/suppliers")
  @ApiOperation({
    summary: "List all library supplier folders (invoices, statements, files) for a unified upload destination picker",
  })
  async listAllLibraryFolderSuppliers(@Req() req: AuthedRequest, @Param("customerId") customerId: string) {
    await this.assertCustomerAccess(req, customerId);
    return { suppliers: await this.portal.listSuppliersAll(customerId, this.uploadFolderListOptions(req)) };
  }

  @Get(":customerId/folders/browse")
  @ApiOperation({ summary: "Paginated leaf folders for folder view (supplier level)" })
  async browseLibraryFolders(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Query("page") pageRaw?: string,
    @Query("limit") limitRaw?: string,
    @Query("libraryKind") libraryKind?: string,
    @Query("scope") scopeRaw?: string,
    @Query("searchText") searchText?: string,
  ) {
    await this.assertCustomerAccess(req, customerId);
    const page = Math.max(1, Number.parseInt(String(pageRaw ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(limitRaw ?? "20"), 10) || 20));
    const scopeStr = String(scopeRaw ?? "customer").trim().toLowerCase();
    const scope = scopeStr === "global" ? "global" : scopeStr === "all" ? "all" : "customer";
    let kinds: FolderLibraryKind[] = [
      FolderLibraryKind.invoices,
      FolderLibraryKind.statements,
      FolderLibraryKind.files,
    ];
    if (libraryKind && (Object.values(FolderLibraryKind) as string[]).includes(libraryKind)) {
      kinds = [libraryKind as FolderLibraryKind];
    }
    return this.portal.listBrowseFoldersPaginated(
      customerId,
      kinds,
      page,
      limit,
      scope,
      searchText?.trim() || undefined,
    );
  }

  @Get(":customerId/dates/browse")
  @ApiOperation({ summary: "Paginated date drill-down for date view (year → month → day → folder → documents)" })
  async browseLibraryDates(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Query("level") levelRaw?: string,
    @Query("page") pageRaw?: string,
    @Query("limit") limitRaw?: string,
    @Query("year") yearRaw?: string,
    @Query("month") monthRaw?: string,
    @Query("day") dayRaw?: string,
    @Query("dateKey") dateKey?: string,
    @Query("folderId") folderId?: string,
    @Query("libraryKind") libraryKind?: string,
    @Query("searchText") searchText?: string,
    @Query("dateBasis") dateBasisRaw?: string,
  ) {
    await this.assertCustomerAccess(req, customerId);
    const levelStr = String(levelRaw ?? "years").trim().toLowerCase();
    const levels = ["years", "months", "days", "dates", "customers", "folders", "documents"] as const;
    if (!levels.includes(levelStr as (typeof levels)[number])) {
      throw new BadRequestException("level must be years, months, days, dates, customers, folders, or documents");
    }
    let kinds: FolderLibraryKind[] = [
      FolderLibraryKind.invoices,
      FolderLibraryKind.statements,
      FolderLibraryKind.files,
    ];
    if (libraryKind && (Object.values(FolderLibraryKind) as string[]).includes(libraryKind)) {
      kinds = [libraryKind as FolderLibraryKind];
    }
    const page = Math.max(1, Number.parseInt(String(pageRaw ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(limitRaw ?? "20"), 10) || 20));
    const year = yearRaw != null && yearRaw !== "" ? Number.parseInt(yearRaw, 10) : undefined;
    const month = monthRaw != null && monthRaw !== "" ? Number.parseInt(monthRaw, 10) : undefined;
    const day = dayRaw != null && dayRaw !== "" ? Number.parseInt(dayRaw, 10) : undefined;
    const dateBasisStr = String(dateBasisRaw ?? "").trim().toLowerCase();
    const dateBasis = dateBasisStr === "uploaded" ? ("uploaded" as const) : undefined;
    return this.documentsAdmin.listBrowseLibraryDates(
      {
        level: levelStr as (typeof levels)[number],
        page,
        limit,
        year: Number.isFinite(year) ? year : undefined,
        month: Number.isFinite(month) ? month : undefined,
        day: Number.isFinite(day) ? day : undefined,
        dateKey: dateKey?.trim() || undefined,
        customerId,
        folderId: folderId?.trim() || undefined,
        libraryKind: kinds.length === 1 ? kinds[0] : undefined,
        searchText: searchText?.trim() || undefined,
        dateBasis,
      },
      req.user,
    );
  }

  @Post(":customerId/library/:kind/upload-s3/init")
  @ApiOperation({
    summary: "Presigned PUT for large library uploads (browser → S3, then POST …/complete)",
  })
  async libraryUploadS3Init(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Param("kind") kind: string,
    @Body() body: { fileName: string; mimeType: string; sizeBytes: number; supplierName?: string; supplierFolderId?: string },
  ) {
    await this.assertCustomerAccess(req, customerId);
    let k = kind.trim().toLowerCase();
    if (body?.supplierFolderId?.trim()) {
      const inferred = await this.portal.inferLibraryKindForCustomerFolder(customerId, body.supplierFolderId.trim());
      if (inferred) k = inferred;
    }
    if (!["invoices", "statements", "files"].includes(k)) {
      throw new BadRequestException("kind must be invoices, statements, or files");
    }
    return this.directS3.initUpload({
      customerId,
      fileName: String(body?.fileName ?? ""),
      mimeType: String(body?.mimeType ?? ""),
      sizeBytes: Number(body?.sizeBytes),
      librarySection: k,
      supplierName: body?.supplierName,
      supplierFolderId: body?.supplierFolderId,
      allowRestrictedUpload: this.allowRestrictedUpload(req),
      allowCreateFolder: this.allowCreateFolder(req),
    });
  }

  @Post(":customerId/library/:kind/upload-s3/batch-init")
  @ApiOperation({ summary: "Batch presigned PUT metadata for many library files (one request)" })
  async libraryUploadS3BatchInit(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Param("kind") kind: string,
    @Body()
    body: {
      files: Array<{ fileName: string; mimeType: string; sizeBytes: number }>;
      supplierName?: string;
      supplierFolderId?: string;
    },
  ) {
    await this.assertCustomerAccess(req, customerId);
    let k = kind.trim().toLowerCase();
    if (body?.supplierFolderId?.trim()) {
      const inferred = await this.portal.inferLibraryKindForCustomerFolder(customerId, body.supplierFolderId.trim());
      if (inferred) k = inferred;
    }
    if (!["invoices", "statements", "files"].includes(k)) {
      throw new BadRequestException("kind must be invoices, statements, or files");
    }
    if (!Array.isArray(body?.files) || body.files.length === 0) {
      throw new BadRequestException("files array is required");
    }
    return this.directS3.initUploadBatch(
      {
        customerId,
        librarySection: k,
        supplierName: body?.supplierName,
        supplierFolderId: body?.supplierFolderId,
        allowRestrictedUpload: this.allowRestrictedUpload(req),
        allowCreateFolder: this.allowCreateFolder(req),
      },
      body.files.map((f) => ({
        fileName: String(f?.fileName ?? ""),
        mimeType: String(f?.mimeType ?? ""),
        sizeBytes: Number(f?.sizeBytes),
      })),
    );
  }

  @Post(":customerId/library/:kind/upload-s3/complete")
  @ApiOperation({ summary: "After PUT to S3: create document, optional mirror to disk, queue extraction" })
  async libraryUploadS3Complete(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Param("kind") kind: string,
    @Body()
    body: {
      fileId: string;
      runExtraction?: string;
      visionPrompt?: string;
      structurePrompt?: string;
      visionModel?: string;
      structureModel?: string;
      aiProvider?: string;
      supplierName?: string;
      supplierFolderId?: string;
    },
  ) {
    await this.assertCustomerAccess(req, customerId);
    let k = kind.trim().toLowerCase();
    if (body?.supplierFolderId?.trim()) {
      const inferred = await this.portal.inferLibraryKindForCustomerFolder(customerId, body.supplierFolderId.trim());
      if (inferred) k = inferred;
    }
    if (!["invoices", "statements", "files"].includes(k)) {
      throw new BadRequestException("kind must be invoices, statements, or files");
    }
    const user = req.user;
    return this.directS3.completeUpload({
      customerId,
      fileId: String(body?.fileId ?? ""),
      runExtraction: body?.runExtraction,
      visionPrompt: body?.visionPrompt,
      structurePrompt: body?.structurePrompt,
      visionModel: body?.visionModel,
      structureModel: body?.structureModel,
      aiProvider: body?.aiProvider,
      libraryKind: k as FolderLibraryKind,
      supplierName: body?.supplierName,
      supplierFolderId: body?.supplierFolderId,
      uploadedByUserId: user?.userId,
      uploaderIsPracticeStaff: Boolean(user && !user.customerId),
      allowRestrictedUpload: this.allowRestrictedUpload(req),
      allowCreateFolder: this.allowCreateFolder(req),
    });
  }

  @Post(":customerId/library/:kind/upload-s3/batch-complete")
  @ApiOperation({ summary: "Finalize many library S3 uploads after PUT (one request)" })
  async libraryUploadS3BatchComplete(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Param("kind") kind: string,
    @Body()
    body: {
      fileIds: string[];
      runExtraction?: string;
      visionPrompt?: string;
      structurePrompt?: string;
      visionModel?: string;
      structureModel?: string;
      aiProvider?: string;
      supplierName?: string;
      supplierFolderId?: string;
    },
  ) {
    await this.assertCustomerAccess(req, customerId);
    let k = kind.trim().toLowerCase();
    if (body?.supplierFolderId?.trim()) {
      const inferred = await this.portal.inferLibraryKindForCustomerFolder(customerId, body.supplierFolderId.trim());
      if (inferred) k = inferred;
    }
    if (!["invoices", "statements", "files"].includes(k)) {
      throw new BadRequestException("kind must be invoices, statements, or files");
    }
    if (!Array.isArray(body?.fileIds) || body.fileIds.length === 0) {
      throw new BadRequestException("fileIds array is required");
    }
    const user = req.user;
    return this.directS3.completeUploadBatch({
      customerId,
      fileIds: body.fileIds.map((id) => String(id ?? "").trim()).filter(Boolean),
      runExtraction: body?.runExtraction,
      visionPrompt: body?.visionPrompt,
      structurePrompt: body?.structurePrompt,
      visionModel: body?.visionModel,
      structureModel: body?.structureModel,
      aiProvider: body?.aiProvider,
      libraryKind: k as FolderLibraryKind,
      supplierName: body?.supplierName,
      supplierFolderId: body?.supplierFolderId,
      uploadedByUserId: user?.userId,
      uploaderIsPracticeStaff: Boolean(user && !user.customerId),
      allowRestrictedUpload: this.allowRestrictedUpload(req),
      allowCreateFolder: this.allowCreateFolder(req),
    });
  }

  @Get(":customerId/invoices/library")
  @ApiOperation({ summary: "Full invoice library: all folders + documents for Miller UI" })
  async getInvoicesLibrary(@Req() req: AuthedRequest, @Param("customerId") customerId: string) {
    await this.assertCustomerAccess(req, customerId);
    return this.portal.getLibraryTree(customerId, FolderLibraryKind.invoices);
  }

  @Get(":customerId/invoices/folders")
  @ApiOperation({ summary: "List invoice library folders (documents tree)" })
  async listInvoicesFolders(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Query("parentId") parentId?: string
  ) {
    await this.assertCustomerAccess(req, customerId);
    const pid = parsePortalFolderParentId(parentId);
    return this.portal.listFolders(customerId, FolderLibraryKind.invoices, pid);
  }

  @Get(":customerId/invoices/folders/all")
  @ApiOperation({ summary: "List all invoice library folders (metadata only, no documents)" })
  async listAllInvoicesFolders(@Req() req: AuthedRequest, @Param("customerId") customerId: string) {
    await this.assertCustomerAccess(req, customerId);
    return this.portal.listAllFolders(customerId, FolderLibraryKind.invoices);
  }

  @Get(":customerId/invoices/folders/:folderId/documents")
  @ApiOperation({ summary: "List documents in an invoice library folder" })
  async listInvoicesDocuments(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Param("folderId") folderId: string
  ) {
    await this.assertCustomerAccess(req, customerId);
    return this.portal.listDocuments(customerId, FolderLibraryKind.invoices, folderId);
  }

  @Get(":customerId/invoices/suppliers")
  @ApiOperation({ summary: "List supplier folders for invoice uploads" })
  async listInvoicesSuppliers(@Req() req: AuthedRequest, @Param("customerId") customerId: string) {
    await this.assertCustomerAccess(req, customerId);
    return { suppliers: await this.portal.listSuppliers(customerId, FolderLibraryKind.invoices, this.uploadFolderListOptions(req)) };
  }

  @Post(":customerId/invoices/upload-for-supplier")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: uploadMaxBytes() },
    })
  )
  @ApiOperation({ summary: "Upload a file into invoice library (folders + documents + job)" })
  async uploadInvoices(
    @Req() req: AuthedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Param("customerId") customerId: string,
    @Body("supplierName") supplierName?: string,
    @Body("supplierFolderId") supplierFolderId?: string,
    @Body("visionPrompt") visionPrompt?: string,
    @Body("structurePrompt") structurePrompt?: string,
    @Body("visionModel") visionModel?: string,
    @Body("structureModel") structureModel?: string,
    @Body("aiProvider") aiProvider?: string,
    @Body("runExtraction") runExtraction?: string
  ) {
    if (!file) throw new BadRequestException('Missing file field "file".');
    await this.assertCustomerAccess(req, customerId);
    this.assertLibraryMultipartDisabledIfS3();
    return this.portal.uploadForSupplier({
      customerId,
      kind: FolderLibraryKind.invoices,
      file,
      supplierName,
      supplierFolderId,
      visionPrompt,
      structurePrompt,
      visionModel,
      structureModel,
      aiProvider,
      runExtraction,
      ...this.uploadActor(req),
      allowRestrictedUpload: this.allowRestrictedUpload(req),
    });
  }

  @Get(":customerId/statements/library")
  @ApiOperation({ summary: "Full statement library: all folders + documents for Miller UI" })
  async getStatementsLibrary(@Req() req: AuthedRequest, @Param("customerId") customerId: string) {
    await this.assertCustomerAccess(req, customerId);
    return this.portal.getLibraryTree(customerId, FolderLibraryKind.statements);
  }

  @Get(":customerId/statements/folders")
  @ApiOperation({ summary: "List statement library folders" })
  async listStatementsFolders(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Query("parentId") parentId?: string
  ) {
    await this.assertCustomerAccess(req, customerId);
    const pid = parsePortalFolderParentId(parentId);
    return this.portal.listFolders(customerId, FolderLibraryKind.statements, pid);
  }

  @Get(":customerId/statements/folders/all")
  @ApiOperation({ summary: "List all statement library folders (metadata only, no documents)" })
  async listAllStatementsFolders(@Req() req: AuthedRequest, @Param("customerId") customerId: string) {
    await this.assertCustomerAccess(req, customerId);
    return this.portal.listAllFolders(customerId, FolderLibraryKind.statements);
  }

  @Get(":customerId/statements/folders/:folderId/documents")
  async listStatementsDocuments(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Param("folderId") folderId: string
  ) {
    await this.assertCustomerAccess(req, customerId);
    return this.portal.listDocuments(customerId, FolderLibraryKind.statements, folderId);
  }

  @Get(":customerId/statements/suppliers")
  async listStatementsSuppliers(@Req() req: AuthedRequest, @Param("customerId") customerId: string) {
    await this.assertCustomerAccess(req, customerId);
    return { suppliers: await this.portal.listSuppliers(customerId, FolderLibraryKind.statements, this.uploadFolderListOptions(req)) };
  }

  @Post(":customerId/statements/upload-for-supplier")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: uploadMaxBytes() },
    })
  )
  async uploadStatements(
    @Req() req: AuthedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Param("customerId") customerId: string,
    @Body("supplierName") supplierName?: string,
    @Body("supplierFolderId") supplierFolderId?: string,
    @Body("visionPrompt") visionPrompt?: string,
    @Body("structurePrompt") structurePrompt?: string,
    @Body("visionModel") visionModel?: string,
    @Body("structureModel") structureModel?: string,
    @Body("aiProvider") aiProvider?: string,
    @Body("runExtraction") runExtraction?: string
  ) {
    if (!file) throw new BadRequestException('Missing file field "file".');
    await this.assertCustomerAccess(req, customerId);
    return this.portal.uploadForSupplier({
      customerId,
      kind: FolderLibraryKind.statements,
      file,
      supplierName,
      supplierFolderId,
      visionPrompt,
      structurePrompt,
      visionModel,
      structureModel,
      aiProvider,
      runExtraction,
      ...this.uploadActor(req),
      allowRestrictedUpload: this.allowRestrictedUpload(req),
    });
  }

  @Get(":customerId/files/library")
  async getFilesLibrary(@Req() req: AuthedRequest, @Param("customerId") customerId: string) {
    await this.assertCustomerAccess(req, customerId);
    return this.portal.getLibraryTree(customerId, FolderLibraryKind.files);
  }

  @Get(":customerId/files/folders")
  @ApiOperation({ summary: "List files-library folders" })
  async listFilesFolders(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Query("parentId") parentId?: string
  ) {
    await this.assertCustomerAccess(req, customerId);
    const pid = parsePortalFolderParentId(parentId);
    return this.portal.listFolders(customerId, FolderLibraryKind.files, pid);
  }

  @Get(":customerId/files/folders/all")
  @ApiOperation({ summary: "List all files-library folders (metadata only, no documents)" })
  async listAllFilesFolders(@Req() req: AuthedRequest, @Param("customerId") customerId: string) {
    await this.assertCustomerAccess(req, customerId);
    return this.portal.listAllFolders(customerId, FolderLibraryKind.files);
  }

  @Get(":customerId/files/folders/:folderId/documents")
  async listFilesDocuments(
    @Req() req: AuthedRequest,
    @Param("customerId") customerId: string,
    @Param("folderId") folderId: string
  ) {
    await this.assertCustomerAccess(req, customerId);
    return this.portal.listDocuments(customerId, FolderLibraryKind.files, folderId);
  }

  @Get(":customerId/files/suppliers")
  async listFilesSuppliers(@Req() req: AuthedRequest, @Param("customerId") customerId: string) {
    await this.assertCustomerAccess(req, customerId);
    return { suppliers: await this.portal.listSuppliers(customerId, FolderLibraryKind.files, this.uploadFolderListOptions(req)) };
  }

  @Post(":customerId/files/upload-for-supplier")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: uploadMaxBytes() },
    })
  )
  async uploadFiles(
    @Req() req: AuthedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Param("customerId") customerId: string,
    @Body("supplierName") supplierName?: string,
    @Body("supplierFolderId") supplierFolderId?: string,
    @Body("visionPrompt") visionPrompt?: string,
    @Body("structurePrompt") structurePrompt?: string,
    @Body("visionModel") visionModel?: string,
    @Body("structureModel") structureModel?: string,
    @Body("aiProvider") aiProvider?: string,
    @Body("runExtraction") runExtraction?: string
  ) {
    if (!file) throw new BadRequestException('Missing file field "file".');
    await this.assertCustomerAccess(req, customerId);
    this.assertLibraryMultipartDisabledIfS3();
    return this.portal.uploadForSupplier({
      customerId,
      kind: FolderLibraryKind.files,
      file,
      supplierName,
      supplierFolderId,
      visionPrompt,
      structurePrompt,
      visionModel,
      structureModel,
      aiProvider,
      runExtraction,
      ...this.uploadActor(req),
      allowRestrictedUpload: this.allowRestrictedUpload(req),
    });
  }
}
