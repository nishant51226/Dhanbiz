import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import type { Archiver } from "archiver";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { DataSource, In, IsNull, Repository } from "typeorm";
import type { AuthUser } from "../auth/auth.types";
import { Customer } from "../entities/customer.entity";
import { DocumentEntity } from "../entities/document.entity";
import { FolderLibraryKind } from "../entities/folder.entity";
import {
  LibraryExportFilters,
  LibraryExportJobEntity,
  LibraryExportJobStatus,
  type LibraryExportViewMode,
} from "../entities/library-export-job.entity";
import { NotificationDispatchService } from "../notification/notification-dispatch.service";
import { QueueService } from "../queue/queue.service";
import { S3Service } from "../s3/s3.service";
import {
  FileActivityLogService,
  type FileActivityRequestContext,
} from "../file-activity/file-activity-log.service.js";
import { DocumentsAdminService } from "./documents-admin.service";
import { libraryFolderDisplayLabel } from "./library-folder-display.util";
import { runWithAdminRls } from "../tenant/run-with-tenant-rls.js";
import { formatDateParts, formatDisplayDate } from "../format-display-date.util.js";

export type CreateLibraryExportInput = {
  customerId?: string;
  viewMode?: LibraryExportViewMode;
  libraryKind?: FolderLibraryKind;
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
};

const MAX_ZIP_FILES = 5000;

function monthLabel(month: number): string {
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-US", { month: "long" });
}

function dayLabel(year: number, month: number, day: number): string {
  return formatDateParts(year, month, day);
}

function sanitizeZipSegment(raw: string): string {
  const cleaned = String(raw ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Untitled";
}

function sanitizeZipFileName(raw: string): string {
  const base = sanitizeZipSegment(raw);
  return base.length > 180 ? base.slice(0, 180) : base;
}

function uniqueZipPath(basePath: string, used: Set<string>): string {
  if (!used.has(basePath)) {
    used.add(basePath);
    return basePath;
  }
  const dot = basePath.lastIndexOf(".");
  const stem = dot > 0 ? basePath.slice(0, dot) : basePath;
  const ext = dot > 0 ? basePath.slice(dot) : "";
  let n = 2;
  while (used.has(`${stem} (${n})${ext}`)) n += 1;
  const next = `${stem} (${n})${ext}`;
  used.add(next);
  return next;
}

function zipEntryPath(
  doc: DocumentEntity,
  viewMode: LibraryExportViewMode,
  scopedFolderName?: string,
): string {
  const uploaded = doc.uploadedAt ?? doc.createdAt;
  const d = new Date(uploaded);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const folderName =
    scopedFolderName?.trim() ||
    libraryFolderDisplayLabel(doc.folder?.name ?? "") ||
    "Files";
  const customerName = sanitizeZipSegment(
    doc.customer?.name ?? doc.folder?.customer?.name ?? "Customer",
  );
  const fileName = sanitizeZipFileName(doc.name);
  const dateParts = [String(year), monthLabel(month), dayLabel(year, month, day)];

  if (viewMode === "customerView") {
    return [customerName, folderName, ...dateParts, fileName].join("/");
  }
  if (viewMode === "dateView") {
    return [...dateParts, customerName, folderName, fileName].join("/");
  }
  return [folderName, ...dateParts, customerName, fileName].join("/");
}

function exportScopeLabel(filters: LibraryExportFilters, customerName?: string | null): string {
  if (filters.documentIds?.length) {
    const n = filters.documentIds.length;
    return `${n} selected file${n === 1 ? "" : "s"}`;
  }
  if (customerName?.trim()) return customerName.trim();
  if (filters.viewMode === "dateView") return "date view";
  if (filters.viewMode === "customerView") return "customer view";
  return "library files";
}

function exportZipFileName(
  filters: LibraryExportFilters,
  customerName: string | null | undefined,
  exportId: string,
): string {
  const name = customerName?.trim();
  if (name) {
    return `${sanitizeZipFileName(name)}.zip`;
  }
  const scopeLabel = sanitizeZipSegment(exportScopeLabel(filters, null)).slice(0, 80);
  return `${scopeLabel}-${exportId.slice(0, 8)}.zip`;
}

type ExportFilterDetail = { label: string; value: string };

function formatFilterDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function buildExportFilterDetails(
  filters: LibraryExportFilters,
  customerName?: string | null,
): ExportFilterDetail[] {
  const rows: ExportFilterDetail[] = [];
  const viewLabels: Record<string, string> = {
    folderView: "Folder view",
    customerView: "Customer view",
    dateView: "Date view",
  };
  const resolvedCustomerName = customerName?.trim() || filters.customerName?.trim();
  if (resolvedCustomerName) {
    rows.push({ label: "Customer", value: resolvedCustomerName });
  }
  if (filters.viewMode && viewLabels[filters.viewMode]) {
    rows.push({ label: "View", value: viewLabels[filters.viewMode] });
  }
  if (filters.folderName?.trim()) {
    rows.push({ label: "Folder", value: filters.folderName.trim() });
  } else if (filters.folderId?.trim()) {
    rows.push({ label: "Folder", value: "Selected folder" });
  }
  if (filters.year != null) {
    if (filters.month != null && filters.day != null) {
      rows.push({ label: "Date", value: dayLabel(filters.year, filters.month, filters.day) });
    } else if (filters.month != null) {
      rows.push({ label: "Date", value: `${monthLabel(filters.month)} ${filters.year}` });
    } else {
      rows.push({ label: "Date", value: String(filters.year) });
    }
  }
  if (filters.searchText?.trim()) {
    rows.push({ label: "Search", value: `"${filters.searchText.trim()}"` });
  }
  if (filters.documentIds?.length) {
    const n = filters.documentIds.length;
    rows.push({ label: "Selection", value: `${n} selected file${n === 1 ? "" : "s"}` });
  }
  if (filters.assignedOnly) {
    rows.push({ label: "Assigned", value: "Assigned to me only" });
  }
  if (filters.uploadedAfter?.trim() || filters.uploadedBefore?.trim()) {
    const parts: string[] = [];
    if (filters.uploadedAfter?.trim()) {
      parts.push(`from ${formatFilterDate(filters.uploadedAfter.trim())}`);
    }
    if (filters.uploadedBefore?.trim()) {
      parts.push(`to ${formatFilterDate(filters.uploadedBefore.trim())}`);
    }
    rows.push({ label: "Uploaded", value: parts.join(" ") });
  }
  return rows;
}

function createZipArchive(options?: { zlib?: { level?: number } }): Archiver {
  // archiver v8 is ESM-only and exposes ZipArchive (no default factory).
  const { ZipArchive } = require("archiver") as {
    ZipArchive: new (opts?: { zlib?: { level?: number } }) => Archiver;
  };
  return new ZipArchive(options);
}

async function buildZipBuffer(files: Array<{ path: string; buffer: Buffer }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = createZipArchive({ zlib: { level: 6 } });
    const passthrough = new PassThrough();
    const chunks: Buffer[] = [];
    passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    passthrough.on("end", () => resolve(Buffer.concat(chunks)));
    passthrough.on("error", reject);
    archive.on("error", reject);
    archive.pipe(passthrough);
    for (const file of files) {
      archive.append(file.buffer, { name: file.path });
    }
    void archive.finalize();
  });
}

@Injectable()
export class LibraryExportService {
  private readonly log = new Logger(LibraryExportService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly documents: DocumentsAdminService,
    private readonly s3: S3Service,
    private readonly queue: QueueService,
    private readonly notifications: NotificationDispatchService,
    private readonly fileActivity: FileActivityLogService,
    private readonly dataSource: DataSource,
    @InjectRepository(LibraryExportJobEntity)
    private readonly exports: Repository<LibraryExportJobEntity>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  async createExport(actor: AuthUser | undefined, input: CreateLibraryExportInput): Promise<LibraryExportJobEntity> {
    if (!actor?.userId?.trim()) {
      throw new ForbiddenException("Authentication required");
    }

    const portalCid = actor.customerId?.trim();
    const requestedCid = input.customerId?.trim();
    let scopedCustomerId = requestedCid || portalCid || null;
    if (portalCid && requestedCid && portalCid !== requestedCid) {
      throw new ForbiddenException("Cannot export another customer's documents");
    }

    let customerName: string | null = null;
    if (scopedCustomerId) {
      const customer = await this.customers.findOne({
        where: { id: scopedCustomerId },
        select: { id: true, name: true },
      });
      if (!customer) {
        throw new NotFoundException("Customer not found");
      }
      customerName = customer.name;
    }

    const viewMode: LibraryExportViewMode = input.viewMode ?? "folderView";
    const documentIds = [...new Set((input.documentIds ?? []).map((id) => id.trim()).filter(Boolean))];
    if (documentIds.length > MAX_ZIP_FILES) {
      throw new BadRequestException(`Too many files selected (${documentIds.length}). Maximum is ${MAX_ZIP_FILES}.`);
    }

    const filters: LibraryExportFilters = {
      viewMode,
      libraryKind: input.libraryKind,
      folderId: input.folderId?.trim() || undefined,
      folderName: input.folderName?.trim() || undefined,
      year: input.year,
      month: input.month,
      day: input.day,
      searchText: input.searchText?.trim() || undefined,
      assignedOnly: input.assignedOnly === true ? true : undefined,
      uploadedAfter: input.uploadedAfter?.trim() || undefined,
      uploadedBefore: input.uploadedBefore?.trim() || undefined,
      documentIds: documentIds.length ? documentIds : undefined,
      customerName: customerName ?? undefined,
    };

    const row = await this.exports.save(
      this.exports.create({
        customerId: scopedCustomerId,
        requestedByUserId: actor.userId,
        status: LibraryExportJobStatus.queued,
        filters,
        s3Key: null,
        zipFileName: null,
        fileCount: 0,
        error: null,
        pgBossJobId: null,
        completedAt: null,
      }),
    );

    const pgBossJobId = await this.queue.enqueueLibraryZipExport(row.id);
    if (pgBossJobId) {
      await this.exports.update(row.id, { pgBossJobId });
    }

    this.log.log(
      `Queued library export ${row.id} view=${viewMode} customer=${scopedCustomerId ?? "all"} user=${actor.userId} folder=${filters.folderId ?? "all"}`,
    );
    return this.getExportForUser(row.id, actor);
  }

  async getExportForUser(exportId: string, actor: AuthUser | undefined): Promise<LibraryExportJobEntity> {
    const row = await this.exports.findOne({
      where: { id: exportId },
      relations: { customer: true },
    });
    if (!row) {
      throw new NotFoundException("Export not found");
    }
    this.assertCanAccessExport(row, actor);
    return row;
  }

  async getDownloadUrl(exportId: string, actor: AuthUser | undefined): Promise<{ url: string; fileName: string }> {
    const row = await this.getExportForUser(exportId, actor);
    if (row.status !== LibraryExportJobStatus.completed || !row.s3Key?.trim()) {
      throw new BadRequestException("Export is not ready for download");
    }
    if (!this.s3.isBucketConfigured()) {
      throw new ServiceUnavailableException("S3 is not configured");
    }
    const fileName = row.zipFileName ?? "library-files.zip";
    const { url } = await this.s3.getPresignedGetUrlByKey(row.s3Key, 3600, fileName);
    return { url, fileName };
  }

  /** Stream export ZIP through the API (avoids S3 CORS / iframe download issues in the browser). */
  async getDownloadFile(
    exportId: string,
    actor: AuthUser | undefined,
    req?: FileActivityRequestContext,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const row = await this.getExportForUser(exportId, actor);
    if (row.status !== LibraryExportJobStatus.completed || !row.s3Key?.trim()) {
      throw new BadRequestException("Export is not ready for download");
    }
    if (!this.s3.isBucketConfigured()) {
      throw new ServiceUnavailableException("S3 is not configured");
    }
    if (actor) {
      try {
        await this.logExportDocumentDownloads(row, actor, req, "GET /library-exports/:id/download");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.warn(`Library export ${exportId} download activity log failed: ${msg}`);
      }
    }
    const buffer = await this.s3.getObjectBufferByKey(row.s3Key);
    const customerName = await this.resolveExportCustomerName(row);
    const fileName =
      row.zipFileName?.trim() ||
      (customerName ? `${sanitizeZipFileName(customerName)}.zip` : "library-files.zip");
    return { buffer, fileName };
  }

  private async documentsForExportActivityLog(
    row: LibraryExportJobEntity,
    actor: AuthUser,
  ): Promise<DocumentEntity[]> {
    const filters = row.filters ?? {};
    const ids = [
      ...new Set(
        [...(filters.exportedDocumentIds ?? []), ...(filters.documentIds ?? [])]
          .map((id) => String(id).trim())
          .filter(Boolean),
      ),
    ];
    if (ids.length > 0) {
      return runWithAdminRls(
        this.dataSource,
        async (manager) =>
          manager.getRepository(DocumentEntity).find({
            where: { id: In(ids), deletedAt: IsNull() },
            relations: { folder: true, customer: true },
          }),
        "libraryExportActivityLog",
      );
    }

    let libraryKind: FolderLibraryKind | undefined;
    if (filters.libraryKind && (Object.values(FolderLibraryKind) as string[]).includes(filters.libraryKind)) {
      libraryKind = filters.libraryKind as FolderLibraryKind;
    }
    return this.documents.findDocumentsForLibraryExport(
      {
        customerId: row.customerId ?? undefined,
        libraryKind,
        folderId: filters.folderId,
        year: filters.year,
        month: filters.month,
        day: filters.day,
        searchText: filters.searchText,
        assignedOnly: filters.assignedOnly,
        uploadedAfter: filters.uploadedAfter,
        uploadedBefore: filters.uploadedBefore,
      },
      actor,
    );
  }

  private async logExportDocumentDownloads(
    row: LibraryExportJobEntity,
    actor: AuthUser,
    req: FileActivityRequestContext | undefined,
    route: string,
  ): Promise<void> {
    const docs = await this.documentsForExportActivityLog(row, actor);
    if (docs.length === 0) {
      this.log.warn(`Library export ${row.id} download activity: no documents resolved for logging`);
      return;
    }
    await this.fileActivity.recordDownloadsForDocuments(
      docs,
      req ?? actor,
      (doc) => `Downloaded ${doc.name?.trim() || "file"} (ZIP export)`,
      () => ({
        intent: "download",
        route,
        exportId: row.id,
      }),
    );
  }

  private async resolveExportCustomerName(row: LibraryExportJobEntity): Promise<string | null> {
    const fromFilters = row.filters?.customerName?.trim();
    if (fromFilters) return fromFilters;
    const fromRelation = row.customer?.name?.trim();
    if (fromRelation) return fromRelation;
    const cid = row.customerId?.trim();
    if (!cid) return null;
    return runWithAdminRls(this.dataSource, async (manager) => {
      const customer = await manager.getRepository(Customer).findOne({
        where: { id: cid },
        select: { id: true, name: true },
      });
      return customer?.name?.trim() || null;
    }, "libraryExportResolveCustomerName");
  }

  async processExport(exportId: string): Promise<void> {
    const row = await this.exports.findOne({
      where: { id: exportId },
      relations: { customer: true, requestedByUser: true },
    });
    if (!row) {
      this.log.warn(`Library export ${exportId} not found`);
      return;
    }
    if (row.status !== LibraryExportJobStatus.queued && row.status !== LibraryExportJobStatus.processing) {
      return;
    }

    await this.exports.update(exportId, { status: LibraryExportJobStatus.processing, error: null });

    try {
      const requester = row.requestedByUser;
      const actor: AuthUser = {
        userId: row.requestedByUserId,
        customerId: requester?.customerId ?? null,
        isAdmin: requester?.isAdmin ?? false,
      };

      const filters = row.filters ?? {};
      const viewMode: LibraryExportViewMode = filters.viewMode ?? "folderView";
      let libraryKind: FolderLibraryKind | undefined;
      if (filters.libraryKind && (Object.values(FolderLibraryKind) as string[]).includes(filters.libraryKind)) {
        libraryKind = filters.libraryKind as FolderLibraryKind;
      }

      const docs = await this.documents.findDocumentsForLibraryExport(
        {
          customerId: row.customerId ?? undefined,
          libraryKind,
          folderId: filters.folderId,
          year: filters.year,
          month: filters.month,
          day: filters.day,
          searchText: filters.searchText,
          assignedOnly: filters.assignedOnly,
          uploadedAfter: filters.uploadedAfter,
          uploadedBefore: filters.uploadedBefore,
          documentIds: filters.documentIds,
        },
        actor,
      );

      if (docs.length === 0) {
        throw new BadRequestException("No files matched the export filters");
      }
      if (docs.length > MAX_ZIP_FILES) {
        throw new BadRequestException(`Too many files (${docs.length}). Maximum is ${MAX_ZIP_FILES}.`);
      }

      const root = this.config.get<string>("FILE_STORAGE_ROOT");
      const usedPaths = new Set<string>();
      const zipEntries: Array<{ path: string; buffer: Buffer }> = [];
      const folderScopeName = filters.folderId ? filters.folderName : undefined;

      for (const doc of docs) {
        const entryPath = uniqueZipPath(zipEntryPath(doc, viewMode, folderScopeName), usedPaths);
        const buffer = await this.readDocumentBytes(doc, root);
        zipEntries.push({ path: entryPath, buffer });
      }

      const zipBuffer = await buildZipBuffer(zipEntries);
      const customerName = await this.resolveExportCustomerName(row);
      const zipFileName = exportZipFileName(filters, customerName, row.id);
      const s3Key = `staff-library-exports/${row.requestedByUserId}/${row.id}/${zipFileName}`;

      if (!this.s3.isBucketConfigured()) {
        throw new ServiceUnavailableException("S3 is not configured");
      }

      await this.s3.putObjectByKey({
        fileKey: s3Key,
        body: zipBuffer,
        contentType: "application/zip",
      });

      await this.fileActivity.recordDownloadsForDocuments(
        docs,
        actor,
        (doc) => `Downloaded ${doc.name?.trim() || "file"} (ZIP export)`,
        () => ({
          intent: "download",
          route: "library_zip_export",
          exportId: row.id,
        }),
      );

      await this.exports.update(exportId, {
        status: LibraryExportJobStatus.completed,
        s3Key,
        zipFileName,
        fileCount: docs.length,
        completedAt: new Date(),
        error: null,
        filters: {
          ...filters,
          exportedDocumentIds: docs.map((d) => d.id),
        },
      });

      const filterDetails = buildExportFilterDetails(filters, customerName);
      await this.notifications.notifyUserInApp({
        userId: row.requestedByUserId,
        eventKey: "library.export.ready",
        title: customerName ? `${customerName} export ready` : "Export ready",
        body: "",
        data: {
          exportId: row.id,
          customerId: row.customerId,
          customerName: customerName ?? "",
          fileCount: docs.length,
          zipFileName,
          viewMode,
          filterDetails,
        },
      });

      this.log.log(`Library export ${exportId} completed (${docs.length} files)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.exports.update(exportId, {
        status: LibraryExportJobStatus.failed,
        error: msg,
        completedAt: new Date(),
      });

      const failedCustomerName = await this.resolveExportCustomerName(row);
      const filterDetails = buildExportFilterDetails(row.filters ?? {}, failedCustomerName);
      await this.notifications.notifyUserInApp({
        userId: row.requestedByUserId,
        eventKey: "library.export.failed",
        title: failedCustomerName ? `${failedCustomerName} export failed` : "Export failed",
        body: msg,
        data: {
          exportId: row.id,
          customerId: row.customerId,
          customerName: failedCustomerName ?? "",
          filterDetails,
        },
      });

      this.log.error(`Library export ${exportId} failed: ${msg}`);
    }
  }

  private assertCanAccessExport(row: LibraryExportJobEntity, actor: AuthUser | undefined): void {
    if (!actor?.userId?.trim()) {
      throw new ForbiddenException("Authentication required");
    }
    const portalCid = actor.customerId?.trim();
    if (portalCid && row.customerId && portalCid !== row.customerId) {
      throw new ForbiddenException("Cannot access this export");
    }
    if (!actor.isAdmin && !portalCid && row.requestedByUserId !== actor.userId) {
      throw new ForbiddenException("Cannot access this export");
    }
  }

  private async readDocumentBytes(doc: DocumentEntity, storageRoot: string | undefined): Promise<Buffer> {
    const s3Key = doc.s3Key?.trim();
    if (s3Key) {
      return this.s3.getObjectBufferByKey(s3Key);
    }
    const customerId = doc.customerId ?? doc.folder?.customerId ?? null;
    if (!customerId) {
      throw new NotFoundException(`Document ${doc.id} has no customer scope`);
    }
    if (!storageRoot) {
      throw new ServiceUnavailableException("FILE_STORAGE_ROOT not configured");
    }
    const rel = doc.fileUrl?.trim().replace(/^\/+/, "");
    if (!rel) {
      throw new NotFoundException(`Document ${doc.id} has no storage path`);
    }
    const abs = path.join(storageRoot, customerId, rel);
    const { readFile } = await import("node:fs/promises");
    return readFile(abs);
  }
}
