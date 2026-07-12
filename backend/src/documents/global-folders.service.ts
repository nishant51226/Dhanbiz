import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { Customer } from "../entities/customer.entity";
import { FolderDefaultEntity } from "../entities/folder-default.entity";
import { FolderRestrictedEntity } from "../entities/folder-restricted.entity";
import {
  FolderEntity,
  FolderLibraryKind,
  folderSegmentTypeForLibraryKind,
} from "../entities/folder.entity";
import { libraryFolderNameKey } from "./library-folder-display.util";

@Injectable()
export class GlobalFoldersService {
  constructor(
    @InjectRepository(FolderEntity) private readonly folders: Repository<FolderEntity>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(FolderDefaultEntity) private readonly folderDefaults: Repository<FolderDefaultEntity>,
    @InjectRepository(FolderRestrictedEntity) private readonly folderRestricted: Repository<FolderRestrictedEntity>,
  ) {}

  private async assignRestricted(customerId: string | null, folderId: string): Promise<void> {
    if (customerId === null) {
      await this.folderRestricted.createQueryBuilder().delete().where(`"customer_id" IS NULL`).execute();
      await this.folderRestricted.save(this.folderRestricted.create({ customerId: null, folderId }));
    } else {
      await this.folderRestricted
        .createQueryBuilder()
        .delete()
        .where(`"customer_id" = :customerId`)
        .setParameter("customerId", customerId)
        .execute();
      await this.folderRestricted.save(this.folderRestricted.create({ customerId, folderId }));
    }
  }

  private async assignDefault(customerId: string | null, folderId: string): Promise<void> {
    if (customerId === null) {
      await this.folderDefaults.createQueryBuilder().delete().where(`"customer_id" IS NULL`).execute();
      await this.folderDefaults.save(this.folderDefaults.create({ customerId: null, folderId }));
    } else {
      await this.folderDefaults
        .createQueryBuilder()
        .delete()
        .where(`"customer_id" = :customerId`)
        .setParameter("customerId", customerId)
        .execute();
      await this.folderDefaults.save(this.folderDefaults.create({ customerId, folderId }));
    }
  }

  async listDefaultCandidates(params: {
    scope: "global" | "customer";
    customerId?: string | null;
  }): Promise<{ id: string; name: string; isGlobal: boolean; customerId: string | null; isCurrentDefault: boolean }[]> {
    const customerId = params.scope === "customer" ? params.customerId?.trim() || null : null;
    if (params.scope === "customer" && !customerId) {
      throw new BadRequestException("customerId is required when scope=customer");
    }
    const customerScopedId = customerId ?? "";
    const where =
      params.scope === "global"
        ? [{ customerId: IsNull(), isGlobal: true }]
        : [
            { customerId: customerScopedId, isGlobal: false },
            { customerId: IsNull(), isGlobal: true },
          ];
    const rows = await this.folders.find({
      where,
      select: ["id", "name", "isGlobal", "customerId", "isRestricted", "createdAt"],
      order: { name: "ASC" },
    });
    const current = await this.folderDefaults.findOne({
      where: customerId === null ? { customerId: IsNull() } : { customerId },
      select: ["folderId"],
    });
    const currentFolderId = current?.folderId ?? null;
    return rows
      .filter((r) => !r.isRestricted)
      .map((r) => ({
      id: r.id,
      name: r.name,
      isGlobal: r.isGlobal,
      customerId: r.customerId,
      isCurrentDefault: currentFolderId === r.id,
    }));
  }

  private async assertNotRestrictedFolderForDefault(
    folder: FolderEntity,
    customerId: string | null,
  ): Promise<void> {
    if (folder.isRestricted) {
      throw new BadRequestException("A folder cannot be both default and restricted");
    }
    const restricted = await this.folderRestricted.findOne({
      where: customerId === null ? { customerId: IsNull() } : { customerId },
      select: ["folderId"],
    });
    if (restricted?.folderId === folder.id) {
      throw new BadRequestException("This folder is already the restricted folder for this scope");
    }
  }

  private async assertNotDefaultFolderForRestricted(folderId: string, customerId: string | null): Promise<void> {
    const defaultRow = await this.folderDefaults.findOne({
      where: customerId === null ? { customerId: IsNull() } : { customerId },
      select: ["folderId"],
    });
    if (defaultRow?.folderId === folderId) {
      throw new BadRequestException("This folder is already the default folder for this scope");
    }
  }

  async setDefaultFolder(params: {
    scope: "global" | "customer";
    folderId: string;
    customerId?: string | null;
  }): Promise<{ scope: "global" | "customer"; customerId: string | null; folderId: string }> {
    const folderId = params.folderId.trim();
    const customerId = params.scope === "customer" ? params.customerId?.trim() || null : null;
    if (params.scope === "customer" && !customerId) {
      throw new BadRequestException("customerId is required when scope=customer");
    }
    const folder = await this.folders.findOne({ where: { id: folderId } });
    if (!folder) {
      throw new NotFoundException("folder not found");
    }
    await this.assertNotRestrictedFolderForDefault(folder, customerId);
    if (params.scope === "global") {
      if (!(folder.isGlobal && folder.customerId == null)) {
        throw new BadRequestException("global default must reference a global folder");
      }
      await this.assignDefault(null, folder.id);
      return { scope: "global", customerId: null, folderId: folder.id };
    }
    if (!(folder.customerId === customerId || (folder.customerId == null && folder.isGlobal))) {
      throw new BadRequestException("customer default must reference customer folder or global folder");
    }
    await this.assignDefault(customerId, folder.id);
    return { scope: "customer", customerId, folderId: folder.id };
  }

  async listDefaultAssignments(): Promise<
    Array<{
      scope: "global" | "customer";
      customerId: string | null;
      customerName: string | null;
      folderId: string;
      folderName: string;
      folderIsGlobal: boolean;
    }>
  > {
    const rows = await this.folderDefaults.find({
      select: ["customerId", "folderId", "updatedAt"],
      order: { updatedAt: "DESC" },
    });
    if (rows.length === 0) return [];
    const folderIds = [...new Set(rows.map((r) => r.folderId))];
    const customerIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is string => Boolean(x)))];
    const [folders, customers] = await Promise.all([
      this.folders.find({ where: folderIds.map((id) => ({ id })), select: ["id", "name", "isGlobal"] }),
      customerIds.length
        ? this.customers.find({ where: customerIds.map((id) => ({ id })), select: ["id", "name"] })
        : Promise.resolve([]),
    ]);
    const folderById = new Map(folders.map((f) => [f.id, f]));
    const customerById = new Map(customers.map((c) => [c.id, c]));
    return rows
      .map((r) => {
        const folder = folderById.get(r.folderId);
        if (!folder) return null;
        const customer = r.customerId ? customerById.get(r.customerId) : null;
        return {
          scope: r.customerId ? ("customer" as const) : ("global" as const),
          customerId: r.customerId ?? null,
          customerName: customer?.name ?? null,
          folderId: r.folderId,
          folderName: folder.name,
          folderIsGlobal: folder.isGlobal,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => {
        if (a.scope !== b.scope) return a.scope === "global" ? -1 : 1;
        return (a.customerName ?? "").localeCompare(b.customerName ?? "");
      });
  }

  async listRestrictedCandidates(params: {
    scope: "global" | "customer";
    customerId?: string | null;
  }): Promise<{ id: string; name: string; isGlobal: boolean; customerId: string | null; isCurrentRestricted: boolean }[]> {
    const customerId = params.scope === "customer" ? params.customerId?.trim() || null : null;
    if (params.scope === "customer" && !customerId) {
      throw new BadRequestException("customerId is required when scope=customer");
    }
    const customerScopedId = customerId ?? "";
    const where =
      params.scope === "global"
        ? [{ customerId: IsNull(), isGlobal: true, isRestricted: true }]
        : [
            { customerId: customerScopedId, isGlobal: false, isRestricted: true },
            { customerId: IsNull(), isGlobal: true, isRestricted: true },
          ];
    const rows = await this.folders.find({
      where,
      select: ["id", "name", "isGlobal", "customerId", "createdAt"],
      order: { name: "ASC" },
    });
    const current = await this.folderRestricted.findOne({
      where: customerId === null ? { customerId: IsNull() } : { customerId },
      select: ["folderId"],
    });
    const currentFolderId = current?.folderId ?? null;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isGlobal: r.isGlobal,
      customerId: r.customerId,
      isCurrentRestricted: currentFolderId === r.id,
    }));
  }

  async setRestrictedFolder(params: {
    scope: "global" | "customer";
    folderId: string;
    customerId?: string | null;
  }): Promise<{ scope: "global" | "customer"; customerId: string | null; folderId: string }> {
    const folderId = params.folderId.trim();
    const customerId = params.scope === "customer" ? params.customerId?.trim() || null : null;
    if (params.scope === "customer" && !customerId) {
      throw new BadRequestException("customerId is required when scope=customer");
    }
    const folder = await this.folders.findOne({ where: { id: folderId } });
    if (!folder) {
      throw new NotFoundException("folder not found");
    }
    if (!folder.isRestricted) {
      throw new BadRequestException("restricted assignment must reference a restricted folder");
    }
    await this.assertNotDefaultFolderForRestricted(folder.id, customerId);
    if (params.scope === "global") {
      if (!(folder.isGlobal && folder.customerId == null)) {
        throw new BadRequestException("global restricted must reference a global folder");
      }
      await this.assignRestricted(null, folder.id);
      return { scope: "global", customerId: null, folderId: folder.id };
    }
    if (!(folder.customerId === customerId || (folder.customerId == null && folder.isGlobal))) {
      throw new BadRequestException("customer restricted must reference customer folder or global folder");
    }
    await this.assignRestricted(customerId, folder.id);
    return { scope: "customer", customerId, folderId: folder.id };
  }

  async listRestrictedAssignments(): Promise<
    Array<{
      scope: "global" | "customer";
      customerId: string | null;
      customerName: string | null;
      folderId: string;
      folderName: string;
      folderIsGlobal: boolean;
    }>
  > {
    const rows = await this.folderRestricted.find({
      select: ["customerId", "folderId", "updatedAt"],
      order: { updatedAt: "DESC" },
    });
    if (rows.length === 0) return [];
    const folderIds = [...new Set(rows.map((r) => r.folderId))];
    const customerIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is string => Boolean(x)))];
    const [folders, customers] = await Promise.all([
      this.folders.find({ where: folderIds.map((id) => ({ id })), select: ["id", "name", "isGlobal"] }),
      customerIds.length
        ? this.customers.find({ where: customerIds.map((id) => ({ id })), select: ["id", "name"] })
        : Promise.resolve([]),
    ]);
    const folderById = new Map(folders.map((f) => [f.id, f]));
    const customerById = new Map(customers.map((c) => [c.id, c]));
    return rows
      .map((r) => {
        const folder = folderById.get(r.folderId);
        if (!folder) return null;
        const customer = r.customerId ? customerById.get(r.customerId) : null;
        return {
          scope: r.customerId ? ("customer" as const) : ("global" as const),
          customerId: r.customerId ?? null,
          customerName: customer?.name ?? null,
          folderId: r.folderId,
          folderName: folder.name,
          folderIsGlobal: folder.isGlobal,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => {
        if (a.scope !== b.scope) return a.scope === "global" ? -1 : 1;
        return (a.customerName ?? "").localeCompare(b.customerName ?? "");
      });
  }

  private async findRootFolderNameConflict(params: {
    name: string;
    type: FolderLibraryKind;
    scope: "global" | "customer";
    customerId: string | null;
  }): Promise<FolderEntity | null> {
    const key = libraryFolderNameKey(params.name);
    if (!key) return null;
    const rows = await this.folders.find({
      where:
        params.scope === "global"
          ? {
              customerId: IsNull(),
              isGlobal: true,
              type: params.type,
              parentId: IsNull(),
            }
          : {
              customerId: params.customerId === null ? IsNull() : params.customerId,
              isGlobal: false,
              type: params.type,
              parentId: IsNull(),
            },
      select: ["id", "name"],
    });
    return rows.find((row) => libraryFolderNameKey(row.name) === key) ?? null;
  }

  private normalizeParentId(parentId?: string | null): string | null {
    const rawParent =
      parentId === undefined || parentId === null || parentId === "" ? null : String(parentId).trim();
    const normalizedRawParent = rawParent && rawParent.toLowerCase() === "null" ? null : rawParent;
    return normalizedRawParent?.length ? normalizedRawParent : null;
  }

  async createAdminFolder(params: {
    name: string;
    type: FolderLibraryKind;
    parentId?: string | null;
    scope: "global" | "customer";
    customerId?: string | null;
    isDefault?: boolean;
    isRestricted?: boolean;
  }): Promise<FolderEntity> {
    const name = params.name.trim().slice(0, 1024);
    if (!name) {
      throw new BadRequestException("name must not be empty");
    }
    const kind = params.type;
    const parentId = this.normalizeParentId(params.parentId);
    const scope = params.scope;
    const requestedCustomerId = params.customerId?.trim() ?? "";
    const customerId = scope === "customer" ? requestedCustomerId || null : null;
    const isGlobal = scope === "global";
    const isDefault = Boolean(params.isDefault);
    const isRestricted = Boolean(params.isRestricted);
    if (isDefault && isRestricted) {
      throw new BadRequestException("A folder cannot be both default and restricted");
    }

    if (scope === "customer" && !customerId) {
      throw new BadRequestException("customerId is required when scope=customer");
    }
    if (scope === "global" && requestedCustomerId) {
      throw new BadRequestException("customerId must be empty when scope=global");
    }
    if (customerId) {
      const customer = await this.customers.findOne({ where: { id: customerId }, select: ["id"] });
      if (!customer) throw new NotFoundException("customer not found");
    }

    if (parentId) {
      const parent = await this.folders.findOne({ where: { id: parentId } });
      if (!parent) {
        throw new NotFoundException("parent folder not found");
      }
      if (parent.type !== kind) {
        throw new BadRequestException("parent folder type must match the requested type");
      }
      if (isGlobal) {
        if (!parent.isGlobal || parent.customerId != null) {
          throw new BadRequestException("global folders must use a global parent");
        }
      } else if (!(parent.customerId === customerId && !parent.isGlobal)) {
        throw new BadRequestException("customer folders must use a parent from the same customer scope");
      }
    }

    if (parentId === null) {
      const dup = await this.findRootFolderNameConflict({
        name,
        type: kind,
        scope: isGlobal ? "global" : "customer",
        customerId,
      });
      if (dup) {
        if (!isDefault) {
          throw new ConflictException("Folder name already exists");
        }
        await this.assignDefault(customerId, dup.id);
        return dup;
      }
    } else {
      const dup = await this.folders.findOne({
        where: {
          customerId: customerId === null ? IsNull() : customerId,
          isGlobal,
          type: kind,
          parentId,
          name,
        },
      });
      if (dup) {
        if (!isDefault) {
          throw new ConflictException("Folder name already exists");
        }
        await this.assignDefault(customerId, dup.id);
        return dup;
      }
    }

    if (isDefault && scope === "customer") {
      const existingCustomerOrGlobal = await this.folders.findOne({
        where: [
          {
            customerId: customerId === null ? IsNull() : customerId,
            type: kind,
            parentId: parentId === null ? IsNull() : parentId,
            name,
          },
          {
            customerId: IsNull(),
            isGlobal: true,
            type: kind,
            parentId: parentId === null ? IsNull() : parentId,
            name,
          },
        ],
        order: { isGlobal: "ASC", createdAt: "ASC" },
      });
      if (existingCustomerOrGlobal) {
        await this.assignDefault(customerId, existingCustomerOrGlobal.id);
        return existingCustomerOrGlobal;
      }
    }

    const row = this.folders.create({
      name,
      parentId,
      type: kind,
      folderType: folderSegmentTypeForLibraryKind(kind),
      customerId,
      isGlobal,
      isDefault: isDefault && isGlobal,
      isRestricted,
      supplierId: null,
    });
    const saved = await this.folders.save(row);
    if (isDefault) {
      await this.assignDefault(customerId, saved.id);
    }
    if (isRestricted && params.scope === "customer" && customerId) {
      await this.assignRestricted(customerId, saved.id);
    } else if (isRestricted && params.scope === "global") {
      await this.assignRestricted(null, saved.id);
    }
    return saved;
  }

  async createAdminFolders(params: {
    name: string;
    type: FolderLibraryKind;
    scope: "global" | "customer";
    customerIds?: string[];
    parentId?: string | null;
    isDefault?: boolean;
    isRestricted?: boolean;
  }): Promise<FolderEntity[]> {
    if (params.scope === "global") {
      const created = await this.createAdminFolder({
        name: params.name,
        type: params.type,
        scope: "global",
        customerId: null,
        parentId: params.parentId ?? null,
        isDefault: params.isDefault,
        isRestricted: params.isRestricted,
      });
      return [created];
    }
    const ids = [...new Set((params.customerIds ?? []).map((x) => String(x).trim()).filter(Boolean))];
    if (ids.length === 0) {
      throw new BadRequestException("customerIds is required when scope=customer");
    }
    const out: FolderEntity[] = [];
    for (const customerId of ids) {
      const created = await this.createAdminFolder({
        name: params.name,
        type: params.type,
        scope: "customer",
        customerId,
        parentId: params.parentId ?? null,
        isDefault: params.isDefault,
        isRestricted: params.isRestricted,
      });
      out.push(created);
    }
    return out;
  }

  async createGlobalFolder(params: {
    name: string;
    type: FolderLibraryKind;
    parentId?: string | null;
  }): Promise<FolderEntity> {
    return this.createAdminFolder({
      name: params.name,
      type: params.type,
      parentId: params.parentId ?? null,
      scope: "global",
    });
  }
}
