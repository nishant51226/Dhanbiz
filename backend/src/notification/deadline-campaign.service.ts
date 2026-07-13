import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { Customer, CustomerAccountStatus } from "../entities/customer.entity";
import {
  DeadlineCampaignEntity,
  type DeadlineCampaignScheduleMode,
} from "../entities/deadline-campaign.entity";
import { DeadlineCampaignAudienceEntity } from "../entities/deadline-campaign-audience.entity";
import { DeadlineCampaignSendEntity } from "../entities/deadline-campaign-send.entity";
import type { UpsertDeadlineCampaignDto } from "./dto/upsert-deadline-campaign.dto";
import {
  campaignDateKey,
  DEADLINE_CAMPAIGN_TIMEZONE,
  DEADLINE_DATE_FIELDS,
  evaluateDeadlinePhase,
  getDeadlineDateField,
  normaliseDeadlineDateKey,
  readDeadlineDateFromOnboarding,
} from "./deadline-campaign-date-fields";
import { formatDisplayDate } from "../format-display-date.util";
import type { AudienceSpec } from "./notification-audience.types";
import { NotificationAudienceResolver } from "./notification-audience.resolver";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { NotificationGroupService } from "./notification-group.service";
import { renderNotificationTemplate } from "./notification-template.util";
import { runWithAdminRls } from "../tenant/run-with-tenant-rls";
import { DEADLINE_CAMPAIGN_TEMPLATES } from "./deadline-campaign-templates";
import {
  buildSendSlots,
  inferScheduleFromLegacySendTimes,
  normalizeHm,
} from "./deadline-campaign-schedule.util";

export type DeadlineCampaignRow = {
  id: string;
  name: string;
  date_field_id: string;
  date_field_label: string;
  schedule_mode: DeadlineCampaignScheduleMode;
  send_start_time: string;
  send_count_per_day: number;
  send_interval_hours: number;
  send_times: string[];
  schedule_summary: string;
  upcoming_enabled: boolean;
  upcoming_lead_days: number;
  overdue_enabled: boolean;
  overdue_lead_days: number;
  default_link_url: string | null;
  group_ids: string[];
  is_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
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

export type DeadlineCampaignPreviewCustomer = {
  customer_id: string;
  customer_name: string;
  due_date: string;
  phase: "upcoming" | "overdue";
  days_remaining: number | null;
  days_overdue: number | null;
};

export type DeadlineCampaignPreviewResult = {
  upcoming: DeadlineCampaignPreviewCustomer[];
  overdue: DeadlineCampaignPreviewCustomer[];
};

/** One row per catalog date type, with optional saved config. */
export type DeadlineEventRow = {
  date_field_id: string;
  label: string;
  sort_order: number;
  campaign: DeadlineCampaignRow | null;
};

type CampaignEvalConfig = {
  id: string;
  dateFieldId: string;
  dateFieldLabel: string;
  scheduleMode: DeadlineCampaignScheduleMode;
  sendTimes: string[];
  upcomingEnabled: boolean;
  upcomingLeadDays: number;
  overdueEnabled: boolean;
  overdueLeadDays: number;
  upcomingTitleTemplate: string;
  upcomingBodyTemplate: string;
  overdueTitleTemplate: string;
  overdueBodyTemplate: string;
  defaultLinkUrl: string | null;
  groupIds: string[];
  pushEnabled: boolean;
  inAppEnabled: boolean;
  audiences: AudienceSpec[];
};

function readCompanyNumber(onboardingData: Record<string, unknown> | null | undefined): string {
  const company = onboardingData?.company;
  if (company == null || typeof company !== "object") return "";
  const num = (company as Record<string, unknown>).number;
  return typeof num === "string" ? num.trim() : "";
}

@Injectable()
export class DeadlineCampaignService {
  private readonly log = new Logger(DeadlineCampaignService.name);

  constructor(
    @InjectRepository(DeadlineCampaignEntity)
    private readonly campaigns: Repository<DeadlineCampaignEntity>,
    @InjectRepository(DeadlineCampaignAudienceEntity)
    private readonly audiences: Repository<DeadlineCampaignAudienceEntity>,
    @InjectRepository(DeadlineCampaignSendEntity)
    private readonly sends: Repository<DeadlineCampaignSendEntity>,
    private readonly dataSource: DataSource,
    private readonly audienceResolver: NotificationAudienceResolver,
    private readonly notificationGroups: NotificationGroupService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  listDateFields() {
    return DEADLINE_DATE_FIELDS.map((f) => ({ id: f.id, label: f.label }));
  }

  async listEvents(): Promise<DeadlineEventRow[]> {
    const rows = await this.list();
    const byField = new Map(rows.map((r) => [r.date_field_id, r]));
    return DEADLINE_DATE_FIELDS.map((f, index) => ({
      date_field_id: f.id,
      label: f.label,
      sort_order: index,
      campaign: byField.get(f.id) ?? null,
    }));
  }

  async getByDateField(dateFieldId: string): Promise<DeadlineCampaignRow | null> {
    const field = getDeadlineDateField(dateFieldId);
    if (!field) throw new BadRequestException(`Unknown date field "${dateFieldId}"`);
    const row = await this.campaigns.findOne({
      where: { dateFieldId: field.id },
      relations: { audiences: { role: true } },
    });
    return row ? this.toRow(row) : null;
  }

  async upsertByDateField(
    dateFieldId: string,
    dto: UpsertDeadlineCampaignDto,
  ): Promise<DeadlineCampaignRow> {
    const field = getDeadlineDateField(dateFieldId);
    if (!field) throw new BadRequestException(`Unknown date field "${dateFieldId}"`);
    const payload = { ...dto, date_field_id: field.id, name: dto.name?.trim() || field.label };
    const existing = await this.campaigns.findOne({ where: { dateFieldId: field.id } });
    if (existing) return this.update(existing.id, payload);
    return this.create(payload);
  }

  async list(): Promise<DeadlineCampaignRow[]> {
    const rows = await this.campaigns.find({
      relations: { audiences: { role: true } },
      order: { sortOrder: "ASC", name: "ASC" },
    });
    return rows.map((r) => this.toRow(r));
  }

  async get(id: string): Promise<DeadlineCampaignRow> {
    const row = await this.campaigns.findOne({
      where: { id },
      relations: { audiences: { role: true } },
    });
    if (!row) throw new NotFoundException("Deadline campaign not found");
    return this.toRow(row);
  }

  async create(dto: UpsertDeadlineCampaignDto): Promise<DeadlineCampaignRow> {
    this.validateDto(dto);
    const fieldId = dto.date_field_id.trim();
    const clash = await this.campaigns.findOne({ where: { dateFieldId: fieldId } });
    if (clash) {
      throw new ConflictException(
        `Deadline event for "${getDeadlineDateField(fieldId)?.label ?? fieldId}" is already configured. Use update instead.`,
      );
    }
    const saved = await this.campaigns.save(this.campaigns.create(this.entityFromDto(dto)));
    await this.replaceAudiences(saved.id, dto.audiences);
    return this.get(saved.id);
  }

  async update(id: string, dto: UpsertDeadlineCampaignDto): Promise<DeadlineCampaignRow> {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Deadline campaign not found");
    this.validateDto(dto);
    Object.assign(row, this.entityFromDto(dto));
    await this.campaigns.save(row);
    await this.replaceAudiences(id, dto.audiences);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const res = await this.campaigns.delete({ id });
    if (!res.affected) throw new NotFoundException("Deadline campaign not found");
  }

  async preview(
    campaignId?: string,
    draft?: UpsertDeadlineCampaignDto,
  ): Promise<DeadlineCampaignPreviewResult> {
    if (draft) {
      this.validateDto(draft);
      return this.evaluateAllCustomers(this.evalConfigFromDraft(draft, "preview"));
    }
    if (campaignId) {
      const row = await this.campaigns.findOne({
        where: { id: campaignId },
        relations: { audiences: true },
      });
      if (!row) throw new NotFoundException("Deadline campaign not found");
      return this.evaluateAllCustomers(this.evalConfigFromEntity(row));
    }
    throw new BadRequestException("campaign_id or draft is required");
  }

  /** Called every minute from cron. */
  async runDueCampaigns(now: Date = new Date()): Promise<void> {
    const todayKey = campaignDateKey(now);
    const currentHm = now
      .toLocaleTimeString("en-GB", {
        timeZone: DEADLINE_CAMPAIGN_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .slice(0, 5);

    const enabled = await this.campaigns.find({
      where: { isEnabled: true },
      relations: { audiences: true },
      order: { sortOrder: "ASC" },
    });
    if (enabled.length === 0) return;

    const activeCustomers = await runWithAdminRls(this.dataSource, async (manager) => {
      return manager.getRepository(Customer).find({
        where: { accountStatus: CustomerAccountStatus.active },
        select: { id: true, name: true, onboardingData: true },
      });
    });

    for (const campaign of enabled) {
      const config = this.evalConfigFromEntity(campaign);
      const slots = this.slotsForNow(config, currentHm);
      if (slots.length === 0) continue;

      for (const customer of activeCustomers) {
        const root = (customer.onboardingData ?? {}) as Record<string, unknown>;
        const raw = readDeadlineDateFromOnboarding(root, config.dateFieldId);
        const dueDateKey = normaliseDeadlineDateKey(raw);
        if (!dueDateKey) continue;

        const phaseEval = evaluateDeadlinePhase({
          dueDateKey,
          todayKey,
          upcomingEnabled: config.upcomingEnabled,
          upcomingLeadDays: config.upcomingLeadDays,
          overdueEnabled: config.overdueEnabled,
          overdueLeadDays: config.overdueLeadDays,
        });
        if (!phaseEval) continue;

        for (const slot of slots) {
          const alreadySent = await this.wasAlreadySent({
            campaignId: config.id,
            customerId: customer.id,
            dueDateKey,
            phase: phaseEval.phase,
            todayKey,
            slot,
            scheduleMode: config.scheduleMode,
          });
          if (alreadySent) continue;

          await this.sendReminder({
            config,
            customer,
            dueDateKey,
            phaseEval,
            todayKey,
            slot,
          });
        }
      }
    }
  }

  private slotsForNow(config: CampaignEvalConfig, currentHm: string): string[] {
    const times = config.sendTimes;
    if (config.scheduleMode === "once") {
      return times.length === 0 || times.includes(currentHm) ? ["once"] : [];
    }
    return times.filter((t) => t === currentHm);
  }

  private async wasAlreadySent(params: {
    campaignId: string;
    customerId: string;
    dueDateKey: string;
    phase: "upcoming" | "overdue";
    todayKey: string;
    slot: string;
    scheduleMode: DeadlineCampaignScheduleMode;
  }): Promise<boolean> {
    if (params.scheduleMode === "once") {
      const count = await this.sends.count({
        where: {
          campaignId: params.campaignId,
          customerId: params.customerId,
          dueDate: params.dueDateKey,
          phase: params.phase,
        },
      });
      return count > 0;
    }
    const count = await this.sends.count({
      where: {
        campaignId: params.campaignId,
        customerId: params.customerId,
        dueDate: params.dueDateKey,
        phase: params.phase,
        sendDate: params.todayKey,
        sendSlot: params.slot,
      },
    });
    return count > 0;
  }

  private async sendReminder(params: {
    config: CampaignEvalConfig;
    customer: Pick<Customer, "id" | "name" | "onboardingData">;
    dueDateKey: string;
    phaseEval: { phase: "upcoming" | "overdue"; daysRemaining?: number; daysOverdue?: number };
    todayKey: string;
    slot: string;
  }): Promise<void> {
    const { config, customer, dueDateKey, phaseEval, todayKey, slot } = params;
    const isUpcoming = phaseEval.phase === "upcoming";
    const titleTemplate = isUpcoming ? config.upcomingTitleTemplate : config.overdueTitleTemplate;
    const bodyTemplate = isUpcoming ? config.upcomingBodyTemplate : config.overdueBodyTemplate;

    const root = (customer.onboardingData ?? {}) as Record<string, unknown>;
    const vars: Record<string, string> = {
      customerName: customer.name.trim() || "Unnamed customer",
      dueDate: formatDisplayDate(dueDateKey),
      deadlineLabel: config.dateFieldLabel,
      phase: phaseEval.phase,
      daysRemaining: String(phaseEval.daysRemaining ?? 0),
      daysOverdue: String(phaseEval.daysOverdue ?? 0),
      companyNumber: readCompanyNumber(root),
    };

    const title = renderNotificationTemplate(titleTemplate, vars);
    const body = renderNotificationTemplate(bodyTemplate, vars);
    const linkPath = config.defaultLinkUrl?.trim() || `/customers/${customer.id}/dashboard`;

    const context = {
      customerId: customer.id,
      customerName: vars.customerName,
      dueDate: vars.dueDate,
      deadlineLabel: vars.deadlineLabel,
      phase: vars.phase,
      daysRemaining: vars.daysRemaining,
      daysOverdue: vars.daysOverdue,
      companyNumber: vars.companyNumber,
    };

    const audienceIds = await this.resolveRecipientIds(config, customer.id);
    if (audienceIds.length === 0) {
      this.log.warn(
        `Deadline campaign ${config.id}: no recipients for customer ${customer.id} (${customer.name})`,
      );
      return;
    }

    await this.dispatch.deliverToUsersPublic({
      userIds: audienceIds,
      eventConfigId: null,
      eventKey: "deadline.reminder",
      name: title,
      body,
      type: "deadline.reminder",
      imageUrl: null,
      data: { ...context, linkUrl: linkPath, campaignId: config.id },
      pushEnabled: config.pushEnabled,
      inAppEnabled: config.inAppEnabled,
    });

    try {
      await this.sends.save(
        this.sends.create({
          campaignId: config.id,
          customerId: customer.id,
          dueDate: dueDateKey,
          phase: phaseEval.phase,
          sendDate: todayKey,
          sendSlot: slot,
        }),
      );
    } catch (err) {
      this.log.warn(
        `Deadline send log duplicate campaign=${config.id} customer=${customer.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.log.log(
      `Deadline reminder sent campaign=${config.id} customer="${customer.name}" phase=${phaseEval.phase} slot=${slot} recipients=${audienceIds.length}`,
    );
  }

  private async resolveRecipientIds(config: CampaignEvalConfig, customerId: string): Promise<string[]> {
    const ids = new Set<string>();
    const context = { customerId, customerName: "" };
    const fromAudiences = await this.audienceResolver.resolveUserIds(config.audiences, context);
    for (const id of fromAudiences) ids.add(id);
    const fromGroups = await this.notificationGroups.resolveGroupsUserIds(config.groupIds);
    for (const id of fromGroups) ids.add(id);
    return [...ids];
  }

  private async evaluateAllCustomers(config: CampaignEvalConfig): Promise<DeadlineCampaignPreviewResult> {
    const todayKey = campaignDateKey();
    const customers = await runWithAdminRls(this.dataSource, async (manager) => {
      return manager.getRepository(Customer).find({
        where: { accountStatus: CustomerAccountStatus.active },
        select: { id: true, name: true, onboardingData: true },
        order: { name: "ASC" },
      });
    });

    const upcoming: DeadlineCampaignPreviewCustomer[] = [];
    const overdue: DeadlineCampaignPreviewCustomer[] = [];

    for (const customer of customers) {
      const root = (customer.onboardingData ?? {}) as Record<string, unknown>;
      const raw = readDeadlineDateFromOnboarding(root, config.dateFieldId);
      const dueDateKey = normaliseDeadlineDateKey(raw);
      if (!dueDateKey) continue;

      const phaseEval = evaluateDeadlinePhase({
        dueDateKey,
        todayKey,
        upcomingEnabled: config.upcomingEnabled,
        upcomingLeadDays: config.upcomingLeadDays,
        overdueEnabled: config.overdueEnabled,
        overdueLeadDays: config.overdueLeadDays,
      });
      if (!phaseEval) continue;

      const row: DeadlineCampaignPreviewCustomer = {
        customer_id: customer.id,
        customer_name: customer.name.trim() || "Unnamed customer",
        due_date: dueDateKey,
        phase: phaseEval.phase,
        days_remaining: phaseEval.daysRemaining ?? null,
        days_overdue: phaseEval.daysOverdue ?? null,
      };
      if (phaseEval.phase === "upcoming") upcoming.push(row);
      else overdue.push(row);
    }

    return { upcoming, overdue };
  }

  private resolveSchedule(input: {
    scheduleMode: DeadlineCampaignScheduleMode;
    sendStartTime?: string | null;
    sendCountPerDay?: number | null;
    sendIntervalHours?: number | null;
    legacySendTimes?: string[];
  }): {
    sendStartTime: string;
    sendCountPerDay: number;
    sendIntervalHours: number;
    sendTimes: string[];
  } {
    let sendStartTime = normalizeHm(input.sendStartTime ?? undefined);
    let sendCountPerDay = input.sendCountPerDay ?? 1;
    let sendIntervalHours = input.sendIntervalHours ?? 4;

    if (
      (input.sendStartTime == null || input.sendStartTime === "") &&
      (input.sendCountPerDay == null || input.sendCountPerDay <= 0) &&
      (input.legacySendTimes?.length ?? 0) > 0
    ) {
      const legacy = inferScheduleFromLegacySendTimes(input.legacySendTimes ?? []);
      sendStartTime = legacy.sendStartTime;
      sendCountPerDay = legacy.sendCountPerDay;
      sendIntervalHours = legacy.sendIntervalHours;
    }

    if (input.scheduleMode === "daily_multi") {
      sendCountPerDay = Math.max(2, sendCountPerDay);
    } else if (input.scheduleMode === "daily_once") {
      sendCountPerDay = 1;
    }

    const sendTimes = buildSendSlots({
      scheduleMode: input.scheduleMode,
      sendStartTime,
      sendCountPerDay,
      sendIntervalHours,
    });

    return { sendStartTime, sendCountPerDay, sendIntervalHours, sendTimes };
  }

  private validateDto(dto: UpsertDeadlineCampaignDto): void {
    if (!getDeadlineDateField(dto.date_field_id)) {
      throw new BadRequestException(`Unknown date_field_id "${dto.date_field_id}"`);
    }
    if (dto.schedule_mode !== "once" && !dto.send_start_time?.trim()) {
      throw new BadRequestException("send_start_time is required for daily schedule modes");
    }
    if (dto.schedule_mode === "daily_multi") {
      const count = dto.send_count_per_day ?? 2;
      const interval = dto.send_interval_hours ?? 4;
      if (count < 2) {
        throw new BadRequestException("send_count_per_day must be at least 2 for daily_multi");
      }
      const slots = buildSendSlots({
        scheduleMode: "daily_multi",
        sendStartTime: normalizeHm(dto.send_start_time),
        sendCountPerDay: count,
        sendIntervalHours: interval,
      });
      if (slots.length < 2) {
        throw new BadRequestException(
          "Send schedule does not fit in one day — reduce count or interval hours",
        );
      }
    }
    if (dto.upcoming_enabled === false && dto.overdue_enabled === false) {
      throw new BadRequestException("Enable at least one of upcoming or overdue");
    }
    for (const a of dto.audiences) {
      const needsRole =
        a.audience_type === "role" || a.audience_type === "all_practice_staff_with_role";
      if (needsRole && !a.role_id?.trim()) {
        throw new BadRequestException(`audience_type "${a.audience_type}" requires role_id`);
      }
    }
    if (dto.audiences.length === 0 && (dto.group_ids ?? []).length === 0) {
      throw new BadRequestException("Add at least one audience or notification group");
    }
  }

  private entityFromDto(dto: UpsertDeadlineCampaignDto): Partial<DeadlineCampaignEntity> {
    const field = getDeadlineDateField(dto.date_field_id);
    const schedule = this.resolveSchedule({
      scheduleMode: dto.schedule_mode,
      sendStartTime: dto.send_start_time,
      sendCountPerDay: dto.send_count_per_day,
      sendIntervalHours: dto.send_interval_hours,
    });
    return {
      name: dto.name?.trim() || field?.label || dto.date_field_id.trim(),
      dateFieldId: dto.date_field_id.trim(),
      scheduleMode: dto.schedule_mode,
      sendStartTime: schedule.sendStartTime,
      sendCountPerDay: schedule.sendCountPerDay,
      sendIntervalHours: schedule.sendIntervalHours,
      sendTimes: schedule.sendTimes,
      upcomingEnabled: dto.upcoming_enabled !== false,
      upcomingLeadDays: dto.upcoming_lead_days ?? 30,
      overdueEnabled: dto.overdue_enabled !== false,
      overdueLeadDays: dto.overdue_lead_days ?? 14,
      upcomingTitleTemplate: DEADLINE_CAMPAIGN_TEMPLATES.upcomingTitle,
      upcomingBodyTemplate: DEADLINE_CAMPAIGN_TEMPLATES.upcomingBody,
      overdueTitleTemplate: DEADLINE_CAMPAIGN_TEMPLATES.overdueTitle,
      overdueBodyTemplate: DEADLINE_CAMPAIGN_TEMPLATES.overdueBody,
      defaultLinkUrl: dto.default_link_url?.trim() || null,
      groupIds: dto.group_ids ?? [],
      isEnabled: dto.is_enabled !== false,
      pushEnabled: dto.push_enabled !== false,
      inAppEnabled: dto.in_app_enabled !== false,
      sortOrder: dto.sort_order ?? 0,
    };
  }

  private evalConfigFromEntity(row: DeadlineCampaignEntity): CampaignEvalConfig {
    const field = getDeadlineDateField(row.dateFieldId);
    const schedule = this.resolveSchedule({
      scheduleMode: row.scheduleMode,
      sendStartTime: row.sendStartTime,
      sendCountPerDay: row.sendCountPerDay,
      sendIntervalHours: row.sendIntervalHours,
      legacySendTimes: row.sendTimes ?? [],
    });
    return {
      id: row.id,
      dateFieldId: row.dateFieldId,
      dateFieldLabel: field?.label ?? row.dateFieldId,
      scheduleMode: row.scheduleMode,
      sendTimes: schedule.sendTimes,
      upcomingEnabled: row.upcomingEnabled,
      upcomingLeadDays: row.upcomingLeadDays,
      overdueEnabled: row.overdueEnabled,
      overdueLeadDays: row.overdueLeadDays,
      upcomingTitleTemplate: DEADLINE_CAMPAIGN_TEMPLATES.upcomingTitle,
      upcomingBodyTemplate: DEADLINE_CAMPAIGN_TEMPLATES.upcomingBody,
      overdueTitleTemplate: DEADLINE_CAMPAIGN_TEMPLATES.overdueTitle,
      overdueBodyTemplate: DEADLINE_CAMPAIGN_TEMPLATES.overdueBody,
      defaultLinkUrl: row.defaultLinkUrl,
      groupIds: row.groupIds ?? [],
      pushEnabled: row.pushEnabled,
      inAppEnabled: row.inAppEnabled,
      audiences: (row.audiences ?? []).map((a) => ({
        audienceType: a.audienceType,
        roleId: a.roleId,
      })),
    };
  }

  private evalConfigFromDraft(dto: UpsertDeadlineCampaignDto, id: string): CampaignEvalConfig {
    const field = getDeadlineDateField(dto.date_field_id);
    const schedule = this.resolveSchedule({
      scheduleMode: dto.schedule_mode,
      sendStartTime: dto.send_start_time,
      sendCountPerDay: dto.send_count_per_day,
      sendIntervalHours: dto.send_interval_hours,
    });
    return {
      id,
      dateFieldId: dto.date_field_id.trim(),
      dateFieldLabel: field?.label ?? dto.date_field_id,
      scheduleMode: dto.schedule_mode,
      sendTimes: schedule.sendTimes,
      upcomingEnabled: dto.upcoming_enabled !== false,
      upcomingLeadDays: dto.upcoming_lead_days ?? 30,
      overdueEnabled: dto.overdue_enabled !== false,
      overdueLeadDays: dto.overdue_lead_days ?? 14,
      upcomingTitleTemplate: DEADLINE_CAMPAIGN_TEMPLATES.upcomingTitle,
      upcomingBodyTemplate: DEADLINE_CAMPAIGN_TEMPLATES.upcomingBody,
      overdueTitleTemplate: DEADLINE_CAMPAIGN_TEMPLATES.overdueTitle,
      overdueBodyTemplate: DEADLINE_CAMPAIGN_TEMPLATES.overdueBody,
      defaultLinkUrl: dto.default_link_url?.trim() || null,
      groupIds: dto.group_ids ?? [],
      pushEnabled: dto.push_enabled !== false,
      inAppEnabled: dto.in_app_enabled !== false,
      audiences: (dto.audiences ?? []).map((a) => ({
        audienceType: a.audience_type,
        roleId: a.role_id?.trim() || null,
      })),
    };
  }

  private async replaceAudiences(
    campaignId: string,
    items: UpsertDeadlineCampaignDto["audiences"],
  ): Promise<void> {
    await this.audiences.delete({ campaignId });
    if (items.length === 0) return;
    await this.audiences.save(
      items.map((a) =>
        this.audiences.create({
          campaignId,
          audienceType: a.audience_type,
          roleId: a.role_id?.trim() || null,
        }),
      ),
    );
  }

  private toRow(e: DeadlineCampaignEntity): DeadlineCampaignRow {
    const field = getDeadlineDateField(e.dateFieldId);
    const schedule = this.resolveSchedule({
      scheduleMode: e.scheduleMode,
      sendStartTime: e.sendStartTime,
      sendCountPerDay: e.sendCountPerDay,
      sendIntervalHours: e.sendIntervalHours,
      legacySendTimes: e.sendTimes ?? [],
    });
    const scheduleSummary =
      e.scheduleMode === "once"
        ? "Once when entering window"
        : e.scheduleMode === "daily_once"
          ? `Daily at ${schedule.sendStartTime} UK`
          : `${schedule.sendCountPerDay}× daily every ${schedule.sendIntervalHours}h from ${schedule.sendStartTime} UK (${schedule.sendTimes.join(", ")})`;
    return {
      id: e.id,
      name: e.name,
      date_field_id: e.dateFieldId,
      date_field_label: field?.label ?? e.dateFieldId,
      schedule_mode: e.scheduleMode,
      send_start_time: schedule.sendStartTime,
      send_count_per_day: schedule.sendCountPerDay,
      send_interval_hours: schedule.sendIntervalHours,
      send_times: schedule.sendTimes,
      schedule_summary: scheduleSummary,
      upcoming_enabled: e.upcomingEnabled,
      upcoming_lead_days: e.upcomingLeadDays,
      overdue_enabled: e.overdueEnabled,
      overdue_lead_days: e.overdueLeadDays,
      default_link_url: e.defaultLinkUrl,
      group_ids: e.groupIds ?? [],
      is_enabled: e.isEnabled,
      push_enabled: e.pushEnabled,
      in_app_enabled: e.inAppEnabled,
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
