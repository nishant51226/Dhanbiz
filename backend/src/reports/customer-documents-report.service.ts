import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, DataSource, In, IsNull, Repository } from "typeorm";
import { S3Service } from "../s3/s3.service.js";
import {
  readDocumentBytes,
  resolveDocumentMime,
} from "./document-report-file.util.js";
import type { DocumentReportPreview } from "./customer-documents-report.types.js";
import {
  verifyReportDocumentDownload,
} from "./report-document-download.util.js";
import { Customer } from "../entities/customer.entity.js";
import { DocumentEntity } from "../entities/document.entity.js";
import { FinancialDocumentEntity } from "../entities/financial-document.entity.js";
import { FolderEntity } from "../entities/folder.entity.js";
import { InvoiceEntity } from "../entities/invoice.entity.js";
import { StatementEntity } from "../entities/statement.entity.js";
import { Job, JobType } from "../entities/job.entity.js";
import { File, FileType } from "../entities/file.entity.js";
import { SupplierEntity } from "../entities/supplier.entity.js";
import type { CustomerDocumentsReportDto, CustomerDocumentsExportCandidate } from "./dto/customer-documents-report.dto.js";
import { buildCustomerDocumentsReportXlsx, customerDocumentsReportFilename } from "./document-report-xlsx.builder.js";
import { parseCalendarReportRange } from "./report-date.util.js";
import type {
  CustomerDocumentsDateBasis,
  CustomerDocumentsReportModel,
  DocumentReportExtraction,
  DocumentReportJobFinancialDoc,
  DocumentReportJobResult,
  DocumentReportRow,
} from "./customer-documents-report.types.js";
import {
  collectOnboardingSignatureFileIds,
  isOnboardingSignatureDocument,
  isOnboardingSignatureFile,
  linkedFileIdFromDocument,
} from "./report-artifact-filters.js";

const EXPORT_PREVIEW: DocumentReportPreview = {
  kind: "unavailable",
  note: "Not included in export",
};

const EFFECTIVE_DOC_DATE = `COALESCE(doc.document_date::timestamptz, doc.uploaded_at, doc.created_at)`;
const UPLOAD_DOC_DATE = `COALESCE(doc.uploaded_at, doc.created_at)`;
const LIBRARY_DOC_DATE_TZ = "Europe/London";

function dateInLibraryTz(timestampExpr: string): string {
  return `timezone('${LIBRARY_DOC_DATE_TZ}', ${timestampExpr})`;
}

function buildFolderPathMap(folders: FolderEntity[]): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  const memo = new Map<string, string>();
  const inGlobalTree = (id: string): boolean => {
    let cur = byId.get(id);
    while (cur) {
      if (cur.isGlobal) return true;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return false;
  };
  const pathFor = (id: string): string => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const folder = byId.get(id);
    if (!folder) {
      memo.set(id, id);
      return id;
    }
    const raw = !folder.parentId ? folder.name : `${pathFor(folder.parentId)}/${folder.name}`;
    const full = inGlobalTree(id) ? `Global/${raw.replace(/^Global\//, "")}` : raw;
    memo.set(id, full);
    return full;
  };
  for (const f of folders) {
    pathFor(f.id);
  }
  return memo;
}

function folderScopeLabel(
  folder: FolderEntity | null | undefined,
  foldersById?: Map<string, FolderEntity>,
): "global" | "customer" | "unfiled" {
  if (!folder) return "unfiled";
  if (folder.isGlobal) return "global";
  if (foldersById) {
    let cur: FolderEntity | undefined = folder;
    while (cur?.parentId) {
      cur = foldersById.get(cur.parentId);
      if (cur?.isGlobal) return "global";
    }
  }
  return "customer";
}

function buildDriveFolderPathMap(files: File[]): Map<string, string> {
  const folders = files.filter((f) => f.fileType === FileType.folder);
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  const memo = new Map<string, string>();
  const pathFor = (id: string): string => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const folder = byId.get(id);
    if (!folder) {
      memo.set(id, id);
      return id;
    }
    if (!folder.parentId) {
      memo.set(id, folder.name);
      return folder.name;
    }
    const full = `${pathFor(folder.parentId)}/${folder.name}`;
    memo.set(id, full);
    return full;
  };
  for (const f of folders) {
    pathFor(f.id);
  }
  return memo;
}

function driveFolderPathForFile(file: File, folderPaths: Map<string, string>): string {
  if (!file.parentId) return "Drive";
  return folderPaths.get(file.parentId) ?? "Drive";
}

function formatIsoDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  return d.toISOString();
}

function formatCalendarDateLondon(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LIBRARY_DOC_DATE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function sheetDateKeyForDocument(
  doc: DocumentEntity,
  dateBasis: CustomerDocumentsDateBasis,
): string {
  const documentDate = typeof doc.documentDate === "string" ? doc.documentDate.trim() : "";
  if (dateBasis === "effective" && documentDate) {
    return documentDate.slice(0, 10);
  }
  return formatCalendarDateLondon(doc.uploadedAt ?? doc.createdAt);
}

function buildFolderNameMap(folders: FolderEntity[]): Map<string, string> {
  return new Map(folders.map((f) => [f.id, f.name] as const));
}

function asStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return String(value);
}

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseJobFinancialDocument(raw: unknown): DocumentReportJobFinancialDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;
  const id = asStringOrNull(doc.id);
  const type = doc.type;
  if (!id || (type !== "invoice" && type !== "statement")) return null;

  const metadata =
    doc.metadata && typeof doc.metadata === "object"
      ? (doc.metadata as { pageRange?: { start?: unknown; end?: unknown } })
      : undefined;
  const pageStart = asNumberOrNull(metadata?.pageRange?.start) ?? 0;
  const pageEnd = asNumberOrNull(metadata?.pageRange?.end) ?? pageStart;
  const status = asStringOrNull(doc.status) ?? "";

  if (type === "invoice") {
    const inv = doc.invoice;
    if (!inv || typeof inv !== "object") return null;
    const invoice = inv as Record<string, unknown>;
    const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
    const extraction: Extract<DocumentReportExtraction, { kind: "invoice" }> = {
      kind: "invoice",
      vendor: asStringOrNull(invoice.vendor),
      storeName: asStringOrNull(invoice.customer) ?? asStringOrNull(invoice.storeName),
      customerAddress: asStringOrNull(invoice.customerAddress),
      invoiceNumber: asStringOrNull(invoice.invoiceNumber),
      invoiceDate: asStringOrNull(invoice.invoiceDate),
      dueDate: asStringOrNull(invoice.dueDate),
      subtotal: asNumberOrNull(invoice.subtotal),
      tax: asNumberOrNull(invoice.tax),
      total: asNumberOrNull(invoice.total),
      currency: asStringOrNull(invoice.currency),
      status: asStringOrNull(invoice.status) ?? status,
      pageStart,
      pageEnd,
      lineItemsDescription: asStringOrNull(invoice.lineItemsDescription),
      lines: lineItems.map((line, index) => {
        const row = line && typeof line === "object" ? (line as Record<string, unknown>) : {};
        return {
          lineIndex: index,
          description: asStringOrNull(row.description),
          quantity: asNumberOrNull(row.quantity),
          unitPrice: asNumberOrNull(row.unitPrice),
          amount: asNumberOrNull(row.amount),
          discount: asNumberOrNull(row.discount),
          taxAmount: asNumberOrNull(row.taxAmount),
        };
      }),
    };
    return { id, type, status, pageStart, pageEnd, extraction };
  }

  const st = doc.statement;
  if (!st || typeof st !== "object") return null;
  const statement = st as Record<string, unknown>;
  const transactions = Array.isArray(statement.transactions) ? statement.transactions : [];
  const extraction: Extract<DocumentReportExtraction, { kind: "statement" }> = {
    kind: "statement",
    accountHolder: asStringOrNull(statement.accountHolder),
    bankName: asStringOrNull(statement.bankName),
    periodStart: asStringOrNull(statement.statementPeriodStart ?? statement.periodStart),
    periodEnd: asStringOrNull(statement.statementPeriodEnd ?? statement.periodEnd),
    openingBalance: asNumberOrNull(statement.openingBalance),
    closingBalance: asNumberOrNull(statement.closingBalance),
    currency: asStringOrNull(statement.currency),
    status: asStringOrNull(statement.status) ?? status,
    pageStart,
    pageEnd,
    lines: transactions.map((line, index) => {
      const row = line && typeof line === "object" ? (line as Record<string, unknown>) : {};
      return {
        lineIndex: index,
        date: asStringOrNull(row.date),
        description: asStringOrNull(row.description),
        debit: asNumberOrNull(row.debit),
        credit: asNumberOrNull(row.credit),
        balance: asNumberOrNull(row.balance),
      };
    }),
  };
  return { id, type, status, pageStart, pageEnd, extraction };
}

function parseJobResult(job: Job): DocumentReportJobResult {
  const result = job.result;
  if (!result || typeof result !== "object") {
    return {
      kind: "job",
      jobId: job.id,
      status: job.status,
      percentCompleted: job.percentCompleted,
      error: job.error,
      createdAt: formatIsoDate(job.createdAt),
      updatedAt: formatIsoDate(job.updatedAt),
      aiProvider: job.aiProvider,
      visionModel: job.visionModel,
      structureModel: job.structureModel,
      manualOverride: null,
      warnings: [],
      financialDocuments: [],
    };
  }

  const raw = result as Record<string, unknown>;
  const financialDocuments = Array.isArray(raw.financialDocuments)
    ? raw.financialDocuments
        .map(parseJobFinancialDocument)
        .filter((doc): doc is DocumentReportJobFinancialDoc => doc !== null)
    : [];
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((w): w is string => typeof w === "string")
    : [];
  const manualOverrideRaw = raw.manualOverride;
  const manualOverride =
    manualOverrideRaw && typeof manualOverrideRaw === "object"
      ? {
          appliedAt: asStringOrNull((manualOverrideRaw as Record<string, unknown>).appliedAt) ?? "",
          note: asStringOrNull((manualOverrideRaw as Record<string, unknown>).note) ?? undefined,
        }
      : null;

  return {
    kind: "job",
    jobId: job.id,
    status: job.status,
    percentCompleted: job.percentCompleted,
    error: job.error,
    createdAt: formatIsoDate(job.createdAt),
    updatedAt: formatIsoDate(job.updatedAt),
    aiProvider: job.aiProvider,
    visionModel: job.visionModel,
    structureModel: job.structureModel,
    manualOverride: manualOverride?.appliedAt ? manualOverride : null,
    warnings,
    financialDocuments,
  };
}

@Injectable()
export class CustomerDocumentsReportService {
  constructor(
    @InjectRepository(InvoiceEntity) private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(StatementEntity) private readonly statements: Repository<StatementEntity>,
    @InjectRepository(SupplierEntity) private readonly suppliers: Repository<SupplierEntity>,
    private readonly dataSource: DataSource,
    private readonly s3: S3Service,
    private readonly config: ConfigService,
  ) {}

  private apiOrigin(): string {
    const configured =
      this.config.get<string>("APP_PUBLIC_API_ORIGIN")?.trim() ||
      this.config.get<string>("PUBLIC_API_ORIGIN")?.trim();
    if (configured) return configured.replace(/\/$/, "");
    const port = this.config.get<string>("PORT")?.trim() || "3000";
    return `http://127.0.0.1:${port}`;
  }

  async streamDocumentForSignedDownload(input: {
    documentId: string;
    customerId: string;
    token: string;
    expiresAtSec: number;
  }): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const secret = this.config.get<string>("AUTH_SECRET")?.trim();
    if (!secret) {
      throw new BadRequestException("Download links are not configured");
    }
    if (
      !verifyReportDocumentDownload(
        secret,
        input.documentId,
        input.customerId,
        input.expiresAtSec,
        input.token,
      )
    ) {
      throw new UnauthorizedException("Download link expired or invalid");
    }

    const doc = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return manager.getRepository(DocumentEntity).findOne({
        where: { id: input.documentId, customerId: input.customerId },
        relations: { folder: true },
      });
    });
    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    const storageRoot = this.config.get<string>("FILE_STORAGE_ROOT");
    const buffer = await readDocumentBytes(doc, this.s3, storageRoot);
    const mimeType = resolveDocumentMime(doc) || "application/octet-stream";
    return { buffer, mimeType, filename: doc.name };
  }

  async exportXlsx(dto: CustomerDocumentsReportDto): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
    documentCount: number;
  }> {
    const model = await this.buildReportModel(dto);
    const buffer = await buildCustomerDocumentsReportXlsx(model);
    return {
      buffer,
      filename: customerDocumentsReportFilename(model),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      documentCount: model.documents.length,
    };
  }

  async buildReportModel(dto: CustomerDocumentsReportDto): Promise<CustomerDocumentsReportModel> {
    const { from, to } = parseCalendarReportRange(dto.from, dto.to);
    const dateBasis: CustomerDocumentsDateBasis = dto.dateBasis === "uploaded" ? "uploaded" : "effective";
    const customerId = typeof dto.customerId === "string" ? dto.customerId.trim() : "";
    if (!customerId) {
      throw new BadRequestException("customerId is required");
    }

    const customer = await this.loadCustomerForReport(customerId);
    let documents = await this.buildDocumentsForCustomer(customer, from, to, dateBasis);
    documents = this.filterDocumentsBySelection(documents, dto.documentIds, dto.layoutMode);

    return {
      customerId: customer.id,
      customerName: customer.name?.trim() || "Customer",
      allCustomers: false,
      customerCount: 1,
      from,
      to,
      layoutMode: dto.layoutMode,
      dateBasis,
      generatedAt: new Date().toISOString(),
      documents,
    };
  }

  async listExportCandidates(dto: CustomerDocumentsReportDto): Promise<CustomerDocumentsExportCandidate[]> {
    const { from, to } = parseCalendarReportRange(dto.from, dto.to);
    const dateBasis: CustomerDocumentsDateBasis = dto.dateBasis === "uploaded" ? "uploaded" : "effective";
    const customerId = typeof dto.customerId === "string" ? dto.customerId.trim() : "";
    if (!customerId) {
      throw new BadRequestException("customerId is required");
    }
    const customer = await this.loadCustomerForReport(customerId);
    const documents = await this.buildDocumentsForCustomer(customer, from, to, dateBasis);
    return documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      folderPath: doc.folderPath,
      uploadedAt: doc.uploadedAt,
      documentType: doc.documentType,
      extractionReady:
        dto.layoutMode === "statement_register"
          ? this.documentHasStatementExtraction(doc)
          : this.documentHasInvoiceExtraction(doc),
      invoiceEligible: this.isInvoiceRegisterCandidate(doc),
      statementEligible: this.isStatementRegisterCandidate(doc),
    }));
  }

  private isInvoiceRegisterCandidate(doc: DocumentReportRow): boolean {
    if (this.documentHasInvoiceExtraction(doc)) return true;
    if (doc.documentType === "invoice") return true;
    const folderPath = (doc.folderPath ?? "").toLowerCase();
    return /(^|\/)invoices(\/|$)/.test(folderPath);
  }

  private isStatementRegisterCandidate(doc: DocumentReportRow): boolean {
    if (this.documentHasStatementExtraction(doc)) return true;
    if (doc.documentType === "statement") return true;
    const folderPath = (doc.folderPath ?? "").toLowerCase();
    return /(^|\/)statements(\/|$)/.test(folderPath);
  }

  private documentHasInvoiceExtraction(doc: DocumentReportRow): boolean {
    if (doc.extraction.kind === "invoice") return true;
    if (doc.job.kind === "job") {
      return doc.job.financialDocuments.some((fd) => fd.type === "invoice");
    }
    return false;
  }

  private documentHasStatementExtraction(doc: DocumentReportRow): boolean {
    if (doc.extraction.kind === "statement") return true;
    if (doc.job.kind === "job") {
      return doc.job.financialDocuments.some((fd) => fd.type === "statement");
    }
    return false;
  }

  private filterDocumentsBySelection(
    documents: DocumentReportRow[],
    documentIds: string[] | undefined,
    layoutMode: CustomerDocumentsReportDto["layoutMode"],
  ): DocumentReportRow[] {
    const needsSelection =
      layoutMode === "invoice_register" ||
      layoutMode === "statement_register" ||
      layoutMode === "per_document";
    const ids = [...new Set((documentIds ?? []).map((id) => id.trim()).filter(Boolean))];
    if (!needsSelection) {
      return documents;
    }
    if (ids.length === 0) {
      throw new BadRequestException("Select at least one document for this layout");
    }
    const allowed = new Set(ids);
    const selected = documents.filter((doc) => allowed.has(doc.id));
    if (selected.length === 0) {
      throw new BadRequestException("No selected documents match the export criteria");
    }
    return selected;
  }

  private async loadCustomerForReport(
    customerId: string,
  ): Promise<Pick<Customer, "id" | "name" | "onboardingData">> {
    const customer = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return manager.getRepository(Customer).findOne({
        where: { id: customerId },
        select: ["id", "name", "onboardingData"],
      });
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

  private async buildDocumentsForCustomer(
    customer: Pick<Customer, "id" | "name" | "onboardingData">,
    from: string,
    to: string,
    dateBasis: CustomerDocumentsDateBasis,
  ): Promise<DocumentReportRow[]> {
    const customerId = customer.id;
    const signatureFileIds = collectOnboardingSignatureFileIds(customer.onboardingData);

    const libraryDocs = (await this.queryDocuments(customerId, from, to, dateBasis)).filter(
      (doc) => !isOnboardingSignatureDocument(doc, signatureFileIds),
    );
    const driveFiles = (await this.queryDriveFilesWithoutLibraryDocument(customerId, from, to, dateBasis)).filter(
      (file) => !isOnboardingSignatureFile(file, signatureFileIds),
    );

    let folderRows = await this.loadFoldersForCustomer(customerId);
    const referencedFolderIds = [
      ...new Set(libraryDocs.map((d) => d.folderId).filter((id): id is string => Boolean(id?.trim()))),
    ];
    folderRows = await this.ensureFoldersWithAncestors(customerId, folderRows, referencedFolderIds);
    const folderPaths = buildFolderPathMap(folderRows);
    const folderNames = buildFolderNameMap(folderRows);
    const foldersById = new Map(folderRows.map((f) => [f.id, f] as const));

    const driveFolderRows = await this.loadDriveFolderRows(customerId);
    const driveFolderPaths = buildDriveFolderPathMap(driveFolderRows);

    const supplierIds = [...new Set(libraryDocs.map((d) => d.supplierId).filter((id): id is string => Boolean(id?.trim())))];
    const supplierMap = new Map<string, string>();
    if (supplierIds.length > 0) {
      const supplierRows = await this.suppliers.find({ where: { id: In(supplierIds) }, select: ["id", "name"] });
      for (const s of supplierRows) {
        supplierMap.set(s.id, s.name);
      }
    }

    const documentIds = libraryDocs.map((d) => d.id);
    const linkedFileIds = [
      ...new Set(
        libraryDocs
          .map(linkedFileIdFromDocument)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const driveFileIds = driveFiles.map((f) => f.id);
    const extractionByTargetId = await this.loadExtractionsByTargetIds(
      customerId,
      documentIds,
      [...linkedFileIds, ...driveFileIds],
    );
    const jobByTargetId = await this.loadJobsByTargetIds(
      customerId,
      documentIds,
      [...linkedFileIds, ...driveFileIds],
    );

    const libraryRows: DocumentReportRow[] = libraryDocs.map((doc) => {
      const folderPath = doc.folderId ? (folderPaths.get(doc.folderId) ?? doc.folder?.name ?? "Folder") : "Unfiled";
      const folderSheetName = doc.folderId
        ? (folderNames.get(doc.folderId) ?? doc.folder?.name ?? folderPath.split("/").pop() ?? "Folder")
        : "Unfiled";
      const linkedFileId = linkedFileIdFromDocument(doc);
      const folder = doc.folder ?? (doc.folderId ? foldersById.get(doc.folderId) : null);
      const extraction =
        extractionByTargetId.get(doc.id) ??
        (linkedFileId ? extractionByTargetId.get(linkedFileId) : undefined) ??
        { kind: "none" as const };
      return {
        id: doc.id,
        customerId: customer.id,
        customerName: customer.name?.trim() || "Customer",
        name: doc.name?.trim() || "Document",
        documentType: doc.documentType,
        folderId: doc.folderId,
        folderScope: folderScopeLabel(folder, foldersById),
        folderPath,
        folderSheetName,
        sheetDateKey: sheetDateKeyForDocument(doc, dateBasis),
        supplierName: doc.supplierId ? (supplierMap.get(doc.supplierId) ?? null) : null,
        documentDate: doc.documentDate ?? null,
        uploadedAt: formatIsoDate(doc.uploadedAt),
        sizeBytes: doc.sizeBytes ?? null,
        mimeType: doc.mimeType ?? null,
        fileUrl: doc.fileUrl?.trim() || null,
        s3Key: doc.s3Key?.trim() || null,
        downloadUrl: null,
        extraction,
        job:
          jobByTargetId.get(doc.id) ??
          (linkedFileId ? jobByTargetId.get(linkedFileId) : undefined) ??
          { kind: "none" },
        preview: EXPORT_PREVIEW,
      };
    });

    const driveRows: DocumentReportRow[] = driveFiles.map((file) => {
      const folderPath = driveFolderPathForFile(file, driveFolderPaths);
      const folderSheetName = folderPath.split("/").pop() ?? "Drive";
      return {
        id: file.id,
        customerId: customer.id,
        customerName: customer.name?.trim() || "Customer",
        name: file.name?.trim() || "File",
        documentType: "file",
        folderId: file.parentId,
        folderScope: "customer",
        folderPath: `Drive/${folderPath}`,
        folderSheetName,
        sheetDateKey: formatCalendarDateLondon(file.createdAt),
        supplierName: null,
        documentDate: null,
        uploadedAt: formatIsoDate(file.createdAt),
        sizeBytes: file.sizeBytes ?? null,
        mimeType: file.mimeType ?? null,
        fileUrl: file.storageRelativePath?.trim() || null,
        s3Key: file.s3Key?.trim() || null,
        downloadUrl: null,
        extraction: extractionByTargetId.get(file.id) ?? { kind: "none" },
        job: jobByTargetId.get(file.id) ?? { kind: "none" },
        preview: EXPORT_PREVIEW,
      };
    });

    return [...libraryRows, ...driveRows].sort((a, b) => {
      const at = a.uploadedAt;
      const bt = b.uploadedAt;
      const cmp = bt.localeCompare(at);
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name, "en");
    });
  }

  private async ensureFoldersWithAncestors(
    customerId: string,
    seed: FolderEntity[],
    folderIds: string[],
  ): Promise<FolderEntity[]> {
    const byId = new Map(seed.map((f) => [f.id, f] as const));
    let pending = [...new Set(folderIds.filter((id) => id?.trim() && !byId.has(id)))];

    while (pending.length > 0) {
      const batch = await this.dataSource.transaction(async (manager) => {
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
        return manager.getRepository(FolderEntity).find({
          where: { id: In(pending) },
          select: ["id", "name", "parentId", "isGlobal", "customerId"],
        });
      });

      if (batch.length === 0) break;

      const nextPending: string[] = [];
      for (const folder of batch) {
        if (folder.customerId != null && folder.customerId !== customerId && !folder.isGlobal) {
          continue;
        }
        byId.set(folder.id, folder);
        if (folder.parentId && !byId.has(folder.parentId)) {
          nextPending.push(folder.parentId);
        }
      }
      pending = nextPending;
    }

    return [...byId.values()];
  }

  private async loadFoldersForCustomer(customerId: string): Promise<FolderEntity[]> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return manager.getRepository(FolderEntity).find({
        where: [{ customerId }, { customerId: IsNull(), isGlobal: true }],
        select: ["id", "name", "parentId", "isGlobal", "customerId"],
      });
    });
  }

  private async queryDocuments(
    customerId: string,
    from: string,
    to: string,
    dateBasis: CustomerDocumentsDateBasis,
  ): Promise<DocumentEntity[]> {
    const ED = dateBasis === "uploaded" ? UPLOAD_DOC_DATE : EFFECTIVE_DOC_DATE;
    const edTz = dateInLibraryTz(ED);
    const dateExpr = `DATE(${edTz})`;

    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      const repo = manager.getRepository(DocumentEntity);
      return repo
        .createQueryBuilder("doc")
        .leftJoinAndSelect("doc.folder", "folder")
        .where("doc.deleted_at IS NULL")
        .andWhere("doc.name NOT ILIKE :sigName1", { sigName1: "%-signature.png" })
        .andWhere("doc.name NOT ILIKE :sigName2", { sigName2: "%-signature.jpeg" })
        .andWhere("doc.name NOT ILIKE :sigName3", { sigName3: "%-signature.jpg" })
        .andWhere("doc.name NOT ILIKE :sigName4", { sigName4: "%-signature.webp" })
        .andWhere(
          new Brackets((sub) => {
            sub
              .where("doc.customer_id = :customerId", { customerId })
              .orWhere("folder.customer_id = :customerId", { customerId })
              .orWhere("(folder.is_global = true AND doc.customer_id = :customerId)", { customerId });
          }),
        )
        .andWhere(`${ED} IS NOT NULL`)
        .andWhere(`${dateExpr} >= :fromDate`, { fromDate: from })
        .andWhere(`${dateExpr} <= :toDate`, { toDate: to })
        .orderBy("doc.uploadedAt", "DESC")
        .addOrderBy("doc.name", "ASC")
        .getMany();
    });
  }

  private async queryDriveFilesWithoutLibraryDocument(
    customerId: string,
    from: string,
    to: string,
    dateBasis: CustomerDocumentsDateBasis,
  ): Promise<File[]> {
    const ED =
      dateBasis === "uploaded"
        ? `COALESCE(file.updated_at, file.created_at)`
        : `COALESCE(file.updated_at, file.created_at)`;
    const edTz = dateInLibraryTz(ED);
    const dateExpr = `DATE(${edTz})`;

    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return manager
        .getRepository(File)
        .createQueryBuilder("file")
        .where("file.customer_id = :customerId", { customerId })
        .andWhere("file.type = :fileType", { fileType: FileType.file })
        .andWhere("file.deleted_at IS NULL")
        .andWhere("(file.metadata->>'remoteSignature') IS DISTINCT FROM 'true'")
        .andWhere("file.name NOT ILIKE :sigName1", { sigName1: "%-signature.png" })
        .andWhere("file.name NOT ILIKE :sigName2", { sigName2: "%-signature.jpeg" })
        .andWhere("file.name NOT ILIKE :sigName3", { sigName3: "%-signature.jpg" })
        .andWhere("file.name NOT ILIKE :sigName4", { sigName4: "%-signature.webp" })
        .andWhere(
          `(file.s3_key IS NULL OR file.s3_key NOT ILIKE :onboardingSigPath)`,
          { onboardingSigPath: "%/onboarding-files/files/%" },
        )
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM documents d
            WHERE d.deleted_at IS NULL
              AND d.metadata->>'fileId' = file.id::text
          )`,
        )
        .andWhere(`${ED} IS NOT NULL`)
        .andWhere(`${dateExpr} >= :fromDate`, { fromDate: from })
        .andWhere(`${dateExpr} <= :toDate`, { toDate: to })
        .orderBy("file.created_at", "DESC")
        .addOrderBy("file.name", "ASC")
        .getMany();
    });
  }

  private async loadDriveFolderRows(customerId: string): Promise<File[]> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return manager.getRepository(File).find({
        where: { customerId, fileType: FileType.folder },
        select: ["id", "name", "parentId", "fileType"],
      });
    });
  }

  private async loadExtractionsByTargetIds(
    customerId: string,
    documentIds: string[],
    fileIds: string[],
  ): Promise<Map<string, DocumentReportExtraction>> {
    const out = new Map<string, DocumentReportExtraction>();
    if (documentIds.length === 0 && fileIds.length === 0) return out;

    const finWhere =
      documentIds.length > 0 && fileIds.length > 0
        ? [
            { customerId, documentId: In(documentIds) },
            { customerId, fileId: In(fileIds) },
          ]
        : documentIds.length > 0
          ? [{ customerId, documentId: In(documentIds) }]
          : [{ customerId, fileId: In(fileIds) }];

    const finDocs = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return manager.getRepository(FinancialDocumentEntity).find({
        where: finWhere,
      });
    });

    if (finDocs.length === 0) return out;

    const targetKey = (fd: FinancialDocumentEntity): string | null => fd.documentId ?? fd.fileId;
    const invoiceFinIds = finDocs.filter((f) => f.docType === "invoice").map((f) => f.id);
    const statementFinIds = finDocs.filter((f) => f.docType === "statement").map((f) => f.id);

    if (invoiceFinIds.length > 0) {
      const invoices = await this.invoices.find({
        where: { customerId, financialDocumentId: In(invoiceFinIds) },
        relations: { lineItems: true, financialDocument: true },
      });
      for (const inv of invoices) {
        const fd = inv.financialDocument;
        const key = fd ? targetKey(fd) : null;
        if (!key) continue;
        const lines = [...(inv.lineItems ?? [])].sort((a, b) => a.lineIndex - b.lineIndex);
        out.set(key, {
          kind: "invoice",
          vendor: inv.vendor,
          storeName: inv.customerName ?? inv.storeName,
          customerAddress: inv.customerAddress,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate,
          subtotal: inv.subtotal,
          tax: inv.tax,
          total: inv.total,
          currency: inv.currency,
          status: inv.status,
          pageStart: fd.pageStart,
          pageEnd: fd.pageEnd,
          lineItemsDescription: inv.lineItemsDescription,
          lines: lines.map((l) => ({
            lineIndex: l.lineIndex,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: l.amount,
            discount: l.discount,
            taxAmount: l.taxAmount,
          })),
        });
      }
    }

    if (statementFinIds.length > 0) {
      const statements = await this.statements.find({
        where: { customerId, financialDocumentId: In(statementFinIds) },
        relations: { transactions: true, financialDocument: true },
      });
      for (const st of statements) {
        const fd = st.financialDocument;
        const key = fd ? targetKey(fd) : null;
        if (!key) continue;
        const lines = [...(st.transactions ?? [])].sort((a, b) => a.lineIndex - b.lineIndex);
        out.set(key, {
          kind: "statement",
          accountHolder: st.accountHolder,
          bankName: st.bankName,
          periodStart: st.periodStart,
          periodEnd: st.periodEnd,
          openingBalance: st.openingBalance,
          closingBalance: st.closingBalance,
          currency: st.currency,
          status: st.status,
          pageStart: fd.pageStart,
          pageEnd: fd.pageEnd,
          lines: lines.map((l) => ({
            lineIndex: l.lineIndex,
            date: l.date,
            description: l.description,
            debit: l.debit,
            credit: l.credit,
            balance: l.balance,
          })),
        });
      }
    }

    return out;
  }

  private async loadJobsByTargetIds(
    customerId: string,
    documentIds: string[],
    fileIds: string[],
  ): Promise<Map<string, DocumentReportJobResult>> {
    const out = new Map<string, DocumentReportJobResult>();
    if (documentIds.length === 0 && fileIds.length === 0) return out;

    const jobs = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      const qb = manager
        .getRepository(Job)
        .createQueryBuilder("job")
        .where("job.customer_id = :customerId", { customerId })
        .andWhere("job.type = :type", { type: JobType.extraction })
        .andWhere("job.deleted_at IS NULL")
        .orderBy("job.updated_at", "DESC");

      qb.andWhere(
        new Brackets((sub) => {
          if (documentIds.length > 0) {
            sub.where("job.document_id IN (:...documentIds)", { documentIds });
          }
          if (fileIds.length > 0) {
            if (documentIds.length > 0) {
              sub.orWhere("job.file_id IN (:...fileIds)", { fileIds });
            } else {
              sub.where("job.file_id IN (:...fileIds)", { fileIds });
            }
          }
        }),
      );

      return qb.getMany();
    });

    for (const job of jobs) {
      const key = job.documentId ?? job.fileId;
      if (!key || out.has(key)) continue;
      out.set(key, parseJobResult(job));
    }
    return out;
  }
}
