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

/** Named supplier / counterparty for a customer (library tagging, defaults). */
@Entity({ name: "suppliers" })
@Index(["customerId"])
export class SupplierEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "customer_id", type: "uuid" })
  customerId!: TenantId;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ type: "varchar", length: 1024 })
  name!: string;

  @Column({ name: "is_default", type: "boolean", default: false })
  isDefault!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
