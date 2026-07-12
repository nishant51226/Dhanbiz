import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module.js";
import { AiPricingEntity } from "../entities/ai-pricing.entity.js";
import { AiPricingController } from "./ai-pricing.controller.js";
import { AiPricingService } from "./ai-pricing.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([AiPricingEntity]), AuthModule],
  controllers: [AiPricingController],
  providers: [AiPricingService],
  exports: [AiPricingService],
})
export class AiModule {}
