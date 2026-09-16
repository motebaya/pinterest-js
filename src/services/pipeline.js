/**
 * Application pipeline — orchestrates extraction → selection → download.
 *
 * This is the use-case layer between the CLI and the core modules.
 * All orchestration logic lives here; the CLI only parses arguments.
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";

import Pinterest from "../core/pinterest/index.js";
import { downloadMedia } from "../core/downloader/download.js";
import { convertHlsToMp4 } from "../core/hls/convert.js";
import { pinKind, planDownloads, requireMediaType } from "../core/media/select.js";
import { saveMetadata, loadUserCache, findPinMetadata } from "./metadata.js";
import { getMediaOutputDir, getUserOutputDir, resolveOutputRoot } from "../config/paths.js";
import { AppError } from "../util/errors.js";
import { toBoxes, humanSize } from "../util/format.js";

/**
 * @typedef {Object} PipelineOptions
 * @property {boolean} [verbose=false]
 * @property {"image"|"video"} [type="image"]
 * @property {number} [maxPages=100]
 * @property {boolean} [metadata=false]
 * @property {boolean} [overwrite=false]
 * @property {string} [cache]
 * @property {boolean} [yes=false] skip interactive confirm
 * @property {object} [log]
 */

/**
 * Summarize extraction results in a console box.
 * @param {string} title
 * @param {Array<[string, string|number]>} rows
 */
function showSummary(title, rows) {
  const body = rows.map(([k, v]) => `${k}: ${chalk.cyan(String(v))}`).join("\n");
  console.log(toBoxes(`\n${body}\n`, title));
}

/**
 * Confirm download with the user (interactive only).
 * @param {{ yes?: boolean, log?: object }} p
 * @returns {Promise<boolean>}
 */
async function confirm({ yes, log }) {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    log?.warn?.("non-interactive session: auto-confirming download (use --yes to silence)", { scope: "Pipeline" });
    return true;
  }
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = await new Promise((resolve) => rl.question(" * Download? [y/n]: ", resolve));
      const v = String(answer).trim().toLowerCase();
      if (v === "y") return true;
      if (v === "n") return false;
    }
  } finally {
    rl.close();
  }
}

/**
 * Download a single media item (image direct, video mp4 direct or HLS convert).
 * @param {object} p
 * @param {import("../core/pinterest/types.js").Media} p.media
 * @param {import("../core/pinterest/types.js").Pin} p.pin
 * @param {string} p.username display username (no @)
 * @param {PipelineOptions} p.opts
 * @param {object} p.log
 */
async function downloadOne({ media, pin, username, opts, log }) {
  if (media.kind === "image") {
    const dir = getMediaOutputDir(username, "images");
    return downloadMedia({
      url: media.url,
      expect: "image",
      outputDir: dir,
      filename: decodeURIComponent(media.url.split("?")[0].split("/").pop() ?? ""),
      overwrite: opts.overwrite,
      log,
    });
  }

  // video
  const dir = getMediaOutputDir(username, "videos");
  if (media.container === "mp4") {
    return downloadMedia({
      url: media.url,
      expect: "video",
      outputDir: dir,
      filename: decodeURIComponent(media.url.split("?")[0].split("/").pop() ?? ""),
      overwrite: opts.overwrite,
      log,
    });
  }

  // HLS: derive output name from the m3u8 tail
  const tail = decodeURIComponent(media.url.split("?")[0].split("/").pop() ?? "video.m3u8");
  const name = `${tail.replace(/\.m3u8$/i, "")}.mp4`;
  const finalPath = path.join(dir, name);
  if (fs.existsSync(finalPath) && !opts.overwrite) {
    log?.debug?.(`HLS output exists, skipping: ${name}`, { scope: "Pipeline" });
    return { status: true, file: finalPath, bytes: fs.statSync(finalPath).size, skipped: true };
  }
  return convertHlsToMp4({ hlsUrl: media.url, outputPath: finalPath, log });
}

/**
 * Run the full pipeline for a username (feed or board flows).
 * @param {{ username: string, mode: "feed"|"board", boardSelection?: (boards: object[]) => Promise<object[]|null>, sectionSelection?: (boardId: string, sections: object[]) => Promise<"all"|"sections"|"skip"> }} p
 * @param {PipelineOptions} opts
 */
export async function runUserPipeline({ username, mode, boardSelection, sectionSelection }, opts) {
  const log = opts.log;
  const type = requireMediaType(opts.type ?? "image");
  const pinterest = new Pinterest({ verbose: opts.verbose, log });
  const root = resolveOutputRoot();
  log?.debug?.(`output root: ${root}`, { scope: "Pipeline" });

  let author;
  /** @type {import("../core/pinterest/types.js").Pin[]} */
  let pins;

  if (mode === "feed") {
    log?.info?.(`resolving feed for @${chalk.blue(username)} (max ${opts.maxPages} pages)`, { scope: "Pipeline" });
    const result = await pinterest.extractPins({ username, maxPages: opts.maxPages });
    author = result.author;
    pins = result.pins;
    log?.success?.(`found ${pins.length} pins across ${result.pages} page(s)`, { scope: "Pipeline" });
  } else {
    // board mode: discover boards, let the caller pick
    const boardsResult = await pinterest.extractBoards({ username, maxPages: opts.maxPages });
    author = boardsResult.author;
    const boards = boardsResult.boards;
    if (boards.length === 0) {
      throw new AppError("E_NO_DATA", `no boards found for @${username}`);
    }
    showSummary("Boards", [
      ["Username", `@${author.username}`],
      ["Boards", boards.length],
      ["Total pins", boards.reduce((s, b) => s + b.pinCount, 0)],
    ]);

    const selected = boardSelection ? await boardSelection(boards) : boards;
    if (!selected || selected.length === 0) {
      log?.warn?.("no boards selected — nothing to do", { scope: "Pipeline" });
      return { downloaded: 0, failed: 0 };
    }

    pins = [];
    for (const board of selected) {
      const choice = sectionSelection ? await sectionSelection(board.id, []) : "all";
      if (choice === "skip") continue;

      // sections of this board
      let sections = [];
      try {
        const secResult = await pinterest.extractBoardSections({
          username,
          boardId: board.id,
          boardSlug: board.slug,
          maxPages: opts.maxPages,
        });
        sections = secResult.sections;
      } catch (err) {
        log?.warn?.(`no sections for board "${board.name}": ${err.message}`, { scope: "Pipeline" });
      }

      if (choice === "sections" && sections.length > 0) {
        for (const section of sections) {
          log?.info?.(`fetching section "${section.name}" (${section.pinCount} pins)`, { scope: "Pipeline" });
          const secPins = await pinterest.extractBoardSectionPins({
            username,
            boardId: board.id,
            boardSlug: board.slug,
            sectionId: section.id,
            sectionSlug: section.slug,
            maxPages: opts.maxPages,
          });
          pins.push(...secPins.pins);
        }
      } else {
        const boardPins = await pinterest.extractBoardPins({
          username,
          boardId: board.id,
          boardSlug: board.slug,
          maxPages: opts.maxPages,
        });
        pins.push(...boardPins.pins);
        // BoardFeedResource excludes section content; fetch sections fully too
        for (const section of sections) {
          const secPins = await pinterest.extractBoardSectionPins({
            username,
            boardId: board.id,
            boardSlug: board.slug,
            sectionId: section.id,
            sectionSlug: section.slug,
            maxPages: opts.maxPages,
          });
          pins.push(...secPins.pins);
        }
      }
    }
    log?.info?.(`collected ${pins.length} pins from ${selected.length} board(s)`, { scope: "Pipeline" });
  }

  if (!author?.username) author = { username, name: username, userId: "" };

  // metadata (user-level export)
  if (opts.metadata) {
    saveMetadata({
      kind: "user",
      username: author.username,
      fileId: author.userId || username,
      data: { exportedAt: new Date().toISOString(), author, kind: mode, count: pins.length, pins },
      overwrite: opts.overwrite,
      log,
    });
  }

  // media selection
  const selectedPins = pins.filter((p) => pinKind(p) === type);
  const plan = planDownloads(pins, type);
  showSummary("Pinterest", [
    ["Username", `@${author.username}`],
    ["Media type", type],
    ["Matching pins", `${plan.length}/${pins.length}`],
  ]);

  if (plan.length === 0) {
    log?.warn?.(`no ${type} pins to download`, { scope: "Pipeline" });
    return { downloaded: 0, failed: 0 };
  }

  const ok = await confirm({ yes: opts.yes, log });
  if (!ok) {
    log?.warn?.("canceled by user", { scope: "Pipeline" });
    return { downloaded: 0, failed: 0 };
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const start = Date.now();
  for (const [index, item] of plan.entries()) {
    log?.info?.(
      `[${index + 1}/${plan.length}] ${item.media.kind} ${chalk.white(item.pin.id)} ${chalk.dim(item.pin.title.slice(0, 60))}`,
      { scope: "Pipeline" },
    );
    if (opts.metadata) {
      saveMetadata({
        kind: type === "image" ? "images" : "videos",
        username: author.username,
        fileId: item.pin.id,
        data: { exportedAt: new Date().toISOString(), author, pin: item.pin, media: item.media },
        overwrite: opts.overwrite,
        log,
      });
    }
    try {
      const result = await downloadOne({ media: item.media, pin: item.pin, username: author.username, opts, log });
      if (result?.skipped) {
        skipped += 1;
        log?.warn?.(`already exists, skipped: ${chalk.white(path.basename(result.file))}`, { scope: "Pipeline" });
      } else {
        downloaded += 1;
      }
    } catch (err) {
      failed += 1;
      log?.error?.(`pin ${item.pin.id}: ${err.message}`, { scope: "Pipeline" });
    }
  }

  showSummary("Download complete", [
    ["Downloaded", downloaded],
    ["Skipped", skipped],
    ["Failed", failed],
    ["Time", `${((Date.now() - start) / 1000).toFixed(1)}s`],
  ]);
  return { downloaded, failed, skipped };
}

/**
 * Run the single-pin pipeline.
 * @param {{ pinInput: string }} p
 * @param {PipelineOptions} opts
 */
export async function runPinPipeline({ pinInput }, opts) {
  const log = opts.log;
  const type = requireMediaType(opts.type ?? "image");
  const pinterest = new Pinterest({ verbose: opts.verbose, log });

  // Cache path: -c <pinId> loads the pin metadata instead of hitting network
  if (opts.cache && /^\d{16,21}$/.test(opts.cache)) {
    const cached = findPinMetadata({ pinId: opts.cache, log });
    if (cached?.pin?.media) {
      const media = cached.pin.media.find((m) => m.kind === type) ?? cached.pin.media[0];
      const result = await downloadOne({ media, pin: cached.pin, username: cached.author?.username ?? "unknown", opts, log });
      return { downloaded: result.skipped ? 0 : 1, failed: 0, skipped: result.skipped ? 1 : 0 };
    }
    log?.warn?.(`no cached metadata for pin ${opts.cache} — fetching live`, { scope: "Pipeline" });
  }

  const pin = await pinterest.extractPin({ pinInput, log });
  const media = pin.media.find((m) => m.kind === type) ?? pin.media[0];
  if (!media) {
    throw new AppError("E_NO_MEDIA", `pin ${pin.id} has no ${type} media`);
  }

  showSummary("Pin", [
    ["Author", `@${pin.author.username || "-"}`],
    ["Title", pin.title || "-"],
    ["Pin", pin.id],
    ["Type", media.kind === "video" ? `video (${media.container})` : "image"],
    ["Size", media.width && media.height ? `${media.width}x${media.height}` : "-"],
  ]);

  if (opts.metadata) {
    saveMetadata({
      kind: media.kind === "video" ? "videos" : "images",
      username: pin.author.username || "unknown",
      fileId: pin.id,
      data: { exportedAt: new Date().toISOString(), ...pin },
      overwrite: opts.overwrite,
      log,
    });
  }

  const result = await downloadOne({ media, pin, username: pin.author.username || "unknown", opts, log });
  return { downloaded: result.skipped ? 0 : 1, failed: 0, skipped: result.skipped ? 1 : 0 };
}

/**
 * Run the cached-user pipeline: load user-level metadata and re-download
 * media from it (no network extraction).
 * @param {{ username: string }} p
 * @param {PipelineOptions} opts
 */
export async function runCachedUserPipeline({ username }, opts) {
  const log = opts.log;
  const type = requireMediaType(opts.type ?? "image");
  const cached = loadUserCache({ username, log });
  if (!cached?.pins) {
    throw new AppError("E_NO_DATA", `cache for "${username}" has no pins — re-run with --metadata to build it`);
  }
  const author = cached.author ?? { username, name: username, userId: "" };
  const plan = planDownloads(cached.pins, type);
  log?.info?.(`cache has ${cached.pins.length} pins, ${plan.length} match type "${type}"`, { scope: "Pipeline" });
  if (plan.length === 0) return { downloaded: 0, failed: 0 };

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  for (const item of plan) {
    try {
      const result = await downloadOne({ media: item.media, pin: item.pin, username: author.username, opts, log });
      if (result?.skipped) {
        skipped += 1;
        log?.warn?.(`already exists, skipped: ${chalk.white(path.basename(result.file))}`, { scope: "Pipeline" });
      } else {
        downloaded += 1;
      }
    } catch (err) {
      failed += 1;
      log?.error?.(`pin ${item.pin.id}: ${err.message}`, { scope: "Pipeline" });
    }
  }
  showSummary("Download complete", [
    ["Downloaded", downloaded],
    ["Skipped", skipped],
    ["Failed", failed],
  ]);
  return { downloaded, failed, skipped };
}

// re-export for CLI use
export { getUserOutputDir, humanSize };
