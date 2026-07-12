import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { TenantId } from "../tenant/tenant-scope.js";
import { Customer } from "./customer.entity";
import { DocumentEntity } from "./document.entity";
import { File } from "./file.entity";
import { Job } from "./job.entity";
import { UserEntity } from "./user.entity";

export enum FileActivityAction {
  uploaded = "uploaded",
  viewed = "viewed",
  downloaded = "downloaded",
  deleted = "deleted",
  assignees_updated = "assignees_updated",
  job_created = "job_created",
  job_processing = "job_processing",
  job_completed = "job_completed",
  job_failed = "job_failed",
  job_cancelled = "job_cancelled",
}

export enum FileActivityActorKind {
  staff = "staff",
  portal = "portal",
  system = "system",
}

@Entity("file_activity_logs")
@Index(["documentId", "createdAt"])
@Index(["fileId", "createdAt"])
@Index(["customerId", "createdAt"])
@Index(["action", "createdAt"])
export class FileActivityLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "customer_id", type: "uuid" })
  customerId!: TenantId;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ name: "document_id", type: "uuid", nullable: true })
  documentId!: string | null;

  @ManyToOne(() => DocumentEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "document_id" })
  document!: DocumentEntity | null;

  @Column({ name: "file_id", type: "uuid", nullable: true })
  fileId!: string | null;

  @ManyToOne(() => File, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "file_id" })
  file!: File | null;

  @Column({ name: "job_id", type: "uuid", nullable: true })
  jobId!: string | null;

  @ManyToOne(() => Job, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "job_id" })
  job!: Job | null;

  @Column({ type: "enum", enum: FileActivityAction, enumName: "file_activity_action" })
  action!: FileActivityAction;

  @Column({ name: "actor_user_id", type: "uuid", nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "actor_user_id" })
  actorUser!: UserEntity | null;

  @Column({ name: "actor_kind", type: "enum", enum: FileActivityActorKind, enumName: "file_activity_actor_kind" })
  actorKind!: FileActivityActorKind;

  @Column({ type: "varchar", length: 512 })
  summary!: string;

  @Column({ type: "jsonb", default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @Column({ name: "ip_address", type: "varchar", length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ name: "user_agent", type: "varchar", length: 512, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
