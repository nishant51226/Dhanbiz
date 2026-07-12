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
import type { CustomerDocumentsExportRequest } from "../reports/dto/customer-documents-report.dto.js";
import { Customer } from "./customer.entity";
import { UserEntity } from "./user.entity";

export enum CustomerDocumentsExportJobStatus {
  queued = "queued",
  processing = "processing",
  completed = "completed",
  failed = "failed",
}

export type { CustomerDocumentsExportRequest };

@Entity({ name: "customer_documents_export_jobs" })
@Index(["requestedByUserId"])
@Index(["customerId"])
export class CustomerDocumentsExportJobEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "customer_id", type: "uuid", nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ name: "requested_by_user_id", type: "uuid" })
  requestedByUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "requested_by_user_id" })
  requestedByUser!: UserEntity;

  @Column({
    type: "enum",
    enum: CustomerDocumentsExportJobStatus,
    default: CustomerDocumentsExportJobStatus.queued,
  })
  status!: CustomerDocumentsExportJobStatus;

  @Column({ type: "jsonb", default: () => "'{}'" })
  request!: CustomerDocumentsExportRequest;

  @Column({ name: "s3_key", type: "varchar", length: 4096, nullable: true })
  s3Key!: string | null;

  @Column({ name: "xlsx_file_name", type: "varchar", length: 512, nullable: true })
  xlsxFileName!: string | null;

  @Column({ name: "document_count", type: "int", default: 0 })
  documentCount!: number;

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
