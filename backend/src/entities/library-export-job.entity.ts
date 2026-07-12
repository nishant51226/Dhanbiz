import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Customer } from "./customer.entity";
import { UserEntity } from "./user.entity";

export enum LibraryExportJobStatus {
  queued = "queued",
  processing = "processing",
  completed = "completed",
  failed = "failed",
}

export type LibraryExportViewMode = "folderView" | "customerView" | "dateView";

export type LibraryExportFilters = {
  viewMode?: LibraryExportViewMode;
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
  /** When set, export only these document ids (access-checked). */
  documentIds?: string[];
  /** Snapshot of document ids included in a completed export (for activity logging). */
  exportedDocumentIds?: string[];
  /** Snapshot at queue time — background worker may not read customers under RLS. */
  customerName?: string;
};

@Entity({ name: "library_export_jobs" })
@Index(["requestedByUserId"])
@Index(["customerId"])
export class LibraryExportJobEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "customer_id", type: "uuid", nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer | null;

  @Column({ name: "requested_by_user_id", type: "uuid" })
  requestedByUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "requested_by_user_id" })
  requestedByUser!: UserEntity;

  @Column({ type: "enum", enum: LibraryExportJobStatus, default: LibraryExportJobStatus.queued })
  status!: LibraryExportJobStatus;

  @Column({ type: "jsonb", default: () => "'{}'" })
  filters!: LibraryExportFilters;

  @Column({ name: "s3_key", type: "varchar", length: 4096, nullable: true })
  s3Key!: string | null;

  @Column({ name: "zip_file_name", type: "varchar", length: 512, nullable: true })
  zipFileName!: string | null;

  @Column({ name: "file_count", type: "int", default: 0 })
  fileCount!: number;

  @Column({ type: "text", nullable: true })
  error!: string | null;

  @Column({ name: "pg_boss_job_id", type: "varchar", length: 128, nullable: true })
  pgBossJobId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt!: Date | null;
}
