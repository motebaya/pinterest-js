/**
 * HLS → MP4 conversion.
 *
 * Fetch master playlist → select best variant (pixel area, then bandwidth) →
 * resolve audio (muxed inline or separate rendition) → ffmpeg remux into a
 * temp file → validate output → atomic rename.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import axios from "axios";
import { parse } from "hls-parser";
import ffmpegPath from "ffmpeg-static";

import { AppError } from "../../util/errors.js";
import { humanSize } from "../../util/format.js";
import { removeFile, atomicMove, ensureDir } from "../../util/fs.js";

const HLS_TIMEOUT_MS = 30_000;

/**
 * Select the best variant: highest pixel area, tie-break on bandwidth.
 * @param {object} hlsObj parsed master playlist
 * @returns {{ best: object, variantUrl: (hlsUrl: string) => string }}
 */
export function selectBestVariant(hlsObj) {
  const variants = hlsObj?.variants ?? [];
  if (!variants.length) {
    throw new AppError("E_FFMPEG", "no variants found in master playlist");
  }
  const best = variants.slice().sort((a, b) => {
    const ap = (a.resolution?.width ?? 0) * (a.resolution?.height ?? 0);
    const bp = (b.resolution?.width ?? 0) * (b.resolution?.height ?? 0);
    if (bp !== ap) return bp - ap;
    return (b.bandwidth ?? 0) - (a.bandwidth ?? 0);
  })[0];
  return { best, variantUrl: (hlsUrl) => new URL(best.uri, new URL(hlsUrl)).toString() };
}

/**
 * Normalize the audio group id from a variant across hls-parser shapes.
 * @param {object} variant
 * @returns {string|null}
 */
export function normalizeAudioGroupId(variant) {
  const attrs = variant?.attributes;
  if (attrs && typeof attrs.AUDIO === "string") return attrs.AUDIO;
  const a = variant?.audio;
  if (!a) return null;
  if (typeof a === "string") return a;
  if (Array.isArray(a)) return typeof a[0]?.groupId === "string" ? a[0].groupId : null;
  if (typeof a?.groupId === "string") return a.groupId;
  return null;
}

/**
 * Resolve an audio playlist URL. Prefers audio muxed into the variant
 * (Pinterest live behavior: empty medias, embedded audio) — in that case
 * returns null and ffmpeg maps `0:a?` from the video playlist itself.
 * @param {object} hlsObj
 * @param {string} hlsUrl
 * @param {object} bestVariant
 * @returns {string|null} audio playlist URL, or null when audio is muxed
 */
export function selectAudioUrl(hlsObj, hlsUrl, bestVariant) {
  const a = bestVariant?.audio;
  if (Array.isArray(a) && a[0]?.uri) return new URL(a[0].uri, new URL(hlsUrl)).toString();
  if (typeof a === "object" && a?.uri) return new URL(a.uri, new URL(hlsUrl)).toString();

  const medias = hlsObj?.medias ?? hlsObj?.media ?? [];
  const audios = (medias ?? []).filter((m) => m.type === "AUDIO" && m.uri);
  if (!audios.length) return null;
  const groupId = normalizeAudioGroupId(bestVariant);
  const pick = (groupId && audios.find((m) => m.groupId === groupId)) || audios[0];
  return new URL(pick.uri, new URL(hlsUrl)).toString();
}

/**
 * Run ffmpeg. Resolves when the process exits 0 and the output exists.
 * @param {{ args: string[], outputMp4: string, log?: object, signal?: AbortSignal }} p
 * @returns {Promise<void>}
 */
function runFfmpeg({ args, outputMp4, log, signal }) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      return reject(new AppError("E_FFMPEG", "ffmpeg-static binary not available for this platform"));
    }
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderrTail = "";
    const SIGERR_MAX = 16_000;

    child.stderr.on("data", (d) => {
      if (stderrTail.length < SIGERR_MAX) stderrTail += d.toString();
      if (log?.level === "debug") process.stderr.write(d);
    });
    child.on("error", (err) =>
      reject(new AppError("E_FFMPEG", `failed to spawn ffmpeg: ${err.message}`, { cause: err })),
    );
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputMp4) && fs.statSync(outputMp4).size > 0) return resolve();
      reject(
        new AppError(
          "E_FFMPEG",
          `ffmpeg exited ${code ?? "abnormal"}\n${stderrTail.slice(-2000)}`,
        ),
      );
    });
    signal?.addEventListener(
      "abort",
      () => {
        child.kill("SIGKILL");
        reject(new AppError("E_ABORTED", "conversion interrupted"));
      },
      { once: true },
    );
  });
}

/**
 * Convert an HLS master playlist URL to MP4.
 *
 * @param {object} p
 * @param {string} p.hlsUrl master playlist URL
 * @param {string} p.outputPath final .mp4 path (written atomically)
 * @param {object} [p.log]
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{ status: true, file: string, bytes: number, resolution: string|null }>}
 * @throws {AppError} E_FFMPEG / E_NETWORK / E_ABORTED
 */
export async function convertHlsToMp4({ hlsUrl, outputPath, log, signal }) {
  ensureDir(path.dirname(outputPath));
  const tmpPath = `${outputPath}.part.mp4`;
  removeFile(tmpPath);

  log?.debug?.(`HLS: fetching master playlist`, { scope: "HLS" });
  let masterText;
  try {
    const res = await axios.get(hlsUrl, { responseType: "text", timeout: HLS_TIMEOUT_MS, validateStatus: null });
    if (res.status !== 200) {
      throw new AppError("E_FFMPEG", `master playlist returned HTTP ${res.status}`);
    }
    masterText = res.data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("E_FFMPEG", `failed to fetch master playlist: ${err.message}`, { cause: err });
  }

  let hlsObj;
  try {
    hlsObj = parse(masterText);
  } catch (err) {
    throw new AppError("E_FFMPEG", `unparseable master playlist: ${err.message}`, { cause: err });
  }

  const { best, variantUrl } = selectBestVariant(hlsObj);
  const videoUrl = variantUrl(hlsUrl);
  const audioUrl = selectAudioUrl(hlsObj, hlsUrl, best);
  const resolution = best.resolution ? `${best.resolution.width}x${best.resolution.height}` : null;

  log?.debug?.(
    `HLS: selected variant ${resolution ?? "?"} @ ${best.bandwidth ?? "?"} bps` +
      (audioUrl ? " (separate audio)" : " (muxed audio)"),
    { scope: "HLS" },
  );

  const args = [
    "-loglevel",
    "error",
    "-y",
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto",
    "-i",
    videoUrl,
  ];
  if (audioUrl) args.push("-i", audioUrl);
  if (audioUrl) args.push("-map", "0:v:0", "-map", "1:a:0");
  else args.push("-map", "0:v:0", "-map", "0:a?");
  args.push("-c", "copy", "-bsf:a", "aac_adtstoasc", "-movflags", "+faststart", tmpPath);

  try {
    await runFfmpeg({ args, outputMp4: tmpPath, log, signal });
    validateMp4(tmpPath);
    atomicMove(tmpPath, outputPath);
    const bytes = fs.statSync(outputPath).size;
    log?.debug?.(`HLS: converted to ${path.basename(outputPath)} (${humanSize(bytes)}, ${resolution ?? "?"})`, {
      scope: "HLS",
    });
    return { status: true, file: outputPath, bytes, resolution };
  } catch (err) {
    removeFile(tmpPath);
    throw err;
  }
}

/**
 * Validate a produced MP4: non-trivial size + ftyp/moov box signature.
 * @param {string} filePath
 * @throws {AppError} E_VALIDATION_FAILED
 */
export function validateMp4(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size < 1024) {
    throw new AppError("E_VALIDATION_FAILED", `MP4 too small (${stat.size} bytes)`);
  }
  const fd = fs.openSync(filePath, "r");
  try {
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    const brand = head.subarray(4, 8).toString("ascii");
    if (brand !== "ftyp" && brand !== "moov" && brand !== "wide" && brand !== "free" && brand !== "skip") {
      throw new AppError("E_VALIDATION_FAILED", `output is not a valid MP4 (box brand "${brand}")`);
    }
  } finally {
    fs.closeSync(fd);
  }
}
