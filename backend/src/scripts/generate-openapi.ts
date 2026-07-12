import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";
import {
  addTransactionalDataSource,
  initializeTransactionalContext,
  StorageDriver,
} from "typeorm-transactional";
import { AppModule } from "../app.module";
import { createOpenApiDocument } from "../swagger-document";

loadEnv();

async function main() {
  const root = process.env.FILE_STORAGE_ROOT;
  if (root) {
    await fs.mkdir(root, { recursive: true });
  }

  initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
  const ds = app.get(DataSource);
  addTransactionalDataSource(ds);
  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });

  const document = createOpenApiDocument(app);
  const outPath = process.env.OPENAPI_OUTPUT?.trim()
    ? path.resolve(process.env.OPENAPI_OUTPUT.trim())
    : path.resolve(process.cwd(), "openapi", "openapi.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(document, null, 2), "utf-8");
  // eslint-disable-next-line no-console
  console.log("Wrote OpenAPI document:", outPath);

  await app.close();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
