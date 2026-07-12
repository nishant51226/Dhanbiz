import sharp from "sharp";

const JPEG_MIMES = new Set(["image/jpeg", "image/jpg"]);

/** Max raw image bytes sent to vision APIs (JSON body limit; base64 adds ~33%). */
function visionImageMaxBytes(): number {
  const v = Number(process.env.VISION_IMAGE_MAX_BYTES);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 4 * 1024 * 1024;
}

function visionImageMaxEdgePx(): number {
  const v = Number(process.env.VISION_IMAGE_MAX_EDGE_PX);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 4096;
}

function visionJpegQuality(): number {
  const v = Number(process.env.VISION_JPEG_QUALITY);
  return Number.isFinite(v) && v >= 1 && v <= 100 ? Math.floor(v) : 85;
}

/** True when raster JPEG should be normalized before vision OCR. */
export function shouldNormalizeJpegForVision(mimeType: string): boolean {
  return JPEG_MIMES.has(mimeType.trim().toLowerCase());
}

/** @deprecated Use {@link shouldNormalizeJpegForVision}. */
export const shouldConvertJpegToPng = shouldNormalizeJpegForVision;

export type PreparedVisionImage = {
  buffer: Buffer;
  mimeType: string;
  converted: boolean;
  meta?: {
    sourceBytes: number;
    outputBytes: number;
    maxEdgePx: number;
    jpegQuality: number;
  };
};

/**
 * Re-encode JPEG for vision models (EXIF orient, consistent encoding, size cap).
 * Original bytes in S3 / on disk are not modified.
 *
 * PNG is intentionally avoided — lossless conversion can exceed API body limits.
 */
export async function prepareImageForVision(
  buffer: Buffer,
  mimeType: string,
): Promise<PreparedVisionImage> {
  const mime = mimeType.trim().toLowerCase() || "application/octet-stream";
  if (!shouldNormalizeJpegForVision(mime)) {
    return { buffer, mimeType: mime, converted: false };
  }

  const maxBytes = visionImageMaxBytes();
  const maxEdgeCap = visionImageMaxEdgePx();
  const sourceMeta = await sharp(buffer).metadata();
  const sourceLongest = Math.max(sourceMeta.width ?? 0, sourceMeta.height ?? 0);
  let maxEdge =
    sourceLongest > 0 ? Math.min(sourceLongest, maxEdgeCap) : maxEdgeCap;
  let quality = visionJpegQuality();

  for (let attempt = 0; attempt < 10; attempt++) {
    let pipeline = sharp(buffer).rotate();
    if (sourceLongest > maxEdge && maxEdge > 0) {
      pipeline = pipeline.resize(maxEdge, maxEdge, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const out = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= maxBytes) {
      return {
        buffer: out,
        mimeType: "image/jpeg",
        converted: true,
        meta: {
          sourceBytes: buffer.length,
          outputBytes: out.length,
          maxEdgePx: maxEdge,
          jpegQuality: quality,
        },
      };
    }
    if (quality > 55) {
      quality -= 10;
      continue;
    }
    maxEdge = Math.floor(maxEdge * 0.75);
    if (maxEdge < 640) break;
    quality = visionJpegQuality();
  }

  const fallback = await sharp(buffer)
    .rotate()
    .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();

  return {
    buffer: fallback,
    mimeType: "image/jpeg",
    converted: true,
    meta: {
      sourceBytes: buffer.length,
      outputBytes: fallback.length,
      maxEdgePx: 1280,
      jpegQuality: 70,
    },
  };
}
