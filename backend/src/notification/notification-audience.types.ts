import type { NotificationAudienceType } from "../entities/notification-event-audience.entity";

export type AudienceSpec = {
  audienceType: NotificationAudienceType;
  roleId: string | null;
};
