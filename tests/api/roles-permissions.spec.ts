import { test, expect } from "@playwright/test";
import { apiBase, bearerHeaders, loginAdmin } from "./helpers";

/** Spot-check keys that must stay in the permission catalog (ROLES-CATALOG-R1). */
const REQUIRED_CATALOG_IDS = [
  "customer:read",
  "customer:write",
  "dashboard:read",
  "job:read",
  "job:create",
  "portal:file:read",
  "portal:dashboard:read",
  "admin_role:read",
  "admin_role:write",
  "subscription_plan:read",
] as const;

type AdminRoleDto = {
  id: string;
  name: string;
  roleType: "staff" | "portal";
  isSystem: boolean;
  description: string | null;
  permissions: string[];
  assignedUserCount: number;
};

function expectRoleShape(role: AdminRoleDto): void {
  expect(typeof role.id).toBe("string");
  expect(typeof role.name).toBe("string");
  expect(["staff", "portal"]).toContain(role.roleType);
  expect(typeof role.isSystem).toBe("boolean");
  expect(Array.isArray(role.permissions)).toBe(true);
  expect(typeof role.assignedUserCount).toBe("number");
}

test.describe("Roles & permissions API regression", () => {
  test.describe.configure({ mode: "serial" });

  let accessToken: string;
  let createdRoleId: string | null = null;
  const testRoleName = `qa_role_${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    const pair = await loginAdmin(request);
    accessToken = pair.accessToken;
  });

  test.afterAll(async ({ request }) => {
    if (!createdRoleId) return;
    const res = await request.delete(`${apiBase()}/api/admin/roles/${createdRoleId}`, {
      headers: bearerHeaders(accessToken),
    });
    expect([200, 204, 404]).toContain(res.status());
  });

  test("GET permission-catalog returns full entry shape (ROLES-CATALOG-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/admin/roles/permission-catalog`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = (await res.json()) as {
      entries?: Array<{ id: string; label: string; group: string }>;
    };
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries!.length).toBeGreaterThan(20);

    for (const entry of body.entries!) {
      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.group).toBe("string");
    }

    const ids = new Set(body.entries!.map((e) => e.id));
    for (const required of REQUIRED_CATALOG_IDS) {
      expect(ids.has(required), `catalog missing ${required}`).toBe(true);
    }

    const portalKeys = body.entries!.filter((e) => e.id.startsWith("portal:"));
    const staffKeys = body.entries!.filter((e) => !e.id.startsWith("portal:"));
    expect(portalKeys.length).toBeGreaterThan(5);
    expect(staffKeys.length).toBeGreaterThan(5);
  });

  test("GET /api/admin/roles returns role rows with assignment counts (ROLES-LIST-R2)", async ({
    request,
  }) => {
    const res = await request.get(`${apiBase()}/api/admin/roles`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = (await res.json()) as AdminRoleDto[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const role of body) {
      expectRoleShape(role);
    }
  });

  test("GET /api/admin/roles?role_type=staff filters staff roles (ROLES-FILTER-R1)", async ({
    request,
  }) => {
    const res = await request.get(`${apiBase()}/api/admin/roles?role_type=staff`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = (await res.json()) as AdminRoleDto[];
    expect(body.length).toBeGreaterThan(0);
    for (const role of body) {
      expect(role.roleType).toBe("staff");
    }
  });

  test("GET /api/admin/roles?role_type=portal filters portal roles (ROLES-FILTER-R2)", async ({
    request,
  }) => {
    const res = await request.get(`${apiBase()}/api/admin/roles?role_type=portal`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = (await res.json()) as AdminRoleDto[];
    expect(body.length).toBeGreaterThan(0);
    for (const role of body) {
      expect(role.roleType).toBe("portal");
    }
  });

  test("POST create → GET → PATCH → DELETE custom role lifecycle (ROLES-CRUD-R1)", async ({
    request,
  }) => {
    const createRes = await request.post(`${apiBase()}/api/admin/roles`, {
      headers: bearerHeaders(accessToken),
      data: {
        name: testRoleName,
        roleType: "staff",
        description: "Playwright regression role",
        permissions: ["customer:read", "job:read"],
      },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const created = (await createRes.json()) as AdminRoleDto;
    expectRoleShape(created);
    expect(created.name).toBe(testRoleName);
    expect(created.isSystem).toBe(false);
    expect(created.permissions).toEqual(expect.arrayContaining(["customer:read", "job:read"]));
    createdRoleId = created.id;

    const getRes = await request.get(`${apiBase()}/api/admin/roles/${created.id}`, {
      headers: bearerHeaders(accessToken),
    });
    expect(getRes.ok(), await getRes.text()).toBeTruthy();
    const fetched = (await getRes.json()) as AdminRoleDto;
    expect(fetched.id).toBe(created.id);
    expect(fetched.permissions).toEqual(expect.arrayContaining(["customer:read", "job:read"]));

    const patchRes = await request.patch(`${apiBase()}/api/admin/roles/${created.id}`, {
      headers: bearerHeaders(accessToken),
      data: {
        permissions: ["customer:read", "job:read", "dashboard:read"],
        description: "Updated by regression test",
      },
    });
    expect(patchRes.ok(), await patchRes.text()).toBeTruthy();
    const updated = (await patchRes.json()) as AdminRoleDto;
    expect(updated.permissions).toEqual(
      expect.arrayContaining(["customer:read", "job:read", "dashboard:read"]),
    );

    const deleteRes = await request.delete(`${apiBase()}/api/admin/roles/${created.id}`, {
      headers: bearerHeaders(accessToken),
    });
    expect(deleteRes.ok(), await deleteRes.text()).toBeTruthy();
    createdRoleId = null;

    const goneRes = await request.get(`${apiBase()}/api/admin/roles/${created.id}`, {
      headers: bearerHeaders(accessToken),
    });
    expect(goneRes.status()).toBe(404);
  });

  test("GET /api/auth/me includes permissions for superadmin (ME-PERMS-R1)", async ({ request }) => {
    const res = await request.get(`${apiBase()}/api/auth/me`, {
      headers: bearerHeaders(accessToken),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const body = (await res.json()) as {
      isAdmin?: boolean;
      permissions?: string[];
      roles?: string[];
    };
    expect(body.isAdmin).toBe(true);
    expect(Array.isArray(body.permissions)).toBe(true);
    expect(Array.isArray(body.roles)).toBe(true);
  });

  test("admin roles endpoints reject unauthenticated callers (ROLES-AUTH-R1)", async ({
    request,
  }) => {
    for (const path of ["/api/admin/roles", "/api/admin/roles/permission-catalog"]) {
      const res = await request.get(`${apiBase()}${path}`);
      expect(res.status(), path).toBe(401);
    }
  });
});
