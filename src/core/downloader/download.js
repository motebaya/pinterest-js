/**
 * Hardened media downloader.
 *
 * Pipeline: request (bounded retries) → stream to <final>.part →
 * validate headers + magic bytes + size → atomic rename → result.
 * Failed downloads never leave a corrupt file at the final path.
 */

import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import progress from "cli-progress";
import chalk from "chalk";

import { USER_AGENT } from "../../config/urls.js";
import { humanSize } from "../../util/format.js";
import { ensureDir, sanitizeFilename, atomicMove, removeFile } from "../../util/fs.js";
import { AppError, asAppError } from "../../util/errors.js";
import { validateResponseHeaders, validateDownloadedContent } from "./validate.js";

export const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;

/**
 * Decide whether an HTTP/transport error is retryable.
 * @param {AppError} err
 * @returns {boolean}
 */
function isRetryable(err) {
  const msg = err.message ?? "";
  return (
    err.code === "E_TIMEOUT" ||
    err.code === "E_NETWORK" ||
    /timed out|no response|ECONNRESET|ECONNABORTED|EAI_AGAIN|socket hang up/i.test(msg) ||
    /HTTP 429|HTTP 5\d\d/.test(msg)
  );
}

/**
 * Filename extension for the expected media type.
 * @param {"image"|"video"} expect
 * @param {string} url
 * @returns {string}
 */
function deriveExtension(expect, url) {
  const tail = url.split("?")[0].split("/").pop() ?? "";
  const ext = path.extname(tail).toLowerCase();
  const okExt =
    expect === "image"
      ? [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]
      : [".mp4", ".m4v", ".webm", ".mov"];
  if (okExt.includes(ext)) return ext;
  return expect === "image" ? ".jpg" : ".mp4";
}

/**
 * Download one media URL into <outputDir>/<filename>.
 *
 * @param {object} p
 * @param {string} p.url media URL
 * @param {"image"|"video"} p.expect expected media super-type
 * @param {string} p.outputDir absolute directory
 * @param {string} [p.filename] defaults to URL tail (+ safe extension)
 * @param {boolean} [p.overwrite=false]
 * @param {object} [p.log] winston-style logger
 * @param {boolean} [p.showProgress=true] render cli-progress bar
 * @param {AbortSignal} [p.signal] interruption signal
 * @returns {Promise<{ status: true, file: string, bytes: number, mediaType: string, skipped: boolean }>}
 * @throws {AppError} E_DOWNLOAD / E_VALIDATION_FAILED / E_FILESYSTEM
 */
export async function downloadMedia({
  url,
  expect,
  outputDir,
  filename,
  overwrite = false,
  log,
  showProgress = true,
  signal,
}) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new AppError("E_VALIDATION", `invalid media URL: ${JSON.stringify(url)}`);
  }
  ensureDir(outputDir);

  const base = sanitizeFilename(filename ?? decodeURIComponent(url.split("?")[0].split("/").pop() ?? "media"));
  const finalName = base.includes(".") ? base : `${base}${deriveExtension(expect, url)}`;
  const finalPath = path.join(outputDir, finalName);
  const tmpPath = `${finalPath}.part`;

  // Dedup: an existing final file is only reused when non-empty (it was
  // written through this function, so it passed validation when created).
  if (fs.existsSync(finalPath)) {
    const stat = fs.statSync(finalPath);
    if (stat.size > 0 && !overwrite) {
      log?.debug?.(`already exists, skipping: ${finalName}`, { scope: "Download" });
      return { status: true, file: finalPath, bytes: stat.size, mediaType: "", skipped: true };
    }
  }

  removeFile(tmpPath);

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await attemptOnce({
        url,
        expect,
        tmpPath,
        finalPath,
        log,
        showProgress,
        signal,
      });
      if (attempt > 1) log?.debug?.(`succeeded on attempt ${attempt}`, { scope: "Download" });
      return result;
    } catch (err) {
      const appErr = asAppError(err);
      lastError = appErr;
      removeFile(tmpPath);
      const retryable = isRetryable(appErr) && attempt < MAX_ATTEMPTS;
      log?.warn?.(
        `download attempt ${attempt}/${MAX_ATTEMPTS} failed: ${appErr.message}${retryable ? " — retrying" : ""}`,
        { scope: "Download" },
      );
      if (!retryable) break;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  throw lastError ?? new AppError("E_DOWNLOAD", "download failed for unknown reason");
}

/**
 * Single download attempt.
 */
async function attemptOnce({ url, expect, tmpPath, finalPath, log, showProgress, signal }) {
  let response;
  try {
    response = await axios.get(url, {
      responseType: "stream",
      timeout: DOWNLOAD_TIMEOUT_MS,
      headers: {
        "User-Agent": USER_AGENT,
        Referer: "https://id.pinterest.com/",
        Accept: "*/*",
      },
      maxRedirects: 5,
    });
  } catch (err) {
    if (err?.response) {
      throw new AppError("E_DOWNLOAD", `HTTP ${err.response.status} while downloading media`);
    }
    if (err?.code === "ECONNABORTED") {
      throw new AppError("E_TIMEOUT", "media request timed out");
    }
    throw new AppError("E_NETWORK", `media request failed: ${err.message ?? err.code}`, { cause: err });
  }

  validateResponseHeaders({
    status: response.status,
    headers: response.headers,
    expect,
  });

  const total = Number(response.headers["content-length"]);
  const contentType = String(response.headers["content-type"] ?? "");

  /** @type {import("cli-progress").SingleBar} */
  let bar = null;
  if (showProgress) {
    bar = new progress.Bar({
      barCompleteChar: "\u2501",
      barInCompleteChar: "-",
      fps: 10,
      stream: process.stdout,
      barsize: 30,
      clearOnComplete: true,
      format: `Downloading ${chalk.cyan(path.basename(finalPath))} [{bar}] {percentage}% | {current}/{total}`,
    });
    bar.start(Number.isFinite(total) ? total : 100, 0);
  }

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmpPath);
    /** @type {Buffer[]} */
    const headChunks = [];
    let headLen = 0;
    let bytes = 0;
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      bar?.stop();
      if (err) reject(err);
      else resolve();
    };

    response.data.on("data", (chunk) => {
      bytes += chunk.length;
      if (headLen < 512) {
        headChunks.push(chunk);
        headLen += chunk.length;
      }
      bar?.increment(chunk.length);
    });
    response.data.on("error", (err) => finish(new AppError("E_NETWORK", `stream error: ${err.message}`, { cause: err })));
    out.on("error", (err) => finish(new AppError("E_FILESYSTEM", `write failed: ${err.message}`, { cause: err })));
    out.on("finish", () => {
      try {
        const head = Buffer.concat(headChunks);
        const mediaType = validateDownloadedContent({
          head,
          contentType,
          bytesWritten: bytes,
          expect,
        });
        atomicMove(tmpPath, finalPath);
        log?.info?.(`saved ${chalk.white(path.basename(finalPath))} (${humanSize(bytes)}) as ${mediaType}`, {
          scope: "Download",
        });
        finish();
      } catch (err) {
        finish(err);
      }
    });
    response.data.pipe(out);
    signal?.addEventListener(
      "abort",
      () => finish(new AppError("E_ABORTED", "download interrupted")),
      { once: true },
    );
  });

  const stat = fs.statSync(finalPath);
  return { status: true, file: finalPath, bytes: stat.size, mediaType: contentType, skipped: false };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
