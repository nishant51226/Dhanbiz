import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { NotificationGroupMemberEntity } from "../entities/notification-group-member.entity";
import { NotificationGroupRuleEntity } from "../entities/notification-group-rule.entity";
import { NotificationGroupEntity } from "../entities/notification-group.entity";
import { UserEntity } from "../entities/user.entity";
import { BroadcastRecipientUserResolver } from "./broadcast-recipient-user.resolver";
import type { UpsertNotificationGroupDto } from "./dto/upsert-notification-group.dto";

export type NotificationGroupListRow = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  rule_count: number;
  resolved_member_count: number;
  created_at: string;
  updated_at: string;
};

export type NotificationGroupRuleRow = {
  id: string;
  filter: string;
  customer_id: string | null;
  customer_name: string | null;
};

export type NotificationGroupMemberRow = {
  user_id: string;
  email: string;
  label: string;
};

export type NotificationGroupDetail = NotificationGroupListRow & {
  members: NotificationGroupMemberRow[];
  rules: NotificationGroupRuleRow[];
};

@Injectable()
export class NotificationGroupService {
  constructor(
    @InjectRepository(NotificationGroupEntity)
    private readonly groups: Repository<NotificationGroupEntity>,
    @InjectRepository(NotificationGroupMemberEntity)
    private readonly members: Repository<NotificationGroupMemberEntity>,
    @InjectRepository(NotificationGroupRuleEntity)
    private readonly rules: Repository<NotificationGroupRuleEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly recipientResolver: BroadcastRecipientUserResolver,
  ) {}

  async list(): Promise<NotificationGroupListRow[]> {
    const rows = await this.groups.find({ order: { name: "ASC" } });
    const out: NotificationGroupListRow[] = [];
    for (const g of rows) {
      out.push(await this.toListRow(g));
    }
    return out;
  }

  async getOne(id: string): Promise<NotificationGroupDetail> {
    const group = await this.loadGroupWithRelations(id);
    return this.toDetail(group);
  }

  async create(dto: UpsertNotificationGroupDto, createdById?: string): Promise<NotificationGroupDetail> {
    this.assertHasMembership(dto);
    await this.assertUniqueName(dto.name.trim());

    const group = await this.groups.save(
      this.groups.create({
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        createdById: createdById ?? null,
      }),
    );

    await this.replaceMembership(group.id, dto);
    return this.getOne(group.id);
  }

  async update(id: string, dto: UpsertNotificationGroupDto): Promise<NotificationGroupDetail> {
    const group = await this.groups.findOne({ where: { id } });
    if (!group) throw new NotFoundException("Notification group not found");

    const name = dto.name.trim();
    if (name !== group.name) {
      await this.assertUniqueName(name, id);
    }

    if (dto.user_ids !== undefined || dto.rules !== undefined) {
      const merged: UpsertNotificationGroupDto = {
        name,
        description: dto.description,
        user_ids: dto.user_ids,
        rules: dto.rules,
      };
      if (dto.user_ids === undefined || dto.rules === undefined) {
        const existing = await this.loadGroupWithRelations(id);
        if (dto.user_ids === undefined) {
          merged.user_ids = existing.members.map((m) => m.userId);
        }
        if (dto.rules === undefined) {
          merged.rules = existing.rules.map((r) => ({
            filter: r.filter,
            customer_id: r.customerId,
          }));
        }
      }
      this.assertHasMembership(merged);
      await this.replaceMembership(id, merged);
    }

    group.name = name;
    group.description =
      dto.description !== undefined ? dto.description?.trim() || null : group.description;
    await this.groups.save(group);
    return this.getOne(id);
  }

  async remove(id: string): Promise<void> {
    const group = await this.groups.findOne({ where: { id } });
    if (!group) throw new NotFoundException("Notification group not found");
    await this.groups.remove(group);
  }

  async previewResolvedCount(id: string): Promise<{ recipient_count: number }> {
    const ids = await this.resolveGroupUserIds(id);
    return { recipient_count: ids.length };
  }

  async previewDraftMembership(dto: UpsertNotificationGroupDto): Promise<{ recipient_count: number }> {
    const ids = await this.resolveDraftUserIds(dto);
    return { recipient_count: ids.length };
  }

  async resolveGroupsUserIds(groupIds: string[]): Promise<string[]> {
    const uniqueGroupIds = [...new Set(groupIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueGroupIds.length === 0) return [];

    const found = await this.groups.find({
      where: { id: In(uniqueGroupIds) },
      select: { id: true },
    });
    if (found.length !== uniqueGroupIds.length) {
      throw new BadRequestException("One or more notification groups were not found.");
    }

    const ids = new Set<string>();
    for (const groupId of uniqueGroupIds) {
      for (const userId of await this.resolveGroupUserIds(groupId)) {
        ids.add(userId);
      }
    }
    return [...ids];
  }

  async resolveGroupUserIds(groupId: string): Promise<string[]> {
    const group = await this.loadGroupWithRelations(groupId);
    const ids = new Set<string>();

    for (const m of group.members) {
      ids.add(m.userId);
    }

    for (const rule of group.rules) {
      const resolved = await this.recipientResolver.resolveUserIdsForFilter(
        rule.filter,
        rule.customerId,
      );
      for (const userId of resolved) {
        ids.add(userId);
      }
    }

    return [...ids];
  }

  private async resolveDraftUserIds(dto: UpsertNotificationGroupDto): Promise<string[]> {
    const ids = new Set<string>();
    const userIds = [...new Set((dto.user_ids ?? []).map((id) => id.trim()).filter(Boolean))];
    if (userIds.length > 0) {
      const found = await this.users.find({
        where: { id: In(userIds) },
        select: { id: true },
      });
      if (found.length !== userIds.length) {
        throw new BadRequestException("One or more selected users were not found.");
      }
      for (const id of userIds) ids.add(id);
    }
    for (const rule of dto.rules ?? []) {
      const resolved = await this.recipientResolver.resolveUserIdsForFilter(
        rule.filter,
        rule.customer_id,
      );
      for (const userId of resolved) ids.add(userId);
    }
    return [...ids];
  }

  private async replaceMembership(groupId: string, dto: UpsertNotificationGroupDto): Promise<void> {
    await this.members.delete({ groupId });
    await this.rules.delete({ groupId });

    const userIds = [...new Set((dto.user_ids ?? []).map((id) => id.trim()).filter(Boolean))];
    if (userIds.length > 0) {
      const found = await this.users.find({
        where: { id: In(userIds) },
        select: { id: true },
      });
      if (found.length !== userIds.length) {
        throw new BadRequestException("One or more selected users were not found.");
      }
      await this.members.save(
        userIds.map((userId) =>
          this.members.create({
            groupId,
            userId,
          }),
        ),
      );
    }

    const ruleRows = dto.rules ?? [];
    if (ruleRows.length > 0) {
      await this.rules.save(
        ruleRows.map((r) =>
          this.rules.create({
            groupId,
            filter: r.filter,
            customerId: r.customer_id?.trim() || null,
          }),
        ),
      );
    }
  }

  private assertHasMembership(dto: UpsertNotificationGroupDto): void {
    const hasUsers = (dto.user_ids ?? []).some((id) => id.trim());
    const hasRules = (dto.rules ?? []).length > 0;
    if (!hasUsers && !hasRules) {
      throw new BadRequestException(
        "Add at least one manual member or one membership rule to the group.",
      );
    }
  }

  private async assertUniqueName(name: string, excludeId?: string): Promise<void> {
    const existing = await this.groups.findOne({ where: { name } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(`A notification group named "${name}" already exists.`);
    }
  }

  private async loadGroupWithRelations(id: string): Promise<NotificationGroupEntity> {
    const group = await this.groups.findOne({
      where: { id },
      relations: {
        members: { user: true },
        rules: { customer: true },
      },
    });
    if (!group) throw new NotFoundException("Notification group not found");
    return group;
  }

  private async toListRow(group: NotificationGroupEntity): Promise<NotificationGroupListRow> {
    const [memberCount, ruleCount] = await Promise.all([
      this.members.count({ where: { groupId: group.id } }),
      this.rules.count({ where: { groupId: group.id } }),
    ]);
    const resolvedCount = (await this.resolveGroupUserIds(group.id)).length;
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      member_count: memberCount,
      rule_count: ruleCount,
      resolved_member_count: resolvedCount,
      created_at: group.createdAt.toISOString(),
      updated_at: group.updatedAt.toISOString(),
    };
  }

  private async toDetail(group: NotificationGroupEntity): Promise<NotificationGroupDetail> {
    const listRow = await this.toListRow(group);
    const userEntities = group.members.map((m) => m.user).filter(Boolean) as UserEntity[];
    const enriched = await this.recipientResolver.enrichRecipientUserOptions(userEntities);

    return {
      ...listRow,
      members: enriched.map((u) => ({
        user_id: u.id,
        email: u.email,
        label: u.label,
      })),
      rules: group.rules.map((r) => ({
        id: r.id,
        filter: r.filter,
        customer_id: r.customerId,
        customer_name: r.customer?.name?.trim() ?? null,
      })),
    };
  }
}
