import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { TenantId } from "../tenant/tenant-scope.js";
import { Customer } from "./customer.entity";

/** Matches PostgreSQL enum `folders_kind_enum`. */
export enum FolderLibraryKind {
  files = "files",
  statements = "statements",
  invoices = "invoices",
}

/** Matches PostgreSQL enum `folders_folder_type_enum`; kept in sync with {@link FolderLibraryKind}. */
export enum FolderSegmentType {
  FILE = "FILE",
  INVOICES = "INVOICES",
  STATEMENT = "STATEMENT",
}

export function folderSegmentTypeForLibraryKind(kind: FolderLibraryKind): FolderSegmentType {
  if (kind === FolderLibraryKind.invoices) return FolderSegmentType.INVOICES;
  if (kind === FolderLibraryKind.statements) return FolderSegmentType.STATEMENT;
  return FolderSegmentType.FILE;
}

/**
 * Typed folder tree per customer (`folders` table).
 * Portal layout per kind: `Year (root) → YYYY-MM-DD (UTC) → Supplier`.
 */
@Entity({ name: "folders" })
@Index(["customerId", "type", "parentId"])
export class FolderEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 1024 })
  name!: string;

  @Column({ name: "parent_id", type: "uuid", nullable: true })
  parentId!: string | null;

  @ManyToOne(() => FolderEntity, (f) => f.children, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "parent_id" })
  parent!: FolderEntity | null;

  @OneToMany(() => FolderEntity, (f) => f.parent)
  children?: FolderEntity[];

  @Column({
    type: "enum",
    enum: FolderLibraryKind,
    enumName: "folders_kind_enum",
  })
  type!: FolderLibraryKind;

  @Column({
    name: "folder_type",
    type: "enum",
    enum: FolderSegmentType,
    enumName: "folders_folder_type_enum",
  })
  folderType!: FolderSegmentType;

  /** Tenant scope; null only for global / system library roots (`is_global`). */
  @Column({ name: "customer_id", type: "uuid", nullable: true })
  customerId!: TenantId | null;

  @ManyToOne(() => Customer, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer | null;

  @Column({ name: "supplier_id", type: "uuid", nullable: true })
  supplierId!: string | null;

  @Column({ name: "is_global", type: "boolean", default: false })
  isGlobal!: boolean;

  @Column({ name: "is_default", type: "boolean", default: false })
  isDefault!: boolean;

  @Column({ name: "is_restricted", type: "boolean", default: false })
  isRestricted!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
