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
import { FolderEntity } from "./folder.entity";
import { Job } from "./job.entity";
import { SupplierEntity } from "./supplier.entity";

/** Binary + portal metadata for a row in `documents` (invoice uploads, etc.). */
@Entity({ name: "documents" })
@Index(["folderId"])
@Index(["customerId"])
export class DocumentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "folder_id", type: "uuid", nullable: true })
  folderId!: string | null;

  @ManyToOne(() => FolderEntity, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "folder_id" })
  folder!: FolderEntity | null;

  /** Denormalized tenant scope for RLS and folderless documents. */
  @Column({ name: "customer_id", type: "uuid" })
  customerId!: TenantId;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ name: "supplier_id", type: "uuid", nullable: true })
  supplierId!: string | null;

  @ManyToOne(() => SupplierEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "supplier_id" })
  supplier!: SupplierEntity | null;

  /** Logical type, e.g. `invoice` | `statement` | `file`. */
  @Column({ name: "document_type", type: "varchar", length: 128 })
  documentType!: string;

  @Column({ type: "varchar", length: 1024 })
  name!: string;

  @Column({ name: "original_name", type: "varchar", length: 1024, nullable: true })
  originalName!: string | null;

  /** Storage path relative to customer root (same convention as `files.storage_relative_path`). */
  @Column({ name: "file_url", type: "varchar", length: 4096 })
  fileUrl!: string;

  /** Full S3 object key when the binary is (also) stored under `{customerId}/…` in the app bucket. */
  @Column({ name: "s3_key", type: "varchar", length: 4096, nullable: true })
  s3Key!: string | null;

  @Column({ name: "mime_type", type: "varchar", length: 256, nullable: true })
  mimeType!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  extension!: string | null;

  @Column({ name: "size_bytes", type: "bigint", nullable: true })
  sizeBytes!: string | null;

  @Column({ type: "jsonb", default: () => ({}) })
  metadata!: Record<string, unknown>;

  /** Business / document date (optional); distinct from upload time. */
  @Column({ name: "document_date", type: "date", nullable: true })
  documentDate!: string | null;

  @Column({ name: "uploaded_at", type: "timestamptz" })
  uploadedAt!: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => Job, (job) => job.document)
  jobs?: Job[];
}
