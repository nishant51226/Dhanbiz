import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { PlansEntity } from "./plans.entity";
import { ServiceEntity } from "./service.entity";

/** Join row: which catalogue `services` belong to a matrix `plans` row (table `plan_service`). */
@Entity("plan_service")
export class PlanServiceEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => PlansEntity, (plan) => plan.planServiceLinks, { onDelete: "CASCADE" })
  @JoinColumn({ name: "plan_id" })
  plan!: PlansEntity;

  @Column({ name: "plan_id" })
  planId!: string;

  @ManyToOne(() => ServiceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "service_id" })
  service!: ServiceEntity;

  @Column({ name: "service_id" })
  serviceId!: string;

  /** Whether this service is included in the plan bundle for this link (legacy `plan_features.is_included`). */
  @Column({ name: "is_included", default: true })
  isIncluded!: boolean;
}
