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
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ensureDir } from "../util/fs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const OUTPUT_DIR_NAME = "pinterest-downloader-output";

/** Project root (src/config → repo root). */
export const PROJECT_ROOT = path.resolve(__dirname, "../..");

/**
 * Output root, created if missing.
 * @returns {string}
 */
export function getOutputDir() {
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

/** Default output override via environment variable (PINTEREST_JS_OUTPUT_DIR). */
export function resolveOutputRoot() {
  const envDir = process.env.PINTEREST_JS_OUTPUT_DIR;
  if (envDir && envDir.trim()) {
    const dir = path.resolve(envDir.trim());
    ensureDir(dir);
    return dir;
  }
  return getOutputDir();
}
