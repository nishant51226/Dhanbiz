import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { PlansEntity } from "./plans.entity";

@Entity("plan_pricing_matrix")
export class PlanPricingMatrixEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "plan_id", type: "uuid" })
  planId!: string;

  @ManyToOne(() => PlansEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "plan_id" })
  plan!: PlansEntity;

  @Column({ name: "turnover_min", type: "decimal", precision: 15, scale: 2, default: 0 })
  turnoverMin!: number;

  @Column({ name: "turnover_max", type: "decimal", precision: 15, scale: 2, nullable: true })
  turnoverMax!: number | null;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  price!: number;
}
