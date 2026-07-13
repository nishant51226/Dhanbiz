---
sidebar_position: 1
---

# Customer portal overview

Customer portal users sign in with credentials linked to **one customer organisation**. They see the same customer workspace UI as practice staff, but scoped to their company and gated by `portal:*` permissions.

## Signing in

Portal users use the same `/login` page as staff. After authentication they land on:

```
/customers/:customerId/dashboard
```

They cannot access the firm-wide modules (global customers list, admin dashboard, or settings) unless they also hold staff roles.

## Workspace tabs

| Tab | Portal permission | What you can do |
|-----|-------------------|-----------------|
| Dashboard | `portal:customer:read` or `portal:dashboard:read` | View account summary and pending actions |
| Drive | `portal:file:read` / `portal:file:write` | Browse folders, upload documents (delete requires practice staff) |
| Jobs | `portal:job:read` / `portal:job:create` | View extraction jobs, submit documents |
| Details | `portal:customer:read` | View company profile |
| Settings | `portal:settings:read` / `portal:settings:write` | Manage portal preferences |
| Users | `portal:user:read` / `portal:user:write` | Invite colleagues (**customer_admin** role) |

## Built-in portal roles

| Role | Typical access |
|------|----------------|
| **customer_admin** | Full drive (read/write), settings, portal user management |
| **customer_user** | Drive read/write only — no user management |
| **Custom portal roles** | Whatever keys you enable under **Settings → Roles** |

Practice staff can create additional portal roles (e.g. read-only portal access) and assign them from **Portal users**.

## Typical workflows

### Upload a document

1. Open **Drive** in your workspace
2. Choose or create a folder
3. Upload your PDF or image
4. Optionally start an extraction job from the file actions menu

### Check extraction progress

Open **Jobs** to see status, progress percentage, and completion time. When a job completes, structured invoice or statement data is available from the job detail view (staff can assist if you lack access).

### Complete onboarding signatures

During onboarding your practice sends DocuSeal signature requests (64-8, client registration, etc.). Pending items appear on your dashboard until signed.

## Getting help

If a tab is missing or an action is disabled, your practice administrator may need to update your **portal role**. Staff manage portal users from the customer workspace **Users** tab or Settings → Users.

For the full permission reference, see [Roles & permissions](../roles-permissions).
