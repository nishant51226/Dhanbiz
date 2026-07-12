import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("ai_pricing")
@Index(["provider", "model"])
export class AiPricingEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 32 })
  provider!: string;

  @Column({ type: "varchar", length: 256 })
  model!: string;

  @Column({ name: "input_token_price", type: "decimal", precision: 18, scale: 8 })
  inputTokenPrice!: string;

  @Column({ name: "output_token_price", type: "decimal", precision: 18, scale: 8 })
  outputTokenPrice!: string;

  @Column({ type: "varchar", length: 8, default: "USD" })
  currency!: string;

  @Column({ name: "effective_until", type: "timestamptz", nullable: true })
  effectiveUntil!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
