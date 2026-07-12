import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { TenantId } from "../tenant/tenant-scope.js";
import { Customer } from "./customer.entity";
import { FolderEntity } from "./folder.entity";

@Entity({ name: "folder_defaults" })
export class FolderDefaultEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Null = platform-wide default; non-null = override for that customer (at most one row each; see migrations). */
  @Column({ name: "customer_id", type: "uuid", nullable: true })
  customerId!: TenantId | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer | null;

  @Column({ name: "folder_id", type: "uuid" })
  folderId!: string;

  @ManyToOne(() => FolderEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "folder_id" })
  folder!: FolderEntity;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
