import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import type { AuthUser } from "../auth/auth.types";
import { UserDeviceTokenEntity } from "../entities/user-device-token.entity";
import { UserNotificationEntity } from "../entities/user-notification.entity";
import { UserEntity } from "../entities/user.entity";
import { AuthService } from "../auth/auth.service";
import type { ListInboxQueryDto } from "./dto/list-inbox-query.dto";
import type { RegisterDeviceTokenDto } from "./dto/register-device-token.dto";

export type InboxNotificationRow = {
  id: string;
  name: string;
  body: string;
  type: string;
  image_url: string | null;
  data: Record<string, unknown>;
  event_key: string | null;
  read_at: string | null;
  created_at: string;
};

export type RegisterDeviceTokenResult = {
  id: string;
  user_id: string;
  firebase_token: string;
  device_type: string | null;
  device_id: string | null;
  app_version: string | null;
  is_active: boolean;
  last_used_at: string;
  created_at: string;
  updated_at: string;
};

function fcmTokenPreview(token: string): string {
  const t = token.trim();
  if (t.length <= 16) return t;
  return `${t.slice(0, 8)}…${t.slice(-6)}`;
}

@Injectable()
export class NotificationService {
  private readonly log = new Logger(NotificationService.name);

  constructor(
    private readonly auth: AuthService,
    @InjectRepository(UserDeviceTokenEntity)
    private readonly deviceTokens: Repository<UserDeviceTokenEntity>,
    @InjectRepository(UserNotificationEntity)
    private readonly inbox: Repository<UserNotificationEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
  ) {}

  private requireActor(actor: AuthUser | undefined): AuthUser {
    if (!this.auth.authEnabled()) {
      return { userId: actor?.userId ?? "", customerId: actor?.customerId ?? null, isAdmin: true };
    }
    if (!actor) throw new UnauthorizedException();
    return actor;
  }

  private assertCanActForUser(actor: AuthUser | undefined, targetUserId: string): void {
    if (!this.auth.authEnabled()) return;
    if (!actor) {
      throw new UnauthorizedException();
    }
    if (actor.isAdmin) return;
    if (actor.userId !== targetUserId) {
      throw new ForbiddenException("You may only register device tokens for your own user");
    }
  }

  private toRow(e: UserDeviceTokenEntity): RegisterDeviceTokenResult {
    return {
      id: e.id,
      user_id: e.userId,
      firebase_token: e.firebaseToken,
      device_type: e.deviceType,
      device_id: e.deviceId,
      app_version: e.appVersion,
      is_active: e.isActive,
      last_used_at: e.lastUsedAt.toISOString(),
      created_at: e.createdAt.toISOString(),
      updated_at: e.updatedAt.toISOString(),
    };
  }

  /** Upsert a device row for (user_id, firebase_token). Deactivates the same FCM token for other users. */
  async registerDeviceToken(
    actor: AuthUser | undefined,
    dto: RegisterDeviceTokenDto,
  ): Promise<RegisterDeviceTokenResult> {
    const userId = dto.user_id.trim();
    const firebaseToken = dto.firebase_token.trim();
    this.assertCanActForUser(actor, userId);

    const user = await this.users.findOne({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.deviceTokens
      .createQueryBuilder()
      .update(UserDeviceTokenEntity)
      .set({ isActive: false })
      .where("firebase_token = :ft", { ft: firebaseToken })
      .andWhere("user_id <> :uid", { uid: userId })
      .execute();

    const now = new Date();
    const isActive = dto.is_active !== false;

    let row = await this.deviceTokens.findOne({
      where: { userId, firebaseToken },
    });

    if (row) {
      row.deviceType = dto.device_type?.trim() || null;
      row.deviceId = dto.device_id?.trim() || null;
      row.appVersion = dto.app_version?.trim() || null;
      row.isActive = isActive;
      row.lastUsedAt = now;
      row = await this.deviceTokens.save(row);
      this.log.log(
        `FCM token refreshed userId=${userId} device=${row.deviceType ?? "unknown"} active=${row.isActive} token=${fcmTokenPreview(firebaseToken)}`,
      );
      return this.toRow(row);
    }

    const created = this.deviceTokens.create({
      userId,
      firebaseToken,
      deviceType: dto.device_type?.trim() || null,
      deviceId: dto.device_id?.trim() || null,
      appVersion: dto.app_version?.trim() || null,
      isActive,
      lastUsedAt: now,
    });
    const saved = await this.deviceTokens.save(created);
    this.log.log(
      `FCM token registered userId=${userId} device=${saved.deviceType ?? "unknown"} active=${saved.isActive} token=${fcmTokenPreview(firebaseToken)}`,
    );
    return this.toRow(saved);
  }

  /** Active FCM tokens for push via Firebase Admin. */
  async getActiveFirebaseTokensForUser(userId: string): Promise<string[]> {
    const rows = await this.deviceTokens.find({
      where: { userId, isActive: true },
      select: { firebaseToken: true },
      order: { lastUsedAt: "DESC" },
    });
    return rows.map((r) => r.firebaseToken);
  }

  /** Count active device tokens per user (for broadcast delivery preview). */
  async getActiveFirebaseTokenCountsForUsers(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.deviceTokens
      .createQueryBuilder("t")
      .select("t.user_id", "userId")
      .addSelect("COUNT(*)", "count")
      .where("t.user_id IN (:...ids)", { ids: userIds })
      .andWhere("t.is_active = :active", { active: true })
      .groupBy("t.user_id")
      .getRawMany<{ userId: string; count: string }>();
    return new Map(rows.map((r) => [r.userId, Number(r.count)]));
  }

  async listInbox(
    actor: AuthUser | undefined,
    query: ListInboxQueryDto,
  ): Promise<{ items: InboxNotificationRow[]; total: number; unread_count: number }> {
    const user = this.requireActor(actor);
    const limit = query.limit ?? 30;
    const offset = query.offset ?? 0;
    const qb = this.inbox
      .createQueryBuilder("n")
      .where("n.user_id = :uid", { uid: user.userId })
      .orderBy("n.created_at", "DESC")
      .skip(offset)
      .take(limit);
    if (query.unread_only) {
      qb.andWhere("n.read_at IS NULL");
    }
    const [rows, total] = await qb.getManyAndCount();
    const unread_count = await this.inbox.count({
      where: { userId: user.userId, readAt: IsNull() },
    });
    return {
      items: rows.map((r) => this.toInboxRow(r)),
      total,
      unread_count,
    };
  }

  async unreadCount(actor: AuthUser | undefined): Promise<{ unread_count: number }> {
    const user = this.requireActor(actor);
    const unread_count = await this.inbox.count({
      where: { userId: user.userId, readAt: IsNull() },
    });
    return { unread_count };
  }

  async markRead(actor: AuthUser | undefined, id: string): Promise<InboxNotificationRow> {
    const user = this.requireActor(actor);
    const row = await this.inbox.findOne({ where: { id, userId: user.userId } });
    if (!row) throw new NotFoundException("Notification not found");
    if (!row.readAt) {
      row.readAt = new Date();
      await this.inbox.save(row);
    }
    return this.toInboxRow(row);
  }

  async markAllRead(actor: AuthUser | undefined): Promise<{ updated: number }> {
    const user = this.requireActor(actor);
    const res = await this.inbox
      .createQueryBuilder()
      .update(UserNotificationEntity)
      .set({ readAt: () => "now()" })
      .where("user_id = :uid", { uid: user.userId })
      .andWhere("read_at IS NULL")
      .execute();
    return { updated: res.affected ?? 0 };
  }

  private toInboxRow(e: UserNotificationEntity): InboxNotificationRow {
    return {
      id: e.id,
      name: e.name,
      body: e.body,
      type: e.type,
      image_url: e.imageUrl,
      data: e.data ?? {},
      event_key: e.eventKey,
      read_at: e.readAt?.toISOString() ?? null,
      created_at: e.createdAt.toISOString(),
    };
  }
}
