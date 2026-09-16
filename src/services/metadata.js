/**
 * Metadata persistence + cache.
 *
 * File layout (matches on-disk reality of previous runs):
 *   @<user>/<userId>.json                    — user-level export (pins/boards snapshot)
 *   @<user>/<images|videos>/metadata/<pinId>.json — pin-level export
 *
 * The cache is the same set of files: `-c <username>` loads the user-level
 * JSON; pin-level files are addressed by explicit id directories.
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getOutputDir, getUserOutputDir } from "../config/paths.js";
import { ensureDir } from "../util/fs.js";
import { AppError } from "../util/errors.js";

/**
 * Save a metadata object as pretty JSON.
 * @param {object} p
 * @param {"user"|"images"|"videos"} p.kind
 * @param {object} p.data serializable payload
 * @param {string} p.username
 * @param {string} p.fileId filename stem (userId or pinId)
 * @param {boolean} [p.overwrite=false]
 * @param {object} [p.log]
 * @returns {{ file: string, written: boolean }}
 */
export function saveMetadata({ kind, data, username, fileId, overwrite = false, log }) {
  const base = kind === "user" ? getUserOutputDir(username) : path.join(getUserOutputDir(username), kind, "metadata");
  ensureDir(base);
  const file = path.join(base, `${fileId}.json`);

  if (fs.existsSync(file) && !overwrite) {
    log?.warn?.(`metadata exists, skipping (use --overwrite to replace): ${chalk.white(path.basename(file))}`, {
      scope: "Metadata",
    });
    return { file, written: false };
  }

  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    throw new AppError("E_FILESYSTEM", `failed to write metadata ${file}: ${err.message}`, { cause: err });
  }
  log?.info?.(`metadata saved: ${chalk.white(file)}`, { scope: "Metadata" });
  return { file, written: true };
}

/**
 * Load cached metadata for a username: reads the first *.json directly under
 * the @user directory (the user-level export).
 * @param {{ username: string, log?: object }} p
 * @returns {object|null} parsed metadata or null when absent
 */
export function loadUserCache({ username, log }) {
  const dir = getUserOutputDir(username);
  if (!fs.existsSync(dir)) {
    log?.error?.(`no cached metadata for "${username}" — run with --metadata first`, { scope: "Metadata" });
    return null;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    log?.error?.(`no metadata files in ${chalk.white(dir)}`, { scope: "Metadata" });
    return null;
  }
  const file = path.join(dir, files[0]);
  log?.info?.(`loaded cache: ${chalk.white(file)}`, { scope: "Metadata" });
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new AppError("E_FILESYSTEM", `cached metadata ${file} is not valid JSON: ${err.message}`, { cause: err });
  }
}

/**
 * Search all user directories for a pin-level metadata file by pin id.
 * @param {{ pinId: string, log?: object }} p
 * @returns {object|null}
 */
export function findPinMetadata({ pinId, log }) {
  const root = getOutputDir();
  const users = fs.readdirSync(root).filter((f) => f.startsWith("@"));
  for (const user of users) {
    const userDir = path.join(root, user);
    if (!fs.statSync(userDir).isDirectory()) continue;
    for (const kind of ["images", "videos"]) {
      const dir = path.join(userDir, kind, "metadata");
      if (!fs.existsSync(dir)) continue;
      const hit = fs.readdirSync(dir).find((f) => f === `${pinId}.json`);
      if (hit) {
        const file = path.join(dir, hit);
        log?.info?.(`found pin metadata: ${chalk.white(file)}`, { scope: "Metadata" });
        return JSON.parse(fs.readFileSync(file, "utf8"));
      }
    }
  }
  return null;
}
