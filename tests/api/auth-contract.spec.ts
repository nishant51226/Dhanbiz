import { test, expect } from "@playwright/test";
import { apiBase, bearerHeaders, loginAdmin } from "./helpers";

test.describe("Auth API contract regression", () => {
  test("GET /health returns ok payload (HEALTH-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/health`);
    expect(res.ok()).toBeTruthy();

    const body = (await res.json()) as {
      ok?: boolean;
      authEnabled?: boolean;
      defaultProvider?: string;
      enabledProviderCount?: number;
    };

    expect(body.ok).toBe(true);
    expect(typeof body.authEnabled).toBe("boolean");
    expect(typeof body.defaultProvider).toBe("string");
    expect(typeof body.enabledProviderCount).toBe("number");
  });

  test("GET /api/auth/status returns authRequired (AUTH-STATUS-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/auth/status`);
    expect(res.ok()).toBeTruthy();

    const body = (await res.json()) as { authRequired?: boolean };
    expect(typeof body.authRequired).toBe("boolean");
  });

  test("POST /api/auth/login returns token pair (AUTH-R1)", async ({ request }) => {
    const pair = await loginAdmin(request);
    expect(pair.accessToken.length).toBeGreaterThan(10);
    expect(pair.refreshToken.length).toBeGreaterThan(10);
    if (pair.token !== undefined) {
      expect(pair.token).toBe(pair.accessToken);
    }
  });

  test("POST /api/auth/login rejects invalid credentials", async ({ request }) => {
    const res = await request.post(`${apiBase()}/api/auth/login`, {
      data: { email: "wrong@example.com", password: "badpassword" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/auth/me returns admin shape (ME-R1)", async ({ request }) => {
    const { accessToken } = await loginAdmin(request);
    const res = await request.get(`${apiBase()}/api/auth/me`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = (await res.json()) as {
      userId?: string;
      customerId?: string | null;
      customer_name?: string;
      isAdmin?: boolean;
      permissions?: string[];
      roles?: string[];
    };

    expect(body.userId, "userId missing from /auth/me").toBeTruthy();
    expect(body.isAdmin).toBe(true);
    expect(Array.isArray(body.permissions)).toBe(true);
    expect(Array.isArray(body.roles)).toBe(true);
    expect(body.customer_name).toBe("");
  });

  test("POST /api/auth/refresh rotates token pair (REFRESH-R1)", async ({ request }) => {
    const first = await loginAdmin(request);
    const res = await request.post(`${apiBase()}/api/auth/refresh`, {
      data: { refreshToken: first.refreshToken },
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
      token?: string;
    };

    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.refreshToken).not.toBe(first.refreshToken);
    if (body.token !== undefined) {
      expect(body.token).toBe(body.accessToken);
    }
  });

  test("POST /api/auth/logout returns 204 (LOGOUT-R1)", async ({ request }) => {
    const { refreshToken } = await loginAdmin(request);
    const res = await request.post(`${apiBase()}/api/auth/logout`, {
      data: { refreshToken },
    });
    expect(res.status()).toBe(204);
  });

  test("protected routes reject missing bearer token", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/auth/me`);
    expect(res.status()).toBe(401);
  });
});
