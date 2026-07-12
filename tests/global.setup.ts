import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

setup("authenticate as admin", async ({ page, request, baseURL }) => {
  const isUat = page.context().browser()?.browserType().name() !== undefined &&
    process.env.UAT_BASE_URL && baseURL === process.env.UAT_BASE_URL;

  const rawApiBase = isUat
    ? (process.env.UAT_API_BASE ?? process.env.UAT_BASE_URL ?? "")
    : (process.env.API_BASE ?? "http://127.0.0.1:3009");
  // Avoid Node resolving localhost to ::1 when the API only listens on IPv4.
  const apiBase = rawApiBase.replace("://localhost", "://127.0.0.1");

  const email = isUat
    ? (process.env.UAT_ADMIN_EMAIL ?? "admin")
    : (process.env.ADMIN_EMAIL ?? "admin");

  const password = isUat
    ? (process.env.UAT_ADMIN_PASSWORD ?? "")
    : (process.env.ADMIN_PASSWORD ?? "change-me");

  const authFile = isUat
    ? path.join(".playwright", "auth", "uat-admin.json")
    : path.join(".playwright", "auth", "admin.json");

  // Call login API directly (faster than UI login)
  const res = await request.post(`${apiBase}/api/auth/login`, {
    data: { email, password },
  });

  expect(res.ok(), `Login failed (${res.status()}): ${await res.text()}`).toBeTruthy();

  const body = await res.json() as {
    accessToken?: string;
    refreshToken?: string;
    token?: string;
  };

  const accessToken = (body.accessToken ?? body.token ?? "").trim();
  const refreshToken = (body.refreshToken ?? "").trim();

  expect(accessToken, "No access token in login response").toBeTruthy();
  expect(refreshToken, "No refresh token in login response").toBeTruthy();

  // Inject tokens into localStorage so AuthContext picks them up on next load
  await page.goto(baseURL!);
  await page.evaluate(
    ({ access, refresh }) => {
      localStorage.setItem("docp_token", access);
      localStorage.setItem("docp_refresh", refresh);
    },
    { access: accessToken, refresh: refreshToken }
  );

  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
