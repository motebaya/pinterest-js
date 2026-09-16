/**
 * Asynchronous file downloader with progress bar display
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: download.js
 */

import axios from "axios";
import progress from "cli-progress";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";
import chalk from "chalk";
import { USER_AGENT } from "../../config/constants.js";
import { getOutputDir } from "../../config/paths.js";
import { createLogger } from "../../logger/index.js";
import { ensureDir } from "../../utils/ensureDir.js";
import { humanSize } from "./humanSize.js";
import { setIncompleteFile } from "./cleanup.js";

/**
 * Download a file from a URL with a CLI progress bar.
 * Organizes output into <outputDir>/<username>/<media_type>/<filename>.
 *
 * @param {Object} opts
 * @param {string} opts.url - URL of the file to download
 * @param {string} opts.filename - Desired filename for the saved file
 * @param {Object} [opts.log] - Winston logger instance (falls back to default)
 * @param {string} opts.username - Pinterest username (with @ prefix)
 * @param {string} opts.media_type - Media type subfolder ("images" | "videos")
 * @param {boolean} [opts.overwrite=false] - Whether to overwrite existing files
 * @returns {Promise<{ status: boolean, message?: string } | undefined>}
 */
export async function download(opts) {
  return new Promise(async (resolve) => {
    let { url, filename, log, username, media_type, overwrite } = opts;
    let msg;
    if (!log) {
      log = createLogger({ level: "info" });
    }
    assert(filename !== undefined, chalk.red(`No filename suplied..!`));
    if (!url && !log) {
      msg = `Invalid Suplied params! -> url: ${url}, filename: ${filename}, log: ${log}, media_type: ${media_type}, username: ${username}`;
      log.error(`${chalk.yellow(msg)}`);
      return resolve({
        status: false,
        message: msg,
      });
    }

    log.debug(`Downloading::${chalk.white(url)}`);
    const prog = new progress.Bar({
      barCompleteChar: "\u2501",
      barInCompleteChar: "-",
      fps: 10,
      stream: process.stdout,
      barsize: 30,
      stopOnComplete: false,
      clearOnComplete: false,
      format:
        "Downloading: {bar} {percentage}% | {current}/{totalMax} | ETA: {eta}s",
    });

    /**
     * default folder output for save:
     * <root>/pinterest-downloader-output/<username>
     */
    let defaultpath = getOutputDir();

    /**
     * structured output folder by username
     */
    defaultpath = path.join(defaultpath, username);
    if (username.startsWith("@")) {
      ensureDir(defaultpath);
      log.debug(
        `${chalk.white(`User output folder ready: ${defaultpath}`)}`,
      );
    } else {
      log.error(`Invalid suplied username!`);
      return resolve();
    }

    /**
     * organize output folder by media type
     */
    defaultpath = path.join(defaultpath, media_type);
    ensureDir(defaultpath);
    log.debug(
      `${chalk.white(`Media type output folder ready: ${defaultpath}`)}`,
    );

    /**
     * overwrite? and if file exist then it will do.
     * not overwrite but file not exist then it will create new file.
     * else, it will skip.
     */
    filename = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, "");
    filename = path.join(defaultpath, filename);
    overwrite =
      overwrite && fs.existsSync(filename)
        ? true
        : !fs.existsSync(filename) && !overwrite
          ? true
          : overwrite && !fs.existsSync(filename)
            ? true
            : false;

    /**
     * file exist but not overwrite? ok exit
     */
    if (!overwrite) {
      log.warn(
        `skipping file::${chalk.white(path.basename(filename))} exist!`,
      );
      return resolve({
        status: false,
        message: "file exist and overwrite flag is false!",
      });
    }

    let response;
    do {
      try {
        response = await axios.get(url, {
          headers: {
            "User-Agent": USER_AGENT,
          },
          responseType: "stream",
        });
      } catch (err) {
        if (err.response) {
          log.error(`Error, couldn't download non stream content.`);
        } else {
          log.error(`Error with status code: ${err.response.status}`);
        }
        return resolve();
      }
    } while (response === undefined || response.status !== 200);

    if (!response) {
      msg =
        "No response!, try open url to browser! it might hit a 404/204 response..";
      log.error(msg);
      return resolve({
        status: false,
        message: msg,
      });
    }
    const stream = fs.createWriteStream(filename);
    setIncompleteFile(filename);
    log.debug(`Stream Created::${chalk.white(filename)}`);

    let current = 1;
    const total = parseInt(response.headers["content-length"]);
    prog.start(total, 0);
    prog.update({ totalMax: humanSize(total) });
    response.data
      .on("data", (chunk) => {
        current += chunk.length;
        prog.increment(chunk.length);
        prog.update({ current: humanSize(current) });
      })
      .pipe(stream);
    response.data.on("error", (err) => {
      prog.stop();
      log.error(err);
      resolve();
    });
    stream.on("finish", () => {
      prog.stop();
      stream.close();
      log.info(`Ok -> ::${chalk.white(filename)}`);
      resolve();
    });
  });
}
