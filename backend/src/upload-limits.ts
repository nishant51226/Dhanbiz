/** Default max upload size (multipart and presigned S3) — 100 MiB. */
export const DEFAULT_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

export function uploadMaxBytes(): number {
  const n = Number(process.env.UPLOAD_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_UPLOAD_MAX_BYTES;
}

/** Max size for `POST …/upload-s3/init` and batch-init (direct-to-S3). */
export function presignedUploadMaxBytes(): number {
  const n = Number(process.env.PRESIGNED_UPLOAD_MAX_BYTES);
  if (Number.isFinite(n) && n > 0) {
    return n;
  }
  return DEFAULT_UPLOAD_MAX_BYTES;
}
