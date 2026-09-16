/**
 * Media content validation.
 *
 * A downloaded file is only a success when it passes: content-type check,
 * magic-byte signature check, and non-zero size. This prevents HTML error
 * pages and truncated responses from masquerading as media.
 */

import { AppError } from "../../util/errors.js";

/**
 * Image/video magic-byte signatures (first bytes of the buffer).
 * @type {Array<{ type: string, test: (b: Buffer) => boolean }>}
 */
const SIGNATURES = [
  { type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/png",
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { type: "image/gif", test: (b) => b.subarray(0, 3).toString("ascii") === "GIF" },
  {
    type: "image/webp",
    test: (b) =>
      b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  {
    type: "image/bmp",
    test: (b) => b[0] === 0x42 && b[1] === 0x4d,
  },
  {
    type: "video/mp4",
    test: (b) => {
      // ISO-BMFF: bytes 4-7 are 'ftyp' (mp4/m4v/cmfv all use ftyp boxes)
      return b.subarray(4, 8).toString("ascii") === "ftyp";
    },
  },
  {
    type: "video/webm",
    test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
  {
    type: "video/quicktime",
    test: (b) => b.subarray(4, 8).toString("ascii") === "wide" || b.subarray(4, 8).toString("ascii") === "moov",
  },
];

/**
 * Detect media type from buffer magic bytes.
 * @param {Buffer} head
 * @returns {string|null}
 */
export function detectMediaType(head) {
  for (const sig of SIGNATURES) {
    if (sig.test(head)) return sig.type;
  }
  return null;
}

/** Base "media" super-type for a detected/declared type. */
export function mediaSuperType(type) {
  if (!type) return null;
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/") || type === "application/octet-stream") return "video";
  return null;
}

/**
 * Validate response headers before writing anything.
 * @param {{ status: number, headers: Record<string,string>, expect: "image"|"video" }} p
 * @throws {AppError} E_DOWNLOAD with reasons
 */
export function validateResponseHeaders({ status, headers, expect }) {
  if (status !== 200) {
    throw new AppError("E_DOWNLOAD", `HTTP ${status} while downloading media`);
  }
  const contentType = String(headers["content-type"] ?? "").toLowerCase();
  if (contentType.includes("text/html") || contentType.includes("application/xml") || contentType.includes("text/plain")) {
    throw new AppError("E_DOWNLOAD", `server returned ${contentType} instead of media`);
  }
  const superType = mediaSuperType(contentType);
  if (superType && superType !== expect) {
    throw new AppError("E_DOWNLOAD", `expected ${expect} but server declared ${contentType}`);
  }
  const len = Number(headers["content-length"]);
  if (Number.isFinite(len) && len === 0) {
    throw new AppError("E_DOWNLOAD", "server returned an empty body (content-length: 0)");
  }
}

/**
 * Validate a downloaded head buffer against the expectation.
 * @param {{ head: Buffer, contentType?: string, bytesWritten: number, expect: "image"|"video", minBytes?: number }} p
 * @throws {AppError} E_VALIDATION_FAILED
 */
export function validateDownloadedContent({ head, contentType, bytesWritten, expect, minBytes = 256 }) {
  if (bytesWritten === 0) {
    throw new AppError("E_VALIDATION_FAILED", "downloaded 0 bytes");
  }

  const detected = detectMediaType(head);

  // HTML error pages are the classic false-success: refuse them always.
  const headAscii = head.subarray(0, 256).toString("ascii").toLowerCase();
  if (headAscii.trimStart().startsWith("<!doctype") || headAscii.includes("<html")) {
    throw new AppError("E_VALIDATION_FAILED", "downloaded content is an HTML page, not media");
  }

  if (detected) {
    const superType = mediaSuperType(detected);
    if (superType !== expect) {
      throw new AppError(
        "E_VALIDATION_FAILED",
        `content signature says ${detected} but expected ${expect}`,
      );
    }
    return detected;
  }

  // Unknown signature: trust declared content-type only if it is media-ish
  const declared = mediaSuperType(contentType);
  if (declared === expect) return contentType;
  if (declared && declared !== expect) {
    throw new AppError(
      "E_VALIDATION_FAILED",
      `content-type ${contentType} does not match expected ${expect}`,
    );
  }

  // Cannot determine type at all — fail closed for images, tolerate for videos
  // (video containers are more varied; images always have known signatures).
  if (expect === "image") {
    throw new AppError("E_VALIDATION_FAILED", "unrecognized image signature");
  }
  if (bytesWritten < minBytes) {
    throw new AppError("E_VALIDATION_FAILED", `file too small (${bytesWritten} bytes) to be valid media`);
  }
  return contentType ?? "video/unknown";
}
