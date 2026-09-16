/**
 * Output path resolution — single source of truth for where files go.
 *
 * Layout:
 *   <root>/pinterest-downloader-output/
 *     └── @<username>/
 *          ├── <userId>.json                     (user metadata / cache)
 *          ├── images/<file>                     (image files)
 *          │   └── metadata/<pinId>.json         (pin image metadata)
 *          └── videos/<file|.mp4>
 *              └── metadata/<pinId>.json         (pin video metadata)
 *
 * Root precedence: `setOutputDir()` (CLI --output-dir) >
 * `PINTEREST_JS_OUTPUT_DIR` env var > `<projectRoot>/pinterest-downloader-output`.
 * Every path helper routes through `getOutputDir()`, so overrides apply
 * uniformly to downloads and metadata/cache files.
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ensureDir } from "../util/fs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const OUTPUT_DIR_NAME = "pinterest-downloader-output";

/** Project root (src/config → repo root). */
export const PROJECT_ROOT = path.resolve(__dirname, "../..");

/** Explicit override, set per-run by the CLI (-d/--output-dir); null = no override. */
let overrideDir = null;

/**
 * Set the highest-precedence output root (CLI flag). Pass a falsy value to
 * clear the override so resolution falls back to env var / default.
 * @param {string|undefined|null} [dir]
 */
export function setOutputDir(dir) {
  const trimmed = typeof dir === "string" ? dir.trim() : "";
  overrideDir = trimmed ? path.resolve(trimmed) : null;
}

/**
 * Where the current output root came from (for tests/diagnostics).
 * @returns {"cli"|"env"|"default"}
 */
export function outputDirSource() {
  if (overrideDir) return "cli";
  if (process.env.PINTEREST_JS_OUTPUT_DIR?.trim()) return "env";
  return "default";
}

/**
 * Output root, created if missing. Precedence: CLI override > env var > default.
 * @returns {string}
 */
export function getOutputDir() {
  if (overrideDir) {
    ensureDir(overrideDir);
    return overrideDir;
  }
  const envDir = process.env.PINTEREST_JS_OUTPUT_DIR;
  if (envDir && envDir.trim()) {
    const dir = path.resolve(envDir.trim());
    ensureDir(dir);
    return dir;
  }
  const dir = path.join(PROJECT_ROOT, OUTPUT_DIR_NAME);
  ensureDir(dir);
  return dir;
}

/**
 * Output directory for one user.
 * @param {string} username with or without leading '@'
 * @returns {string}
 */
export function getUserOutputDir(username) {
  const normalized = username.startsWith("@") ? username : `@${username}`;
  return path.join(getOutputDir(), normalized);
}

/**
 * Directory for one media type under a user.
 * @param {string} username
 * @param {"images"|"videos"} mediaType plural
 */
export function getMediaOutputDir(username, mediaType) {
  return path.join(getUserOutputDir(username), mediaType);
}

/**
 * Metadata directory for one media type under a user.
 * @param {string} username
 * @param {"images"|"videos"} mediaType plural
 */
export function getMetadataDir(username, mediaType) {
  return path.join(getMediaOutputDir(username, mediaType), "metadata");
}
