import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  RequestChecksumCalculation,
  ResponseChecksumValidation,
} from "@aws-sdk/middleware-flexible-checksums";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** What you get back from {@link S3Service.getPresignedGetUrlForCustomer}: the signed URL plus the exact S3 object key. */
export type CustomerPresignedGetResult = {
  url: string;
  fileKey: string;
};

export type CustomerPresignedPutResult = {
  url: string;
  fileKey: string;
};

/**
 * Single place for customer-scoped S3 keys: `{customerId}/{folder}/{key}`.
 * Use {@link uploadCustomerFile}, {@link deleteCustomerFile}, {@link getCustomerDownloadUrl} from feature code;
 * {@link putCustomerFile} remains for arbitrary paths under the customer prefix when needed.
 */
@Injectable()
export class S3Service {
  private readonly log = new Logger(S3Service.name);
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>("S3_AWS_REGION")?.trim() || "eu-west-2";
    const endpoint = this.config.get<string>("AWS_S3_ENDPOINT")?.trim();
    const forcePathStyle =
      this.config.get<string>("AWS_S3_FORCE_PATH_STYLE") === "true" ||
      this.config.get<string>("AWS_S3_FORCE_PATH_STYLE") === "1";

    const accessKeyId = this.config.get<string>("S3_AWS_ACCESS_KEY_ID")?.trim();
    const secretAccessKey = this.config.get<string>("S3_AWS_SECRET_ACCESS_KEY")?.trim();
    let credentials: { accessKeyId: string; secretAccessKey: string } | undefined;
    if (accessKeyId && secretAccessKey) {
      credentials = { accessKeyId, secretAccessKey };
    } else if (accessKeyId || secretAccessKey) {
      this.log.warn(
        "S3_AWS_ACCESS_KEY_ID and S3_AWS_SECRET_ACCESS_KEY must both be set to use static credentials; falling back to the default AWS credential chain for this client.",
      );
    }

    // Default SDK behavior (WHEN_SUPPORTED) injects CRC32 into presigned PutObject URLs; browsers then
    // PUT without matching checksum trailers → 400. Only add checksums when S3 models them as required.
    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle } : {}),
      ...(credentials ? { credentials } : {}),
      requestChecksumCalculation: RequestChecksumCalculation.WHEN_REQUIRED,
      responseChecksumValidation: ResponseChecksumValidation.WHEN_REQUIRED,
    });
  }

  private bucketName(): string | undefined {
    return this.config.get<string>("S3_AWS_BUCKET")?.trim() || undefined;
  }

  /** True when `S3_AWS_BUCKET` is set (PutObject / presigned GET / delete are allowed). */
  isBucketConfigured(): boolean {
    return Boolean(this.bucketName());
  }

  private resolveBucketAndFileKey(customerId: string, objectPath: string): { bucket: string; fileKey: string } {
    const bucket = this.bucketName();
    if (!bucket) {
      throw new ServiceUnavailableException("S3_AWS_BUCKET is not set.");
    }

    const id = customerId.trim();
    const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!uuidOk) {
      throw new BadRequestException("Invalid customer id.");
    }

    let pathInsideCustomer = objectPath.trim().replace(/^\/+/u, "");
    if (!pathInsideCustomer) {
      throw new BadRequestException("objectPath is required.");
    }
    if (pathInsideCustomer.includes("..")) {
      throw new BadRequestException("Invalid objectPath.");
    }
    for (const seg of pathInsideCustomer.split("/")) {
      if (seg === "." || seg === "..") {
        throw new BadRequestException("Invalid objectPath.");
      }
    }

    const fileKey = `${id}/${pathInsideCustomer}`;
    return { bucket, fileKey };
  }

  /** `{folder}/{key}` under the customer prefix (both trimmed; key may contain subdirs, e.g. `documents/a.pdf`). */
  private folderKeyToObjectPath(folder: string, key: string): string {
    const f = folder.trim().replace(/^\/+|\/+$/g, "");
    const k = key.trim().replace(/^\/+/u, "");
    if (!f || !k) {
      throw new BadRequestException("folder and key are required.");
    }
    return this.assertSafeRelativePath(`${f}/${k}`);
  }

  private assertSafeRelativePath(objectPath: string): string {
    if (objectPath.includes("..")) {
      throw new BadRequestException("Invalid path.");
    }
    for (const seg of objectPath.split("/")) {
      if (seg === "." || seg === "..") {
        throw new BadRequestException("Invalid path.");
      }
    }
    return objectPath;
  }

  /**
   * Upload bytes for one customer object: S3 key `{customerId}/{folder}/{key}`.
   * Typical folders: `onboarding-files`, `invoices`, `statements`, `files`.
   */
  async uploadCustomerFile(params: {
    customerId: string;
    folder: string;
    key: string;
    body: Buffer | Uint8Array;
    contentType?: string;
  }): Promise<{ fileKey: string }> {
    const objectPath = this.folderKeyToObjectPath(params.folder, params.key);
    return this.putCustomerFile({
      customerId: params.customerId,
      objectPath,
      body: params.body,
      contentType: params.contentType,
    });
  }

  /** Delete one object under `{customerId}/{folder}/{key}`. */
  async deleteCustomerFile(params: { customerId: string; folder: string; key: string }): Promise<void> {
    const objectPath = this.folderKeyToObjectPath(params.folder, params.key);
    const { bucket, fileKey } = this.resolveBucketAndFileKey(params.customerId, objectPath);
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileKey }));
  }

  /** Browser / client PUT upload without sending bytes through the API. Client must send `Content-Type` exactly as given. */
  async getPresignedPutUrlForCustomer(params: {
    customerId: string;
    folder: string;
    key: string;
    contentType: string;
    expiresInSec?: number;
  }): Promise<CustomerPresignedPutResult> {
    const objectPath = this.folderKeyToObjectPath(params.folder, params.key);
    const { bucket, fileKey } = this.resolveBucketAndFileKey(params.customerId, objectPath);
    const expiresIn = Math.min(Math.max(60, params.expiresInSec ?? 900), 86400);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      ContentType: params.contentType,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return { url, fileKey };
  }

  /** Returns size when the object exists; otherwise `null`. */
  async headObjectByKey(fileKey: string): Promise<{ contentLength: number; contentType?: string } | null> {
    const bucket = this.bucketName();
    if (!bucket) {
      return null;
    }
    const key = fileKey.trim();
    if (!key || key.includes("..")) {
      return null;
    }
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        contentLength: Number(out.ContentLength ?? 0),
        contentType: out.ContentType ?? undefined,
      };
    } catch {
      return null;
    }
  }

  /** Presigned GET for `{customerId}/{folder}/{key}`. */
  async getCustomerDownloadUrl(params: {
    customerId: string;
    folder: string;
    key: string;
    expiresInSec?: number;
  }): Promise<CustomerPresignedGetResult> {
    const objectPath = this.folderKeyToObjectPath(params.folder, params.key);
    return this.getPresignedGetUrlForCustomer(
      params.customerId,
      objectPath,
      params.expiresInSec ?? 3600,
    );
  }

  /** Low-level: any path under the customer id (use {@link uploadCustomerFile} when you have folder + key). */
  async putCustomerFile(params: {
    customerId: string;
    objectPath: string;
    body: Buffer | Uint8Array;
    contentType?: string;
  }): Promise<{ fileKey: string }> {
    const { bucket, fileKey } = this.resolveBucketAndFileKey(params.customerId, params.objectPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
    return { fileKey };
  }

  /** Presigned GET for an arbitrary path under the customer id. */
  async getPresignedGetUrlForCustomer(
    customerId: string,
    objectPath: string,
    expiresInSec = 3600,
  ): Promise<CustomerPresignedGetResult> {
    const { bucket, fileKey } = this.resolveBucketAndFileKey(customerId, objectPath);
    const expiresIn = Math.min(Math.max(60, expiresInSec), 86400);
    const command = new GetObjectCommand({ Bucket: bucket, Key: fileKey });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return { url, fileKey };
  }

  /**
   * Presigned GET using the full S3 object key stored on `files.s3_key` after upload.
   * The key must start with `{customerId}/` so callers cannot sign paths outside that tenant prefix.
   */
  async getPresignedUrlForCustomerScopedObjectKey(params: {
    customerId: string;
    s3ObjectKey: string;
    expiresInSec?: number;
  }): Promise<CustomerPresignedGetResult> {
    const id = params.customerId.trim();
    const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!uuidOk) {
      throw new BadRequestException("Invalid customer id.");
    }
    const key = params.s3ObjectKey.trim();
    const prefix = `${id}/`;
    if (!key.startsWith(prefix)) {
      throw new BadRequestException("S3 key is not under this customer prefix.");
    }
    if (key.includes("..")) {
      throw new BadRequestException("Invalid S3 key.");
    }
    const bucket = this.bucketName();
    if (!bucket) {
      throw new ServiceUnavailableException("S3_AWS_BUCKET is not set.");
    }
    const expiresIn = Math.min(Math.max(60, params.expiresInSec ?? 3600), 86400);
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return { url, fileKey: key };
  }

  /** Load object bytes by full S3 object key (must exist in the configured bucket). */
  async getObjectBufferByKey(fileKey: string): Promise<Buffer> {
    const bucket = this.bucketName();
    if (!bucket) {
      throw new ServiceUnavailableException("S3_AWS_BUCKET is not set.");
    }
    const key = fileKey.trim();
    if (!key || key.includes("..")) {
      throw new BadRequestException("Invalid S3 key.");
    }
    const out = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = out.Body;
    if (!body) {
      throw new NotFoundException("S3 object has no body.");
    }
    const arr = await body.transformToByteArray();
    return Buffer.from(arr);
  }

  /** Upload bytes to an arbitrary bucket key (staff library exports, etc.). */
  async putObjectByKey(params: {
    fileKey: string;
    body: Buffer | Uint8Array;
    contentType?: string;
  }): Promise<{ fileKey: string }> {
    const bucket = this.bucketName();
    if (!bucket) {
      throw new ServiceUnavailableException("S3_AWS_BUCKET is not set.");
    }
    const key = params.fileKey.trim();
    if (!key || key.includes("..")) {
      throw new BadRequestException("Invalid S3 key.");
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
    return { fileKey: key };
  }

  /** Presigned GET for any object key in the configured bucket. */
  async getPresignedGetUrlByKey(
    fileKey: string,
    expiresInSec = 3600,
    downloadFileName?: string,
    disposition: "inline" | "attachment" = "attachment",
  ): Promise<CustomerPresignedGetResult> {
    const bucket = this.bucketName();
    if (!bucket) {
      throw new ServiceUnavailableException("S3_AWS_BUCKET is not set.");
    }
    const key = fileKey.trim();
    if (!key || key.includes("..")) {
      throw new BadRequestException("Invalid S3 key.");
    }
    const expiresIn = Math.min(Math.max(60, expiresInSec), 86400);
    const trimmedName = downloadFileName?.trim();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(trimmedName
        ? {
            ResponseContentDisposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(trimmedName)}`,
          }
        : {}),
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return { url, fileKey: key };
  }
}
