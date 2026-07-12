import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as path from "node:path";
import { Brackets, In, IsNull, Repository } from "typeorm";
import { Customer } from "../entities/customer.entity";
import { DocumentEntity } from "../entities/document.entity";
import { File, FileType } from "../entities/file.entity";
import { FolderDefaultEntity } from "../entities/folder-default.entity";
import { FolderEntity, FolderLibraryKind, folderSegmentTypeForLibraryKind } from "../entities/folder.entity";
import { applyLibraryFolderNameSearch, libraryFolderNameKey } from "../documents/library-folder-display.util";
import {
  PORTAL_JOB_FILE_META_KEY,
  PORTAL_JOB_STAGING_META_KEY,
  PORTAL_STAGING_LIBRARY_KIND_META_KEY,
  portalStagingFolderName,
} from "./portal-staging.constants";

/** Matches `FilesSupplierPathService` portal supplier picker shape. */
export type PortalSupplierRow = {
  folderId: string;
  label: string;
  disambiguation: string;
  /** True when this folder is the configured default for this library kind (customer override, else global). */
  isDefault: boolean;
  /** Library tree for this folder (`folders.type`). */
  libraryKind: FolderLibraryKind;
  isRestricted: boolean;
};

@Injectable()
export class PortalFolderDocumentService {
  constructor(
    @InjectRepository(FolderEntity) private readonly folders: Repository<FolderEntity>,
    @InjectRepository(FolderDefaultEntity) private readonly folderDefaults: Repository<FolderDefaultEntity>,
    @InjectRepository(DocumentEntity) private readonly documents: Repository<DocumentEntity>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(File) private readonly files: Repository<File>
  ) {}

  normalizeSupplierKey(label: string): string {
    return label
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  /** Legacy suffixes (`.global`, `.customer`) and kind prefixes (`files.`) should not appear in UI labels. */
  private displayFolderLabel(raw: string): string {
    let s = String(raw ?? "").trim();
    s = s.replace(/\.(global|customer)$/i, "").trim();
    s = s.replace(/^(files|invoices|statements)\./i, "").trim();
    const parts = s.split(".").filter(Boolean);
    if (parts.length > 1) {
      const tail = parts.filter((p) => !/^(files|invoices|statements)$/i.test(p)).pop();
      if (tail) s = tail;
    }
    return s || String(raw ?? "").trim();
  }

  assertLibraryKind(raw: string): FolderLibraryKind {
    const s = raw?.trim().toLowerCase();
    if (s === "invoices") return FolderLibraryKind.invoices;
    if (s === "statements") return FolderLibraryKind.statements;
    if (s === "files") return FolderLibraryKind.files;
    throw new BadRequestException("library must be invoices, statements, or files");
  }

  private defaultSuffixForKind(kind: FolderLibraryKind): "Files" | "Invoices" | "Statements" {
    if (kind === FolderLibraryKind.invoices) return "Invoices";
    if (kind === FolderLibraryKind.statements) return "Statements";
    return "Files";
  }

  private async defaultFolderLabelForCustomer(customerId: string, kind: FolderLibraryKind): Promise<string> {
    const c = await this.customers.findOne({ where: { id: customerId }, select: ["id", "name"] });
    const base = (c?.name ?? "").trim() || "Customer";
    return `${base}-${this.defaultSuffixForKind(kind)}`;
  }

  private todayUtcYearAndDate(): { year: string; dateKey: string } {
    const d = new Date();
    const y = String(d.getUTCFullYear());
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return { year: y, dateKey: `${y}-${m}-${day}` };
  }

  async listFolders(
    customerId: string,
    kind: FolderLibraryKind,
    parentId: string | null
  ): Promise<FolderEntity[]> {
    return this.folders.find({
      where: {
        customerId,
        type: kind,
        parentId: parentId === null ? IsNull() : parentId,
      },
      order: { name: "ASC" },
    });
  }

  /** All folders for a library kind (metadata only — no documents). Includes global folders. */
  async listAllFolders(customerId: string, kind: FolderLibraryKind): Promise<FolderEntity[]> {
    return this.folders.find({
      where: [
        { customerId, type: kind },
        { customerId: IsNull(), isGlobal: true, type: kind },
      ],
      select: ["id", "name", "parentId", "type", "customerId", "isGlobal", "createdAt"],
      order: { name: "ASC" },
    });
  }

  /** Leaf folders for folder view (supplier level), paginated. */
  async listBrowseFoldersPaginated(
    customerId: string,
    kinds: FolderLibraryKind[],
    page: number,
    limit: number,
    scope: "global" | "customer" | "all",
    searchText?: string,
  ): Promise<{
    data: Array<{
      id: string;
      name: string;
      parentId: string | null;
      type: FolderLibraryKind;
      customerId: string | null;
      customer: { id: string; name: string } | null;
      isGlobal: boolean;
      isRestricted: boolean;
    }>;
    total: number;
    page: number;
    pageCount: number;
    limit: number;
  }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;
    const kindList = kinds.length > 0 ? kinds : [FolderLibraryKind.invoices, FolderLibraryKind.statements, FolderLibraryKind.files];

    const qb = this.folders
      .createQueryBuilder("folder")
      .leftJoinAndSelect("folder.customer", "customer")
      .where(`NOT EXISTS (SELECT 1 FROM folders child WHERE child.parent_id = folder.id)`)
      .andWhere("folder.type IN (:...kindList)", { kindList });

    if (scope === "global") {
      qb.andWhere("folder.is_global = true AND folder.customer_id IS NULL");
    } else if (scope === "customer") {
      qb.andWhere("folder.customer_id = :cid AND folder.is_global = false", { cid: customerId });
    } else {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where("folder.customer_id = :cid AND folder.is_global = false", { cid: customerId })
            .orWhere("folder.is_global = true AND folder.customer_id IS NULL");
        }),
      );
    }

    applyLibraryFolderNameSearch(qb, searchText);

    const hasSearch = Boolean(searchText?.trim());
    if (hasSearch) {
      const total = await qb.getCount();
      const rows = await qb
        .orderBy("folder.name", "ASC")
        .addOrderBy("folder.id", "ASC")
        .skip(skip)
        .take(safeLimit)
        .getMany();
      return {
        data: rows.map((folder) => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          type: folder.type,
          customerId: folder.customerId,
          customer: folder.customer ? { id: folder.customer.id, name: folder.customer.name } : null,
          isGlobal: folder.isGlobal,
          isRestricted: folder.isRestricted,
        })),
        total,
        page: safePage,
        limit: safeLimit,
        pageCount: Math.max(1, Math.ceil(total / safeLimit)),
      };
    }

    if (scope === "global") {
      qb.orderBy("folder.name", "ASC");
    } else if (scope === "customer") {
      qb.orderBy("folder.name", "ASC");
    } else {
      qb.orderBy("folder.isGlobal", "DESC").addOrderBy("folder.name", "ASC");
    }

    const [rows, total] = await qb.skip(skip).take(safeLimit).getManyAndCount();

    return {
      data: rows.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        type: folder.type,
        customerId: folder.customerId,
        customer: folder.customer ? { id: folder.customer.id, name: folder.customer.name } : null,
        isGlobal: folder.isGlobal,
        isRestricted: folder.isRestricted,
      })),
      total,
      page: safePage,
      limit: safeLimit,
      pageCount: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async listDocuments(
    customerId: string,
    kind: FolderLibraryKind,
    folderId: string
  ): Promise<DocumentEntity[]> {
    const folder = await this.folders.findOne({ where: { id: folderId, type: kind } });
    if (!folder) {
      throw new NotFoundException("folder not found");
    }
    if (folder.customerId != null && folder.customerId !== customerId) {
      throw new NotFoundException("folder not found");
    }
    if (folder.customerId == null && !folder.isGlobal) {
      throw new NotFoundException("folder not found");
    }
    return this.documents.find({
      where: { folderId },
      order: { name: "ASC" },
    });
  }

  async ensureJobStagingFolder(customerId: string, kind: FolderLibraryKind): Promise<File> {
    const name = portalStagingFolderName(kind as "invoices" | "statements" | "files");
    const existing = await this.files.findOne({
      where: {
        customerId,
        parentId: IsNull(),
        fileType: FileType.folder,
        name,
      },
    });
    const metaBase = {
      [PORTAL_JOB_STAGING_META_KEY]: true,
      [PORTAL_STAGING_LIBRARY_KIND_META_KEY]: kind,
    };
    if (existing) {
      if (!existing.metadata?.[PORTAL_JOB_STAGING_META_KEY]) {
        await this.files.update(existing.id, {
          metadata: { ...existing.metadata, ...metaBase },
        });
      }
      return (await this.files.findOne({ where: { id: existing.id } }))!;
    }
    const row = this.files.create({
      customerId,
      parentId: null,
      fileType: FileType.folder,
      name,
      mimeType: null,
      sizeBytes: null,
      storageRelativePath: null,
      metadata: metaBase,
    });
    return this.files.save(row);
  }

  private async findChildFolder(
    customerId: string,
    kind: FolderLibraryKind,
    parentId: string | null,
    name: string
  ): Promise<FolderEntity | null> {
    if (parentId === null) {
      return this.folders.findOne({
        where: {
          customerId,
          parentId: IsNull(),
          type: kind,
          name,
        },
      });
    }
    return this.folders.findOne({
      where: { customerId, parentId, type: kind, name },
    });
  }

  private async createFolder(
    customerId: string,
    kind: FolderLibraryKind,
    parentId: string | null,
    name: string
  ): Promise<FolderEntity> {
    const row = this.folders.create({
      customerId,
      parentId,
      type: kind,
      folderType: folderSegmentTypeForLibraryKind(kind),
      name: name.slice(0, 1024),
      isGlobal: false,
      isDefault: false,
      supplierId: null,
    });
    return this.folders.save(row);
  }

  private async ensureYearAndDateFolder(
    customerId: string,
    kind: FolderLibraryKind,
    year: string,
    dateKey: string
  ): Promise<string> {
    const yFolder =
      (await this.findChildFolder(customerId, kind, null, year)) ??
      (await this.createFolder(customerId, kind, null, year));
    const dateFolder =
      (await this.findChildFolder(customerId, kind, yFolder.id, dateKey)) ??
      (await this.createFolder(customerId, kind, yFolder.id, dateKey));
    return dateFolder.id;
  }

  private async findSupplierUnderDateFolder(
    customerId: string,
    kind: FolderLibraryKind,
    dateFolderId: string,
    supplierKey: string
  ): Promise<FolderEntity | null> {
    const children = await this.folders.find({
      where: {
        customerId,
        parentId: dateFolderId,
        type: kind,
      },
    });
    const matches = children.filter((c) => this.normalizeSupplierKey(c.name) === supplierKey);
    if (matches.length === 0) return null;
    matches.sort((a, b) => a.id.localeCompare(b.id));
    return matches[0] ?? null;
  }

  private async createSupplierFolder(
    customerId: string,
    kind: FolderLibraryKind,
    dateFolderId: string,
    supplierLabel: string
  ): Promise<FolderEntity> {
    const key = this.normalizeSupplierKey(supplierLabel);
    const name = supplierLabel.trim().slice(0, 1024) || key.slice(0, 1024);
    return this.createFolder(customerId, kind, dateFolderId, name);
  }

  /** Resolved default folder (single customer override, else platform global), or null. */
  private async resolveEffectiveDefaultSupplierFolder(
    customerId: string,
    options?: { skipRestricted?: boolean },
  ): Promise<{ id: string; name: string; type: FolderLibraryKind } | null> {
    const customerDefault = await this.folderDefaults.findOne({
      where: { customerId },
      select: ["folderId"],
    });
    const globalDefault = await this.folderDefaults.findOne({
      where: { customerId: IsNull() },
      select: ["folderId"],
    });
    const pickedDefaultId = customerDefault?.folderId ?? globalDefault?.folderId ?? null;
    if (!pickedDefaultId) return null;
    const pickedDefault = await this.folders.findOne({
      where: { id: pickedDefaultId },
      select: ["id", "name", "customerId", "isGlobal", "type", "isRestricted"],
    });
    if (
      pickedDefault &&
      (pickedDefault.customerId === customerId || (pickedDefault.customerId == null && pickedDefault.isGlobal))
    ) {
      if (options?.skipRestricted && pickedDefault.isRestricted) return null;
      return { id: pickedDefault.id, name: pickedDefault.name, type: pickedDefault.type };
    }
    return null;
  }

  /** Infer `folders.type` when the client picked a folder by id (unified upload UI). */
  async inferLibraryKindForCustomerFolder(customerId: string, folderId: string): Promise<FolderLibraryKind | null> {
    const id = folderId?.trim();
    if (!id) return null;
    const folder = await this.folders.findOne({ where: { id }, select: ["id", "customerId", "isGlobal", "type"] });
    if (!folder) return null;
    if (folder.customerId != null && folder.customerId !== customerId) return null;
    if (folder.customerId == null && !folder.isGlobal) return null;
    return folder.type;
  }

  async listSuppliers(
    customerId: string,
    kind: FolderLibraryKind,
    options?: { excludeRestricted?: boolean },
  ): Promise<PortalSupplierRow[]> {
    const [rows, defaultFolder] = await Promise.all([
      this.folders.find({
        where: [
          { customerId, type: kind },
          { customerId: IsNull(), isGlobal: true, type: kind },
        ],
        select: ["id", "name", "customerId", "isGlobal", "type", "isRestricted"],
        order: { name: "ASC" },
      }),
      this.resolveEffectiveDefaultSupplierFolder(customerId, {
        skipRestricted: options?.excludeRestricted,
      }),
    ]);
    const visibleRows = options?.excludeRestricted ? rows.filter((r) => !r.isRestricted) : rows;
    const defaultFolderId = defaultFolder?.id ?? null;
    return visibleRows.map((r) => ({
      folderId: r.id,
      label: this.displayFolderLabel(r.name),
      disambiguation: r.isGlobal ? "Global" : "Customer",
      isDefault: defaultFolderId != null && r.id === defaultFolderId,
      libraryKind: kind,
      isRestricted: r.isRestricted,
    }));
  }

  /** All supplier-scoped library folders for this customer (plus globals), for a single-folder-picker upload UI. */
  async listSuppliersAll(
    customerId: string,
    options?: { excludeRestricted?: boolean },
  ): Promise<PortalSupplierRow[]> {
    const kindList = [FolderLibraryKind.invoices, FolderLibraryKind.statements, FolderLibraryKind.files];
    const [rows, defaultFolder] = await Promise.all([
      this.folders.find({
        where: [
          { customerId, type: In(kindList) },
          { customerId: IsNull(), isGlobal: true, type: In(kindList) },
        ],
        select: ["id", "name", "customerId", "isGlobal", "type", "isRestricted"],
        order: { name: "ASC" },
      }),
      this.resolveEffectiveDefaultSupplierFolder(customerId, {
        skipRestricted: options?.excludeRestricted,
      }),
    ]);
    const visibleRows = options?.excludeRestricted ? rows.filter((r) => !r.isRestricted) : rows;
    const defaultFolderId = defaultFolder?.id ?? null;
    return visibleRows.map((r) => ({
      folderId: r.id,
      label: this.displayFolderLabel(r.name),
      disambiguation: r.isGlobal ? "Global" : "Customer",
      isDefault: defaultFolderId != null && r.id === defaultFolderId,
      libraryKind: r.type,
      isRestricted: r.isRestricted,
    }));
  }

  async resolveSupplierUploadFolder(params: {
    customerId: string;
    kind: FolderLibraryKind;
    supplierName?: string;
    supplierFolderId?: string;
    allowRestrictedUpload?: boolean;
    /** When false, portal users must pick an existing folder (no manual or implicit folder creation). */
    allowCreateFolder?: boolean;
  }): Promise<{ supplierFolderId: string; supplierLabel: string; kind: FolderLibraryKind }> {
    const { customerId, kind, supplierFolderId, allowRestrictedUpload = false } = params;
    const allowCreateFolder = params.allowCreateFolder !== false;

    if (supplierFolderId?.trim()) {
      const folder = await this.folders.findOne({ where: { id: supplierFolderId.trim() } });
      if (!folder || (folder.customerId != null && folder.customerId !== customerId)) {
        throw new NotFoundException("supplier folder not found");
      }
      if (!(folder.customerId === customerId || (folder.customerId == null && folder.isGlobal))) {
        throw new BadRequestException("folder must be customer-specific or global");
      }
      if (folder.isRestricted && !allowRestrictedUpload) {
        throw new BadRequestException("cannot upload to restricted folder");
      }
      return {
        supplierFolderId: folder.id,
        supplierLabel: this.displayFolderLabel(folder.name),
        kind: folder.type,
      };
    }

    const manualSupplierName = params.supplierName?.trim() || "";
    if (!manualSupplierName) {
      const pickedDefault = await this.resolveEffectiveDefaultSupplierFolder(customerId, {
        skipRestricted: !allowRestrictedUpload,
      });
      if (pickedDefault) {
        return {
          supplierFolderId: pickedDefault.id,
          supplierLabel: this.displayFolderLabel(pickedDefault.name),
          kind: pickedDefault.type,
        };
      }
    }

    if (manualSupplierName) {
      if (!allowCreateFolder) {
        throw new BadRequestException(
          "Select an existing folder. Creating new folders is not permitted for your role.",
        );
      }
      const key = libraryFolderNameKey(manualSupplierName);
      const customerRoots = await this.folders.find({
        where: {
          customerId,
          type: kind,
          parentId: IsNull(),
          isGlobal: false,
        },
        select: ["id", "name"],
      });
      const dup = customerRoots.find((f) => libraryFolderNameKey(f.name) === key);
      if (dup) {
        throw new ConflictException("Folder name already exists");
      }
      const created = await this.createFolder(customerId, kind, null, manualSupplierName);
      return { supplierFolderId: created.id, supplierLabel: manualSupplierName, kind };
    }

    const supplierLabel = await this.defaultFolderLabelForCustomer(customerId, kind);

    const all = await this.folders.find({
      where: [
        { customerId, type: kind },
        { customerId: IsNull(), isGlobal: true, type: kind },
      ],
      select: ["id", "name", "customerId", "isGlobal", "isRestricted"],
    });
    const visibleAll = allowRestrictedUpload ? all : all.filter((f) => !f.isRestricted);
    const key = this.normalizeSupplierKey(supplierLabel);
    const hit = visibleAll.find((f) => this.normalizeSupplierKey(this.displayFolderLabel(f.name)) === key);
    if (hit) {
      return {
        supplierFolderId: hit.id,
        supplierLabel: this.displayFolderLabel(hit.name),
        kind,
      };
    }
    if (!allowCreateFolder) {
      throw new BadRequestException(
        "Select an existing folder. Creating new folders is not permitted for your role.",
      );
    }
    // New entries are always customer-specific root folders (no date/month/parent hierarchy).
    const created = await this.createFolder(customerId, kind, null, supplierLabel);
    return { supplierFolderId: created.id, supplierLabel, kind };
  }

  private extensionFromFilename(displayName: string): string | null {
    const n = displayName.trim();
    const dot = n.lastIndexOf(".");
    if (dot < 0 || dot === n.length - 1) return null;
    return n.slice(dot + 1, dot + 33).toLowerCase();
  }

  private documentTypeForLibrary(kind?: FolderLibraryKind): string {
    if (kind === FolderLibraryKind.invoices) return "invoice";
    if (kind === FolderLibraryKind.statements) return "statement";
    return "file";
  }

  async createDocument(params: {
    folderId: string;
    customerId?: string;
    displayName: string;
    originalName?: string;
    fileUrl: string;
    mimeType: string;
    sizeBytes: number;
    /** Set when the same binary is stored in S3 under the customer prefix. */
    s3Key?: string | null;
    libraryKind?: FolderLibraryKind;
    supplierId?: string | null;
    documentDate?: string | null;
  }): Promise<DocumentEntity> {
    const folder = await this.folders.findOne({ where: { id: params.folderId } });
    if (!folder) {
      throw new NotFoundException("folder not found");
    }
    const tenantCustomerId = params.customerId?.trim() || null;
    const customerId = folder.customerId ?? tenantCustomerId;
    if (!customerId) {
      throw new BadRequestException("customerId is required when saving a document under a global folder.");
    }
    if (folder.customerId && tenantCustomerId && folder.customerId !== tenantCustomerId) {
      throw new BadRequestException("folder does not belong to the provided customer scope.");
    }
    if (!folder.customerId && !folder.isGlobal) {
      throw new BadRequestException("folder is missing customer scope and is not marked global.");
    }
    const now = new Date();
    const meta = {
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
    };
    const row = this.documents.create({
      folderId: params.folderId,
      customerId,
      supplierId: params.supplierId ?? null,
      documentType: this.documentTypeForLibrary(params.libraryKind),
      name: params.displayName.slice(0, 1024),
      originalName: (params.originalName ?? params.displayName).slice(0, 1024),
      fileUrl: params.fileUrl,
      s3Key: params.s3Key ?? null,
      mimeType: params.mimeType,
      extension: this.extensionFromFilename(params.displayName),
      sizeBytes: String(params.sizeBytes),
      documentDate: params.documentDate ?? null,
      uploadedAt: now,
      metadata: meta,
    });
    return this.documents.save(row);
  }

  /** Full folder + document graph for one library kind (Miller / tree UI). */
  async getLibraryTree(
    customerId: string,
    kind: FolderLibraryKind
  ): Promise<{ folders: FolderEntity[]; documents: DocumentEntity[] }> {
    const folders = await this.folders.find({
      where: { customerId, type: kind },
      select: ["id", "name", "parentId", "type", "customerId", "isGlobal", "createdAt"],
      order: { name: "ASC" },
    });
    if (folders.length === 0) {
      return { folders: [], documents: [] };
    }
    const documents = await this.documents.find({
      where: { folderId: In(folders.map((f) => f.id)) },
      select: [
        "id",
        "folderId",
        "customerId",
        "supplierId",
        "documentType",
        "name",
        "originalName",
        "fileUrl",
        "s3Key",
        "mimeType",
        "extension",
        "sizeBytes",
        "metadata",
        "documentDate",
        "uploadedAt",
        "createdAt",
      ],
      order: { name: "ASC" },
    });
    return { folders, documents };
  }

  async linkDocumentToExtractionFile(documentId: string, fileId: string): Promise<void> {
    const d = await this.documents.findOne({ where: { id: documentId } });
    if (!d) return;
    await this.documents.update(documentId, {
      metadata: { ...d.metadata, fileId },
    });
  }

  /** Absolute path + MIME for streaming a library document (tenant-checked). */
  async resolveDocumentAbsolutePath(
    customerId: string,
    documentId: string,
    root: string
  ): Promise<{ abs: string; mimeType: string }> {
    const doc = await this.documents.findOne({
      where: { id: documentId },
      relations: { folder: true },
    });
    const scope = doc?.customerId ?? doc?.folder?.customerId ?? null;
    if (!doc || !scope || scope !== customerId) {
      throw new NotFoundException("document not found");
    }
    const rel = doc.fileUrl?.trim().replace(/^\/+/, "");
    if (!rel) {
      throw new BadRequestException("document has no file_url");
    }
    const abs = path.join(root, customerId, rel);
    const mimeFromCol = typeof doc.mimeType === "string" ? doc.mimeType.trim() : "";
    const mimeFromMeta =
      doc.metadata && typeof doc.metadata.mimeType === "string" ? doc.metadata.mimeType.trim() : "";
    const mimeType = mimeFromCol || mimeFromMeta || "application/octet-stream";
    return { abs, mimeType };
  }

  /** Prefer `s3_key` when set; otherwise on-disk path under `FILE_STORAGE_ROOT`. */
  async resolveDocumentContentSource(
    customerId: string,
    documentId: string,
    root: string,
  ): Promise<
    | { mode: "disk"; abs: string; mimeType: string }
    | { mode: "s3"; key: string; mimeType: string }
  > {
    const doc = await this.documents.findOne({
      where: { id: documentId },
      relations: { folder: true },
    });
    const scope = doc?.customerId ?? doc?.folder?.customerId ?? null;
    if (!doc || !scope || scope !== customerId) {
      throw new NotFoundException("document not found");
    }
    const mimeFromCol = typeof doc.mimeType === "string" ? doc.mimeType.trim() : "";
    const mimeFromMeta =
      doc.metadata && typeof doc.metadata.mimeType === "string" ? doc.metadata.mimeType.trim() : "";
    const mimeType = mimeFromCol || mimeFromMeta || "application/octet-stream";
    const s3Key = doc.s3Key?.trim();
    if (s3Key) {
      return { mode: "s3", key: s3Key, mimeType };
    }
    const rel = doc.fileUrl?.trim().replace(/^\/+/, "");
    if (!rel) {
      throw new BadRequestException("document has no file_url or s3_key");
    }
    const abs = path.join(root, customerId, rel);
    return { mode: "disk", abs, mimeType };
  }
}
