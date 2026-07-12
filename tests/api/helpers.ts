import { expect, type APIRequestContext } from "@playwright/test";

export function apiBase(): string {
  return (process.env.API_BASE ?? "http://127.0.0.1:3009").replace(
    "://localhost",
    "://127.0.0.1"
  );
}

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  token?: string;
};

export async function loginAdmin(request: APIRequestContext): Promise<TokenPair> {
  const res = await request.post(`${apiBase()}/api/auth/login`, {
    data: {
      email: process.env.ADMIN_EMAIL ?? "admin@example.com",
      password: process.env.ADMIN_PASSWORD ?? "change-me",
    },
  });
  if (!res.ok()) {
    throw new Error(`Admin login failed (${res.status()}): ${await res.text()}`);
  }
  const body = (await res.json()) as TokenPair;
  if (!body.accessToken || !body.refreshToken) {
    throw new Error("Login response missing accessToken or refreshToken");
  }
  return body;
}

export function bearerHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Nestjsx CRUD may return a bare array or `{ data, total|count }` — mirror frontend `crudListData`. */
export function expectCrudListBody(body: unknown): void {
  if (Array.isArray(body)) {
    expect(body.length).toBeGreaterThanOrEqual(0);
    return;
  }
  expect(body).toBeTruthy();
  expect(typeof body).toBe("object");
  const record = body as { data?: unknown; total?: number; count?: number };
  expect(Array.isArray(record.data)).toBe(true);
  const total = record.total ?? record.count;
  expect(typeof total).toBe("number");
}
