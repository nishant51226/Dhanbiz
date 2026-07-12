import fs from "node:fs";
import path from "node:path";
import { DataSource } from "typeorm";
import { config as loadEnv } from "dotenv";

type CustomerRow = Record<string, unknown>;

function loadEnvFile(): void {
  const fromDist = path.join(__dirname, "..", "..", ".env");
  const fromSrc = path.join(__dirname, "..", ".env");
  const envPath = fs.existsSync(fromDist) ? fromDist : fromSrc;
  loadEnv({ path: envPath });
}

function parseArgs(argv: string[]): {
  includeDeleted: boolean;
  full: boolean;
  useAppRole: boolean;
  limit: number;
  id?: string;
} {
  const includeDeleted = argv.includes("--include-deleted");
  const full = argv.includes("--full");
  const useAppRole = argv.includes("--app");
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const parsedLimit = limitArg ? Number.parseInt(limitArg.split("=")[1] ?? "", 10) : 100;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100;
  const idArg = argv.find((a) => a.startsWith("--id="));
  const id = idArg?.split("=")[1]?.trim() || undefined;
  return { includeDeleted, full, useAppRole, limit, id };
}

/**
 * Prefer DATABASE_URL_ADMIN for inspection scripts (sees all rows, no RLS session vars).
 * Use --app to connect as DATABASE_URL (customer_app); sets app.is_admin for the session.
 */
function resolveDatabaseUrl(useAppRole: boolean): { url: string; role: "admin" | "app" } {
  const adminUrl = process.env.DATABASE_URL_ADMIN?.trim() || "";
  const appUrl = process.env.DATABASE_URL?.trim() || "";

  if (useAppRole) {
    if (!appUrl) {
      // eslint-disable-next-line no-console
      console.error("Set DATABASE_URL in backend/.env (or omit --app to use DATABASE_URL_ADMIN)");
      process.exit(1);
    }
    return { url: appUrl, role: "app" };
  }

  const url = adminUrl || appUrl;
  if (!url) {
    // eslint-disable-next-line no-console
    console.error("Set DATABASE_URL_ADMIN or DATABASE_URL in backend/.env");
    process.exit(1);
  }
  if (!adminUrl) {
    // eslint-disable-next-line no-console
    console.warn("DATABASE_URL_ADMIN is not set; falling back to DATABASE_URL.");
  }
  return { url, role: adminUrl ? "admin" : "app" };
}

/** Hide password in connection string when printing. */
function redactDatabaseUrl(url: string): string {
  try {
    const u = new URL(url.replace(/^postgres(ql)?:\/\//, "http://"));
    if (u.password) u.password = "****";
    return u.toString().replace(/^http:\/\//, "postgres://");
  } catch {
    return "(invalid url)";
  }
}

function buildWhere(
  includeDeleted: boolean,
  id?: string,
): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (!includeDeleted) {
    parts.push("deleted_at IS NULL");
  }
  if (id) {
    params.push(id);
    parts.push(`id = $${params.length}::uuid`);
  }
  return {
    clause: parts.length > 0 ? parts.join(" AND ") : "TRUE",
    params,
  };
}

async function main(): Promise<void> {
  loadEnvFile();
  const { includeDeleted, full, useAppRole, limit, id } = parseArgs(process.argv.slice(2));
  const { url: dbUrl, role } = resolveDatabaseUrl(useAppRole);

  const columns = [
    "id",
    "name",
    "account_status",
    "annual_turnover_gbp",
    "plan_id",
    "created_at",
    "updated_at",
    "deleted_at",
  ];
  if (full) {
    columns.push("onboarding_data");
  }

  const { clause, params } = buildWhere(includeDeleted, id);
  const limitParamIndex = params.length + 1;
  const listParams = [...params, limit];

  const ds = new DataSource({
    type: "postgres",
    url: dbUrl,
    entities: [],
    synchronize: false,
    extra: {
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    },
  });

  await ds.initialize();

  try {
    if (role === "app") {
      await ds.query(`SELECT set_config('app.is_admin', '1', true)`);
    }

    const listSql = `
      SELECT ${columns.join(", ")}
      FROM customers
      WHERE ${clause}
      ORDER BY created_at DESC
      LIMIT $${limitParamIndex}
    `;
    const customers = await ds.query<CustomerRow>(listSql, listParams);

    const countRows = await ds.query(`SELECT count(*)::int AS n FROM customers WHERE ${clause}`, params);
    const totalMatching =
      (Array.isArray(countRows) ? (countRows[0] as { n?: number } | undefined)?.n : undefined) ?? 0;

    let formSubmissionCount: number | undefined;
    let orphanedSubmissionCount: number | undefined;
    if (totalMatching === 0) {
      const subRows = await ds.query(`SELECT count(*)::int AS n FROM customer_form_submission`);
      formSubmissionCount =
        (Array.isArray(subRows) ? (subRows[0] as { n?: number } | undefined)?.n : undefined) ?? 0;
      if (formSubmissionCount > 0) {
        const orphanRows = await ds.query(`
          SELECT count(*)::int AS n
          FROM customer_form_submission cfs
          LEFT JOIN customers c ON c.id = cfs.customer_id
          WHERE c.id IS NULL
        `);
        orphanedSubmissionCount =
          (Array.isArray(orphanRows) ? (orphanRows[0] as { n?: number } | undefined)?.n : undefined) ??
          0;
      }
    }

    const output: Record<string, unknown> = {
      database: redactDatabaseUrl(dbUrl),
      connectionRole: role,
      totalMatching,
      returned: customers.length,
      customers,
    };

    if (formSubmissionCount !== undefined) {
      output.formSubmissionCount = formSubmissionCount;
    }
    if (orphanedSubmissionCount !== undefined && orphanedSubmissionCount > 0) {
      output.orphanedFormSubmissions = orphanedSubmissionCount;
      output.note =
        "customers is empty but customer_form_submission has rows whose customer_id no longer exists — likely a partial DB restore or manual delete on customers.";
    }

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
