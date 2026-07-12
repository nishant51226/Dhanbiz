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
import { ExtractionSegmentEntity } from "./extraction-segment.entity";

@Entity("ai_executions")
@Index(["customerId"])
@Index(["segmentId"])
export class AiExecutionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "segment_id", type: "uuid" })
  segmentId!: string;

  @ManyToOne(() => ExtractionSegmentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "segment_id" })
  segment!: ExtractionSegmentEntity;

  @Column({ name: "customer_id", type: "uuid" })
  customerId!: TenantId;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ type: "varchar", length: 32 })
  method!: string;

  @Column({ type: "varchar", length: 32 })
  provider!: string;

  @Column({ type: "varchar", length: 256 })
  model!: string;

  @Column({ name: "input_tokens", type: "int", nullable: true })
  inputTokens!: number | null;

  @Column({ name: "output_tokens", type: "int", nullable: true })
  outputTokens!: number | null;

  @Column({ name: "total_tokens", type: "int", nullable: true })
  totalTokens!: number | null;

  @Column({ type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
