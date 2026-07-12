// backend/src/subscription-plans/subscription-plans.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { SubscriptionPlan } from "../entities/subscription-plan.entity";
import { SubscriptionPlansController } from "./subscription-plans.controller";
import { SubscriptionPlansService } from "./subscription-plans.service";

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionPlan]), AuthModule],
  controllers: [SubscriptionPlansController],
  providers: [SubscriptionPlansService],
  exports: [SubscriptionPlansService],
})
export class SubscriptionPlansModule {}