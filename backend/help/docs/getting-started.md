---
sidebar_position: 2
---

# Getting started

## Sign in

1. Open the application URL provided by your administrator.
2. You are redirected to **Sign in** if you are not already authenticated.
3. Enter your **email** and **password**, then click **Sign in**.

![Login page](/img/docs/auth-01-login-page.png)

If credentials are wrong, a red error message appears below the password field.

![Invalid credentials](/img/docs/auth-02-login-error.png)

Use the eye icon to show or hide your password before submitting.

## Where you land after login

| Account type | Default landing page |
|--------------|----------------------|
| Superadmin | `/dashboard` |
| Staff (role-based) | First module you have permission for |
| Customer portal user | `/customers/:id/dashboard` |

![Home after sign-in](/img/docs/auth-04-after-login.png)

## Staff navigation

Staff users see a sidebar with modules based on their role:

- **Dashboard** — requires `dashboard:read`
- **Customers** — requires `customer:read`
- **Jobs** and **Files** — require `job:read` and/or file permissions
- **Reports** — admin only
- **Settings** — requires `settings:read` or `settings:write`

If you cannot see a module, ask your administrator to check your **role assignments** under Settings → Users (staff) or your **portal role** under the customer’s Portal users tab. See [Roles & permissions](./roles-permissions) for the full catalogue.

## Customer portal navigation

Portal users are scoped to a single customer. From the workspace sidebar you can open:

- **Dashboard** — account summary and pending actions
- **Drive** — upload and browse documents
- **Jobs** — view extraction jobs for your organisation
- **Details** and **Settings** — profile and portal user management (when permitted)

## Sign out

Use the account menu in the top bar to sign out. Your session tokens are cleared from the browser.

## Need access?

Contact your practice administrator to:

- Create or reset your staff account
- Assign you to customer workspaces
- Grant portal access for client contacts
