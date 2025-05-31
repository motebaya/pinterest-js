#!/usr/bin/node

/***
 * @github.com/motebaya - 5/8/2025
 * file: main.js
 */

import Pinterest from "./lib/extractor/Pinterest.js";
import path from "path";
import fs from "fs";
import chalk from "chalk";
import { fileURLToPath } from "url";
import Utils from "./lib/Utils.js";
import Downloader from "./lib/Downloader.js";

class Main extends Pinterest {
  constructor(verbose = false) {
    super(verbose);
    this.defaultPath = path.join(
      fileURLToPath(import.meta.url),
      `../pinterest-downloader-output`
    );
  }

  /**
   * Save the metadata to the file
   *
   * @param {*} opts
   * @param {String} opts.type
   * @param {Object} opts.metadata
   * @param {Boolean} opts.overwrite
   * @param {Object} opts.log
   * @returns {Promise<void>}
   */
  async saveMetaData(opts) {
    return new Promise(async (resolve) => {
      let { type, metadata, overwrite } = opts;
      let defaultPath = path.join(
        fileURLToPath(import.meta.url),
        `../pinterest-downloader-output/@${metadata.author.username}`
      );
      if (type === "videos" || type === "images") {
        defaultPath = path.join(defaultPath, `${type}/metadata`);
      }

      if (!fs.existsSync(defaultPath)) {
        fs.mkdirSync(defaultPath, { recursive: true });
      }

      const fname = path.join(
        defaultPath,
        `${
          type === "user" ? metadata.author.userId : metadata.result.entityId
        }.json`
      );
      if (fs.existsSync(fname) && !overwrite) {
        this.log.warn(`metadata file already exists in::${chalk.white(fname)}`);
        return resolve();
      }

      fs.writeFileSync(fname, JSON.stringify(metadata, null, 2));
      this.log.info(`metadata saved in::${chalk.white(fname)}`);
      return resolve();
    });
  }

  /**
   * Get the metadata from the cache
   *
   * @param {Object} opts
   * @param {String} opts.cache
   * @returns {Promise<Object>}
   */
  getFromCache(opts) {
    let { cache } = opts;
    cache = /^\d+$/.test(cache.replace(/\D+/g, ""))
      ? cache.replace(/\D+/g, "")
      : !cache.startsWith("@")
      ? `@${cache}`
      : cache;
    if (cache.startsWith("@")) {
      cache = path.join(this.defaultPath, cache);
      if (fs.existsSync(cache)) {
        const cache_file = fs
          .readdirSync(cache)
          .filter((f) => f.endsWith(".json"));
        if (cache_file.length === 0) {
          this.log.error(
            `no metadata cache file found in::${chalk.white(cache)}`
          );
          return;
        }
        cache = path.join(cache, cache_file[0]);
        this.log.info(`found metadata in::|>${chalk.white(cache)}`);
        return JSON.parse(fs.readFileSync(cache, "utf8"));
      } else {
        this.log.error(`cache file not found in::${chalk.white(cache)}`);
        return;
      }
    } else {
      this.log.info(
        `scanning::|>${chalk.white(
          this.defaultPath
        )} for matching ID::${chalk.white(cache)}`
      );
      const files = fs.readdirSync(this.defaultPath);
      for (const file of files) {
        let fpath = path.join(this.defaultPath, file);
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
            this.log.info(
              `scanning metadata of ${chalk.white(fpath.length)} files`
            );
            for (const f of fpath) {
              if (f.endsWith(".json") && f.includes(cache)) {
                this.log.info(`found metadata in::|>${chalk.white(f)}`);
                return JSON.parse(fs.readFileSync(f).toString());
              }
            }
          } else {
            this.log.warn(
              `no metadata found in::|>${chalk.white(
                imageMetadata
              )} and ${chalk.white(videoMetadata)}`
            );
          }
        }
      }
    }
  }

  /***
   * extractor main
   *
   * @param {Object} opts
   * @param {String} opts.username
   * @param {String} opts.pinId
   * @param {String} opts.source
   * @param {Boolean} opts.verbose
   * @param {Boolean} opts.metadata
   * @param {Boolean} opts.overwrite
   * @param {String} opts.type
   * @returns {Promise<void>}
   */
  async extract(opts) {
    let { username, pinId, metadata, overwrite, type, cache } = opts;
    let result;
    if (cache) {
      if (!username && !/^\d+$/.test(cache.replace(/\D+/g, ""))) {
        this.log.info(`using cache as username::|>${chalk.white(cache)}`);
        username = cache;
      } else {
        this.log.info(`using cache as pinId::|>${chalk.white(cache)}`);
        pinId = cache.replace(/\D+/g, "");
      }
    }
    if (username) {
      this.log.info(`extracting from user::@${chalk.white(username)}`);
      if (cache) {
        result = this.getFromCache({ cache });
      } else {
        result = await this.getUserPin({
          username,
        });
      }

      if (result.status) {
        if (metadata) {
          this.saveMetaData({
            metadata: result,
            type: "user",
            overwrite: overwrite || false,
          });
        }

        let media = result.result.reduce((m, r) => {
          if (r.images) {
            m.push({
              u: r.images?.orig?.url,
              t: r.title,
              p: r.pinId,
            });
          }
          if (r.videos?.video_list) {
            m.push({
              u: r.videos?.video_list?.V_720P?.url,
              t: r.title,
              i: r.videos?.video_list?.V_720P?.thumbnail,
              p: r.pinId,
            });
          }
          return m;
        }, []);

        console.log("-".repeat(35));
        Object.keys(result.author).forEach((key) => {
          console.log(
            `* ${chalk.blue(key)}: ${chalk.white(result.author[key])}`
          );
        });
        console.log(
          `* ${chalk.blue("videos:")} ${chalk.yellow(
            media.filter((m) => m.i).length
          )}`
        );
        console.log(
          `* ${chalk.blue("images:")} ${chalk.yellow(
            media.filter((m) => !m.i).length
          )}`
        );

        console.log("-".repeat(35));
        await Utils.waitConfirm();
        this.log.info(`choosed media type::${chalk.white(type)}`);

        const start = new Date();
        for (const [index, item] of media.entries()) {
          const godl =
            item.i && type === "video"
              ? true
              : !item.i && type === "image"
              ? true
              : false;
          if (godl) {
            this.log.info(
              ` ${chalk.yellow(item.i ? "video" : "image")} (${chalk.yellow(
                index + 1
              )}/${chalk.white(media.length)}) ${chalk.white(
                item.t
              )} - (${chalk.white(item.p)})`
            );
            await Downloader._download({
              url: item.u,
              filename: item.u.split("/").slice(-1)[0],
              logger: this.log,
              username: `@${result.author.username}`,
              overwrite: overwrite || false,
              media_type: item.i ? "videos" : "images",
            });
          } else {
            this.log.warn(
              `skipping::${chalk.white(item.p)}, not match type::${chalk.white(
                type
              )}`
            );
          }
        }
        this.log.info(
          `completed in ${chalk.yellow((new Date() - start) / 1000)} seconds`
        );
      } else {
        this.log.error(result.message);
      }
    } else {
      if (pinId) {
        pinId = Utils.isPinUrl(pinId);
        if (!pinId) {
          this.log.error("Invalid pin id or url");
          return;
        }

        result = cache
          ? this.getFromCache({ cache })
          : type === "image"
          ? await this.getImages({
              pinId: pinId.url,
            })
          : await this.getVideos({
              pinId: pinId.url,
            });

        if (result.status) {
          if (metadata) {
            this.saveMetaData({
              metadata: result,
              type: `${type}s`,
              overwrite: overwrite || false,
            });
          }
          console.log("-".repeat(35));
          console.log(
            ` * ${chalk.blue("Author: ")}@${chalk.white(
              result.author.username
            )} / ${chalk.white(result.author.name)}`
          );
          console.log(
            ` * ${chalk.blue("Title: ")} ${chalk.white(result.result.title)}`
          );
          console.log(
            ` * ${chalk.blue("PinId: ")} ${chalk.white(result.result.entityId)}`
          );
          console.log("-".repeat(35));

          // different location
          const target =
            type === "video"
              ? result.result.videoList?.v720P?.url
              : type === "image"
              ? result?.result?.url ??
                result?.result?.videoList?.v720P?.thumbnail
              : undefined;
          if (target !== undefined) {
            await Downloader._download({
              url: target,
              filename: target.split("/").slice(-1)[0],
              logger: this.log,
              username: `@${result.author.username}`,
              overwrite: overwrite || false,
              media_type: `${type}s`,
            });
          } else {
            this.log.error(`no target url found for::${chalk.white(pinId.id)}`);
          }
        }
        return;
      }
    }
  }
}

export default Main;
