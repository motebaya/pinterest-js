/**
 * Main orchestrator — coordinates extraction, downloading, and display
 * @github.com/motebaya - 2/14/2026 14:00PM
 * file: main.js
 */

import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import boxen from "boxen";
import inquirer from "inquirer";
import Pinterest from "./core/extractor/index.js";
import { convert as hlsConvert } from "./core/hls/convert.js";
import { download } from "./core/downloader/download.js";
import { registerCleanup } from "./core/downloader/cleanup.js";
import { saveMetaData, getFromCache } from "./services/metadata.js";
import { filterMedia } from "./services/mediaFilter.js";
import { getOutputDir } from "./config/paths.js";
import { isPinUrl } from "./utils/isPinUrl.js";
import { waitConfirm } from "./utils/waitConfirm.js";
import { ensureDir } from "./utils/ensureDir.js";
import { RS_CONFIG } from "./config/constants.js";
import { toTitleCase, label, toBoxes } from "./utils/cliFormat.js";

/**
 * constants keys
 */
const RS_KEYS = Object.keys(RS_CONFIG).filter((i) => i.startsWith("user."));

/**
 * Register the SIGINT cleanup handler at module load time.
 */
registerCleanup();

/**
 * Main application class — uses composition over inheritance.
 * Holds a Pinterest extractor instance and orchestrates the full
 * extraction -> display -> confirmation -> download pipeline.
 */
class Main {
  /**
   * Create a new Main orchestrator instance.
   *
   * @param {boolean} [verbose=false] - Enable debug logging
   */
  constructor(verbose = false) {
    this.pinterest = new Pinterest(verbose);
    this.log = this.pinterest.log;
    this.defaultPath = getOutputDir();
  }

  /**
   * Main extraction and download pipeline.
   * Handles both user-level bulk extraction and single-pin extraction.
   *
   * @param {Object} opts
   * @param {string} [opts.username] - Pinterest username to extract pins from
   * @param {string} [opts.pinId] - Pinterest pin ID or URL
   * @param {string} opts.type - Media type filter ("image" | "video")
   * @param {boolean} [opts.metadata] - Whether to save metadata to JSON
   * @param {boolean} [opts.overwrite] - Whether to overwrite existing files
   * @param {string} [opts.cache] - Use cached metadata (username or pinId)
   * @param {number} [opts.pages=100] - Maximum pages to fetch
   * @returns {Promise<void>}
   */
  async extract(opts) {
    let { username, pinId, metadata, overwrite, type, cache, pages, toMethod } =
      opts;
    username = username.replace("@", "");
    const scope = toTitleCase(this.extract.name);
    let result;
    if (username) {
      this.log.info(
        `Processing ${chalk.blue(username)} /${chalk.white(toMethod)}`,
        { scope },
      );

      const result = await this.pinterest.extractUserResource({
        username,
        fromResource: toMethod == "feed" ? "user.feed" : "user.board",
      });
      if (result.status) {
        switch (toMethod) {
          case "feed":
            break;
          case "board":
            let content =
              `${label("Username")} ${chalk.cyan(result.author.username)}\n` +
              `${label("Name")} ${chalk.cyan(result.author.name)}\n` +
              `${label("UserId")} ${chalk.blue(result.author.userId)}\n` +
              `${label("Boards")} ${chalk.blue(result.result.length)}`;
            console.log(toBoxes(content, "Board List"));
            result.result.sort((a, b) => a.pinCount - b.pinCount);
            let choices = result.result.map((i, n) => {
              return {
                name: `${chalk.white(String(n + 1).padStart(2, "0"))}}. ${chalk.yellow(i.pinCount)} pins, ${chalk.white(i.name)}`,
                value: `${i.slug}|${i.id}`,
              };
            });
            try {
              let boards = await inquirer.prompt([
                {
                  type: "checkbox",
                  name: "Boards",
                  message: "Select Boards:",
                  pageSize: 12,
                  choices,
                },
              ]);
              boards = boards.Boards;
              this.log.debug(
                `Looking for::${chalk.yellow(boards.length)} selected items to boards section list`,
                { scope },
              );

              // section has different items handle
              let sections = JSON.parse(
                fs.readFileSync("board_section.json").toString(),
              );
              if (sections.result.length >= 1) {
                sections.result.sort((a, b) => a.pinCount - b.pinCount);
                let totalSectionsPin = sections.result.reduce(
                  (sum, num) => sum + num.pinCount,
                  0,
                );
                this.log.info(
                  `Total [boardmame]sections board::${chalk.white(sections.result.length)}, pins::${chalk.white(totalSectionsPin)}\n`,
                );
                let sectionChoices = await inquirer.prompt([
                  {
                    type: "select",
                    name: "content",
                    message: "Choose:",
                    choices: [
                      {
                        name: `Download all boards content? <unknown of totals>`,
                        value: "all",
                      },
                      {
                        name: `Download selectable sections list? {${chalk.yellow(totalSectionsPin)} of total}`,
                        value: "sections",
                      },
                    ],
                  },
                ]);
                sectionChoices = sectionChoices.content;
                if (sectionChoices === "all") {
                  // get all content
                } else {
                }
              }
            } catch (err) {
              if (err.name === "ExitPromptError") {
                this.log.error("USER CANCELLED");
                process.exit(1);
              }
              throw err;
            }
            break;
        }
        process.exit();

        let media = filterMedia(result.result);

        let content = `
 * Username: ${chalk.blue(result.author.username)}
 * Name: ${chalk.blue(result.author.name)}
 * UserId: ${chalk.blue(result.author.userId)}
 * Videos: ${chalk.yellow(media.filter((m) => m.i).length)}
 * Images: ${chalk.yellow(media.filter((m) => !m.i).length)}
        `;
        console.log(
          boxen(content, {
            title: "pinterest",
            titleAlignment: "center",
            borderColor: "white",
          }),
        );

        let godl = await waitConfirm();
        if (!godl) {
          this.log.warn("Canceled");
          return;
        }

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
              `${chalk.white(item.i ? "Video" : "Image")} (${chalk.white(
                index + 1,
              )}/${chalk.white(media.length)}) ${chalk.white(
                item.t,
              )} - (${chalk.white(item.p)})`,
            );
            if (!item.c) {
              await download({
                url: item.u,
                filename: item.u.split("/").slice(-1)[0],
                log: this.log,
                username: `@${result.author.username}`,
                overwrite: overwrite || false,
                media_type: item.i ? "videos" : "images",
              });
            } else {
              this.log.debug(`Found HLS video::${chalk.green(item.p)}`);
              let videosDir = path.join(
                getOutputDir(),
                `@${result.author.username}`,
                "videos",
              );
              ensureDir(videosDir);
              let outputMp4 = path.join(
                videosDir,
                item.u
                  .split("/")
                  .slice(-1)[0]
                  .replace(path.extname(item.u), ".mp4"),
              );
              if (fs.existsSync(outputMp4) && !overwrite) {
                this.log.warn(
                  `file already exists, skipping HLS conversion::${chalk.white(
                    outputMp4,
                  )}`,
                );
                continue;
              } else {
                this.log.info(
                  "overwrite mode received for HLS conversion::" +
                    `${chalk.white(outputMp4)}`,
                );
              }
              const convertOk = await hlsConvert({
                hlsUrl: item.u,
                outputMp4: outputMp4,
                log: this.log,
              });
              if (convertOk.status) {
                this.log.info(
                  `HLS conversion completed::${chalk.green(item.p)}`,
                );
              } else {
                this.log.error(`HLS conversion failed::${chalk.red(item.p)}`);
              }
            }
          } else {
            this.log.warn(
              `skipping::${chalk.white(item.p)}, not match type::${chalk.white(
                type,
              )}`,
            );
          }
        }
        this.log.info(
          `completed in ${chalk.yellow((new Date() - start) / 1000)} seconds`,
        );
      } else {
        this.log.error(result.message);
      }
    } else {
      if (pinId) {
        pinId = isPinUrl(pinId);
        this.log.info(`Extracting from pinId::${chalk.white(pinId.id)}`);
        if (!pinId) {
          this.log.error("Invalid pin id or url");
          return;
        }

        result = cache
          ? getFromCache({ cache, log: this.log })
          : type === "image"
            ? await this.pinterest.getImages({
                pinId: pinId.url,
              })
            : await this.pinterest.getVideos({
                pinId: pinId.url,
              });

        if (result.status) {
          if (metadata) {
            saveMetaData({
              metadata: result,
              type: `${type}s`,
              overwrite: overwrite || false,
              log: this.log,
            });
          }

          let content = `
 + Author: ${chalk.blue("@" + result.author.username)} / ${result.author.name}
 + Title: ${result.result.title}
 + PinId: ${chalk.blue(result.result.entityId)}
 + Type: ${type}
          `;
          console.log(
            boxen(content, {
              title: "pinterest",
              titleAlignment: "center",
              borderStyle: "single",
              padding: 0,
              borderColor: "white",
            }),
          );
          // different location
          const target =
            type === "video"
              ? result.result?.url
              : type === "image"
                ? (result?.result?.url ?? result?.result?.thumbnail)
                : undefined;
          if (target !== undefined) {
            await download({
              url: target,
              filename: target.split("/").slice(-1)[0],
              log: this.log,
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
