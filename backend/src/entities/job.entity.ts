import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { AiProviderId } from "../ai/types";
import type { TenantId } from "../tenant/tenant-scope.js";
import { Customer } from "./customer.entity";
import { DocumentEntity } from "./document.entity";
import { File } from "./file.entity";

export enum JobType {
  extraction = "extraction",
}

export enum JobStatus {
  queued = "queued",
  processing = "processing",
  completed = "completed",
  failed = "failed",
  cancelled = "cancelled",
}

@Entity("jobs")
export class Job {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Company / tenant scope; required for isolation and future RLS. See `tenant-scope.ts`. */
  @Column({ name: "customer_id", type: "uuid" })
  customerId!: TenantId;

  @ManyToOne(() => Customer, (c) => c.jobs, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  /** Legacy drive / admin upload path (`files` table). Prefer `documentId` for portal library jobs. */
  @Column({ name: "file_id", type: "uuid", nullable: true })
  fileId!: string | null;

  @ManyToOne(() => File, (f) => f.jobs, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "file_id" })
  file!: File | null;

  /** Portal library row (`documents`); binary lives at `document.fileUrl`. */
  @Column({ name: "document_id", type: "uuid", nullable: true })
  documentId!: string | null;

  @ManyToOne(() => DocumentEntity, (d) => d.jobs, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "document_id" })
  document!: DocumentEntity | null;

  @Column({
    type: "enum",
    enum: JobType,
    enumName: "jobs_type_enum",
  })
  type!: JobType;

  @Column({
    type: "enum",
    enum: JobStatus,
    enumName: "jobs_status_enum",
    default: JobStatus.queued,
  })
  status!: JobStatus;

  @Column({ name: "percent_completed", type: "smallint", default: 0 })
  percentCompleted!: number;

  /** Pipeline output; must remain attributable to `customerId` for tenant / RLS checks. */
  @Column({ type: "jsonb", nullable: true })
  result!: Record<string, unknown> | null;

  @Column({ type: "text", nullable: true })
  error!: string | null;

  @Column({ name: "pg_boss_job_id", type: "varchar", length: 128, nullable: true })
  pgBossJobId!: string | null;

  @Column({ name: "vision_prompt", type: "text", nullable: true })
  visionPrompt!: string | null;

  @Column({ name: "structure_prompt", type: "text", nullable: true })
  structurePrompt!: string | null;

  @Column({ name: "vision_model", type: "varchar", length: 256, nullable: true })
  visionModel!: string | null;

  @Column({ name: "structure_model", type: "varchar", length: 256, nullable: true })
  structureModel!: string | null;

  @Column({ name: "ai_provider", type: "varchar", length: 32, nullable: true })
  aiProvider!: AiProviderId | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  /** When the worker first picked up this job (processing started). */
  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt!: Date | null;

  /** When the job reached a terminal status (completed, failed, or cancelled). */
  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt!: Date | null;

  /** Wall-clock processing time in milliseconds (worker start → terminal status). */
  @Column({ name: "processing_duration_ms", type: "integer", nullable: true })
  processingDurationMs!: number | null;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
