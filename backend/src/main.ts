import "reflect-metadata";
import {
  addTransactionalDataSource,
  initializeTransactionalContext,
  StorageDriver,
} from "typeorm-transactional";
import { DataSource } from "typeorm";
import * as fs from "node:fs/promises";
import { RequestMethod } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { createOpenApiDocument } from "./swagger-document";

// Pings the client every 15 s so upstream proxies don't close idle WebSocket connections.
// Default Socket.IO pingInterval is 25 s, which exceeds common proxy idle timeouts (20–30 s).
class KeepAliveIoAdapter extends IoAdapter {
  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      pingInterval: 15000,
      pingTimeout: 10000,
    });
  }
}

async function bootstrap() {
  console.log("[bootstrap] Starting — Node", process.version, "| NODE_ENV:", process.env.NODE_ENV ?? "unset");
  console.log("[bootstrap] PORT:", process.env.PORT ?? "3000 (default)");
  console.log("[bootstrap] DATABASE_URL set:", !!process.env.DATABASE_URL);
  console.log("[bootstrap] AI_PROVIDER_DEFAULT:", process.env.AI_PROVIDER_DEFAULT ?? "unset");

  // AsyncLocalStorage (AUTO on Node 16+) keeps the transactional EntityManager across awaits /
  // RxJS (e.g. RlsTenantInterceptor + firstValueFrom); cls-hooked can drop it so RLS GUCs and
  // INSERTs ran on different connections.
  initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });

  const root = process.env.FILE_STORAGE_ROOT;
  if (root) {
    console.log("[bootstrap] Ensuring FILE_STORAGE_ROOT:", root);
    await fs.mkdir(root, { recursive: true });
  }

  console.log("[bootstrap] Creating Nest application…");
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  console.log("[bootstrap] Nest application created");

  app.useWebSocketAdapter(new KeepAliveIoAdapter(app));
  // Register the Nest-managed DataSource with transactional context
  const ds = app.get(DataSource);
  addTransactionalDataSource(ds);
  console.log("[bootstrap] DataSource registered with transactional context");

  // Onboarding autosave PATCH carries the entire form (including up to 4 ~30-60 kB base64
  // signature data URLs before they are uploaded as files at finalisation), so Express's
  // default 100 kB JSON limit gets exceeded mid-wizard and the client sees 413.
  app.useBodyParser("json", { limit: "5mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "5mb" });
  const defaultAllowedOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const envAllowedOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  for (const origin of envAllowedOrigins) defaultAllowedOrigins.add(origin);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. curl/Postman) without Origin header.
      if (!origin) return callback(null, true);
      return callback(null, defaultAllowedOrigins.has(origin));
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "x-docuseal-webhook-secret"],
  });
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });

  // DocuSeal / docs sometimes use /webhooks/docuseal without /api; Nest registers /api/webhooks/docuseal only.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use((req: Request, _res: Response, next: NextFunction) => {
    const raw = typeof req.originalUrl === "string" ? req.originalUrl : req.url ?? "";
    if (/^\/webhooks\/docuseal(\/|\?|$)/.test(raw)) {
      req.url = "/api/webhooks/docuseal" + raw.replace(/^\/webhooks\/docuseal/, "");
    }
    next();
  });

  console.log("[bootstrap] Setting up Swagger…");
  const openApiDocument = createOpenApiDocument(app);
  SwaggerModule.setup("docs", app, openApiDocument, {
    useGlobalPrefix: true,
    jsonDocumentUrl: "docs-json",
  });

  const port = Number(process.env.PORT) || 3000;
  console.log("[bootstrap] Listening on port", port);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log("App started on port", port);
  // eslint-disable-next-line no-console
  console.log(
    `DocuSeal webhook URL (POST + x-docuseal-webhook-secret): http://127.0.0.1:${port}/api/webhooks/docuseal`,
  );
  // eslint-disable-next-line no-console
  console.log(
    "If DocuSeal runs in Docker, use host.docker.internal (Win/Mac) or your LAN IP instead of localhost so webhooks can reach this API.",
  );
}

bootstrap().catch((err) => {
  console.error("[bootstrap] FATAL — process will exit:", err);
  process.exit(1);
});
