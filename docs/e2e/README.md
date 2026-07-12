# 3K Financial — E2E Documentation

**Environment:** https://fs3kltd.infurotech.com  
**Generated:** 23/06/2026, 11:01:33

---

Auto-generated end-to-end documentation for every feature of the 3K Financial & Accounting Services platform. Each file includes step-by-step instructions with live screenshots from UAT.

## Features

| # | Feature | File |
|---|---|---|
| 1 | Authentication | [01-authentication.md](01-authentication.md) |
| 2 | Dashboard | [02-dashboard.md](02-dashboard.md) |
| 3 | Customers | [03-customers.md](03-customers.md) |
| 4 | Jobs | [04-jobs.md](04-jobs.md) |
| 5 | Files | [05-files.md](05-files.md) |
| 6 | Reports | [06-reports.md](06-reports.md) |
| 7 | Settings | [07-settings.md](07-settings.md) |

## Run Commands

```bash
# Full UAT test suite
npx playwright test --project=uat-setup --project=uat

# Regenerate docs only (fast)
npx playwright test --project=uat-setup --project=uat tests/customer-journey

# HTML report
npm run test:report
```
