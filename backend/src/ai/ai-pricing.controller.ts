import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AiPricingService } from "./ai-pricing.service.js";

@ApiBearerAuth("bearer")
@Controller("ai-pricing")
@UseGuards(JwtAuthGuard)
export class AiPricingController {
  constructor(private readonly pricing: AiPricingService) {}

  @Get()
  list() {
    return this.pricing.list();
  }

  @Post()
  create(
    @Body()
    body: {
      provider: string;
      model: string;
      inputTokenPrice: string;
      outputTokenPrice: string;
      currency?: string;
      effectiveUntil?: string | null;
    }
  ) {
    return this.pricing.create({
      provider: body.provider,
      model: body.model,
      inputTokenPrice: body.inputTokenPrice,
      outputTokenPrice: body.outputTokenPrice,
      currency: body.currency,
      effectiveUntil:
        body.effectiveUntil != null && body.effectiveUntil !== ""
          ? new Date(body.effectiveUntil)
          : null,
    });
  }

  @Patch(":id")
  patch(
    @Param("id") id: string,
    @Body()
    body: {
      inputTokenPrice?: string;
      outputTokenPrice?: string;
      currency?: string;
      effectiveUntil?: string | null;
    }
  ) {
    return this.pricing.update(id, {
      inputTokenPrice: body.inputTokenPrice,
      outputTokenPrice: body.outputTokenPrice,
      currency: body.currency,
      effectiveUntil:
        body.effectiveUntil === undefined
          ? undefined
          : body.effectiveUntil === null || body.effectiveUntil === ""
            ? null
            : new Date(body.effectiveUntil),
    });
  }
}
