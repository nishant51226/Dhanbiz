import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequireAnyPermission, RequirePermission } from "../auth/require-permission.decorator";
import { AttachServiceToPlanDto } from "./dto/attach-service-to-plan.dto";
import { CreateCatalogServiceDto } from "./dto/create-catalog-service.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { CreateServiceForPlanDto } from "./dto/create-service-for-plan.dto";
import { RecommendSubscriptionPlansDto } from "./dto/recommend-subscription-plans.dto";
import { UpdateCatalogServiceDto } from "./dto/update-catalog-service.dto";
import { UpdateBundlePlanDto } from "./dto/update-bundle-plan.dto";
import { SubscriptionService } from "./subscription.service";
@Controller("subscriptions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post("recommend")
  @RequireAnyPermission("subscription_plan:read", "customer:read", "customer:write")
  recommendSubscriptionPlans(@Body() body: RecommendSubscriptionPlansDto) {
    return this.subscriptionService.recommendSubscriptionPlans(body);
  }

  @Get()
  @RequireAnyPermission("subscription_plan:read", "customer:read", "customer:write")
  listBundlePlans() {
    return this.subscriptionService.listBundlePlans();
  }

  /** Catalogue `services`. Query `planId` scopes to that plan's links; `activeOnly=true` limits to active rows (onboarding picker). */
  @Get("services")
  @RequireAnyPermission("subscription_plan:read", "customer:read", "customer:write")
  listCatalogServices(
    @Query("planId") planId?: string,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.subscriptionService.listCatalogServices(planId, activeOnly);
  }

  @Post("services")
  @RequirePermission("subscription_plan:write")
  createCatalogService(@Body() body: CreateCatalogServiceDto) {
    return this.subscriptionService.createCatalogService(body);
  }

  @Post("services/plans/:planId/link")
  @RequirePermission("subscription_plan:write")
  attachServiceToPlan(@Param("planId", ParseUUIDPipe) planId: string, @Body() body: AttachServiceToPlanDto) {
    return this.subscriptionService.addServiceToPlan(planId, body);
  }

  @Post("services/plans/:planId/create")
  @RequirePermission("subscription_plan:write")
  createServiceForPlan(@Param("planId", ParseUUIDPipe) planId: string, @Body() body: CreateServiceForPlanDto) {
    return this.subscriptionService.createServiceAndAttachToPlan(planId, body);
  }

  @Delete("services/links/:planServiceId")
  @RequirePermission("subscription_plan:write")
  removePlanServiceLink(@Param("planServiceId", ParseUUIDPipe) planServiceId: string) {
    return this.subscriptionService.removePlanServiceLink(planServiceId);
  }

  @Patch("services/:serviceId")
  @RequirePermission("subscription_plan:write")
  updateCatalogService(
    @Param("serviceId", ParseUUIDPipe) serviceId: string,
    @Body() body: UpdateCatalogServiceDto,
  ) {
    return this.subscriptionService.updateCatalogService(serviceId, body);
  }

  @Delete("services/:serviceId")
  @RequirePermission("subscription_plan:write")
  deleteCatalogService(@Param("serviceId", ParseUUIDPipe) serviceId: string) {
    return this.subscriptionService.deleteCatalogService(serviceId);
  }

  @Get(":planId/assigned-customers")
  @RequireAnyPermission("subscription_plan:read", "customer:read", "customer:write")
  listCustomersAssignedToBundlePlan(@Param("planId", ParseUUIDPipe) planId: string) {
    return this.subscriptionService.listCustomersAssignedToBundlePlan(planId);
  }

  @Get(":planId")
  @RequirePermission("subscription_plan:read")
  getBundlePlan(@Param("planId", ParseUUIDPipe) planId: string) {
    return this.subscriptionService.getBundlePlanById(planId);
  }

  @Post()
  @RequirePermission("subscription_plan:write")
  createSubscription(@Body() body: CreateSubscriptionDto) {
    return this.subscriptionService.createSubscription(body);
  }

  @Put(":planId")
  @RequirePermission("subscription_plan:write")
  replaceBundlePlan(@Param("planId", ParseUUIDPipe) planId: string, @Body() body: CreateSubscriptionDto) {
    return this.subscriptionService.updateBundlePlan(planId, body);
  }

  @Patch(":planId")
  @RequirePermission("subscription_plan:write")
  updateBundlePlanActive(
    @Param("planId", ParseUUIDPipe) planId: string,
    @Body() body: UpdateBundlePlanDto,
  ) {
    return this.subscriptionService.updateBundlePlanIsActive(planId, body.isActive);
  }

  @Delete(":planId")
  @RequirePermission("subscription_plan:write")
  deleteBundlePlan(@Param("planId", ParseUUIDPipe) planId: string) {
    return this.subscriptionService.deleteBundlePlan(planId);
  }
}
