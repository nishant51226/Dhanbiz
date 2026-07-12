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
  UpdateDateColumn,
} from "typeorm";
import type { TenantId } from "../tenant/tenant-scope.js";
import { Customer } from "./customer.entity";
import { Job } from "./job.entity";

export enum FileType {
  folder = "folder",
  file = "file",
}

@Entity("files")
@Index(["customerId", "parentId"])
export class File {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Company / tenant scope; required for isolation and future RLS. See `tenant-scope.ts`. */
  @Column({ name: "customer_id", type: "uuid" })
  customerId!: TenantId;

  @ManyToOne(() => Customer, (c) => c.files, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ name: "parent_id", type: "uuid", nullable: true })
  parentId!: string | null;

  @ManyToOne(() => File, (f) => f.children, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "parent_id" })
  parent!: File | null;

  @OneToMany(() => File, (f) => f.parent)
  children?: File[];

  @Column({
    name: "type",
    type: "enum",
    enum: FileType,
    enumName: "files_type_enum",
  })
  fileType!: FileType;

  @Column({ type: "varchar", length: 1024 })
  name!: string;

  @Column({ name: "mime_type", type: "varchar", length: 256, nullable: true })
  mimeType!: string | null;

  @Column({ name: "size_bytes", type: "bigint", nullable: true })
  sizeBytes!: string | null;

  @Column({ name: "storage_relative_path", type: "varchar", length: 2048, nullable: true })
  storageRelativePath!: string | null;

  /** Full S3 object key after a successful customer-scoped upload (`{customerId}/…`). */
  @Column({ name: "s3_key", type: "varchar", length: 4096, nullable: true })
  s3Key!: string | null;

  /** Portal tab context, folder hints, extraction keys, etc. */
  @Column({ type: "jsonb", default: () => ({}) })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => Job, (j) => j.file)
  jobs?: Job[];
}
