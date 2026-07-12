import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { Customer } from "../entities/customer.entity";
import { CustomerTypeEntity } from "../entities/customer-type.entity";
import { PlanAddonsEntity } from "../entities/plan-addons.entity";
import { PlanLimitEntity } from "../entities/plan-limit.entity";
import { PlanPricingMatrixEntity } from "../entities/plan-pricing-matrix.entity";
import { PlanServiceEntity } from "../entities/plan-service.entity";
import { ServiceEntity } from "../entities/service.entity";
import { PlanRulesEntity } from "../entities/plan-rules.entity";
import { PlansEntity } from "../entities/plans.entity";
import { SubscriptionController } from "./subscription.controller";
import { SubscriptionService } from "./subscription.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      Customer,
      CustomerTypeEntity,
      PlansEntity,
      PlanPricingMatrixEntity,
      PlanRulesEntity,
      PlanLimitEntity,
      PlanAddonsEntity,
      ServiceEntity,
      PlanServiceEntity,
    ]),
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
