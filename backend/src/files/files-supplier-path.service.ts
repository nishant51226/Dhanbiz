import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { File, FileType } from "../entities/file.entity";

export type PortalLibrarySection = "invoices" | "statements" | "files";

export type PortalSupplierListItem = {
  folderId: string;
  label: string;
  disambiguation: string;
};

function isPortalLibrarySection(s: string): s is PortalLibrarySection {
  return s === "invoices" || s === "statements" || s === "files";
}

function sectionRootFolderName(section: PortalLibrarySection): string {
  switch (section) {
    case "invoices":
      return "Invoices";
    case "statements":
      return "Statements";
    case "files":
      return "Files";
  }
}

function isSupplierFolder(f: File): boolean {
  return f.fileType === FileType.folder && f.metadata?.isSupplier === true;
}

@Injectable()
export class FilesSupplierPathService {
  constructor(@InjectRepository(File) private readonly files: Repository<File>) {}

  normalizeSupplierKey(label: string): string {
    return label
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  /** Today in UTC: year folder name `2026` and date folder name `2026-04-20` (full calendar day under that year). */
  private todayUtcYearAndDate(): { year: string; dateKey: string } {
    const d = new Date();
    const y = String(d.getUTCFullYear());
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return { year: y, dateKey: `${y}-${m}-${day}` };
  }

  assertLibrarySection(body: string): PortalLibrarySection {
    const s = body?.trim().toLowerCase();
    if (!s || !isPortalLibrarySection(s)) {
      throw new BadRequestException("librarySection must be invoices, statements, or files");
    }
    return s;
  }

  async listSuppliers(
    customerId: string,
    librarySection?: PortalLibrarySection
  ): Promise<PortalSupplierListItem[]> {
    const all = await this.files.find({
      where: { customerId },
      select: ["id", "parentId", "name", "fileType", "metadata"],
    });
    const byId = new Map(all.map((f) => [f.id, f] as const));
    const rootName = librarySection ? sectionRootFolderName(librarySection) : null;

    const pathToRoot = (f: File): File[] => {
      const chain: File[] = [];
      let cur: File | null = f;
      while (cur) {
        chain.unshift(cur);
        cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
      }
      return chain;
    };

    const inSection = (f: File): boolean => {
      if (!librarySection || !rootName) return true;
      const chain = pathToRoot(f);
      return chain[0]?.name === rootName && chain[0]?.parentId === null;
    };

    /* Supplier path: Section / year / YYYY-MM-DD / supplier; disambiguation shows year and date. */
    const disambiguationFor = (f: File): string => {
      const chain = pathToRoot(f);
      if (chain.length >= 4) {
        return `${chain[1]?.name ?? ""} / ${chain[2]?.name ?? ""}`.trim();
      }
      if (chain.length >= 3) {
        return `${chain[1]?.name ?? ""}`.trim();
      }
      return f.id.slice(0, 8);
    };

    const out: PortalSupplierListItem[] = [];
    for (const row of all) {
      if (!isSupplierFolder(row)) continue;
      if (!inSection(row)) continue;
      out.push({
        folderId: row.id,
        label: row.name,
        disambiguation: disambiguationFor(row),
      });
    }
    out.sort((a, b) => a.label.localeCompare(b.label) || a.disambiguation.localeCompare(b.disambiguation));
    return out;
  }

  private async findChildFolder(
    customerId: string,
    parentId: string | null,
    name: string
  ): Promise<File | null> {
    if (parentId === null) {
      return this.files.findOne({
        where: {
          customerId,
          parentId: IsNull(),
          fileType: FileType.folder,
          name,
        },
      });
    }
    return this.files.findOne({
      where: {
        customerId,
        parentId,
        fileType: FileType.folder,
        name,
      },
    });
  }

  private async createFolder(
    customerId: string,
    parentId: string | null,
    name: string,
    metadata: Record<string, unknown>
  ): Promise<File> {
    const row = this.files.create({
      customerId,
      parentId,
      fileType: FileType.folder,
      name: name.slice(0, 1024),
      mimeType: null,
      sizeBytes: null,
      storageRelativePath: null,
      metadata,
    });
    return this.files.save(row);
  }

  private async findOrCreateSectionRoot(
    customerId: string,
    section: PortalLibrarySection
  ): Promise<File> {
    const name = sectionRootFolderName(section);
    const hit = await this.findChildFolder(customerId, null, name);
    if (hit) return hit;
    return this.createFolder(customerId, null, name, {});
  }

  /** `Section / Year / YYYY-MM-DD` (empty metadata on year and date folders). */
  private async ensureYearAndDateFolder(
    customerId: string,
    sectionRootId: string,
    year: string,
    dateKey: string
  ): Promise<string> {
    const yFolder =
      (await this.findChildFolder(customerId, sectionRootId, year)) ??
      (await this.createFolder(customerId, sectionRootId, year, {}));
    const dateFolder =
      (await this.findChildFolder(customerId, yFolder.id, dateKey)) ??
      (await this.createFolder(customerId, yFolder.id, dateKey, {}));
    return dateFolder.id;
  }

  private async findSupplierUnderDateFolder(
    customerId: string,
    dateFolderId: string,
    supplierKey: string
  ): Promise<File | null> {
    const children = await this.files.find({
      where: {
        customerId,
        parentId: dateFolderId,
        fileType: FileType.folder,
      },
    });
    const matches = children.filter(
      (c) => isSupplierFolder(c) && this.normalizeSupplierKey(c.name) === supplierKey
    );
    if (matches.length === 0) return null;
    matches.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return matches[0] ?? null;
  }

  private async createSupplierFolder(
    customerId: string,
    dateFolderId: string,
    supplierLabel: string
  ): Promise<File> {
    const key = this.normalizeSupplierKey(supplierLabel);
    const name = supplierLabel.trim().slice(0, 1024) || key.slice(0, 1024);
    return this.createFolder(customerId, dateFolderId, name, { isSupplier: true });
  }

  /**
   * Resolves parent folder for upload.
   * New uploads use **today (UTC)**: `Section / Year / YYYY-MM-DD / Supplier` (supplier has only `{ isSupplier: true }`).
   */
  async resolveSupplierUploadParent(params: {
    customerId: string;
    section: PortalLibrarySection;
    supplierName?: string;
    supplierFolderId?: string;
  }): Promise<{ parentId: string; supplierLabel: string }> {
    const { customerId, section, supplierFolderId } = params;

    if (supplierFolderId?.trim()) {
      const folder = await this.files.findOne({
        where: { id: supplierFolderId.trim() },
      });
      if (!folder || folder.customerId !== customerId) {
        throw new NotFoundException("supplier folder not found");
      }
      if (folder.fileType !== FileType.folder) {
        throw new BadRequestException("supplierFolderId must be a folder");
      }
      if (!isSupplierFolder(folder)) {
        throw new BadRequestException("supplierFolderId must be a supplier folder");
      }
      return {
        parentId: folder.id,
        supplierLabel: folder.name,
      };
    }

    const supplierLabel = params.supplierName?.trim();
    if (!supplierLabel) {
      throw new BadRequestException("supplierName is required unless supplierFolderId is set");
    }

    const { year, dateKey } = this.todayUtcYearAndDate();
    const supplierKey = this.normalizeSupplierKey(supplierLabel);

    const sectionRoot = await this.findOrCreateSectionRoot(customerId, section);
    const dateFolderId = await this.ensureYearAndDateFolder(
      customerId,
      sectionRoot.id,
      year,
      dateKey
    );

    let supplierFolder = await this.findSupplierUnderDateFolder(
      customerId,
      dateFolderId,
      supplierKey
    );
    if (!supplierFolder) {
      supplierFolder = await this.createSupplierFolder(
        customerId,
        dateFolderId,
        supplierLabel
      );
    }

    return {
      parentId: supplierFolder.id,
      supplierLabel,
    };
  }
}
