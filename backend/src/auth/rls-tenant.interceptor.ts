import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { DataSource } from "typeorm";
import { Observable, from, firstValueFrom } from "rxjs";
import { runInTransaction } from "typeorm-transactional";
import * as crypto from "node:crypto";

type AuthUser = { userId: string; customerId: string | null; isAdmin: boolean };

function timingSafeEqualString(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Queue mutations run admin SQL + pg-boss; must not hold the HTTP request transaction open. */
function isQueueMutationWithoutRequestTxn(req: Request): boolean {
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "POST") return false;
  const path = String(req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
  return (
    /\/jobs\/[0-9a-f-]{36}\/requeue$/i.test(path) ||
    /\/jobs\/[0-9a-f-]{36}\/cancel$/i.test(path) ||
    /\/documents\/[0-9a-f-]{36}\/requeue-extraction$/i.test(path)
  );
}

@Injectable()
export class RlsTenantInterceptor implements NestInterceptor {
  constructor(private readonly dataSource: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const url = String(req.originalUrl ?? req.url ?? "");
    const secret = process.env.DOCUSEAL_WEBHOOK_SECRET?.trim() ?? "";
    if (url.includes("/webhooks/docuseal")) {
      const method = (req.method ?? "GET").toUpperCase();
      // Browser/curl sanity check without secret; DocuSeal must still POST with the secret header.
      if (method === "GET" || method === "HEAD") {
        return next.handle();
      }
      if (!secret) {
        throw new ForbiddenException("DocuSeal webhook is not configured");
      }
      const headerName = (process.env.DOCUSEAL_WEBHOOK_SECRET_HEADER ?? "x-docuseal-webhook-secret")
        .trim()
        .toLowerCase();
      const headerRaw = req.headers[headerName];
      const provided =
        typeof headerRaw === "string" ? headerRaw : Array.isArray(headerRaw) ? headerRaw[0] ?? "" : "";
      if (!timingSafeEqualString(provided, secret)) {
        throw new ForbiddenException("Invalid DocuSeal webhook secret");
      }
      return from(
        runInTransaction(async () => {
          await this.dataSource.query("SELECT set_config('app.is_admin', $1, true)", ["1"]);
          await this.dataSource.query("SELECT set_config('app.customer_id', $1, true)", [""]);
          await this.dataSource.query("SELECT set_config('app.user_id', $1, true)", [""]);
          return await firstValueFrom(next.handle());
        }),
      );
    }

    const user = req.user;
    const isAdmin = user?.isAdmin ? "1" : "0";
    const customerId = user?.customerId ?? "";
    const userId = user?.userId ?? "";
    if (isQueueMutationWithoutRequestTxn(req)) {
      return next.handle();
    }
    return from(
      runInTransaction(async () => {
        await this.dataSource.query("SELECT set_config('app.is_admin', $1, true)", [isAdmin]);
        await this.dataSource.query("SELECT set_config('app.customer_id', $1, true)", [customerId]);
        await this.dataSource.query("SELECT set_config('app.user_id', $1, true)", [userId]);
        return await firstValueFrom(next.handle());
      }),
    );
  }
}
