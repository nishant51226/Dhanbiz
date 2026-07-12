---
sidebar_position: 5
---

# Notifications

Route: `/settings/notifications`  
**Access:** Superadmin only

## Purpose

Configure how the platform communicates with staff and portal users — automated event emails, one-off broadcasts, and SMTP delivery.

![Notifications](/img/docs/settings-05-notifications.png)

## Event notifications

Triggered automatically by platform events:

| Event | Typical recipient |
|-------|-------------------|
| Job completed / failed | Staff who submitted the job |
| File uploaded | Assigned customer owner |
| Customer status change | Practice administrators |
| Onboarding signature completed | Onboarding workflow |

Configure templates and enable/disable per event type in the **Event** tab.

## Broadcast messages

One-off announcements to **all portal users** (or scoped groups when supported):

1. Open **Settings → Notifications** → **Broadcast** tab
2. Compose subject and body
3. Send — delivered via configured SMTP

Legacy routes `/settings/notifications/broadcast` and `/settings/notifications/events` redirect to tab query parameters.

## SMTP configuration

Ensure outbound email is configured in your deployment environment (`.env` / Docker Compose):

- SMTP host, port, credentials
- From address matching your firm domain
- TLS settings

Without valid SMTP, notifications are queued but not delivered.

## Testing notifications

1. Trigger a test event (e.g. complete a small extraction job)
2. Check recipient inbox and **Reports → File activity** for audit
3. Review backend logs if delivery fails

## Verification

Send a test broadcast or trigger a job-completion event, then confirm delivery per [monthly health check](../qa/checklists#monthly-health-check).
