/**
 * Metadata persistence — save and retrieve cached pin metadata
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: metadata.js
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getOutputDir } from "../config/paths.js";
import { ensureDir } from "../utils/ensureDir.js";

/**
 * Save extraction metadata to a JSON file.
 * Organizes by username and media type under the global output directory.
 *
 * @param {Object} opts
 * @param {string} opts.type - Metadata category: "user" | "videos" | "images"
 * @param {Object} opts.metadata - The metadata object to persist
 * @param {boolean} opts.overwrite - Whether to overwrite an existing metadata file
 * @param {Object} opts.log - Winston logger instance
 * @returns {Promise<void>}
 */
export async function saveMetaData(opts) {
  let { type, metadata, overwrite, log } = opts;
  let defaultPath = path.join(getOutputDir(), `@${metadata.author.username}`);
  if (type === "videos" || type === "images") {
    defaultPath = path.join(defaultPath, `${type}/metadata`);
  }

  ensureDir(defaultPath);

  const fname = path.join(
    defaultPath,
    `${
      type === "user" ? metadata.author.userId : metadata.result.entityId
    }.json`,
  );
  if (fs.existsSync(fname) && !overwrite) {
    log.warn(
      `metadata file already exists in::${chalk.white(fname.split(path.sep).slice(3).join(path.sep))}`,
    );
    log.warn(`use --overwrite option to overwrite existing metadata`);
    return;
  }

  fs.writeFileSync(fname, JSON.stringify(metadata, null, 2));
  log.info(
    `${overwrite ? chalk.red("overwritten ") : ""}metadata saved in::${chalk.white(fname)}`,
  );
  return;
}

/**
 * Retrieve previously saved metadata from cache.
 * Supports lookup by username (directory) or by pinId (scanning all metadata files).
 *
 * @param {Object} opts
 * @param {string} opts.cache - Username or pinId to look up
 * @param {Object} opts.log - Winston logger instance
 * @returns {Object|undefined} Parsed metadata object, or undefined if not found
 */
export function getFromCache(opts) {
  let { cache, log } = opts;
  const defaultPath = getOutputDir();
  cache = !cache.startsWith("@") ? `@${cache}` : cache;
  if (cache.startsWith("@")) {
    let cachePath = path.join(defaultPath, cache);
    if (fs.existsSync(cachePath)) {
      const cache_file = fs
        .readdirSync(cachePath)
        .filter((f) => f.endsWith(".json"));
      if (cache_file.length === 0) {
        log.error(`no metadata cache file found in::${chalk.white(cachePath)}`);
        return;
      }
      cachePath = path.join(cachePath, cache_file[0]);
      log.info(`found metadata in::|>${chalk.white(cachePath)}`);
      return JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } else {
      log.error(`cache file not found in::${chalk.white(cachePath)}`);
      return;
    }
  } else {
    log.info(
      `scanning::|>${chalk.white(
        defaultPath,
      )} for matching ID::${chalk.white(cache)}`,
    );
    const files = fs.readdirSync(defaultPath);
    for (const file of files) {
      let fpath = path.join(defaultPath, file);
      if (fs.statSync(fpath).isDirectory()) {
        let imageMetadata = path.join(fpath, `images/metadata`);
        let videoMetadata = path.join(fpath, `videos/metadata`);
        fpath = [
          ...(fs.existsSync(imageMetadata)
            ? fs
                .readdirSync(imageMetadata)
                .map((f) => path.join(imageMetadata, f))
            : []),
          ...(fs.existsSync(videoMetadata)
            ? fs
                .readdirSync(videoMetadata)
                .map((f) => path.join(videoMetadata, f))
            : []),
        ];
        if (fpath.length >= 1) {
          log.info(`scanning metadata of ${chalk.white(fpath.length)} files`);
          for (const f of fpath) {
            if (f.endsWith(".json") && f.includes(cache)) {
              log.info(`found metadata in::|>${chalk.white(f)}`);
              return JSON.parse(fs.readFileSync(f).toString());
            }
          }
        } else {
          log.warn(
            `no metadata found in::|>${chalk.white(
              imageMetadata,
            )} and ${chalk.white(videoMetadata)}`,
          );
        }
      }
    }
  }
}
