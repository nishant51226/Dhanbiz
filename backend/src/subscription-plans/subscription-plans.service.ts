// backend/src/subscription-plans/subscription-plans.service.ts

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';

export type SubscriptionPlanWithRecommendation = SubscriptionPlan & { recommended: boolean };

@Injectable()
export class SubscriptionPlansService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private subscriptionPlanRepository: Repository<SubscriptionPlan>,
  ) {}

  private isPostgresUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      typeof err.driverError === "object" &&
      err.driverError !== null &&
      String((err.driverError as { code?: string }).code) === "23505"
    );
  }

  /** `subscription_plans.code` is UNIQUE — validate before save and map DB errors to 409. */
  private async assertPlanCodeAvailable(code: string, excludeId?: string): Promise<void> {
    const existing = await this.subscriptionPlanRepository.findOne({ where: { code } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        "A subscription plan with this code already exists. Choose a different code.",
      );
    }
  }

  async create(createDto: CreateSubscriptionPlanDto): Promise<SubscriptionPlan> {
    const code = createDto.code.trim();
    const name = createDto.name.trim();
    if (!code) {
      throw new BadRequestException("Plan code is required");
    }
    if (!name) {
      throw new BadRequestException("Plan name is required");
    }
    await this.assertPlanCodeAvailable(code);

    const plan = this.subscriptionPlanRepository.create({
      name,
      code,
      description: createDto.description ?? null,
      price: createDto.price ?? 0,
      billing_cycle: createDto.billing_cycle ?? "monthly",
      features:
        createDto.features !== undefined && createDto.features !== null
          ? createDto.features
          : { included: [], not_included: [] },
      turnoverMinGbp: createDto.turnoverMinGbp ?? 0,
      turnoverMaxGbp: createDto.turnoverMaxGbp ?? null,
      sortOrder: createDto.sortOrder ?? 0,
      isActive: createDto.isActive ?? true,
    });
    try {
      return await this.subscriptionPlanRepository.save(plan);
    } catch (err) {
      if (this.isPostgresUniqueViolation(err)) {
        throw new ConflictException(
          "A subscription plan with this code already exists. Choose a different code.",
        );
      }
      throw err;
    }
  }

  async findAll(): Promise<SubscriptionPlan[]> {
    const rows = await this.subscriptionPlanRepository.find({
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    // Ensure JSON always carries an explicit boolean (some clients saw missing / snake_case only).
    return rows.map((row) => ({
      ...row,
      isActive: row.isActive !== false,
    }));
  }

  private numericBandValue(v: unknown): number {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /** Inclusive lower, inclusive upper; null upper = no cap. */
  private turnoverBandContains(plan: SubscriptionPlan, turnoverGbp: number): boolean {
    const min = this.numericBandValue(plan.turnoverMinGbp);
    const maxRaw = plan.turnoverMaxGbp;
    const max =
      maxRaw === null || maxRaw === undefined || String(maxRaw).trim() === ""
        ? null
        : this.numericBandValue(maxRaw);
    if (turnoverGbp < min) return false;
    if (max !== null && turnoverGbp > max) return false;
    return true;
  }

  /**
   * Active catalogue plans for onboarding: all active plans, each with `recommended` when
   * `annualTurnoverGbp` falls in that plan's turnover band (inclusive).
   */
  async findActiveWithRecommendations(annualTurnoverGbp: number): Promise<SubscriptionPlanWithRecommendation[]> {
    const rows = await this.subscriptionPlanRepository.find({
      where: { isActive: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    const withFlags: SubscriptionPlanWithRecommendation[] = rows.map((row) => ({
      ...row,
      isActive: row.isActive !== false,
      recommended: this.turnoverBandContains(row, annualTurnoverGbp),
    }));
    withFlags.sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      const ao = this.numericBandValue(a.sortOrder);
      const bo = this.numericBandValue(b.sortOrder);
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name, "en-GB");
    });
    return withFlags;
  }

  async findOne(id: string): Promise<SubscriptionPlan> {
    const plan = await this.subscriptionPlanRepository.findOne({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Subscription plan with ID ${id} not found`);
    }
    return plan;
  }

  async findByCode(code: string): Promise<SubscriptionPlan | null> {
    return this.subscriptionPlanRepository.findOne({ where: { code } });
  }

  async update(id: string, updateDto: UpdateSubscriptionPlanDto): Promise<SubscriptionPlan> {
    const plan = await this.findOne(id);
    const nextCode =
      updateDto.code !== undefined && updateDto.code !== null ? updateDto.code.trim() : undefined;
    if (nextCode !== undefined) {
      await this.assertPlanCodeAvailable(nextCode, id);
    }
    Object.assign(plan, updateDto);
    if (nextCode !== undefined) {
      plan.code = nextCode;
    }
    if (typeof updateDto.name === "string") {
      plan.name = updateDto.name.trim();
    }
    try {
      return await this.subscriptionPlanRepository.save(plan);
    } catch (err) {
      if (this.isPostgresUniqueViolation(err)) {
        throw new ConflictException(
          "A subscription plan with this code already exists. Choose a different code.",
        );
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const plan = await this.findOne(id);
    await this.subscriptionPlanRepository.remove(plan);
  }
}