import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AiPricingEntity } from "../entities/ai-pricing.entity.js";

@Injectable()
export class AiPricingService {
  constructor(
    @InjectRepository(AiPricingEntity)
    private readonly repo: Repository<AiPricingEntity>
  ) {}

  async list(): Promise<AiPricingEntity[]> {
    return this.repo.find({ order: { provider: "ASC", model: "ASC", createdAt: "DESC" } });
  }

  async create(row: {
    provider: string;
    model: string;
    inputTokenPrice: string;
    outputTokenPrice: string;
    currency?: string;
    effectiveUntil?: Date | null;
  }): Promise<AiPricingEntity> {
    return this.repo.save({
      provider: row.provider.trim(),
      model: row.model.trim(),
      inputTokenPrice: row.inputTokenPrice,
      outputTokenPrice: row.outputTokenPrice,
      currency: row.currency?.trim() || "USD",
      effectiveUntil: row.effectiveUntil ?? null,
    });
  }

  async update(
    id: string,
    patch: Partial<{
      inputTokenPrice: string;
      outputTokenPrice: string;
      currency: string;
      effectiveUntil: Date | null;
    }>
  ): Promise<AiPricingEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException("pricing row not found");
    }
    if (patch.inputTokenPrice !== undefined) row.inputTokenPrice = patch.inputTokenPrice;
    if (patch.outputTokenPrice !== undefined) row.outputTokenPrice = patch.outputTokenPrice;
    if (patch.currency !== undefined) row.currency = patch.currency.trim() || row.currency;
    if (patch.effectiveUntil !== undefined) row.effectiveUntil = patch.effectiveUntil;
    return this.repo.save(row);
  }
}
