import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { DeadlineCampaignService } from "./deadline-campaign.service";
import {
  PreviewDeadlineCampaignDto,
  UpsertDeadlineCampaignDto,
} from "./dto/upsert-deadline-campaign.dto";

@ApiTags("admin")
@Controller("admin/deadline-campaigns")
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth("bearer")
export class AdminDeadlineCampaignController {
  constructor(private readonly campaigns: DeadlineCampaignService) {}

  @Get("date-fields")
  @ApiOperation({ summary: "List date fields available for deadline campaigns" })
  listDateFields() {
    return this.campaigns.listDateFields();
  }

  @Get()
  @ApiOperation({ summary: "List deadline campaigns (superadmin)" })
  list() {
    return this.campaigns.list();
  }

  @Get("events")
  @ApiOperation({ summary: "List all deadline date events with optional saved config" })
  listEvents() {
    return this.campaigns.listEvents();
  }

  @Get("by-date-field/:dateFieldId")
  @ApiOperation({ summary: "Get config for one deadline date event" })
  async getByDateField(@Param("dateFieldId") dateFieldId: string) {
    const row = await this.campaigns.getByDateField(dateFieldId);
    return row ?? { configured: false };
  }

  @Put("by-date-field/:dateFieldId")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Create or update config for one deadline date event" })
  upsertByDateField(
    @Param("dateFieldId") dateFieldId: string,
    @Body() dto: UpsertDeadlineCampaignDto,
  ) {
    return this.campaigns.upsertByDateField(dateFieldId, dto);
  }

  @Post("preview")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Preview matching customers for a campaign or draft" })
  preview(@Body() dto: PreviewDeadlineCampaignDto) {
    return this.campaigns.preview(dto.campaign_id, dto.draft);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one deadline campaign (superadmin)" })
  get(@Param("id") id: string) {
    return this.campaigns.get(id);
  }

  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Create deadline campaign (superadmin)" })
  create(@Body() dto: UpsertDeadlineCampaignDto) {
    return this.campaigns.create(dto);
  }

  @Patch(":id")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Update deadline campaign (superadmin)" })
  update(@Param("id") id: string, @Body() dto: UpsertDeadlineCampaignDto) {
    return this.campaigns.update(id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete deadline campaign (superadmin)" })
  async remove(@Param("id") id: string) {
    await this.campaigns.remove(id);
    return { ok: true };
  }
}
