import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("doc-parser API")
    .setDescription("HTTP API for document parsing, extraction, jobs, and customers.")
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "Authorization",
        in: "header",
      },
      "bearer",
    )
    .build();
  return SwaggerModule.createDocument(app, config, { deepScanRoutes: true });
}
