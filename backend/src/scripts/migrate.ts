import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import { DataSource } from "typeorm";
import { config as loadEnv } from "dotenv";
import { typeormMigrations } from "../typeorm-migrations.registry";

function loadMigrationEnv(): void {
  const fromDist = path.join(__dirname, "..", "..", ".env");
  const fromSrc = path.join(__dirname, "..", ".env");
  const envPath = fs.existsSync(fromDist) ? fromDist : fromSrc;
  loadEnv({ path: envPath });
}

async function main() {
  loadMigrationEnv();
  // eslint-disable-next-line no-console
  console.log("[migrate] Starting migration runner — Node", process.version);

  const adminUrl = process.env.DATABASE_URL_ADMIN || "";
  const appUrl = process.env.DATABASE_URL || "";
  // eslint-disable-next-line no-console
  console.log("[migrate] DATABASE_URL_ADMIN set:", !!adminUrl, "| DATABASE_URL set:", !!appUrl);

  if (!adminUrl && !appUrl) {
    // eslint-disable-next-line no-console
    console.error("[migrate] FATAL: DATABASE_URL_ADMIN or DATABASE_URL is required to run migrations");
    process.exit(1);
  }
  const url = adminUrl || appUrl;
  if (!adminUrl) {
    // eslint-disable-next-line no-console
    console.warn("[migrate] DATABASE_URL_ADMIN is not set; falling back to DATABASE_URL for migrations.");
  }

  // Mask credentials for safe logging
  const safeUrl = url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
  // eslint-disable-next-line no-console
  console.log("[migrate] Connecting to:", safeUrl);

  const migrationDs = new DataSource({
    type: "postgres",
    url,
    entities: ["dist/entities/*.js"],
    migrations: typeormMigrations,
    synchronize: false,
    migrationsRun: false,
    extra: {
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    },
  });

  // eslint-disable-next-line no-console
  console.log("[migrate] Initializing DataSource…");
  await migrationDs.initialize();
  // eslint-disable-next-line no-console
  console.log("[migrate] DataSource initialized. Running pending migrations…");

  try {
    const results = await migrationDs.runMigrations();
    // eslint-disable-next-line no-console
    console.log(`[migrate] Done — ran ${results.length} migration(s).`);
    for (const m of results) {
      // eslint-disable-next-line no-console
      console.log("[migrate]  ✓", m.name);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[migrate] Migration failed:", err);
    throw err;
  } finally {
    await migrationDs.destroy();
  }
}

if (require.main === module) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[migrate] FATAL — process will exit:", e);
    process.exit(1);
  });
}
