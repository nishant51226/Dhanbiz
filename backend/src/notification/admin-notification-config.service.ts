import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotificationEventAudienceEntity } from "../entities/notification-event-audience.entity";
import { NotificationEventConfigEntity } from "../entities/notification-event-config.entity";
import type { UpsertNotificationConfigDto } from "./dto/upsert-notification-config.dto";
import { NotificationDispatchService } from "./notification-dispatch.service";

export type NotificationConfigRow = {
  id: string;
  event_key: string;
  label: string;
  description: string | null;
  trigger_type: string;
  title_template: string;
  body_template: string;
  image_url_template: string | null;
  default_link_url: string | null;
  is_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  available_placeholders: string[];
  sort_order: number;
  audiences: {
    id: string;
    audience_type: string;
    role_id: string | null;
    role_name: string | null;
  }[];
  created_at: string;
  updated_at: string;
};

@Injectable()
export class AdminNotificationConfigService {
  constructor(
    @InjectRepository(NotificationEventConfigEntity)
    private readonly configs: Repository<NotificationEventConfigEntity>,
    @InjectRepository(NotificationEventAudienceEntity)
    private readonly audiences: Repository<NotificationEventAudienceEntity>,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  list(): Promise<NotificationConfigRow[]> {
    return this.configs
      .find({ relations: { audiences: { role: true } }, order: { sortOrder: "ASC", label: "ASC" } })
      .then((rows) => rows.map((r) => this.toRow(r)));
  }

  async get(id: string): Promise<NotificationConfigRow> {
    const row = await this.configs.findOne({
      where: { id },
      relations: { audiences: { role: true } },
    });
    if (!row) throw new NotFoundException("Notification config not found");
    return this.toRow(row);
  }

  async create(dto: UpsertNotificationConfigDto): Promise<NotificationConfigRow> {
    const eventKey = dto.event_key.trim();
    const existing = await this.configs.findOne({ where: { eventKey } });
    if (existing) {
      throw new ConflictException(`Event key "${eventKey}" already exists`);
    }
    this.validateAudiences(dto.audiences);

    const saved = await this.configs.save(
      this.configs.create({
        eventKey,
        label: dto.label.trim(),
        description: dto.description?.trim() || null,
        triggerType: dto.trigger_type ?? "event",
        titleTemplate: dto.title_template,
        bodyTemplate: dto.body_template,
        imageUrlTemplate: dto.image_url_template?.trim() || null,
        defaultLinkUrl: dto.default_link_url?.trim() || null,
        isEnabled: dto.is_enabled !== false,
        pushEnabled: dto.push_enabled !== false,
        inAppEnabled: dto.in_app_enabled !== false,
        availablePlaceholders: dto.available_placeholders ?? [],
        sortOrder: dto.sort_order ?? 0,
      }),
    );
    await this.replaceAudiences(saved.id, dto.audiences);
    return this.get(saved.id);
  }

  async update(id: string, dto: UpsertNotificationConfigDto): Promise<NotificationConfigRow> {
    const row = await this.configs.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Notification config not found");

    const eventKey = dto.event_key.trim();
    if (eventKey !== row.eventKey) {
      const clash = await this.configs.findOne({ where: { eventKey } });
      if (clash && clash.id !== id) {
        throw new ConflictException(`Event key "${eventKey}" already exists`);
      }
    }
    this.validateAudiences(dto.audiences);

    row.eventKey = eventKey;
    row.label = dto.label.trim();
    row.description = dto.description?.trim() || null;
    row.triggerType = dto.trigger_type ?? row.triggerType;
    row.titleTemplate = dto.title_template;
    row.bodyTemplate = dto.body_template;
    row.imageUrlTemplate = dto.image_url_template?.trim() || null;
    row.defaultLinkUrl = dto.default_link_url?.trim() || null;
    if (dto.is_enabled !== undefined) row.isEnabled = dto.is_enabled;
    if (dto.push_enabled !== undefined) row.pushEnabled = dto.push_enabled;
    if (dto.in_app_enabled !== undefined) row.inAppEnabled = dto.in_app_enabled;
    if (dto.available_placeholders !== undefined) {
      row.availablePlaceholders = dto.available_placeholders;
    }
    if (dto.sort_order !== undefined) row.sortOrder = dto.sort_order;
    await this.configs.save(row);
    await this.replaceAudiences(id, dto.audiences);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const res = await this.configs.delete({ id });
    if (!res.affected) throw new NotFoundException("Notification config not found");
  }

  async sendTest(id: string): Promise<{ recipient_count: number }> {
    const count = await this.dispatch.dispatchFromConfigId(id, {
      customerName: "Test Customer",
      fileName: "sample.pdf",
      uploadSummary: "sample.pdf",
      fileCount: "1",
      customerId: "",
    });
    return { recipient_count: count };
  }

  private validateAudiences(
    audiences: UpsertNotificationConfigDto["audiences"],
  ): void {
    for (const a of audiences) {
      const needsRole =
        a.audience_type === "role" || a.audience_type === "all_practice_staff_with_role";
      if (needsRole && !a.role_id?.trim()) {
        throw new BadRequestException(`audience_type "${a.audience_type}" requires role_id`);
      }
    }
  }

  private async replaceAudiences(
    configId: string,
    items: UpsertNotificationConfigDto["audiences"],
  ): Promise<void> {
    await this.audiences.delete({ eventConfigId: configId });
    if (items.length === 0) return;
    await this.audiences.save(
      items.map((a) =>
        this.audiences.create({
          eventConfigId: configId,
          audienceType: a.audience_type,
          roleId: a.role_id?.trim() || null,
        }),
      ),
    );
  }

  private toRow(e: NotificationEventConfigEntity): NotificationConfigRow {
    return {
      id: e.id,
      event_key: e.eventKey,
      label: e.label,
      description: e.description,
      trigger_type: e.triggerType,
      title_template: e.titleTemplate,
      body_template: e.bodyTemplate,
      image_url_template: e.imageUrlTemplate,
      default_link_url: e.defaultLinkUrl,
      is_enabled: e.isEnabled,
      push_enabled: e.pushEnabled,
      in_app_enabled: e.inAppEnabled,
      available_placeholders: e.availablePlaceholders ?? [],
      sort_order: e.sortOrder,
      audiences: (e.audiences ?? []).map((a) => ({
        id: a.id,
        audience_type: a.audienceType,
        role_id: a.roleId,
        role_name: a.role?.name ?? null,
      })),
      created_at: e.createdAt.toISOString(),
      updated_at: e.updatedAt.toISOString(),
    };
  }
}
