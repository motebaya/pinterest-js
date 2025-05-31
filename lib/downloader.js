/**
 * @github.com/motebaya - © 2023-10
 * file: downloader.js
 */
import axios from "axios";
import progress from "cli-progress";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";
import chalk from "chalk";
import logger from "./logger/logging.js";

/**
 * cleanup, you can continue download them later.
 */
let maybeIncomplete;
process.on("SIGINT", async () => {
  if (maybeIncomplete !== undefined) {
    if (fs.existsSync(maybeIncomplete)) {
      let retry = 5;
      while (--retry) {
        try {
          await fsp.unlink(maybeIncomplete);
          break;
        } catch (err) {
          if (err.code === "EBUSY") {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } else {
            break;
          }
        }
      }
    }
  }
  console.log("\nInterrupted, exiting...");
  process.exit(1);
});

class Downloader {
  /**
   * c: https://stackoverflow.com/a/20732091
   *
   * @param {number} size bytes length.
   * @returns {string}
   */
  static humanSize(size) {
    var i = size == 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
    return (
      (size / Math.pow(1024, i)).toFixed(2) * 1 +
      " " +
      ["B", "kB", "MB", "GB", "TB"][i]
    );
  }

  /**
   * Asynchronous downloader with progress bar.
   * - https://github.com/axios/axios#request-config
   * - https://github.com/npkgz/cli-progress/tree/master#options-1
   *
   * @param {object} opts
   * @param {string} opts.url string url to download.
   * @param {string} opts.filename string filename to save.
   * @param {winston.logger} opts.logger downloader class doesn't extend instance which have logger.
   * @returns {Promise<undefined>}
   */
  static async _download(opts) {
    return new Promise(async (resolve) => {
      let { url, filename, log, username, media_type, overwrite } = opts;
      if (!log) {
        log = logger({ level: "debug" }); // lo logger suplied set level default to debug
      }
      assert(filename !== undefined, chalk.red(`No filename suplied..!`));
      if (url !== undefined && log !== undefined) {
        log.debug(`downloading::${chalk.white(url)}`);
        const prog = new progress.Bar({
          barCompleteChar: "━",
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
        let defaultpath = path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "../pinterest-downloader-output"
        );
        if (!fs.existsSync(defaultpath)) {
          fs.mkdirSync(defaultpath);
        }

        /**
         * i will set more structured output folder.,
         * so i can find output easier.
         */
        defaultpath = path.join(defaultpath, username);
        if (username.startsWith("@")) {
          if (!fs.existsSync(defaultpath)) {
            fs.mkdirSync(defaultpath, { recursive: true });
            log.debug(
              `(${chalk.white(this._download.name)}) ${chalk.green(
                `Created user output folder: ${defaultpath}`
              )}`
            );
          }
        } else {
          log.error(
            `(${chalk.white(this._download.name)}) ${chalk.red(
              "Invalid suplied username!"
            )}`
          );
          return resolve();
        }

        /**
         * then, i will organize output folder by type media too
         */
        defaultpath = path.join(defaultpath, media_type);
        if (!fs.existsSync(defaultpath)) {
          fs.mkdirSync(defaultpath, { recursive: true });
          log.debug(
            `(${chalk.white(this._download.name)}) ${chalk.green(
              `Created media type output folder: ${defaultpath}`
            )}`
          );
        }

        /**
         * overwrite? and if file exist then it wil do.
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
        if (overwrite) {
          let response;
          do {
            try {
              response = await axios.get(url, {
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
                },
                responseType: "stream",
              });
            } catch (err) {
              if (err.response) {
                log.error(
                  `(${chalk.white(this._download.name)}) ${chalk.red(
                    `Error, couldn't download non stream content.`
                  )}`
                );
              } else {
                log.error(
                  `(${chalk.white(this._download.name)}) ${chalk.red(
                    `Error with status code: ${err.response.status}`
                  )}`
                );
              }
              return resolve();
            }
          } while (response === undefined || response.status !== 200);
          if (response) {
            const stream = fs.createWriteStream(filename);
            maybeIncomplete = filename;
            log.debug(
              `(${chalk.white(
                this._download.name
              )}) Stream Created::${chalk.white(filename)}`
            );

            let current = 1;
            const total = parseInt(response.headers["content-length"]);
            prog.start(total, 0);
            prog.update({ totalMax: this.humanSize(total) });
            response.data
              .on("data", (chunk) => {
                current += chunk.length;
                prog.increment(chunk.length);
                prog.update({ current: this.humanSize(current) });
              })
              .pipe(stream);
            response.data.on("error", (err) => {
              prog.stop();
              log.error(
                `(${chalk.white(this._download.name)}) ${chalk.red(err)}`
              );
              return resolve();
            });
            stream.on("finish", () => {
              prog.stop();
              log.info(`(${chalk.white(this._download.name)}) Success...`);
              log.info(
                `(${chalk.white(
                  this._download.name
                )}) Output Stored in: ${chalk.white(filename)}`
              );
              return resolve();
            });
          } else {
            log.error(
              `(${chalk.white(this._download.name)}) ${chalk.red(
                "No response!, try open url to browser! it might hit a 404/204 response.."
              )}`
            );
            resolve();
          }
        } else {
          log.warn(
            `(${chalk.white(this._download.name)}) skipping file::${chalk.green(
              path.basename(filename)
            )} exist!, ${chalk.red("Try again with --overwrite flag!!")}`
          );
          resolve();
        }
      } else {
        log.error(
          `(${chalk.white(this._download.name)}) ${chalk.yellow(
            `Invalid Suplied params! -> url: ${url}, filename: ${filename}, log: ${log}, media_type: ${media_type}, username: ${username}`
          )}`
        );
        resolve();
      }
    });
  }
}

export default Downloader;
