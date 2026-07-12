// backend/src/subscription-plans/entities/subscription-plan.entity.ts

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ default: 'monthly' })
  billing_cycle: string;

  /** UI lists: `{ included: string[], not_included?: string[] }` plus optional extras. */
  @Column({ type: 'jsonb', nullable: true })
  features: Record<string, unknown> | null;

  /** Inclusive lower bound (GBP annual turnover) for recommending this plan. */
  @Column({ name: "turnover_min_gbp", type: "decimal", precision: 15, scale: 2, default: 0 })
  turnoverMinGbp: number;

  /** Inclusive upper bound; null = no upper limit. */
  @Column({ name: "turnover_max_gbp", type: "decimal", precision: 15, scale: 2, nullable: true })
  turnoverMaxGbp: number | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}