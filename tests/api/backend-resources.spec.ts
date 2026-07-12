import { test, expect } from "@playwright/test";
import { apiBase, bearerHeaders, expectCrudListBody, loginAdmin } from "./helpers";

test.describe("Backend resource API regression", () => {
  test.describe.configure({ mode: "serial" });

  let accessToken: string;

  test.beforeAll(async ({ request }) => {
    const pair = await loginAdmin(request);
    accessToken = pair.accessToken;
  });

  test("GET /api/customers returns list (CUSTOMERS-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/customers`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    expectCrudListBody(await res.json());
  });

  test("GET /api/customers?page=1&limit=10 returns paginated shape (CUSTOMERS-R2)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/customers?page=1&limit=10`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = (await res.json()) as { data?: unknown[]; total?: number; count?: number };
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof (body.total ?? body.count)).toBe("number");
  });

  test("GET /api/jobs/counts-by-status returns status buckets (JOBS-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/jobs/counts-by-status`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = (await res.json()) as {
      queued?: number;
      processing?: number;
      completed?: number;
      failed?: number;
      cancelled?: number;
      total?: number;
    };

    for (const key of ["queued", "processing", "completed", "failed", "cancelled", "total"] as const) {
      expect(typeof body[key]).toBe("number");
    }
  });

  test("GET /api/jobs returns paginated list (JOBS-LIST-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/jobs`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = await res.json();
    expectCrudListBody(body);
  });

  test("GET /api/files returns list (FILES-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/files`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    expectCrudListBody(await res.json());
  });

  test("GET /api/subscription-plans returns array (PLANS-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/subscription-plans`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/admin/roles/permission-catalog returns entries (ROLES-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/admin/roles/permission-catalog`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = (await res.json()) as {
      entries?: Array<{ id?: string; label?: string; group?: string }>;
    };
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries!.length).toBeGreaterThan(0);
    expect(typeof body.entries![0].id).toBe("string");
    expect(typeof body.entries![0].label).toBe("string");
  });

  test("GET /api/admin/roles returns role list (ROLES-LIST-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/admin/roles`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/config/extract returns extraction defaults (CONFIG-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/config/extract`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
  });

  test("GET /api/customers without token returns 401", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/customers`);
    expect(res.status()).toBe(401);
  });
});
