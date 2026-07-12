import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  defaultProviderForConfig,
  defaultStructureModel,
  defaultVisionModel,
  listEnabledProviders,
} from "./ai/providers/factory.js";
import { AuthService } from "./auth/auth.service";

@Controller()
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService
  ) {}

  @Get("health")
  health() {
    const providers = listEnabledProviders(this.config);
    const def = defaultProviderForConfig(this.config);
    return {
      ok: true,
      defaultProvider: def,
      enabledProviderCount: providers.length,
      visionModel: defaultVisionModel(this.config, def),
      structureModel: defaultStructureModel(this.config, def),
      authEnabled: this.auth.authEnabled(),
    };
  }
}
