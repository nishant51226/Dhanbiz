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
import type { TenantId } from "../tenant/tenant-scope.js";
import { Customer } from "./customer.entity";
import { StatementEntity } from "./statement.entity";

@Entity("statement_lines")
@Index(["customerId"])
@Index(["statementId"])
export class StatementLineEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "statement_id", type: "uuid" })
  statementId!: string;

  @ManyToOne(() => StatementEntity, (st) => st.transactions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "statement_id" })
  statement!: StatementEntity;

  @Column({ name: "customer_id", type: "uuid" })
  customerId!: TenantId;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ name: "line_index", type: "int" })
  lineIndex!: number;

  @Column({ type: "varchar", length: 64, nullable: true })
  date!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "double precision", nullable: true })
  debit!: number | null;

  @Column({ type: "double precision", nullable: true })
  credit!: number | null;

  @Column({ type: "double precision", nullable: true })
  balance!: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
