import type { DeadlineCampaignScheduleMode } from "../entities/deadline-campaign.entity";

export const DEADLINE_UPCOMING_TITLE =
  "{{customerName}} — {{deadlineLabel}} due in {{daysRemaining}} days";
export const DEADLINE_UPCOMING_BODY =
  "{{deadlineLabel}} for {{customerName}} will expire soon — due on {{dueDate}} ({{daysRemaining}} days remaining).";
export const DEADLINE_OVERDUE_TITLE =
  "{{customerName}} — {{deadlineLabel}} overdue by {{daysOverdue}} days";
export const DEADLINE_OVERDUE_BODY =
  "{{deadlineLabel}} for {{customerName}} has expired — was due on {{dueDate}} ({{daysOverdue}} days overdue).";

export const DEADLINE_CAMPAIGN_TEMPLATES = {
  upcomingTitle: DEADLINE_UPCOMING_TITLE,
  upcomingBody: DEADLINE_UPCOMING_BODY,
  overdueTitle: DEADLINE_OVERDUE_TITLE,
  overdueBody: DEADLINE_OVERDUE_BODY,
} as const;
