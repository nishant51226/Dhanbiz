import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import type { AiCallUsage, AiProviderId } from "../ai/types.js";
import { AiExecutionEntity } from "../entities/ai-execution.entity.js";
import { AiPricingEntity } from "../entities/ai-pricing.entity.js";
import { ExtractionSegmentEntity } from "../entities/extraction-segment.entity.js";
import { runWithTenantRls } from "../tenant/run-with-tenant-rls.js";
import type { TenantId } from "../tenant/tenant-scope.js";

export type AiExecutionMethod = "extraction" | "classification" | "formatting";

export type JobCostByProvider = {
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number | null;
  currency: string | null;
};

export type JobCostLine = {
  provider: string;
  model: string;
  tokenType: "input" | "output";
  tokens: number;
  /** Per-million token price from global `ai_pricing`, if configured. */
  pricePerMillion: number | null;
  currency: string | null;
  actualCost: number | null;
};

export type JobCostSummary = {
  byProvider: JobCostByProvider[];
  lines: JobCostLine[];
  totalEstimatedCost: number | null;
  currency: string | null;
  unpricedModelKeys: string[];
  executionCount: number;
};

export type TokenBurnModelRow = {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  executionCount: number;
  estimatedCost: number | null;
  currency: string | null;
};

export type TokenBurnCustomerRow = {
  customerId: string;
  customerName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  executionCount: number;
  estimatedCost: number | null;
  currency: string | null;
};

export type TokenBurnReportTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  executionCount: number;
  estimatedCost: number | null;
  currency: string | null;
};

export type TokenBurnFileRow = {
  fileId: string | null;
  fileName: string | null;
  jobId: string;
  customerId: string;
  customerName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  executionCount: number;
  estimatedCost: number | null;
  currency: string | null;
};

export type TokenBurnPageRow = {
  jobId: string;
  fileId: string | null;
  fileName: string | null;
  pageNumber: number;
  customerId: string;
  customerName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  executionCount: number;
  estimatedCost: number | null;
  currency: string | null;
};

export type UnpricedModelRef = {
  provider: string;
  model: string;
};

export type TokenBurnReport = {
  from: string;
  to: string;
  customerId: string | null;
  byModel: TokenBurnModelRow[];
  byCustomer: TokenBurnCustomerRow[];
  byFile: TokenBurnFileRow[];
  byPage: TokenBurnPageRow[];
  totals: TokenBurnReportTotals;
  /** True when some models in range lack `ai_pricing` (cost totals may be partial). */
  costIncomplete: boolean;
  unpricedModelKeys: string[];
  unpricedModels: UnpricedModelRef[];
};

type ResolvedModelPricing = {
  pairKey: string;
  inputPricePerM: number | null;
  outputPricePerM: number | null;
  currency: string | null;
  unpriced: boolean;
};

type PricingCache = Map<string, Promise<ResolvedModelPricing>>;

@Injectable()
export class AiExecutionsService {
  private readonly log = new Logger(AiExecutionsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AiExecutionEntity)
    private readonly execRepo: Repository<AiExecutionEntity>,
    @InjectRepository(AiPricingEntity)
    private readonly pricingRepo: Repository<AiPricingEntity>
  ) {}

  async record(params: {
    jobId: string;
    customerId: TenantId;
    pipelineSegmentId: string;
    method: AiExecutionMethod;
    provider: AiProviderId;
    model: string;
    usage?: AiCallUsage | null;
  }): Promise<void> {
    const u = params.usage;
    this.log.log(
      `[job ${params.jobId}] AI call method=${params.method} provider=${params.provider} model=${params.model.trim()} ` +
        `tokens in=${u?.inputTokens ?? "—"} out=${u?.outputTokens ?? "—"}`,
    );
    await runWithTenantRls(this.dataSource, params.customerId, async (manager) => {
      const segRepo = manager.getRepository(ExtractionSegmentEntity);
      const execRepo = manager.getRepository(AiExecutionEntity);
      const seg = await segRepo.findOne({
        where: { jobId: params.jobId, pipelineSegmentId: params.pipelineSegmentId },
      });
      if (!seg) {
        return;
      }
      await execRepo.save({
        segmentId: seg.id,
        customerId: params.customerId,
        method: params.method,
        provider: params.provider,
        model: params.model.trim(),
        inputTokens: u?.inputTokens ?? null,
        outputTokens: u?.outputTokens ?? null,
        totalTokens: u?.totalTokens ?? null,
        metadata: u?.metadata ?? null,
      });
    });
  }

  private modelCacheKey(provider: string, model: string): string {
    return `${provider}\t${model.trim()}`;
  }

  private async findActivePricing(
    provider: string,
    model: string
  ): Promise<AiPricingEntity | null> {
    const trimmed = model.trim();
    const rows = await this.pricingRepo.find({
      where: { provider, model: trimmed },
      order: { createdAt: "DESC" },
      take: 5,
    });
    const now = Date.now();
    for (const r of rows) {
      if (r.effectiveUntil == null || r.effectiveUntil.getTime() > now) {
        return r;
      }
    }
    return null;
  }

  private createPricingCache(): PricingCache {
    return new Map();
  }

  private resolveModelPricing(
    provider: string,
    model: string,
    cache: PricingCache
  ): Promise<ResolvedModelPricing> {
    const trimmed = model.trim();
    const cacheKey = this.modelCacheKey(provider, trimmed);
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = this.findActivePricing(provider, trimmed).then((priceRow) => {
        const inP = priceRow ? Number(priceRow.inputTokenPrice) : Number.NaN;
        const outP = priceRow ? Number(priceRow.outputTokenPrice) : Number.NaN;
        const inPriceOk = Number.isFinite(inP);
        const outPriceOk = Number.isFinite(outP);
        return {
          pairKey: this.modelCacheKey(provider, trimmed),
          inputPricePerM: inPriceOk ? inP : null,
          outputPricePerM: outPriceOk ? outP : null,
          currency: priceRow?.currency ?? null,
          unpriced: !inPriceOk || !outPriceOk,
        };
      });
      cache.set(cacheKey, pending);
    }
    return pending;
  }

  private aggregateTokenCost(
    inputTokens: number,
    outputTokens: number,
    pricing: ResolvedModelPricing
  ): { cost: number | null; currency: string | null; unpriced: boolean } {
    if (pricing.unpriced) {
      return { cost: null, currency: null, unpriced: true };
    }
    const cost =
      (inputTokens / 1_000_000) * (pricing.inputPricePerM ?? 0) +
      (outputTokens / 1_000_000) * (pricing.outputPricePerM ?? 0);
    return { cost, currency: pricing.currency, unpriced: false };
  }

  private parseUnpricedModelKey(pairKey: string): UnpricedModelRef {
    const tab = pairKey.indexOf("\t");
    if (tab >= 0) {
      return { provider: pairKey.slice(0, tab), model: pairKey.slice(tab + 1) };
    }
    const colon = pairKey.indexOf(":");
    if (colon >= 0) {
      return { provider: pairKey.slice(0, colon), model: pairKey.slice(colon + 1) };
    }
    return { provider: pairKey, model: "" };
  }

  async getJobCostSummary(jobId: string, customerId: TenantId): Promise<JobCostSummary> {
    const rows = await this.execRepo
      .createQueryBuilder("e")
      .innerJoin("e.segment", "seg")
      .where("seg.job_id = :jobId", { jobId })
      .andWhere("e.customer_id = :customerId", { customerId })
      .getMany();

    if (rows.length === 0) {
      return {
        byProvider: [],
        lines: [],
        totalEstimatedCost: null,
        currency: null,
        unpricedModelKeys: [],
        executionCount: 0,
      };
    }

    type ModelAgg = { provider: string; model: string; inputTokens: number; outputTokens: number };
    const byModel = new Map<string, ModelAgg>();
    for (const ex of rows) {
      const model = ex.model.trim();
      const key = `${ex.provider}\t${model}`;
      let m = byModel.get(key);
      if (!m) {
        m = { provider: ex.provider, model, inputTokens: 0, outputTokens: 0 };
        byModel.set(key, m);
      }
      m.inputTokens += ex.inputTokens ?? 0;
      m.outputTokens += ex.outputTokens ?? 0;
    }

    type ProvAgg = {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      costAccum: number;
      hasUnpriced: boolean;
      currency: string | null;
    };
    const byProv = new Map<string, ProvAgg>();
    const unpricedKeys = new Set<string>();
    const lines: JobCostLine[] = [];

    const ensureProv = (p: string): ProvAgg => {
      let a = byProv.get(p);
      if (!a) {
        a = {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costAccum: 0,
          hasUnpriced: false,
          currency: null,
        };
        byProv.set(p, a);
      }
      return a;
    };

    for (const m of byModel.values()) {
      const priceRow = await this.findActivePricing(m.provider, m.model);
      const pairKey = `${m.provider}:${m.model}`;
      const inP = priceRow ? Number(priceRow.inputTokenPrice) : Number.NaN;
      const outP = priceRow ? Number(priceRow.outputTokenPrice) : Number.NaN;
      const inPriceOk = Number.isFinite(inP);
      const outPriceOk = Number.isFinite(outP);
      const cur = priceRow?.currency ?? null;

      const pa = ensureProv(m.provider);
      pa.inputTokens += m.inputTokens;
      pa.outputTokens += m.outputTokens;
      pa.totalTokens += m.inputTokens + m.outputTokens;

      const pushLine = (
        tokenType: "input" | "output",
        tokens: number,
        pricePerM: number | null
      ) => {
        if (tokens <= 0) return;
        const actualCost =
          pricePerM != null && Number.isFinite(pricePerM) ? (tokens / 1_000_000) * pricePerM : null;
        lines.push({
          provider: m.provider,
          model: m.model,
          tokenType,
          tokens,
          pricePerMillion: pricePerM,
          currency: cur,
          actualCost,
        });
        if (actualCost != null) {
          pa.costAccum += actualCost;
          pa.currency = pa.currency ?? cur;
        } else {
          pa.hasUnpriced = true;
          unpricedKeys.add(pairKey);
        }
      };

      pushLine("input", m.inputTokens, inPriceOk ? inP : null);
      pushLine("output", m.outputTokens, outPriceOk ? outP : null);
    }

    lines.sort((a, b) => {
      const c = a.provider.localeCompare(b.provider);
      if (c !== 0) return c;
      const cm = a.model.localeCompare(b.model);
      if (cm !== 0) return cm;
      return a.tokenType === "input" ? -1 : 1;
    });

    const byProvider: JobCostByProvider[] = [...byProv.entries()].map(([provider, a]) => ({
      provider,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      totalTokens: a.totalTokens,
      estimatedCost: a.hasUnpriced ? null : a.costAccum,
      currency: a.hasUnpriced ? null : a.currency,
    }));

    let totalEstimatedCost: number | null = null;
    let currency: string | null = null;
    if (unpricedKeys.size === 0) {
      totalEstimatedCost = byProvider.reduce((s, b) => s + (b.estimatedCost ?? 0), 0);
      currency = byProvider.find((b) => b.currency)?.currency ?? null;
    }

    return {
      byProvider,
      lines,
      totalEstimatedCost,
      currency,
      unpricedModelKeys: [...unpricedKeys],
      executionCount: rows.length,
    };
  }

  async getTokenBurnReport(params: {
    from: Date;
    to: Date;
    customerId?: string;
  }): Promise<TokenBurnReport> {
    const qb = this.execRepo
      .createQueryBuilder("e")
      .innerJoin("e.segment", "seg")
      .innerJoin("e.customer", "cust")
      .where("e.created_at >= :from", { from: params.from })
      .andWhere("e.created_at <= :to", { to: params.to });

    if (params.customerId) {
      qb.andWhere("e.customer_id = :customerId", { customerId: params.customerId });
    }

    type RawModelRow = {
      provider: string;
      model: string;
      inputTokens: string;
      outputTokens: string;
      executionCount: string;
    };

    const modelRaw = await qb
      .clone()
      .select("e.provider", "provider")
      .addSelect("e.model", "model")
      .addSelect("SUM(COALESCE(e.input_tokens, 0))", "inputTokens")
      .addSelect("SUM(COALESCE(e.output_tokens, 0))", "outputTokens")
      .addSelect("COUNT(*)", "executionCount")
      .groupBy("e.provider")
      .addGroupBy("e.model")
      .orderBy("e.provider", "ASC")
      .addOrderBy("e.model", "ASC")
      .getRawMany<RawModelRow>();

    type RawCustomerRow = RawModelRow & {
      customerId: string;
      customerName: string;
    };

    const customerRaw = await qb
      .clone()
      .select("e.customer_id", "customerId")
      .addSelect("cust.name", "customerName")
      .addSelect("e.provider", "provider")
      .addSelect("e.model", "model")
      .addSelect("SUM(COALESCE(e.input_tokens, 0))", "inputTokens")
      .addSelect("SUM(COALESCE(e.output_tokens, 0))", "outputTokens")
      .addSelect("COUNT(*)", "executionCount")
      .groupBy("e.customer_id")
      .addGroupBy("cust.name")
      .addGroupBy("e.provider")
      .addGroupBy("e.model")
      .orderBy("cust.name", "ASC")
      .addOrderBy("e.provider", "ASC")
      .addOrderBy("e.model", "ASC")
      .getRawMany<RawCustomerRow>();

    type RawFileRow = RawModelRow & {
      fileId: string | null;
      fileName: string | null;
      jobId: string;
      customerId: string;
      customerName: string;
    };

    const fileRaw = await qb
      .clone()
      .leftJoin("seg.file", "file")
      .select("seg.file_id", "fileId")
      .addSelect("file.name", "fileName")
      .addSelect("seg.job_id", "jobId")
      .addSelect("e.customer_id", "customerId")
      .addSelect("cust.name", "customerName")
      .addSelect("e.provider", "provider")
      .addSelect("e.model", "model")
      .addSelect("SUM(COALESCE(e.input_tokens, 0))", "inputTokens")
      .addSelect("SUM(COALESCE(e.output_tokens, 0))", "outputTokens")
      .addSelect("COUNT(*)", "executionCount")
      .groupBy("seg.file_id")
      .addGroupBy("file.name")
      .addGroupBy("seg.job_id")
      .addGroupBy("e.customer_id")
      .addGroupBy("cust.name")
      .addGroupBy("e.provider")
      .addGroupBy("e.model")
      .orderBy("COALESCE(file.name, seg.job_id::text)", "ASC")
      .getRawMany<RawFileRow>();

    type RawPageRow = RawModelRow & {
      fileId: string | null;
      fileName: string | null;
      jobId: string;
      pageNumber: string;
      customerId: string;
      customerName: string;
    };

    const pageRaw = await qb
      .clone()
      .leftJoin("seg.file", "file")
      .select("seg.job_id", "jobId")
      .addSelect("seg.file_id", "fileId")
      .addSelect("file.name", "fileName")
      .addSelect("seg.page_number", "pageNumber")
      .addSelect("e.customer_id", "customerId")
      .addSelect("cust.name", "customerName")
      .addSelect("e.provider", "provider")
      .addSelect("e.model", "model")
      .addSelect("SUM(COALESCE(e.input_tokens, 0))", "inputTokens")
      .addSelect("SUM(COALESCE(e.output_tokens, 0))", "outputTokens")
      .addSelect("COUNT(*)", "executionCount")
      .groupBy("seg.job_id")
      .addGroupBy("seg.file_id")
      .addGroupBy("file.name")
      .addGroupBy("seg.page_number")
      .addGroupBy("e.customer_id")
      .addGroupBy("cust.name")
      .addGroupBy("e.provider")
      .addGroupBy("e.model")
      .orderBy("cust.name", "ASC")
      .addOrderBy("seg.job_id", "ASC")
      .addOrderBy("seg.page_number", "ASC")
      .getRawMany<RawPageRow>();

    if (modelRaw.length === 0) {
      return {
        from: params.from.toISOString(),
        to: params.to.toISOString(),
        customerId: params.customerId ?? null,
        byModel: [],
        byCustomer: [],
        byFile: [],
        byPage: [],
        totals: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          executionCount: 0,
          estimatedCost: null,
          currency: null,
        },
        costIncomplete: false,
        unpricedModelKeys: [],
        unpricedModels: [],
      };
    }

    const pricingCache = this.createPricingCache();
    const unpricedKeys = new Set<string>();
    const byModel: TokenBurnModelRow[] = [];

    for (const row of modelRaw) {
      const inputTokens = Number(row.inputTokens) || 0;
      const outputTokens = Number(row.outputTokens) || 0;
      const provider = row.provider;
      const model = row.model.trim();
      const pricing = await this.resolveModelPricing(provider, model, pricingCache);
      const { cost, currency, unpriced } = this.aggregateTokenCost(
        inputTokens,
        outputTokens,
        pricing
      );
      if (unpriced) {
        unpricedKeys.add(pricing.pairKey);
      }
      byModel.push({
        provider,
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        executionCount: Number(row.executionCount) || 0,
        estimatedCost: cost,
        currency: unpriced ? null : currency,
      });
    }

    const customerAgg = new Map<
      string,
      {
        customerName: string;
        inputTokens: number;
        outputTokens: number;
        executionCount: number;
        costAccum: number;
        currency: string | null;
      }
    >();

    for (const row of customerRaw) {
      const inputTokens = Number(row.inputTokens) || 0;
      const outputTokens = Number(row.outputTokens) || 0;
      const provider = row.provider;
      const model = row.model.trim();
      const pricing = await this.resolveModelPricing(provider, model, pricingCache);
      const { cost, currency, unpriced } = this.aggregateTokenCost(
        inputTokens,
        outputTokens,
        pricing
      );

      let agg = customerAgg.get(row.customerId);
      if (!agg) {
        agg = {
          customerName: row.customerName,
          inputTokens: 0,
          outputTokens: 0,
          executionCount: 0,
          costAccum: 0,
          currency: null,
        };
        customerAgg.set(row.customerId, agg);
      }
      agg.inputTokens += inputTokens;
      agg.outputTokens += outputTokens;
      agg.executionCount += Number(row.executionCount) || 0;
      if (unpriced) {
        unpricedKeys.add(pricing.pairKey);
      }
      if (cost != null) {
        agg.costAccum += cost;
        agg.currency = agg.currency ?? currency;
      }
    }

    const byCustomer: TokenBurnCustomerRow[] = [...customerAgg.entries()]
      .map(([customerId, a]) => ({
        customerId,
        customerName: a.customerName,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        totalTokens: a.inputTokens + a.outputTokens,
        executionCount: a.executionCount,
        estimatedCost: a.costAccum > 0 ? a.costAccum : null,
        currency: a.costAccum > 0 ? a.currency : null,
      }))
      .sort((a, b) => a.customerName.localeCompare(b.customerName));

    const fileAgg = new Map<
      string,
      {
        fileId: string | null;
        fileName: string | null;
        jobId: string;
        customerId: string;
        customerName: string;
        inputTokens: number;
        outputTokens: number;
        executionCount: number;
        costAccum: number;
        currency: string | null;
      }
    >();

    for (const row of fileRaw) {
      const inputTokens = Number(row.inputTokens) || 0;
      const outputTokens = Number(row.outputTokens) || 0;
      const provider = row.provider;
      const model = row.model.trim();
      const pricing = await this.resolveModelPricing(provider, model, pricingCache);
      const { cost, currency, unpriced } = this.aggregateTokenCost(
        inputTokens,
        outputTokens,
        pricing
      );
      if (unpriced) {
        unpricedKeys.add(pricing.pairKey);
      }

      const fileKey = `${row.jobId}\t${row.fileId ?? ""}`;
      let agg = fileAgg.get(fileKey);
      if (!agg) {
        agg = {
          fileId: row.fileId,
          fileName: row.fileName,
          jobId: row.jobId,
          customerId: row.customerId,
          customerName: row.customerName,
          inputTokens: 0,
          outputTokens: 0,
          executionCount: 0,
          costAccum: 0,
          currency: null,
        };
        fileAgg.set(fileKey, agg);
      }
      agg.inputTokens += inputTokens;
      agg.outputTokens += outputTokens;
      agg.executionCount += Number(row.executionCount) || 0;
      if (cost != null) {
        agg.costAccum += cost;
        agg.currency = agg.currency ?? currency;
      }
    }

    const byFile: TokenBurnFileRow[] = [...fileAgg.values()]
      .map((a) => ({
        fileId: a.fileId,
        fileName: a.fileName,
        jobId: a.jobId,
        customerId: a.customerId,
        customerName: a.customerName,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        totalTokens: a.inputTokens + a.outputTokens,
        executionCount: a.executionCount,
        estimatedCost: a.costAccum > 0 ? a.costAccum : null,
        currency: a.costAccum > 0 ? a.currency : null,
      }))
      .sort((a, b) => {
        const nameA = a.fileName ?? a.jobId;
        const nameB = b.fileName ?? b.jobId;
        return nameA.localeCompare(nameB);
      });

    const pageAgg = new Map<
      string,
      {
        jobId: string;
        fileId: string | null;
        fileName: string | null;
        pageNumber: number;
        customerId: string;
        customerName: string;
        inputTokens: number;
        outputTokens: number;
        executionCount: number;
        costAccum: number;
        currency: string | null;
      }
    >();

    for (const row of pageRaw) {
      const inputTokens = Number(row.inputTokens) || 0;
      const outputTokens = Number(row.outputTokens) || 0;
      const provider = row.provider;
      const model = row.model.trim();
      const pricing = await this.resolveModelPricing(provider, model, pricingCache);
      const { cost, currency, unpriced } = this.aggregateTokenCost(
        inputTokens,
        outputTokens,
        pricing
      );
      if (unpriced) {
        unpricedKeys.add(pricing.pairKey);
      }

      const pageNumber = Number(row.pageNumber) || 0;
      const pageKey = `${row.jobId}\t${row.fileId ?? ""}\t${pageNumber}`;
      let agg = pageAgg.get(pageKey);
      if (!agg) {
        agg = {
          jobId: row.jobId,
          fileId: row.fileId,
          fileName: row.fileName,
          pageNumber,
          customerId: row.customerId,
          customerName: row.customerName,
          inputTokens: 0,
          outputTokens: 0,
          executionCount: 0,
          costAccum: 0,
          currency: null,
        };
        pageAgg.set(pageKey, agg);
      }
      agg.inputTokens += inputTokens;
      agg.outputTokens += outputTokens;
      agg.executionCount += Number(row.executionCount) || 0;
      if (cost != null) {
        agg.costAccum += cost;
        agg.currency = agg.currency ?? currency;
      }
    }

    const byPage: TokenBurnPageRow[] = [...pageAgg.values()]
      .map((a) => ({
        jobId: a.jobId,
        fileId: a.fileId,
        fileName: a.fileName,
        pageNumber: a.pageNumber,
        customerId: a.customerId,
        customerName: a.customerName,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        totalTokens: a.inputTokens + a.outputTokens,
        executionCount: a.executionCount,
        estimatedCost: a.costAccum > 0 ? a.costAccum : null,
        currency: a.costAccum > 0 ? a.currency : null,
      }))
      .sort((a, b) => {
        const c = a.customerName.localeCompare(b.customerName);
        if (c !== 0) return c;
        const f = (a.fileName ?? a.jobId).localeCompare(b.fileName ?? b.jobId);
        if (f !== 0) return f;
        return a.pageNumber - b.pageNumber;
      });

    const totalsInput = byModel.reduce((s, r) => s + r.inputTokens, 0);
    const totalsOutput = byModel.reduce((s, r) => s + r.outputTokens, 0);
    const totalsExecutions = byModel.reduce((s, r) => s + r.executionCount, 0);
    const costIncomplete = unpricedKeys.size > 0;
    let totalEstimatedCost: number | null = null;
    let currency: string | null = null;
    const pricedSum = byModel.reduce((s, r) => s + (r.estimatedCost ?? 0), 0);
    if (pricedSum > 0) {
      totalEstimatedCost = pricedSum;
      currency = byModel.find((r) => r.currency)?.currency ?? null;
    }

    return {
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      customerId: params.customerId ?? null,
      byModel,
      byCustomer,
      byFile,
      byPage,
      totals: {
        inputTokens: totalsInput,
        outputTokens: totalsOutput,
        totalTokens: totalsInput + totalsOutput,
        executionCount: totalsExecutions,
        estimatedCost: totalEstimatedCost,
        currency,
      },
      costIncomplete,
      unpricedModelKeys: [...unpricedKeys],
      unpricedModels: [...unpricedKeys].map((k) => this.parseUnpricedModelKey(k)),
    };
  }
}
