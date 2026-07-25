import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { DataSource } from "typeorm";
import { File, FileType } from "../entities/file.entity";
import { S3Service } from "../s3/s3.service";
import { runWithTenantRls } from "../tenant/run-with-tenant-rls";
import type { CustomerOnboardingData } from "./onboarding-templates/customerOnboarding";

const FILE_REF =
  /^file:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

function parseSignatureFileId(signature: string): string | null {
  const m = FILE_REF.exec(String(signature ?? "").trim());
  return m ? m[1] : null;
}

function cloneOnboarding(data: CustomerOnboardingData): CustomerOnboardingData {
  return JSON.parse(JSON.stringify(data)) as CustomerOnboardingData;
}

function toDataUrl(buf: Buffer, mime: string): string {
  const m = mime.split(";")[0]?.trim() || "image/png";
  return `data:${m};base64,${buf.toString("base64")}`;
}

/**
 * Resolves {@code file:<uuid>} onboarding signature refs to {@code data:image/...} for HTML→PDF,
 * reading from {@code FILE_STORAGE_ROOT} or S3 {@code s3_key} like the staff UI hydration.
 *
 * File lookups run inside {@link runWithTenantRls} so Postgres RLS sees {@code app.customer_id}
 * (background S3 sync has no HTTP {@link RlsTenantInterceptor}).
 */
@Injectable()
export class OnboardingPdfSignatureHydrateService {
  private readonly log = new Logger(OnboardingPdfSignatureHydrateService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly s3: S3Service,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async hydrate(customerId: string, data: CustomerOnboardingData): Promise<CustomerOnboardingData> {
    return runWithTenantRls(this.dataSource, customerId, async (manager) => {
      const fileRepo = manager.getRepository(File);
      const next = cloneOnboarding(data);
      next.signatures.client_registration.signature = await this.resolveOne(
        customerId,
        fileRepo,
        next.signatures.client_registration.signature,
      );
      next.signatures.change_accountant.signature = await this.resolveOne(
        customerId,
        fileRepo,
        next.signatures.change_accountant.signature,
      );
      return next;
    });
  }

  private async resolveOne(
    customerId: string,
    fileRepo: Repository<File>,
    signature: string,
  ): Promise<string> {
    const id = parseSignatureFileId(signature);
    if (!id) {
      return signature;
    }
    const dataUrl = await this.loadFileAsDataUrl(customerId, id, fileRepo);
    return dataUrl ?? signature;
  }

  private async loadFileAsDataUrl(
    customerId: string,
    fileId: string,
    fileRepo: Repository<File>,
  ): Promise<string | null> {
    const row = await fileRepo.findOne({ where: { id: fileId, customerId } });
    if (!row || row.fileType !== FileType.file) {
      this.log.debug(`Signature file row missing: ${fileId} (customer ${customerId})`);
      return null;
    }
    const mime = row.mimeType?.split(";")[0]?.trim() || "image/png";
    const root = this.config.get<string>("FILE_STORAGE_ROOT")?.trim();

    if (row.storageRelativePath?.trim() && root) {
      const custRoot = path.resolve(path.join(root, customerId));
      const abs = path.resolve(path.join(custRoot, row.storageRelativePath));
      if (!abs.startsWith(custRoot + path.sep) && abs !== custRoot) {
        this.log.warn(`Rejected path traversal for signature file ${fileId}`);
        return null;
      }
      try {
        const buf = await fs.readFile(abs);
        return toDataUrl(buf, mime);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`Could not read signature file ${fileId} from disk: ${msg}`);
      }
    }

    if (row.s3Key?.trim() && this.s3.isBucketConfigured()) {
      try {
        const buf = await this.s3.getObjectBufferByKey(row.s3Key.trim());
        return toDataUrl(buf, mime);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`Could not read signature file ${fileId} from S3: ${msg}`);
      }
    }

    return null;
  }
}
