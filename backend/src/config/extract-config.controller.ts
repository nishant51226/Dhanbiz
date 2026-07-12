import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  defaultProviderForConfig,
  defaultStructureModel,
  defaultVisionModel,
  listEnabledProviders,
  resolveEffectiveModels,
} from "../ai/providers/factory.js";
import { defaultStructurePrompt, defaultVisionPrompt } from "../extractPipeline";

@ApiBearerAuth("bearer")
@Controller("config")
@UseGuards(JwtAuthGuard)
export class ExtractConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get("extract")
  extractDefaults() {
    const def = defaultProviderForConfig(this.config);
    const models = resolveEffectiveModels(this.config);
    return {
      visionModel: defaultVisionModel(this.config, def),
      structureModel: defaultStructureModel(this.config, def),
      defaultProvider: def,
      providers: listEnabledProviders(this.config),
      visionPromptDefault: defaultVisionPrompt(),
      structurePromptDefault: defaultStructurePrompt(),
      effectiveModels: models,
    };
  }
}
