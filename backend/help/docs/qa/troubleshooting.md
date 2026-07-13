---
sidebar_position: 3
---

# Troubleshooting

Common issues and what to try before contacting support.

## Sign-in problems

| Symptom | Likely cause | What to try |
|---------|--------------|-------------|
| "Invalid credentials" | Wrong email or password | Reset password via administrator |
| Redirect loop to login | Expired or corrupt session | Clear browser cache; sign in again |
| Blank page after login | Missing permissions | Administrator checks role assignment |
| Portal user sees staff dashboard | Wrong account type | Use portal email, not staff email |

## Customers & onboarding

| Symptom | Likely cause | What to try |
|---------|--------------|-------------|
| Cannot see **+ Add customer** | Missing `customer:write` | Administrator updates your role |
| Onboarding form won't save | Required field missing | Check red validation messages |
| DocuSeal email not received | SMTP or wrong contact email | Verify email in Details; check spam |
| Customer not in list | Filter active or wrong tenant | Clear filters; search by Client ref |

## Jobs & extraction

| Symptom | Likely cause | What to try |
|---------|--------------|-------------|
| Job stuck on **Queued** | Worker not running | Administrator checks backend / queue service |
| Job **Failed** | Unsupported PDF, AI timeout, page limit | Open job detail for error; try smaller PDF |
| No structured results | Vision/structure model error | Re-submit; check `PDF_MAX_PAGES` limit |
| Progress bar at 0% | Recent submit | Wait 30–60 seconds and refresh |

## Files & drive

| Symptom | Likely cause | What to try |
|---------|--------------|-------------|
| Upload fails | File too large or wrong type | Use PDF/JPG/PNG under 10 MB |
| Cannot delete file (staff) | Missing `file:delete` | Manager role or custom role with delete — ask administrator |
| Cannot delete file (portal) | By design | Portal roles cannot delete — contact your practice |
| File missing from library | Wrong customer folder | Check customer drive path |

## Reports

| Symptom | Likely cause | What to try |
|---------|--------------|-------------|
| Reports menu missing | Not admin | Only superadmin sees customer-documents and file-activity |
| Empty job cost report | No completed jobs in date range | Widen date filter |
| CSV export empty | No matching rows | Adjust filters |

## Settings & notifications

| Symptom | Likely cause | What to try |
|---------|--------------|-------------|
| Cannot open Users or Roles | Admin-only route | **Settings → Roles** requires superadmin; portal **Users** tab needs `portal:user:read` |
| Module missing after role change | Session cache | Sign out and back in; permissions apply on next request |
| Emails not sent | SMTP not configured | Administrator checks deployment env vars |
| Plan not in onboarding dropdown | Plan inactive | **Settings → Subscription** — enable plan |

## Browser tips

- Use a supported browser: Chrome, Edge, Firefox, or Safari (latest two versions)
- Disable ad blockers if API calls fail silently
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
