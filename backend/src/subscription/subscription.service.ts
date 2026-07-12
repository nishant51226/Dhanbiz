import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, QueryFailedError, Repository } from "typeorm";
import { Customer } from "../entities/customer.entity";
import { CustomerTypeEntity } from "../entities/customer-type.entity";
import { PlanAddonsEntity } from "../entities/plan-addons.entity";
import { PlanLimitEntity } from "../entities/plan-limit.entity";
import { PlanPricingMatrixEntity } from "../entities/plan-pricing-matrix.entity";
import { PlanRulesEntity } from "../entities/plan-rules.entity";
import { PlanServiceEntity } from "../entities/plan-service.entity";
import { PlansEntity } from "../entities/plans.entity";
import { ServiceEntity } from "../entities/service.entity";
import { AttachServiceToPlanDto } from "./dto/attach-service-to-plan.dto";
import { CreateCatalogServiceDto } from "./dto/create-catalog-service.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { CreateServiceForPlanDto } from "./dto/create-service-for-plan.dto";
import { RecommendSubscriptionPlansDto } from "./dto/recommend-subscription-plans.dto";
import { UpdateCatalogServiceDto } from "./dto/update-catalog-service.dto";
import type {
  AddPlanInput,
  BundlePlanDetailResponse,
  BundlePlanListItem,
  PlanAssignedCustomerRow,
  CatalogServiceListItem,
  CreateSubscriptionResult,
  PlanBundleServiceRow,
  PlanAddonSettingsInput,
  PlanPricingMatrixBandInput,
  PlanRuleBodyInput,
  RecommendSubscriptionPlansResponse,
  RecommendedSubscriptionPlanOption,
} from "./types/subscription-record.types";

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(CustomerTypeEntity)
    private readonly customerTypes: Repository<CustomerTypeEntity>,
    @InjectRepository(PlansEntity)
    private readonly plans: Repository<PlansEntity>,
    @InjectRepository(PlanPricingMatrixEntity)
    private readonly planPricingMatrix: Repository<PlanPricingMatrixEntity>,
    @InjectRepository(PlanRulesEntity)
    private readonly planRules: Repository<PlanRulesEntity>,
    @InjectRepository(PlanLimitEntity)
    private readonly planLimit: Repository<PlanLimitEntity>,
    @InjectRepository(PlanAddonsEntity)
    private readonly planAddons: Repository<PlanAddonsEntity>,
    @InjectRepository(ServiceEntity)
    private readonly serviceCatalog: Repository<ServiceEntity>,
    @InjectRepository(PlanServiceEntity)
    private readonly planServices: Repository<PlanServiceEntity>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  /**
   * Lists all rows from `plans` with customer type, pricing band count, lowest band price,
   * extendable flag, and free payroll limit for the subscription settings screen.
   */
  async listBundlePlans(): Promise<BundlePlanListItem[]> {
    const planRows = await this.plans.find({
      where: { isActive: true },
      relations: { customerTypes: true },
      order: { name: "ASC" },
    });
    if (!planRows.length) return [];

    const ids = planRows.map((p) => p.id);
    const [matrixRows, ruleRows, limitRows, assignmentCounts] = await Promise.all([
      this.planPricingMatrix.find({ where: { planId: In(ids) } }),
      this.planRules.find({ where: { planId: In(ids) } }),
      this.planLimit.find({ where: { planId: In(ids) } }),
      this.countCustomersByPlanId(ids),
    ]);

    const matrixByPlan = new Map<string, PlanPricingMatrixEntity[]>();
    for (const m of matrixRows) {
      const list = matrixByPlan.get(m.planId) ?? [];
      list.push(m);
      matrixByPlan.set(m.planId, list);
    }
    const ruleByPlan = new Map(ruleRows.map((r) => [r.planId, r] as const));
    const limitByPlan = new Map(limitRows.map((l) => [l.planId, l] as const));

    return planRows.map((p) => {
      const bands = matrixByPlan.get(p.id) ?? [];
      const prices = bands.map((b) => Number(b.price)).filter((x) => Number.isFinite(x));
      const priceFrom = prices.length ? Math.min(...prices) : 0;
      const rule = ruleByPlan.get(p.id);
      const lim = limitByPlan.get(p.id);
      const capRaw = p.maxTurnover;
      const capNum = capRaw === null || capRaw === undefined ? null : Number(capRaw);
      const maxTurnover = capNum !== null && Number.isFinite(capNum) ? capNum : null;

      return {
        id: p.id,
        name: p.name,
        billingCycle: p.billingCycle,
        customerTypeNames: (p.customerTypes ?? [])
          .map((c) => c.name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "en-GB")),
        maxTurnover,
        pricingBandCount: bands.length,
        priceFrom,
        extendable: rule ? Boolean(rule.extendable) : false,
        freePayrollLimit: lim ? lim.freePayrollLimit : null,
        isActive: p.isActive !== false,
        assignedCustomerCount: assignmentCounts.get(p.id) ?? 0,
      };
    });
  }

  async listCustomersAssignedToBundlePlan(planId: string): Promise<PlanAssignedCustomerRow[]> {
    const pid = planId.trim();
    const plan = await this.plans.findOne({ where: { id: pid }, select: { id: true } });
    if (!plan) {
      throw new NotFoundException("Plan not found");
    }
    const rows = await this.customers.find({
      where: { planId: pid },
      select: { id: true, name: true, accountStatus: true },
      order: { name: "ASC" },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      accountStatus: c.accountStatus,
    }));
  }

  private async countCustomersByPlanId(planIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!planIds.length) return out;
    const raw = await this.customers
      .createQueryBuilder("c")
      .select("c.plan_id", "planId")
      .addSelect("COUNT(*)::int", "count")
      .where("c.plan_id IN (:...planIds)", { planIds })
      .groupBy("c.plan_id")
      .getRawMany<{ planId: string; count: number | string }>();
    for (const row of raw) {
      if (!row.planId) continue;
      const n = Number(row.count);
      out.set(row.planId, Number.isFinite(n) ? n : 0);
    }
    return out;
  }

  async updateBundlePlanIsActive(planId: string, isActive: boolean): Promise<{ id: string; isActive: boolean }> {
    const id = planId.trim();
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${planId}`);
    }
    plan.isActive = Boolean(isActive);
    const saved = await this.plans.save(plan);
    return { id: saved.id, isActive: saved.isActive !== false };
  }

  /** Full plan for the staff edit screen (matrix, rules, limits, add-ons). */
  async getBundlePlanById(planId: string): Promise<BundlePlanDetailResponse> {
    const id = planId.trim();
    const plan = await this.plans.findOne({
      where: { id },
      relations: { customerTypes: true },
    });
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${planId}`);
    }

    const bands = await this.planPricingMatrix.find({
      where: { planId: id },
      order: { turnoverMin: "ASC" },
    });
    const rule = await this.planRules.findOne({ where: { planId: id } });
    const lim = await this.planLimit.findOne({ where: { planId: id } });
    const addon = await this.planAddons.findOne({ where: { planId: id } });
    const planSvcLinks = await this.planServices.find({
      where: { planId: id },
      relations: { service: true },
    });
    const planServices: PlanBundleServiceRow[] = planSvcLinks
      .map((ps) => {
        const s = ps.service;
        if (!s) return null;
        return {
          planServiceId: ps.id,
          serviceId: s.id,
          name: s.name,
          description: s.description ?? null,
          price: Number(s.price),
          isActive: s.isActive !== false,
          isIncluded: Boolean(ps.isIncluded),
        };
      })
      .filter((x): x is PlanBundleServiceRow => x !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

    const capRaw = plan.maxTurnover;
    const capNum = capRaw === null || capRaw === undefined ? null : Number(capRaw);
    const maxTurnover = capNum !== null && Number.isFinite(capNum) ? capNum : null;

    const ext = rule ? Boolean(rule.extendable) : false;
    const step = rule ? Number(rule.incrementStep) : 0;
    const cost = rule ? Number(rule.incrementCost) : 0;

    return {
      id: plan.id,
      isActive: plan.isActive !== false,
      name: plan.name,
      customerTypes: (plan.customerTypes ?? [])
        .map((c) => c.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "en-GB")),
      billingCycle: plan.billingCycle,
      maxTurnover,
      pricingMatrix: bands.map((b) => ({
        minTurnover: Number(b.turnoverMin),
        maxTurnover:
          b.turnoverMax === null || b.turnoverMax === undefined ? null : Number(b.turnoverMax),
        price: Number(b.price),
      })),
      rules: ext
        ? { extendable: true, incrementStep: step, incrementCost: cost }
        : { extendable: false },
      limits: { freePayrollLimit: lim?.freePayrollLimit ?? 0 },
      addons: addon
        ? {
            vatPercent: Number(addon.vatPercent),
            taxFilingVatEnabled: Boolean(addon.taxFillingVatEnable),
            dormantEnabled: Boolean(addon.dormantEnable),
            dormantCost: Number(addon.dormantCost),
            extraEmployeeCost: Number(addon.extraEmployeeCost),
          }
        : {
            vatPercent: 0,
            taxFilingVatEnabled: false,
            dormantEnabled: false,
            dormantCost: 0,
            extraEmployeeCost: 0,
          },
      planServices,
    };
  }

  /**
   * Catalogue `services`: all rows when `planId` is omitted; when `planId` is set, only services linked via `plan_service`.
   */
  async listCatalogServices(planIdRaw?: string, activeOnlyRaw?: string): Promise<CatalogServiceListItem[]> {
    const activeOnly =
      String(activeOnlyRaw ?? "")
        .trim()
        .toLowerCase() === "true" || String(activeOnlyRaw ?? "").trim() === "1";
    const planId = planIdRaw?.trim();
    if (planId) {
      if (!this.isUuid(planId)) {
        throw new BadRequestException("planId must be a valid UUID");
      }
      const plan = await this.plans.findOne({ where: { id: planId } });
      if (!plan) {
        throw new NotFoundException(`Plan not found: ${planId}`);
      }
      const links = await this.planServices.find({
        where: { planId },
        relations: { service: true },
      });
      return links
        .map((ps) => {
          const s = ps.service;
          if (!s) return null;
          if (activeOnly && s.isActive === false) return null;
          const row: CatalogServiceListItem = {
            planServiceId: ps.id,
            serviceId: s.id,
            name: s.name,
            description: s.description ?? null,
            price: Number(s.price),
            isActive: s.isActive !== false,
            isIncluded: Boolean(ps.isIncluded),
          };
          return row;
        })
        .filter((x): x is CatalogServiceListItem => x !== null)
        .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
    }
    const rows = await this.serviceCatalog.find({
      where: activeOnly ? { isActive: true } : {},
      order: { name: "ASC" },
    });
    return rows.map((s) => ({
      planServiceId: null,
      serviceId: s.id,
      name: s.name,
      description: s.description ?? null,
      price: Number(s.price),
      isActive: s.isActive !== false,
      isIncluded: Boolean(s.isIncluded),
    }));
  }

  /**
   * Links an existing catalogue service to a plan (`plan_service`), or updates `is_included` if the link exists.
   */
  async addServiceToPlan(
    planId: string,
    dto: AttachServiceToPlanDto,
  ): Promise<{ planServiceId: string; serviceId: string; isIncluded: boolean }> {
    const pid = planId.trim();
    await this.requirePlan(pid);
    const sid = dto.serviceId.trim();
    const svc = await this.serviceCatalog.findOne({ where: { id: sid } });
    if (!svc) {
      throw new NotFoundException(`Service not found: ${sid}`);
    }
    let link = await this.planServices.findOne({ where: { planId: pid, serviceId: sid } });
    if (link) {
      link.isIncluded = Boolean(dto.isIncluded);
      link = await this.planServices.save(link);
    } else {
      link = this.planServices.create({
        planId: pid,
        serviceId: sid,
        isIncluded: Boolean(dto.isIncluded),
      });
      link = await this.planServices.save(link);
    }
    return { planServiceId: link.id, serviceId: sid, isIncluded: Boolean(link.isIncluded) };
  }

  /** Creates a `services` row and a `plan_service` row for the given plan. */
  async createServiceAndAttachToPlan(
    planId: string,
    dto: CreateServiceForPlanDto,
  ): Promise<{
    serviceId: string;
    planServiceId: string;
    name: string;
    description: string | null;
    price: number;
    isActive: boolean;
    isIncluded: boolean;
  }> {
    const pid = planId.trim();
    await this.requirePlan(pid);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Service name is required");
    }
    const priceNum = dto.price === undefined || dto.price === null ? 0 : Number(dto.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      throw new BadRequestException("price must be a non-negative number");
    }
    const desc =
      dto.description === undefined || dto.description === null
        ? null
        : String(dto.description).trim() || null;
    const isActive = dto.isActive !== false;
    const isIncluded = Boolean(dto.isIncluded);

    const svcRow = this.serviceCatalog.create({
      name,
      description: desc,
      price: String(priceNum),
      isActive,
      isIncluded: true,
    });
    const savedSvc = await this.serviceCatalog.save(svcRow);
    const link = this.planServices.create({
      planId: pid,
      serviceId: savedSvc.id,
      isIncluded,
    });
    const savedLink = await this.planServices.save(link);
    return {
      serviceId: savedSvc.id,
      planServiceId: savedLink.id,
      name: savedSvc.name,
      description: savedSvc.description ?? null,
      price: Number(savedSvc.price),
      isActive: savedSvc.isActive !== false,
      isIncluded: Boolean(savedLink.isIncluded),
    };
  }

  /** Removes a `plan_service` row (service stays in the catalogue). */
  async removePlanServiceLink(planServiceId: string): Promise<{ deleted: true }> {
    const id = planServiceId.trim();
    if (!id) {
      throw new BadRequestException("planServiceId is required");
    }
    const res = await this.planServices.delete({ id });
    if (!res.affected) {
      throw new NotFoundException(`Plan service link not found: ${id}`);
    }
    return { deleted: true };
  }

  /** Creates a catalogue `services` row (not linked to any plan). */
  async createCatalogService(dto: CreateCatalogServiceDto): Promise<CatalogServiceListItem> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Service name is required");
    }
    const priceNum = dto.price === undefined || dto.price === null ? 0 : Number(dto.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      throw new BadRequestException("price must be a non-negative number");
    }
    const desc =
      dto.description === undefined || dto.description === null
        ? null
        : String(dto.description).trim() || null;
    const isActive = dto.isActive !== false;

    const svcRow = this.serviceCatalog.create({
      name,
      description: desc,
      price: String(priceNum),
      isActive,
      isIncluded: true,
    });
    const saved = await this.serviceCatalog.save(svcRow);
    return {
      planServiceId: null,
      serviceId: saved.id,
      name: saved.name,
      description: saved.description ?? null,
      price: Number(saved.price),
      isActive: saved.isActive !== false,
      isIncluded: Boolean(saved.isIncluded),
    };
  }

  /** Updates a catalogue `services` row. */
  async updateCatalogService(serviceId: string, dto: UpdateCatalogServiceDto): Promise<CatalogServiceListItem> {
    const sid = serviceId.trim();
    if (!this.isUuid(sid)) {
      throw new BadRequestException("serviceId must be a valid UUID");
    }
    const svc = await this.serviceCatalog.findOne({ where: { id: sid } });
    if (!svc) {
      throw new NotFoundException(`Service not found: ${sid}`);
    }
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("Service name cannot be empty");
      }
      svc.name = name;
    }
    if (dto.description !== undefined) {
      svc.description =
        dto.description === null ? null : String(dto.description).trim() || null;
    }
    if (dto.price !== undefined) {
      const priceNum = Number(dto.price);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        throw new BadRequestException("price must be a non-negative number");
      }
      svc.price = String(priceNum);
    }
    if (dto.isActive !== undefined) {
      svc.isActive = Boolean(dto.isActive);
    }
    const saved = await this.serviceCatalog.save(svc);
    return {
      planServiceId: null,
      serviceId: saved.id,
      name: saved.name,
      description: saved.description ?? null,
      price: Number(saved.price),
      isActive: saved.isActive !== false,
      isIncluded: Boolean(saved.isIncluded),
    };
  }

  /** Deletes a catalogue `services` row (plan links cascade). */
  async deleteCatalogService(serviceId: string): Promise<{ deleted: true }> {
    const sid = serviceId.trim();
    if (!this.isUuid(sid)) {
      throw new BadRequestException("serviceId must be a valid UUID");
    }
    const res = await this.serviceCatalog.delete({ id: sid });
    if (!res.affected) {
      throw new NotFoundException(`Service not found: ${sid}`);
    }
    return { deleted: true };
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  private async requirePlan(planId: string): Promise<PlansEntity> {
    const plan = await this.plans.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${planId}`);
    }
    return plan;
  }

  /** Prevent confusing duplicate matrix catalogue rows (same display name + billing cycle). */
  private async assertBundlePlanNameBillingUnique(
    nameRaw: string,
    billingCycleRaw: string,
    excludePlanId?: string,
  ): Promise<void> {
    const name = nameRaw.trim();
    const billingCycle = billingCycleRaw.trim() || "monthly";
    const qb = this.plans
      .createQueryBuilder("p")
      .where("LOWER(TRIM(p.name)) = LOWER(TRIM(:name))", { name })
      .andWhere("LOWER(TRIM(p.billingCycle)) = LOWER(TRIM(:bc))", { bc: billingCycle });
    if (excludePlanId) {
      qb.andWhere("p.id != :excludeId", { excludeId: excludePlanId });
    }
    const hit = await qb.getOne();
    if (hit) {
      throw new ConflictException(
        `A plan named "${name}" already exists for billing cycle "${billingCycle}". Use a different name or billing cycle.`,
      );
    }
  }

  /**
   * Replaces matrix bands and upserts rules, limits, add-ons; updates plan row and customer types.
   * Does not change `isActive` (use PATCH for that).
   */
  async updateBundlePlan(planId: string, dto: CreateSubscriptionDto): Promise<CreateSubscriptionResult> {
    const pid = planId.trim();
    const plan = await this.plans.findOne({ where: { id: pid }, relations: { customerTypes: true } });
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${planId}`);
    }

    const labels = dto.customerTypes.map((s) => s.trim()).filter(Boolean);
    if (!labels.length) {
      throw new BadRequestException("At least one customer type is required");
    }
    const resolvedIds: string[] = [];
    for (const label of labels) {
      resolvedIds.push(await this.getCustomerTypeIdByName(label));
    }
    const uniqueIds = [...new Set(resolvedIds)];
    const typeEntities = await this.customerTypes.findBy({ id: In(uniqueIds) });
    if (typeEntities.length !== uniqueIds.length) {
      throw new BadRequestException("One or more customer types could not be resolved");
    }

    const newName = dto.name.trim();
    const newBc = dto.billingCycle.trim() || "monthly";
    await this.assertBundlePlanNameBillingUnique(newName, newBc, pid);

    plan.name = newName;
    plan.billingCycle = newBc;
    plan.maxTurnover = dto.maxTurnover === undefined ? null : dto.maxTurnover;
    plan.customerTypes = typeEntities;
    try {
      await this.plans.save(plan);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        typeof err.driverError === "object" &&
        err.driverError !== null &&
        String((err.driverError as { code?: string }).code) === "23505"
      ) {
        throw new ConflictException(
          "A subscription plan with these details already exists. Change the plan name or billing cycle.",
        );
      }
      throw err;
    }

    await this.planPricingMatrix.delete({ planId: pid });
    const pricingMatrixIds = await this.addPlanPricingMatrix(
      pid,
      dto.pricingMatrix.map((b) => ({
        min: b.minTurnover,
        max: b.maxTurnover,
        price: b.price,
      })),
    );

    const planRulesId = await this.addPlanRules(pid, [
      {
        extendable: dto.rules.extendable,
        incrementStep: dto.rules.incrementStep,
        incrementCost: dto.rules.incrementCost,
      },
    ]);

    const payroll = dto.limits.freePayrollLimit ?? dto.limits.freePayrollUsers;
    if (payroll === undefined || payroll === null) {
      throw new BadRequestException("limits must include freePayrollLimit or freePayrollUsers");
    }
    const planLimitId = await this.addPlanLimit(pid, Number(payroll));

    let addonIds: string[] = [];
    if (dto.addons) {
      const addonId = await this.addPlanAddonSettings(pid, {
        vatPercent: dto.addons.vatPercent,
        taxFillingVatEnable: dto.addons.taxFilingVatEnabled,
        dormantEnable: dto.addons.dormantEnabled,
        dormantCost: dto.addons.dormantCost,
        extraEmployeeCost: dto.addons.extraEmployeeCost,
      });
      addonIds = [addonId];
    }

    return { planId: pid, pricingMatrixIds, planRulesId, planLimitId, addonIds };
  }

  /** Maps API aliases (`limited`, `solo`) to seeded `customer_type.name` values. */
  private normalizeCustomerTypeLabel(raw: string): string {
    const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
    const aliases: Record<string, string> = {
      solo: "Solo",
      "sole trader": "Solo",
      partnership: "Partnership",
      limited: "Limited Company",
      "limited company": "Limited Company",
      ltd: "Limited Company",
    };
    if (aliases[t] !== undefined) return aliases[t]!;
    return raw.trim();
  }

  private normalizeBillingCycle(raw: string): string {
    const t = raw.trim().toLowerCase();
    if (t === "annual" || t === "annually") return "yearly";
    return t;
  }

  private planMaxTurnoverNum(plan: PlansEntity): number | null {
    const capRaw = plan.maxTurnover;
    const capNum = capRaw === null || capRaw === undefined ? null : Number(capRaw);
    return capNum !== null && Number.isFinite(capNum) ? capNum : null;
  }

  private effBandMin(b: PlanPricingMatrixEntity): number {
    return Number(b.turnoverMin);
  }

  /** Inclusive upper turnover for the band, capped by plan max when set; +∞ when open-ended and no plan cap. */
  private effBandMaxCeiling(b: PlanPricingMatrixEntity, planMax: number | null): number {
    const raw = b.turnoverMax;
    if (raw === null || raw === undefined) {
      return planMax ?? Number.POSITIVE_INFINITY;
    }
    let mx = Number(raw);
    if (planMax !== null) mx = Math.min(mx, planMax);
    return mx;
  }

  /**
   * Matrix base price + turnover extension blocks when turnover exceeds the matched band ceiling
   * and `plan_rules.extendable` is true.
   */
  private computeTurnoverPricing(
    bands: PlanPricingMatrixEntity[],
    turnover: number,
    planMax: number | null,
    extendable: boolean,
    step: number,
    incCost: number,
  ): {
    base: number;
    turnoverExtra: number;
    turnoverExtensionDetail?: { blocks: number; step: number; costPerBlock: number; bandCeiling: number };
  } | null {
    if (!bands.length) return null;
    const sorted = [...bands].sort((a, b) => this.effBandMin(a) - this.effBandMin(b));

    for (const b of sorted) {
      const min = this.effBandMin(b);
      const maxC = this.effBandMaxCeiling(b, planMax);
      if (turnover >= min && turnover <= maxC) {
        const base = Number(b.price);
        return Number.isFinite(base) ? { base, turnoverExtra: 0 } : null;
      }
    }

    let top: PlanPricingMatrixEntity | null = null;
    for (const b of sorted) {
      if (this.effBandMin(b) <= turnover) {
        if (!top || this.effBandMin(b) > this.effBandMin(top)) top = b;
      }
    }
    if (!top) {
      const first = sorted[0]!;
      if (turnover < this.effBandMin(first)) {
        const base = Number(first.price);
        return Number.isFinite(base) ? { base, turnoverExtra: 0 } : null;
      }
      return null;
    }

    const ceiling = this.effBandMaxCeiling(top, planMax);
    const base = Number(top.price);
    if (!Number.isFinite(base)) return null;
    if (turnover <= ceiling) {
      return { base, turnoverExtra: 0 };
    }
    if (!extendable || step <= 0 || !Number.isFinite(incCost) || incCost < 0) {
      return null;
    }
    const extraUnits = Math.ceil((turnover - ceiling) / step);
    const turnoverExtra = extraUnits * incCost;
    return {
      base,
      turnoverExtra,
      turnoverExtensionDetail: {
        blocks: extraUnits,
        step,
        costPerBlock: incCost,
        bandCeiling: ceiling,
      },
    };
  }

  /** When turnover does not match any band, use the lowest-band price as an indicative base. */
  private lowestBandBasePrice(bands: PlanPricingMatrixEntity[]): number | null {
    if (!bands.length) return null;
    const sorted = [...bands].sort((a, b) => this.effBandMin(a) - this.effBandMin(b));
    const base = Number(sorted[0]!.price);
    return Number.isFinite(base) ? base : null;
  }

  private planMatchesCustomerType(plan: PlansEntity, canonicalCustomerType: string): boolean {
    const want = this.normalizeCustomerTypeLabel(canonicalCustomerType);
    for (const ct of plan.customerTypes ?? []) {
      if (!ct?.name) continue;
      if (this.normalizeCustomerTypeLabel(ct.name) === want) return true;
    }
    return false;
  }

  private async recommendPlansPipeline(
    candidates: PlansEntity[],
    ctx: { turnover: number; payeeUsers: number; billing: string; isDormant: boolean },
    opts: { turnoverFilter: "strict" | "skip"; matrixMatch: "strict" | "allow_lowest_band" },
  ): Promise<RecommendSubscriptionPlansResponse> {
    const { turnover, payeeUsers, billing, isDormant } = ctx;
    const ids = candidates.map((p) => p.id);
    if (!ids.length) {
      return { recommendedPlan: "", plans: [] };
    }

    const [matrixRows, ruleRows, limitRows, addonRows] = await Promise.all([
      this.planPricingMatrix.find({ where: { planId: In(ids) }, order: { turnoverMin: "ASC" } }),
      this.planRules.find({ where: { planId: In(ids) } }),
      this.planLimit.find({ where: { planId: In(ids) } }),
      this.planAddons.find({ where: { planId: In(ids) } }),
    ]);

    const matrixByPlan = new Map<string, PlanPricingMatrixEntity[]>();
    for (const m of matrixRows) {
      const list = matrixByPlan.get(m.planId) ?? [];
      list.push(m);
      matrixByPlan.set(m.planId, list);
    }
    const ruleByPlan = new Map(ruleRows.map((r) => [r.planId, r] as const));
    const limitByPlan = new Map(limitRows.map((l) => [l.planId, l] as const));
    const addonByPlan = new Map(addonRows.map((a) => [a.planId, a] as const));

    const turnoverFiltered: PlansEntity[] = [];
    if (opts.turnoverFilter === "strict") {
      for (const p of candidates) {
        const cap = this.planMaxTurnoverNum(p);
        const rule = ruleByPlan.get(p.id);
        const extendable = rule ? Boolean(rule.extendable) : false;
        if (cap === null || turnover <= cap) {
          turnoverFiltered.push(p);
          continue;
        }
        if (extendable) {
          turnoverFiltered.push(p);
        }
      }
    } else {
      for (const p of candidates) {
        if ((matrixByPlan.get(p.id) ?? []).length > 0) {
          turnoverFiltered.push(p);
        }
      }
    }

    type Priced = {
      plan: PlansEntity;
      base: number;
      turnoverExtra: number;
      turnoverExtensionDetail?: { blocks: number; step: number; costPerBlock: number; bandCeiling: number };
      payrollExtra: number;
      payrollExtraDetail?: { extraPayees: number; ratePerPayee: number };
      dormant: number;
      dormantDetail?: { flatFee: number };
      payrollLimit: number;
    };

    const priced: Priced[] = [];
    for (const p of turnoverFiltered) {
      const bands = matrixByPlan.get(p.id) ?? [];
      const rule = ruleByPlan.get(p.id);
      const extendable = rule ? Boolean(rule.extendable) : false;
      const step = rule ? Number(rule.incrementStep) : 0;
      const incCost = rule ? Number(rule.incrementCost) : 0;
      const planCap = this.planMaxTurnoverNum(p);
      let tp = this.computeTurnoverPricing(bands, turnover, planCap, extendable, step, incCost);
      if (!tp && opts.matrixMatch === "allow_lowest_band") {
        const fb = this.lowestBandBasePrice(bands);
        if (fb !== null) {
          tp = { base: fb, turnoverExtra: 0 };
        }
      }
      if (!tp) continue;

      const lim = limitByPlan.get(p.id);
      const freeLimit = lim ? Number(lim.freePayrollLimit) : 0;
      const fl = Number.isFinite(freeLimit) && freeLimit >= 0 ? Math.floor(freeLimit) : 0;
      const addon = addonByPlan.get(p.id);
      const extraEmp = addon ? Number(addon.extraEmployeeCost) : 0;
      const payrollExtra =
        payeeUsers > fl && Number.isFinite(extraEmp) && extraEmp >= 0
          ? (payeeUsers - fl) * extraEmp
          : 0;
      const payrollExtraDetail =
        payrollExtra > 0 ? { extraPayees: payeeUsers - fl, ratePerPayee: extraEmp } : undefined;

      let dormant = 0;
      if (
        billing === "yearly" &&
        isDormant &&
        addon &&
        Boolean(addon.dormantEnable) &&
        Number.isFinite(Number(addon.dormantCost))
      ) {
        dormant = Math.max(0, Number(addon.dormantCost));
      }
      const dormantDetail = dormant > 0 ? { flatFee: dormant } : undefined;

      priced.push({
        plan: p,
        base: tp.base,
        turnoverExtra: tp.turnoverExtra,
        turnoverExtensionDetail: tp.turnoverExtensionDetail,
        payrollExtra,
        payrollExtraDetail,
        dormant,
        dormantDetail,
        payrollLimit: fl,
      });
    }

    if (!priced.length) {
      return { recommendedPlan: "", plans: [] };
    }

    const strictOk = priced.filter((x) => x.payrollLimit >= payeeUsers);
    const pool = strictOk.length ? strictOk : priced;
    pool.sort((a, b) => a.payrollLimit - b.payrollLimit);

    const poolPlanIds = pool.map((x) => x.plan.id);
    const allPlanLinks =
      poolPlanIds.length > 0
        ? await this.planServices.find({
            where: { planId: In(poolPlanIds) },
            relations: { service: true },
          })
        : [];
    const linksByPlanId = new Map<string, PlanServiceEntity[]>();
    for (const l of allPlanLinks) {
      const arr = linksByPlanId.get(l.planId) ?? [];
      arr.push(l);
      linksByPlanId.set(l.planId, arr);
    }

    const plansOut: RecommendedSubscriptionPlanOption[] = [];
    for (const x of pool) {
      const addon = addonByPlan.get(x.plan.id);
      const vatPct = addon && Number.isFinite(Number(addon.vatPercent)) ? Number(addon.vatPercent) : 0;
      const subtotal = x.base + x.turnoverExtra + x.payrollExtra + x.dormant;
      const vat = Math.round((subtotal * (vatPct / 100)) * 100) / 100;
      const final = Math.round((subtotal + vat) * 100) / 100;

      const plLinks = linksByPlanId.get(x.plan.id) ?? [];
      /** Only services attached to this plan (included or add-on), not the whole catalogue. */
      const featureMatrix = [...plLinks]
        .filter((l) => l.service?.isActive !== false)
        .sort((a, b) =>
          String(a.service?.name ?? "")
            .toLowerCase()
            .localeCompare(String(b.service?.name ?? "").toLowerCase()),
        )
        .map((link) => ({
          serviceId: link.serviceId,
          name: link.service?.name?.trim() ? link.service.name : link.serviceId,
          status: link.isIncluded ? ("included" as const) : ("addon" as const),
        }));

      plansOut.push({
        planId: x.plan.id,
        plan: x.plan.name,
        payrollLimit: x.payrollLimit,
        featureMatrix,
        pricing: {
          base: x.base,
          turnoverExtra: x.turnoverExtra,
          payrollExtra: x.payrollExtra,
          dormant: x.dormant,
          vat,
          final,
          vatPercent: vatPct,
          subtotalBeforeVat: subtotal,
          turnoverExtensionDetail: x.turnoverExtensionDetail,
          payrollExtraDetail: x.payrollExtraDetail,
          dormantDetail: x.dormantDetail,
        },
      });
    }

    const recommendedPlan = plansOut[0]?.plan ?? "";
    return { recommendedPlan, plans: plansOut };
  }

  /**
   * Filters matrix `plans` by customer type, billing cycle, turnover cap / extendable,
   * payroll limits (with fallback), ranks by payroll limit ascending, then VAT-inclusive pricing.
   * When nothing matches, falls back to every active plan for the requested billing cycle (indicative pricing).
   */
  async recommendSubscriptionPlans(dto: RecommendSubscriptionPlansDto): Promise<RecommendSubscriptionPlansResponse> {
    const turnover = Number(dto.turnover);
    if (!Number.isFinite(turnover) || turnover < 0) {
      throw new BadRequestException("turnover must be a non-negative number");
    }
    const payeeUsers = Math.max(0, Math.floor(Number(dto.payeeUsers)));
    if (!Number.isFinite(payeeUsers)) {
      throw new BadRequestException("payeeUsers must be a non-negative integer");
    }
    const billing = this.normalizeBillingCycle(dto.billingCycle);
    if (billing !== "monthly" && billing !== "yearly") {
      throw new BadRequestException('billingCycle must be "monthly" or "yearly"');
    }
    const isDormant = Boolean(dto.isDormant);
    const canonicalType = this.normalizeCustomerTypeLabel(dto.customerType);
    const ctx = { turnover, payeeUsers, billing, isDormant };

    const planRows = await this.plans.find({
      where: { isActive: true },
      relations: { customerTypes: true },
    });
    let candidates = planRows.filter((p) => this.planMatchesCustomerType(p, canonicalType));
    candidates = candidates.filter((p) => this.normalizeBillingCycle(p.billingCycle) === billing);
    const typeBillingCandidates = [...candidates];

    const wantedServiceIds = [...new Set((dto.serviceIds ?? []).map((x) => String(x).trim()).filter(Boolean))];
    if (wantedServiceIds.length) {
      for (const sid of wantedServiceIds) {
        if (!this.isUuid(sid)) {
          throw new BadRequestException(`Invalid service id: ${sid}`);
        }
      }
      const activeServices = await this.serviceCatalog.find({
        where: { id: In(wantedServiceIds), isActive: true },
      });
      if (activeServices.length !== wantedServiceIds.length) {
        throw new BadRequestException("One or more services are missing or inactive");
      }
      const candIds = candidates.map((p) => p.id);
      if (!candIds.length) {
        const billingOnly = planRows.filter((p) => this.normalizeBillingCycle(p.billingCycle) === billing);
        const fbRes = await this.recommendPlansPipeline(billingOnly, ctx, {
          turnoverFilter: "skip",
          matrixMatch: "allow_lowest_band",
        });
        const ok = fbRes.plans.length > 0;
        return { ...fbRes, recommendedPlan: ok ? "" : fbRes.recommendedPlan, billingCycleFallback: ok };
      }
      const svcLinks = await this.planServices.find({
        where: { planId: In(candIds), serviceId: In(wantedServiceIds) },
      });
      const planIdToServiceIds = new Map<string, Set<string>>();
      for (const l of svcLinks) {
        const set = planIdToServiceIds.get(l.planId) ?? new Set();
        set.add(l.serviceId);
        planIdToServiceIds.set(l.planId, set);
      }
      candidates = candidates.filter((p) => {
        const set = planIdToServiceIds.get(p.id) ?? new Set();
        return wantedServiceIds.every((sid) => set.has(sid));
      });
    }

    if (!candidates.length) {
      const billingOnly = planRows.filter((p) => this.normalizeBillingCycle(p.billingCycle) === billing);
      const fbRes = await this.recommendPlansPipeline(billingOnly, ctx, {
        turnoverFilter: "skip",
        matrixMatch: "allow_lowest_band",
      });
      const ok = fbRes.plans.length > 0;
      return { ...fbRes, recommendedPlan: ok ? "" : fbRes.recommendedPlan, billingCycleFallback: ok };
    }

    let res = await this.recommendPlansPipeline(candidates, ctx, {
      turnoverFilter: "strict",
      matrixMatch: "strict",
    });
    if (res.plans.length) {
      return { ...res, billingCycleFallback: false };
    }

    if (wantedServiceIds.length && typeBillingCandidates.length) {
      res = await this.recommendPlansPipeline(typeBillingCandidates, ctx, {
        turnoverFilter: "strict",
        matrixMatch: "strict",
      });
      if (res.plans.length) {
        return { ...res, billingCycleFallback: false };
      }
    }

    const billingOnly = planRows.filter((p) => this.normalizeBillingCycle(p.billingCycle) === billing);
    res = await this.recommendPlansPipeline(billingOnly, ctx, {
      turnoverFilter: "skip",
      matrixMatch: "allow_lowest_band",
    });
    const fallbackOk = res.plans.length > 0;
    return {
      ...res,
      recommendedPlan: fallbackOk ? "" : res.recommendedPlan,
      billingCycleFallback: fallbackOk,
    };
  }

  /** Looks up `customer_type.id` by name (trimmed) or known alias. */
  async getCustomerTypeIdByName(name: string): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new NotFoundException("Customer type name is required");
    }
    const canonical = this.normalizeCustomerTypeLabel(trimmed);
    const row = await this.customerTypes.findOne({ where: { name: canonical } });
    if (!row) {
      throw new NotFoundException(`Customer type not found: ${trimmed}`);
    }
    return row.id;
  }

  async getPlanByTurnover(): Promise<void> {}

  async getPlanFromFeatures(): Promise<void> {}

  async decideFinalPlan(): Promise<void> {}

  async fetchPlanDetails(): Promise<void> {}

  async calculatePricing(): Promise<void> {}

  async saveSubscription(): Promise<void> {}

  async createFeature(): Promise<void> {}

  async assignFeaturesToPlan(): Promise<void> {}

  async setPlanPricing(): Promise<void> {}

  /**
   * Creates a plan and related rows: pricing matrix, rules, limit, optional plan add-ons (in that order).
   */
  async createSubscription(dto: CreateSubscriptionDto): Promise<CreateSubscriptionResult> {
    const planId = await this.addPlans({
      name: dto.name,
      billingCycle: dto.billingCycle,
      customerTypeNames: dto.customerTypes,
      maxTurnover: dto.maxTurnover === undefined ? null : dto.maxTurnover,
    });

    const pricingMatrixIds = await this.addPlanPricingMatrix(
      planId,
      dto.pricingMatrix.map((b) => ({
        min: b.minTurnover,
        max: b.maxTurnover,
        price: b.price,
      })),
    );

    const planRulesId = await this.addPlanRules(planId, [
      {
        extendable: dto.rules.extendable,
        incrementStep: dto.rules.incrementStep,
        incrementCost: dto.rules.incrementCost,
      },
    ]);

    const payroll = dto.limits.freePayrollLimit ?? dto.limits.freePayrollUsers;
    if (payroll === undefined || payroll === null) {
      throw new BadRequestException("limits must include freePayrollLimit or freePayrollUsers");
    }
    const planLimitId = await this.addPlanLimit(planId, Number(payroll));

    let addonIds: string[] = [];
    if (dto.addons) {
      const id = await this.addPlanAddonSettings(planId, {
        vatPercent: dto.addons.vatPercent,
        taxFillingVatEnable: dto.addons.taxFilingVatEnabled,
        dormantEnable: dto.addons.dormantEnabled,
        dormantCost: dto.addons.dormantCost,
        extraEmployeeCost: dto.addons.extraEmployeeCost,
      });
      addonIds = [id];
    }

    return { planId, pricingMatrixIds, planRulesId, planLimitId, addonIds };
  }

  /** Resolves customer types by name, then inserts into `plans` with join rows. Returns the new plan id. */
  async addPlans(input: AddPlanInput): Promise<string> {
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException("Plan name is required");
    }
    const labels = input.customerTypeNames.map((s) => s.trim()).filter(Boolean);
    if (!labels.length) {
      throw new BadRequestException("At least one customer type is required");
    }
    const resolvedIds: string[] = [];
    for (const label of labels) {
      resolvedIds.push(await this.getCustomerTypeIdByName(label));
    }
    const uniqueIds = [...new Set(resolvedIds)];
    const typeEntities = await this.customerTypes.findBy({ id: In(uniqueIds) });
    if (typeEntities.length !== uniqueIds.length) {
      throw new BadRequestException("One or more customer types could not be resolved");
    }

    const billingCycle = input.billingCycle.trim() || "monthly";
    await this.assertBundlePlanNameBillingUnique(name, billingCycle);

    const row = this.plans.create({
      name,
      billingCycle,
      maxTurnover: input.maxTurnover,
      isActive: input.isActive !== false,
      customerTypes: typeEntities,
    });
    try {
      const saved = await this.plans.save(row);
      return saved.id;
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        typeof err.driverError === "object" &&
        err.driverError !== null &&
        String((err.driverError as { code?: string }).code) === "23505"
      ) {
        throw new ConflictException(
          "A subscription plan with these details already exists. Change the plan name or billing cycle.",
        );
      }
      throw err;
    }
  }

  /**
   * Inserts one `plan_pricing_matrix` row per band for `planId`.
   * Each band: `min` → `turnover_min`, `max` → `turnover_max` (null if omitted), `price` → `price`.
   * Returns ids of created rows in the same order as `bands`.
   */
  async addPlanPricingMatrix(planId: string, bands: PlanPricingMatrixBandInput[]): Promise<string[]> {
    const pid = planId.trim();
    if (!pid) {
      throw new BadRequestException("plan_id is required");
    }
    if (!bands?.length) {
      throw new BadRequestException("At least one pricing matrix band is required");
    }
    const plan = await this.plans.findOne({ where: { id: pid } });
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${pid}`);
    }

    const planCapRaw = plan.maxTurnover;
    const planCap =
      planCapRaw === null || planCapRaw === undefined ? null : Number(planCapRaw);
    const planMaxTurnover = planCap !== null && Number.isFinite(planCap) ? planCap : null;

    const ids: string[] = [];
    for (const band of bands) {
      const min = Number(band.min);
      const price = Number(band.price);
      if (!Number.isFinite(min) || !Number.isFinite(price)) {
        throw new BadRequestException("Each band must have numeric min and price");
      }
      const maxRaw = band.max;
      let turnoverMax =
        maxRaw === undefined || maxRaw === null ? null : Number(maxRaw);
      if (turnoverMax !== null && !Number.isFinite(turnoverMax)) {
        throw new BadRequestException("Each band max must be numeric or null for open-ended");
      }

      if (planMaxTurnover !== null) {
        if (min > planMaxTurnover) {
          throw new BadRequestException(
            `Pricing band min turnover (${min}) cannot exceed the plan max turnover (${planMaxTurnover}).`,
          );
        }
        if (turnoverMax !== null) {
          if (turnoverMax > planMaxTurnover) {
            throw new BadRequestException(
              `Pricing band max turnover (${turnoverMax}) cannot exceed the plan max turnover (${planMaxTurnover}).`,
            );
          }
        } else {
          turnoverMax = planMaxTurnover;
        }
      }

      const row = this.planPricingMatrix.create({
        planId: pid,
        turnoverMin: min,
        turnoverMax: turnoverMax,
        price,
      });
      const saved = await this.planPricingMatrix.save(row);
      ids.push(saved.id);
    }
    return ids;
  }

  /**
   * Saves `plan_rules` for `planId`. Table allows one row per plan; pass a one-element `rules` array.
   * If a row already exists for this plan it is updated.
   */
  async addPlanRules(planId: string, rules: PlanRuleBodyInput[]): Promise<string> {
    const pid = planId.trim();
    if (!pid) {
      throw new BadRequestException("plan_id is required");
    }
    if (!rules?.length) {
      throw new BadRequestException("At least one plan rule is required");
    }
    if (rules.length !== 1) {
      throw new BadRequestException("plan_rules allows one row per plan; pass exactly one rule in the array");
    }
    const item = rules[0]!;
    const plan = await this.plans.findOne({ where: { id: pid } });
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${pid}`);
    }

    const ext = Boolean(item.extendable);
    let step = 0;
    let cost = 0;
    if (ext) {
      step = Number(item.incrementStep);
      cost = Number(item.incrementCost);
      if (!Number.isFinite(step) || step < 0) {
        throw new BadRequestException(
          "When extendable is true, incrementStep must be a non-negative number (e.g. 10000).",
        );
      }
      if (!Number.isFinite(cost) || cost < 0) {
        throw new BadRequestException(
          "When extendable is true, incrementCost must be a non-negative number (e.g. 10).",
        );
      }
    }

    const existing = await this.planRules.findOne({ where: { planId: pid } });
    if (existing) {
      existing.extendable = ext;
      existing.incrementStep = step;
      existing.incrementCost = cost;
      const saved = await this.planRules.save(existing);
      return saved.id;
    }
    const row = this.planRules.create({
      planId: pid,
      extendable: ext,
      incrementStep: step,
      incrementCost: cost,
    });
    const saved = await this.planRules.save(row);
    return saved.id;
  }

  /**
   * Saves `plan_limit` (`free_payroll_limit`). One row per `plan_id`; updates if already present.
   */
  async addPlanLimit(planId: string, freePayrollLimit: number): Promise<string> {
    const pid = planId.trim();
    if (!pid) {
      throw new BadRequestException("plan_id is required");
    }
    const limit = Number(freePayrollLimit);
    if (!Number.isFinite(limit) || limit < 0 || !Number.isInteger(limit)) {
      throw new BadRequestException("freePayrollLimit must be a non-negative integer");
    }
    const plan = await this.plans.findOne({ where: { id: pid } });
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${pid}`);
    }

    const existing = await this.planLimit.findOne({ where: { planId: pid } });
    if (existing) {
      existing.freePayrollLimit = limit;
      const saved = await this.planLimit.save(existing);
      return saved.id;
    }
    const row = this.planLimit.create({ planId: pid, freePayrollLimit: limit });
    const saved = await this.planLimit.save(row);
    return saved.id;
  }

  /**
   * Upserts the single `plan_addons` row for `plan_id` (VAT, tax filing, dormant, extra employee).
   */
  async addPlanAddonSettings(planId: string, input: PlanAddonSettingsInput): Promise<string> {
    const pid = planId.trim();
    if (!pid) {
      throw new BadRequestException("plan_id is required");
    }
    const plan = await this.plans.findOne({ where: { id: pid } });
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${pid}`);
    }

    const vatPercent = Number(input.vatPercent);
    const dormantCost = Number(input.dormantCost);
    const extraEmployeeCost = Number(input.extraEmployeeCost);
    if (!Number.isFinite(vatPercent) || vatPercent < 0) {
      throw new BadRequestException("vatPercent must be a non-negative number");
    }
    if (!Number.isFinite(dormantCost) || dormantCost < 0) {
      throw new BadRequestException("dormantCost must be a non-negative number");
    }
    if (!Number.isFinite(extraEmployeeCost) || extraEmployeeCost < 0) {
      throw new BadRequestException("extraEmployeeCost must be a non-negative number");
    }

    const existing = await this.planAddons.findOne({ where: { planId: pid } });
    if (existing) {
      existing.vatPercent = vatPercent;
      existing.taxFillingVatEnable = Boolean(input.taxFillingVatEnable);
      existing.dormantEnable = Boolean(input.dormantEnable);
      existing.dormantCost = dormantCost;
      existing.extraEmployeeCost = extraEmployeeCost;
      const saved = await this.planAddons.save(existing);
      return saved.id;
    }
    const row = this.planAddons.create({
      planId: pid,
      vatPercent,
      taxFillingVatEnable: Boolean(input.taxFillingVatEnable),
      dormantEnable: Boolean(input.dormantEnable),
      dormantCost,
      extraEmployeeCost,
    });
    const saved = await this.planAddons.save(row);
    return saved.id;
  }

  /**
   * Archive a bundle plan (`is_active = false`). Archived plans are omitted from `listBundlePlans`.
   * Existing `customers.plan_id` references are unchanged so assigned customers keep their plan.
   */
  async deleteBundlePlan(planId: string): Promise<{ id: string; isActive: boolean; hidden: true }> {
    const result = await this.updateBundlePlanIsActive(planId, false);
    return { ...result, hidden: true };
  }
}
