import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  InternalServerErrorException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  createDepsForProvider,
  defaultVisionModel,
  resolveEffectiveProvider,
} from "../ai/providers/factory.js";
import { ExtractPipelineService } from "../extract/extract-pipeline.service";
import { uploadMaxBytes } from "../upload-limits";

@ApiBearerAuth("bearer")
@Controller()
@UseGuards(JwtAuthGuard)
export class LegacyExtractController {
  constructor(
    private readonly pipeline: ExtractPipelineService,
    private readonly config: ConfigService
  ) {}

  @Post("extract")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: uploadMaxBytes() },
    })
  )
  async extractDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("visionPrompt") visionPrompt?: string,
    @Body("structurePrompt") structurePrompt?: string
  ) {
    if (!file) {
      throw new BadRequestException('Missing file field "file".');
    }
    const ok =
      file.mimetype.startsWith("image/") || file.mimetype === "application/pdf";
    if (!ok) {
      throw new BadRequestException("Expected an image or PDF file.");
    }
    const vp =
      typeof visionPrompt === "string" && visionPrompt.trim()
        ? visionPrompt.trim()
        : this.pipeline.defaultVisionPrompt();
    const sp =
      typeof structurePrompt === "string" && structurePrompt.trim()
        ? structurePrompt.trim()
        : this.pipeline.defaultStructurePrompt();
    try {
      return await this.pipeline.run(file.buffer, file.mimetype, vp, sp);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "extract failed";
      if (
        msg.includes("Ollama HTTP") ||
        msg.includes("OpenAI HTTP") ||
        msg.includes("fetch failed")
      ) {
        throw new BadGatewayException(msg);
      }
      throw new InternalServerErrorException(msg);
    }
  }

  @Post("ocr")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: uploadMaxBytes() },
    })
  )
  async ocr(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("prompt") prompt?: string
  ) {
    if (!file) {
      throw new BadRequestException('Missing file field "image".');
    }
    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestException("Expected an image file.");
    }
    const p =
      typeof prompt === "string" && prompt.trim()
        ? prompt.trim()
        : this.pipeline.defaultVisionPrompt();
    const provider = resolveEffectiveProvider(null, this.config);
    const deps = createDepsForProvider(this.config, provider);
    const model = defaultVisionModel(this.config, provider);
    const mime = file.mimetype.startsWith("image/") ? file.mimetype : "image/png";
    try {
      const r = await deps.visionChat(model, p, file.buffer, mime);
      return { text: r.text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("HTTP") || msg.includes("fetch failed")) {
        throw new BadGatewayException(msg);
      }
      throw new InternalServerErrorException(msg);
    }
  }
}
