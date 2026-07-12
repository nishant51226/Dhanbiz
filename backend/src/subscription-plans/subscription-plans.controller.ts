// backend/src/subscription-plans/subscription-plans.controller.ts

import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { CreateSubscriptionPlanDto } from "./dto/create-subscription-plan.dto";
import { UpdateSubscriptionPlanDto } from "./dto/update-subscription-plan.dto";
import { SubscriptionPlansService } from "./subscription-plans.service";

function parseAnnualTurnoverGbp(body: { annualTurnoverGbp?: unknown }): number {
  const raw = body?.annualTurnoverGbp;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestException("annualTurnoverGbp must be a non-negative number");
  }
  return n;
}

@Controller("subscription-plans")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubscriptionPlansController {
  constructor(private readonly subscriptionPlansService: SubscriptionPlansService) {}

  @Post()
  @RequirePermission("subscription_plan:write")
  create(@Body() createDto: CreateSubscriptionPlanDto) {
    return this.subscriptionPlansService.create(createDto);
  }

  @Get()
  @RequirePermission("subscription_plan:read")
  findAll() {
    return this.subscriptionPlansService.findAll();
  }

  /** Active plans with `recommended` set from turnover vs each plan's min/max band. */
  @Post("by-turnover")
  @RequirePermission("subscription_plan:read")
  findByTurnover(@Body() body: { annualTurnoverGbp?: unknown }) {
    return this.subscriptionPlansService.findActiveWithRecommendations(parseAnnualTurnoverGbp(body ?? {}));
  }

  @Get(":id")
  @RequirePermission("subscription_plan:read")
  findOne(@Param("id") id: string) {
    return this.subscriptionPlansService.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("subscription_plan:write")
  update(@Param("id") id: string, @Body() updateDto: UpdateSubscriptionPlanDto) {
    return this.subscriptionPlansService.update(id, updateDto);
  }

  @Delete(":id")
  @RequirePermission("subscription_plan:write")
  remove(@Param("id") id: string) {
    return this.subscriptionPlansService.remove(id);
  }
}